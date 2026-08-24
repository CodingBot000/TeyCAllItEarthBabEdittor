import { describe, expect, it } from 'vitest';
import { createNewCampaign } from '../domain/campaignRules';
import { battleRequestFor } from './BattleGateway';

describe('battle gateway boundary', () => {
  it('creates an engine-neutral request for the integrated battle runtime', () => {
    const campaign = {
      ...createNewCampaign(1234),
      plannedMission: { id: 'mission-1', cityId: 'seoul', missionType: 'RAID' as const, cohortIds: [], overchargeCells: 1, travelChargeCost: 0, cellChargeCost: 8, createdAtMinutes: 0 },
    };
    expect(battleRequestFor(campaign, 'seoul')).toEqual({ campaignId: 'campaign-1234', cityId: 'seoul', mapId: 'city-day', missionId: 'mission-1' });
  });
});
