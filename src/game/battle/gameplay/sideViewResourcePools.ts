import type { AbsorbableKind, AbsorbableTargetDefinition, CityAbsorbablePoolState, CityDefinition, CitySideViewResourceState } from '../../domain/types';
import { gameplayProfileForPreset, type BattleGameplayProfile } from './BattleGameplayProfile';
import { sideViewBiomeForPreset } from './sideViewBiomeCatalog';

export const ABSORBABLE_KINDS: AbsorbableKind[] = ['ORGANIC', 'POWER', 'VEHICLE', 'MACHINERY', 'DATA', 'RELIC'];

export function createCitySideViewResourceState(city: CityDefinition): CitySideViewResourceState {
  const profile = gameplayProfileForPreset(city.tacticalPresetId);
  const sourceTargets = sideViewBiomeForPreset(city.tacticalPresetId).absorbableTargets;
  return {
    profileId: profile.id,
    profileVersion: profile.version,
    pools: createCityAbsorbablePools(city, profile, sourceTargets),
    migrationBackup: {},
  };
}

export function createCityAbsorbablePools(
  city: CityDefinition,
  profile: BattleGameplayProfile,
  sourceTargets: AbsorbableTargetDefinition[],
): Record<AbsorbableKind, CityAbsorbablePoolState> {
  const sourceTotals = Object.fromEntries(ABSORBABLE_KINDS.map((kind) => [kind, 0])) as Record<AbsorbableKind, number>;
  for (const target of sourceTargets) sourceTotals[target.kind] += Math.max(0, target.baseAmount);
  return Object.fromEntries(ABSORBABLE_KINDS.map((kind) => {
    const initialAmount = Math.max(0, Math.round(sourceTotals[kind] * cityResourceScale(city, kind) * profileWeightScale(profile, kind)));
    return [kind, { initialAmount, remainingAmount: initialAmount, destroyedAmount: 0 } satisfies CityAbsorbablePoolState];
  })) as Record<AbsorbableKind, CityAbsorbablePoolState>;
}

export function legacyTargetInitialAmount(city: CityDefinition, target: AbsorbableTargetDefinition, cityDestruction = 0): number {
  const destructionScale = Math.max(0.4, 1 - Math.max(0, cityDestruction) / 140);
  return Math.max(0, Math.round(target.baseAmount * cityResourceScale(city, target.kind) * destructionScale));
}

function cityResourceScale(city: CityDefinition, kind: AbsorbableKind): number {
  if (kind === 'ORGANIC') return clamp(0.85 + city.basePopulation / 50_000_000, 0.85, 1.2);
  if (kind === 'DATA' || kind === 'RELIC') return clamp(0.85 + city.technologyRating * 0.05, 0.9, 1.2);
  return clamp(0.85 + city.resourceRating * 0.05, 0.9, 1.2);
}

function profileWeightScale(profile: BattleGameplayProfile, kind: AbsorbableKind): number {
  const weights = ABSORBABLE_KINDS.map((candidate) => Math.max(0, profile.absorbableWeights[candidate]));
  const averageWeight = weights.reduce((sum, weight) => sum + weight, 0) / Math.max(1, weights.length);
  if (averageWeight <= 0) return 1;
  return clamp(0.65 + profile.absorbableWeights[kind] / averageWeight * 0.35, 0.4, 1.65);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
