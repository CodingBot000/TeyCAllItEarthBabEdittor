import { describe, expect, it } from 'vitest';
import { CITY_BY_ID } from '../../data/world';
import { battleMapIdForCity, battleMapIdForStage, battleTimeOfDayForStage, createPlannedBattleSetup } from './battleSetupRules';
import { createNewCampaign } from '../../domain/campaignRules';

describe('battle background map selection', () => {
  it('uses the London-compatible city-day background for Cairo, Dubai and Paris', () => {
    expect(battleMapIdForCity(CITY_BY_ID.london)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.cairo)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.dubai)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.paris)).toBe('city-day');
  });

  it('preserves independent River and Desert backgrounds for other cities', () => {
    expect(battleMapIdForCity(CITY_BY_ID.shanghai)).toBe('river-day');
    expect(battleMapIdForCity(CITY_BY_ID.seoul)).toBe('city-day');
  });

  it('alternates day and night from the first stage onward', () => {
    expect([1, 2, 3, 4, 5, 6].map(battleTimeOfDayForStage)).toEqual(['DAY', 'NIGHT', 'DAY', 'NIGHT', 'DAY', 'NIGHT']);
    expect(battleTimeOfDayForStage(0)).toBe('DAY');
    expect(battleTimeOfDayForStage(Number.NaN)).toBe('DAY');
  });

  it('uses the city day map on odd stages and the night map on even stages', () => {
    expect(battleMapIdForStage(CITY_BY_ID.shanghai, 1)).toBe('river-day');
    expect(battleMapIdForStage(CITY_BY_ID.shanghai, 2)).toBe('city-night');
    expect(battleMapIdForStage(CITY_BY_ID.shanghai, 3)).toBe('river-day');
  });

  it('derives the planned battle map from the next campaign stage', () => {
    const city = CITY_BY_ID.seoul;
    const first = createPlannedBattleSetup(createNewCampaign(901), city, 'mission-1');
    const secondCampaign = { ...createNewCampaign(901), completedBattles: 1 };
    const second = createPlannedBattleSetup(secondCampaign, city, 'mission-2');

    expect(first.mapId).toBe('city-day');
    expect(second.mapId).toBe('city-night');
  });
});
