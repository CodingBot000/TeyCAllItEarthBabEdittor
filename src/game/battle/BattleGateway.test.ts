import { describe, expect, it } from 'vitest';
import { createNewCampaign } from '../domain/campaignRules';
import { battleRequestFor, UnavailableBattleGateway } from './BattleGateway';

describe('phase-one battle boundary', () => {
  it('keeps the replacement battle runtime unavailable and engine-neutral', async () => {
    const campaign = createNewCampaign(1234);
    const gateway = new UnavailableBattleGateway();

    expect(gateway.isAvailable()).toBe(false);
    expect(battleRequestFor(campaign, 'seoul')).toEqual({ campaignId: 'campaign-1234', cityId: 'seoul' });
    await expect(gateway.launch({ campaignId: campaign.campaignId, cityId: 'seoul' })).rejects.toThrow('phase one');
  });
});
