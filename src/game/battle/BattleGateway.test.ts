import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/cities';
import { createNewCampaign } from '../domain/campaignRules';
import { createPlannedBattleSetup } from './gameplay/battleSetupRules';
import { battleRequestFor } from './BattleGateway';

describe('battle gateway boundary', () => {
  it('creates an engine-neutral request for the integrated battle runtime', () => {
    const base = createNewCampaign(1234);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const campaign = {
      ...base,
      plannedMission: { id: 'mission-1', cityId: 'seoul', missionType: 'RAID' as const, cohortIds: [], overchargeCells: 1, travelChargeCost: 0, cellChargeCost: 8, createdAtMinutes: 0, battleSetup: createPlannedBattleSetup(base, city, 'mission-1') },
    };
    expect(battleRequestFor(campaign, 'seoul')).toEqual({ campaignId: 'campaign-1234', cityId: 'seoul', mapId: 'city-night', missionId: 'mission-1' });
  });

  it('uses the next campaign stage when no map override is supplied', () => {
    const campaign = { ...createNewCampaign(1235), completedBattles: 1 };
    expect(battleRequestFor(campaign, 'seoul')).toEqual({ campaignId: 'campaign-1235', cityId: 'seoul', mapId: 'city-day' });
  });
});
