import type { CampaignState, CityDefinition, PlannedBattleSetup } from '../../domain/types';
import { gameplayProfileForPreset } from './BattleGameplayProfile';

export type BattleTimeOfDay = 'DAY' | 'NIGHT';

export function battleMapIdForCity(city: CityDefinition): string {
  // Keep Cairo, Dubai and Paris gameplay profiles intact, but temporarily use
  // the London-compatible City Day background until their replacement art is ready.
  if (city.id === 'cairo' || city.id === 'dubai' || city.id === 'paris') return 'city-day';
  if (city.tacticalPresetId === 'river-metropolis') return 'river-day';
  if (city.tacticalPresetId === 'desert-tech-hub') return 'desert-day';
  return 'city-day';
}

/** Stages start in daylight and alternate time of day after every battle. */
export function battleTimeOfDayForStage(stageNumber: number): BattleTimeOfDay {
  const normalizedStage = Number.isFinite(stageNumber) ? Math.max(1, Math.floor(stageNumber)) : 1;
  return normalizedStage % 2 === 0 ? 'NIGHT' : 'DAY';
}

export function battleMapIdForStage(city: CityDefinition, stageNumber: number): string {
  return battleTimeOfDayForStage(stageNumber) === 'NIGHT' ? 'city-night' : battleMapIdForCity(city);
}

export function createPlannedBattleSetup(campaign: CampaignState, city: CityDefinition, missionId: string): PlannedBattleSetup {
  const profile = gameplayProfileForPreset(city.tacticalPresetId);
  const visit = campaign.cities[city.id]?.visits ?? 0;
  const stageNumber = campaign.completedBattles + 1;
  return {
    missionId,
    mapId: battleMapIdForStage(city, stageNumber),
    gameplayProfileId: profile.id,
    gameplayProfileVersion: profile.version,
    layoutSeed: hashSeed(`${campaign.seed}:${city.id}:${visit + 1}:${missionId}:${profile.id}:${profile.version}`),
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
