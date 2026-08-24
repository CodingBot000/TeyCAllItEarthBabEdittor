import type { AbsorbableKind, FacilityKind } from '../../domain/types';

export interface BattleGameplayProfile {
  id: string;
  version: number;
  worldMinX: number;
  worldMaxX: number;
  initialViewHalfWidth: number;
  clusterCount: number;
  clusterSpacing: number;
  autoScanRange: number;
  survivalUnlockSeconds: number;
  extractionChannelSeconds: number;
  absorbableWeights: Record<AbsorbableKind, number>;
  defenseWeights: Record<FacilityKind, number>;
  enemyPressureMultiplier: number;
  groundPressureMultiplier: number;
  rewardMultiplier: number;
  occupationNodeCount: number;
}

const COMMON_PROFILE = {
  version: 1,
  worldMinX: -132,
  worldMaxX: 132,
  initialViewHalfWidth: 46,
  clusterCount: 5,
  clusterSpacing: 28,
  autoScanRange: 24,
  survivalUnlockSeconds: 75,
  extractionChannelSeconds: 3,
  defenseWeights: { SAM: 4, RADAR: 2, AIRBASE: 2, POWER: 1, RESEARCH: 1 },
  enemyPressureMultiplier: 1,
  groundPressureMultiplier: 1,
  rewardMultiplier: 1,
  occupationNodeCount: 2,
} satisfies Omit<BattleGameplayProfile, 'id' | 'absorbableWeights'>;

export const COASTAL_GAMEPLAY_PROFILE: BattleGameplayProfile = {
  ...COMMON_PROFILE,
  id: 'coastal-side-view-v1',
  absorbableWeights: { ORGANIC: 5, VEHICLE: 3, MACHINERY: 2, POWER: 2, DATA: 1, RELIC: 1 },
};

export const RIVER_GAMEPLAY_PROFILE: BattleGameplayProfile = {
  ...COMMON_PROFILE,
  id: 'river-side-view-v1',
  absorbableWeights: { ORGANIC: 3, VEHICLE: 2, MACHINERY: 4, POWER: 4, DATA: 2, RELIC: 1 },
  groundPressureMultiplier: 1.12,
};

export const DESERT_GAMEPLAY_PROFILE: BattleGameplayProfile = {
  ...COMMON_PROFILE,
  id: 'desert-side-view-v1',
  absorbableWeights: { ORGANIC: 2, VEHICLE: 2, MACHINERY: 2, POWER: 5, DATA: 4, RELIC: 3 },
  enemyPressureMultiplier: 1.15,
  groundPressureMultiplier: 1.2,
  rewardMultiplier: 1.12,
};

const PROFILE_BY_PRESET_ID: Record<string, BattleGameplayProfile> = {
  'coastal-megacity': COASTAL_GAMEPLAY_PROFILE,
  'river-metropolis': RIVER_GAMEPLAY_PROFILE,
  'desert-tech-hub': DESERT_GAMEPLAY_PROFILE,
};

export function gameplayProfileForPreset(presetId: string): BattleGameplayProfile {
  return PROFILE_BY_PRESET_ID[presetId] ?? COASTAL_GAMEPLAY_PROFILE;
}
