import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/cities';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { createNewCampaign } from './campaignRules';
import { BALANCE } from './balance';
import { startBeamOnTarget, tickCombat } from './combatRules';
import { createSideViewBattleSession } from '../battle/gameplay/sideViewBattleRules';
import type { AbsorbableTargetState, CombatState } from './types';
import { refreshAbsorbableTargetStatuses } from './combatRules';
import { shelterCapacityFor, shelterInitialOccupantsFor, tickCivilianShelters } from './shelterRules';

function organicTarget(id: string, x: number, amount: number, overrides: Partial<AbsorbableTargetState> = {}): AbsorbableTargetState {
  return {
    id,
    sectorId: 'test',
    label: id,
    kind: 'ORGANIC',
    weight: 1,
    center: { x, z: 0 },
    radius: 4,
    baseAmount: amount,
    initialAmount: amount,
    density: 1,
    yieldPerThousand: { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 },
    energyCostMultiplier: 1,
    alertMultiplier: 1,
    requirement: 'NONE',
    optional: false,
    visualBudget: 1,
    remainingAmount: amount,
    absorbedAmount: 0,
    destroyedAmount: 0,
    discovered: true,
    status: 'AVAILABLE',
    ...overrides,
  };
}

function shelterState(targets: AbsorbableTargetState[]): CombatState {
  return { absorbableTargets: targets } as CombatState;
}

describe('organic shelter rules', () => {
  it('starts with a fixed civilian group and blocks absorption until the shelter is destroyed', () => {
    const campaign = createNewCampaign(8421);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const target = combatState.absorbableTargets.find((candidate) => candidate.kind === 'ORGANIC' && !candidate.id.startsWith('ambient:'))!;
    combatState.groundDefenders = [];
    combatState.facilities = [];
    combatState.enemies = [];
    target.discovered = true;
    combatState.mothership.position = { ...target.center };
    refreshAbsorbableTargetStatuses(combatState);

    expect(target.shelterBreachState).toBe('INTACT');
    const initialOccupants = shelterInitialOccupantsFor(target.initialAmount);
    expect(target.remainingAmount).toBe(initialOccupants);
    expect(target.shelterOccupants).toBe(initialOccupants);
    expect(target.shelterCapacity).toBe(shelterCapacityFor(target.initialAmount));
    expect(target.status).toBe('LOCKED');
    expect(startBeamOnTarget(combatState, target.id)).toEqual({ ok: true });

    for (let frame = 0; frame < BALANCE.beam.shelterBreachSeconds * 60 - 1; frame += 1) {
      tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    }
    expect(target.shelterBreachState).toBe('BREACHING');
    expect(target.remainingAmount).toBe(initialOccupants);

    tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    expect(target.shelterBreachState).toBe('DESTROYED');
    expect(target.status).toBe('AVAILABLE');

    tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    expect(target.remainingAmount).toBeLessThan(initialOccupants);
  });

  it('assigns each external civilian group to the nearest available shelter', () => {
    const left = organicTarget('shelter-left', -20, 1000, { remainingAmount: 0 });
    const right = organicTarget('shelter-right', 20, 1000, { remainingAmount: 0 });
    const civilian = organicTarget('ambient:civilian', 14, 400);
    const state = shelterState([left, right, civilian]);

    tickCivilianShelters(state, 1);
    tickCivilianShelters(state, 1);

    expect(civilian.assignedShelterId).toBe('shelter-right');
    expect(civilian.civilianShelterState).toBe('SHELTERED');
    expect(civilian.remainingAmount).toBe(0);
    expect(right.shelterOccupants).toBe(400);
    expect(left.shelterOccupants).toBe(0);
  });

  it('keeps overflow outside when the nearest shelter is full', () => {
    const shelter = organicTarget('shelter-full', 0, 1000, { remainingAmount: 0, shelterCapacity: 500, shelterOccupants: 0 });
    const first = organicTarget('ambient:first', 0, 400);
    const second = organicTarget('ambient:second', 0, 400);
    const state = shelterState([shelter, first, second]);

    tickCivilianShelters(state, 1);

    expect(shelter.shelterOccupants).toBe(500);
    expect(first.civilianShelterState).toBe('SHELTERED');
    expect(second.civilianShelterState).toBe('BLOCKED');
    expect(second.remainingAmount).toBe(300);
  });

  it('marks a destroyed occupied shelter as exposed civilians, not an interactable shelter', () => {
    const shelter = organicTarget('shelter-destroyed', 0, 1000, {
      remainingAmount: 400,
      shelterCapacity: 1000,
      shelterOccupants: 400,
      shelterBreachState: 'DESTROYED',
      shelterBreachProgress: 1,
    });
    const state = shelterState([shelter]);

    refreshAbsorbableTargetStatuses(state);

    expect(shelter.status).toBe('AVAILABLE');
    expect(shelter.shelterBreachState).toBe('DESTROYED');
    expect(shelter.shelterOccupants).toBe(400);
  });
});
