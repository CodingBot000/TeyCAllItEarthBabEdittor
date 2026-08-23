import { describe, expect, it } from 'vitest';
import { CITIES } from './cities';
import { createNewCampaign } from '../domain/campaignRules';
import { createCombatState } from '../domain/combatRules';
import { TACTICAL_PRESETS } from './tacticalPresets';

describe('battle tactical presets', () => {
  it('covers every playable city archetype', () => {
    const presetIds = new Set(CITIES.map((city) => city.tacticalPresetId));
    expect([...presetIds].every((id) => Boolean(TACTICAL_PRESETS[id]))).toBe(true);
  });

  it('keeps namespaced variant references internally consistent', () => {
    const campaign = createNewCampaign(1001);
    const city = CITIES.find((item) => item.tacticalPresetId === 'river-metropolis') ?? CITIES[0];
    const preset = TACTICAL_PRESETS[city.tacticalPresetId];
    const state = createCombatState(campaign, city, campaign.cities[city.id], preset);
    const facilityIds = new Set(state.facilities.map((facility) => facility.id));
    expect(state.absorbableTargets.filter((target) => target.linkedFacilityId).every((target) => facilityIds.has(target.linkedFacilityId!))).toBe(true);
    expect(preset.controlNodes.filter((node) => node.linkedFacilityId).every((node) => facilityIds.has(node.linkedFacilityId!))).toBe(true);
  });
});
