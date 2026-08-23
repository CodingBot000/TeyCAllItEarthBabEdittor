import { describe, expect, it } from 'vitest';
import { createNewCampaign } from '../domain/campaignRules';
import { battleRequestFor, UnavailableBattleGateway } from './BattleGateway';

describe('battle gateway boundary', () => {
  it('keeps the replacement battle runtime unavailable and engine-neutral', async () => {
    const campaign = createNewCampaign(1234);
    const gateway = new UnavailableBattleGateway();

    expect(gateway.isAvailable()).toBe(false);
    expect(battleRequestFor(campaign, 'seoul')).toEqual({ campaignId: 'campaign-1234', cityId: 'seoul', mapId: 'city-day' });
    await expect(gateway.launch({ campaignId: campaign.campaignId, cityId: 'seoul', mapId: 'city-day' })).rejects.toThrow('phase one');
  });
});
