import type { AbsorbableKind, AbsorbableTargetDefinition } from '../../domain/types';
import { isShelterOrganicTarget } from '../../domain/shelterRules';
import type { BattleGameplayProfile } from './BattleGameplayProfile';

export interface AbsorbableClusterGenerationInput {
  campaignSeed: number;
  cityId: string;
  visit: number;
  missionId: string;
  profile: BattleGameplayProfile;
  sourceTargets: AbsorbableTargetDefinition[];
  layoutSeed?: number;
  availableAmountsByKind?: Partial<Record<AbsorbableKind, number>>;
}

interface RandomSource {
  next(): number;
}

export function generateAbsorbableClusters(input: AbsorbableClusterGenerationInput): AbsorbableTargetDefinition[] {
  const { profile } = input;
  if (input.sourceTargets.length === 0 || profile.clusterCount <= 0) return [];
  const shelterTemplates = input.sourceTargets.filter(isShelterOrganicTarget);
  const availableTargets = input.sourceTargets.filter((target) => isShelterOrganicTarget(target)
    || input.availableAmountsByKind === undefined
    || Math.max(0, input.availableAmountsByKind[target.kind] ?? 0) > 0);
  if (availableTargets.length === 0) return [];
  const random = seededRandom(input.layoutSeed === undefined
    ? `${input.campaignSeed}:${input.cityId}:${input.visit}:${input.missionId}:${profile.id}:${profile.version}`
    : `layout:${input.layoutSeed}`);
  const positions = generateClusterPositions(profile, random);
  const unguarded = availableTargets.filter((target) => target.requirement === 'NONE');
  const gated = availableTargets.filter((target) => target.requirement !== 'NONE');
  const initialClusterIndex = positions.reduce((bestIndex, position, index) => Math.abs(position) < Math.abs(positions[bestIndex]) ? index : bestIndex, 0);
  const gatedClusterIndex = positions.reduce((bestIndex, position, index) => Math.abs(position) > Math.abs(positions[bestIndex]) ? index : bestIndex, 0);
  const shelterSlotIndexes = new Set([0, Math.max(0, positions.length - 1)].slice(0, Math.min(2, positions.length)));

  const drafts = positions.map((x, index) => {
    const candidates = shelterTemplates.length > 0 && shelterSlotIndexes.has(index)
      ? shelterTemplates
      : index === initialClusterIndex && unguarded.length > 0
      ? unguarded
      : index === gatedClusterIndex && gated.length > 0
        ? gated
        : targetsForWeightedKind(availableTargets, profile, random);
    const template = candidates[Math.floor(random.next() * candidates.length)] ?? availableTargets[index % availableTargets.length];
    const amountScale = 0.82 + random.next() * 0.36;
    return { x, index, template, amountScale, radiusScale: 0.9 + random.next() * 0.2 };
  });
  const allocations = allocatePoolAmounts(drafts, input.availableAmountsByKind);

  return drafts.flatMap(({ x, index, template, amountScale, radiusScale }, draftIndex) => {
    const initialAmountOverride = allocations[draftIndex];
    if (input.availableAmountsByKind !== undefined && (!initialAmountOverride || initialAmountOverride <= 0) && !isShelterOrganicTarget(template)) return [];
    const clusterId = `${input.cityId}:visit-${input.visit}:cluster-${String(index + 1).padStart(2, '0')}`;
    return {
      ...template,
      id: clusterId,
      sectorId: `${input.cityId}:side-view`,
      label: template.label,
      center: { x, z: 0 },
      radius: Math.max(4.5, template.radius * radiusScale),
      baseAmount: Math.max(1000, Math.round(template.baseAmount * amountScale)),
      ...(initialAmountOverride !== undefined && initialAmountOverride > 0 ? { initialAmountOverride } : {}),
      yieldPerThousand: scaleYield(template.yieldPerThousand, profile.rewardMultiplier),
      visualBudget: Math.max(6, Math.min(36, template.visualBudget)),
    };
  });
}

function allocatePoolAmounts(
  drafts: Array<{ template: AbsorbableTargetDefinition; amountScale: number }>,
  availableAmountsByKind: Partial<Record<AbsorbableKind, number>> | undefined,
): Array<number | undefined> {
  if (availableAmountsByKind === undefined) return drafts.map(() => undefined);
  const allocations = drafts.map(() => 0);
  const kinds = Object.keys(availableAmountsByKind) as AbsorbableKind[];
  for (const kind of kinds) {
    const draftIndexes = drafts.flatMap((draft, index) => draft.template.kind === kind ? [index] : []);
    if (draftIndexes.length === 0) continue;
    const available = Math.max(0, Math.floor(availableAmountsByKind[kind] ?? 0));
    const desired = draftIndexes.map((index) => Math.max(1000, Math.round(drafts[index].template.baseAmount * drafts[index].amountScale)));
    const desiredTotal = desired.reduce((sum, amount) => sum + amount, 0);
    let allocated = 0;
    for (let position = 0; position < draftIndexes.length; position += 1) {
      const remaining = Math.max(0, available - allocated);
      const amount = position === draftIndexes.length - 1
        ? Math.min(remaining, desired[position])
        : Math.min(remaining, Math.floor(desired[position] / Math.max(1, desiredTotal) * Math.min(available, desiredTotal)));
      allocations[draftIndexes[position]] = amount;
      allocated += amount;
    }
  }
  return allocations;
}

function generateClusterPositions(profile: BattleGameplayProfile, random: RandomSource): number[] {
  const edgePadding = Math.max(8, profile.clusterSpacing * 0.35);
  const minimum = profile.worldMinX + edgePadding;
  const maximum = profile.worldMaxX - edgePadding;
  const centerLimit = Math.max(8, profile.initialViewHalfWidth * 0.58);
  const leftMinimum = minimum;
  const leftMaximum = -profile.initialViewHalfWidth - edgePadding;
  const rightMinimum = profile.initialViewHalfWidth + edgePadding;
  const rightMaximum = maximum;
  const positions = [
    sampleRange(-centerLimit, centerLimit, random.next()),
    sampleRange(leftMinimum, leftMaximum, random.next()),
    sampleRange(rightMinimum, rightMaximum, random.next()),
  ];

  let attempts = 0;
  while (positions.length < profile.clusterCount && attempts < 240) {
    attempts += 1;
    const candidate = sampleRange(minimum, maximum, random.next());
    if (positions.every((position) => Math.abs(position - candidate) >= profile.clusterSpacing)) positions.push(candidate);
  }

  if (positions.length < profile.clusterCount) {
    const slots = profile.clusterCount - positions.length;
    for (let index = 0; index < slots; index += 1) {
      const candidate = minimum + (maximum - minimum) * ((index + 1) / (slots + 1));
      if (positions.every((position) => Math.abs(position - candidate) >= profile.clusterSpacing * 0.72)) positions.push(candidate);
    }
  }

  return positions.slice(0, profile.clusterCount).sort((a, b) => a - b).map((position) => round(position, 3));
}

function targetsForWeightedKind(targets: AbsorbableTargetDefinition[], profile: BattleGameplayProfile, random: RandomSource): AbsorbableTargetDefinition[] {
  const kinds = Object.keys(profile.absorbableWeights) as AbsorbableKind[];
  const availableKinds = kinds.filter((kind) => targets.some((target) => target.kind === kind) && profile.absorbableWeights[kind] > 0);
  if (availableKinds.length === 0) return targets;
  const totalWeight = availableKinds.reduce((sum, kind) => sum + profile.absorbableWeights[kind], 0);
  let roll = random.next() * totalWeight;
  for (const kind of availableKinds) {
    roll -= profile.absorbableWeights[kind];
    if (roll <= 0) return targets.filter((target) => target.kind === kind);
  }
  return targets.filter((target) => target.kind === availableKinds[availableKinds.length - 1]);
}

function scaleYield(yieldRate: AbsorbableTargetDefinition['yieldPerThousand'], multiplier: number): AbsorbableTargetDefinition['yieldPerThousand'] {
  return {
    captives: yieldRate.captives * multiplier,
    biomass: yieldRate.biomass * multiplier,
    alloy: yieldRate.alloy * multiplier,
    intel: yieldRate.intel * multiplier,
    coreCharge: yieldRate.coreCharge * multiplier,
  };
}

function sampleRange(minimum: number, maximum: number, unit: number): number {
  if (maximum <= minimum) return (minimum + maximum) / 2;
  return minimum + (maximum - minimum) * unit;
}

function seededRandom(seedText: string): RandomSource {
  let state = hashString(seedText) || 0x6d2b79f5;
  return {
    next() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}
