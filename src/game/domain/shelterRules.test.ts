import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/cities';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { createNewCampaign } from './campaignRules';
import { BALANCE } from './balance';
import { startBeamOnTarget, tickCombat } from './combatRules';
import { createSideViewBattleSession } from '../battle/gameplay/sideViewBattleRules';

describe('organic shelter breach', () => {
  it('blocks civilian absorption until the shelter is destroyed', () => {
    const campaign = createNewCampaign(8421);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const target = combatState.absorbableTargets.find((candidate) => candidate.kind === 'ORGANIC' && !candidate.id.startsWith('ambient:'))!;
    const remainingBefore = target.remainingAmount;
    combatState.groundDefenders = [];
    combatState.facilities = [];
    combatState.enemies = [];
    target.discovered = true;
    combatState.mothership.position = { ...target.center };

    expect(target.shelterBreachState).toBe('INTACT');
    expect(target.status).toBe('LOCKED');
    expect(startBeamOnTarget(combatState, target.id)).toEqual({ ok: true });

    for (let frame = 0; frame < BALANCE.beam.shelterBreachSeconds * 60 - 1; frame += 1) {
      tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    }
    expect(target.shelterBreachState).toBe('BREACHING');
    expect(target.remainingAmount).toBe(remainingBefore);

    tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    expect(target.shelterBreachState).toBe('DESTROYED');
    expect(target.remainingAmount).toBe(remainingBefore);
    expect(target.status).toBe('AVAILABLE');

    tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    expect(target.remainingAmount).toBeLessThan(remainingBefore);
  });
});
