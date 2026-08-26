import { describe, expect, it } from 'vitest';
import { createNewCampaign, purchaseUpgrade } from './campaignRules';
import { UPGRADE_DEFINITIONS } from './upgradeCatalog';
import { missingRequirements, UPGRADE_TREE_NODES, upgradeNodeState } from './upgradeTree';

describe('mothership upgrade tree', () => {
  it('defines one tree node for every catalog upgrade', () => {
    expect(new Set(UPGRADE_TREE_NODES.map((node) => node.id))).toEqual(new Set(UPGRADE_DEFINITIONS.map((upgrade) => upgrade.id)));
  });

  it('locks child nodes until their required parent levels are reached', () => {
    const campaign = createNewCampaign();
    expect(upgradeNodeState(campaign, 'air-defense-cycle', 3)).toBe('LOCKED');
    expect(missingRequirements(campaign, 'air-defense-cycle')).toEqual([{ id: 'air-defense-damage', level: 1 }]);

    campaign.upgrades['air-defense-damage'] = 1;
    expect(upgradeNodeState(campaign, 'air-defense-cycle', 3)).toBe('AVAILABLE');
  });

  it('enforces prerequisites in the purchase domain rule', () => {
    const campaign = createNewCampaign();
    campaign.resources = { biomass: 10_000, alloy: 10_000, intel: 10_000 };
    expect(purchaseUpgrade(campaign, 'point-defense-efficiency')).toMatchObject({ ok: false, reason: 'Prerequisites not met' });

    campaign.upgrades['point-defense-accuracy'] = 1;
    expect(purchaseUpgrade(campaign, 'point-defense-efficiency').ok).toBe(true);
  });

  it('keeps already-owned nodes upgradeable for legacy saves', () => {
    const campaign = createNewCampaign();
    campaign.resources = { biomass: 10_000, alloy: 10_000, intel: 10_000 };
    campaign.upgrades['selective-filter'] = 1;

    const result = purchaseUpgrade(campaign, 'selective-filter');
    expect(result.ok).toBe(true);
    expect(result.campaign.upgrades['selective-filter']).toBe(2);
  });
});
