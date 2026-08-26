import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data/cities';
import { TACTICAL_PRESETS } from '../../data/tacticalPresets';
import { createNewCampaign } from '../../domain/campaignRules';
import { battleAbilityAvailability } from './battleAbilityAvailability';
import { createSideViewBattleSession } from './sideViewBattleRules';

describe('battle ability availability', () => {
  it('reports short, non-mutating reasons for unavailable controls', () => {
    const campaign = createNewCampaign(9011);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const initialEnergy = combatState.mothership.energy;

    expect(battleAbilityAvailability(combatState).extract).toMatchObject({ enabled: false, reason: 'EXTRACT_LOCKED', energyCost: 0, cellCost: 0 });
    combatState.overchargeCells = 0;
    expect(battleAbilityAvailability(combatState).emp).toMatchObject({ enabled: true, energyCost: 400, cellCost: 0 });
    expect(battleAbilityAvailability(combatState).plasma).toMatchObject({ enabled: true, energyCost: 400, cellCost: 0 });
    expect(battleAbilityAvailability(combatState).overdrive).toMatchObject({ enabled: true, energyCost: 400, cellCost: 0 });
    expect(combatState.mothership.energy).toBe(initialEnergy);
    expect(combatState.overchargeCells).toBe(0);

    combatState.cooldowns.plasma = 3.2;
    expect(battleAbilityAvailability(combatState).plasma).toMatchObject({ enabled: false, reason: 'COOLDOWN', cooldownRemaining: 3.2 });

    combatState.cooldowns.plasma = 0;
    combatState.groundDefenders.forEach((target) => { target.health = 0; });
    combatState.facilities.forEach((target) => { target.destroyed = true; });
    combatState.enemies = [];
    expect(battleAbilityAvailability(combatState).emp).toMatchObject({ enabled: false, reason: 'NO_TARGET' });

    combatState.absorbableTargets.forEach((target) => { target.discovered = false; });
    expect(battleAbilityAvailability(combatState).beam).toMatchObject({ enabled: false, reason: 'NO_TARGET' });
  });
});
