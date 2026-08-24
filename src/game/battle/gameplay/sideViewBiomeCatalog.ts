import { ABSORBABLE_WEIGHT_BY_KIND } from '../../domain/types';
import type { AbsorbableKind, AbsorbableTargetDefinition, FacilityDefinition, GroundDefenderDefinition, PopulationZoneDefinition, TacticalControlNodeDefinition, TacticalPreset } from '../../domain/types';
import type { BattleGameplayProfile } from './BattleGameplayProfile';

export interface SideViewBiomeDefinition {
  id: string;
  label: string;
  terrain: TacticalPreset['terrain'];
  landmarkLabel: string;
  absorbableTargets: AbsorbableTargetDefinition[];
  populationZones: PopulationZoneDefinition[];
  facilities: FacilityDefinition[];
  controlNodes: TacticalControlNodeDefinition[];
  groundDefenders: GroundDefenderDefinition[];
  breachObjectiveIds: string[];
}

const BIOME_BY_PRESET_ID: Record<string, SideViewBiomeDefinition> = {
  'coastal-megacity': createBiome('coastal', 'COASTAL CORRIDOR', 'coastal', { sam: [-52, -18, 40], radar: 8, airbase: -78, power: 64 }),
  'river-metropolis': createBiome('river', 'RIVER METROPOLIS', 'river', { sam: [-66, -28, 46], radar: -4, airbase: 76, power: 36 }),
  'desert-tech-hub': createBiome('desert', 'DESERT TECH HUB', 'desert', { sam: [-72, -16, 54], radar: 12, airbase: -62, power: 72 }),
};

const BIOME_BY_PROFILE_ID: Record<string, SideViewBiomeDefinition> = {
  'coastal-side-view-v1': BIOME_BY_PRESET_ID['coastal-megacity'],
  'river-side-view-v1': BIOME_BY_PRESET_ID['river-metropolis'],
  'desert-side-view-v1': BIOME_BY_PRESET_ID['desert-tech-hub'],
};

export function sideViewBiomeForPreset(presetId: string): SideViewBiomeDefinition {
  return BIOME_BY_PRESET_ID[presetId] ?? BIOME_BY_PRESET_ID['coastal-megacity'];
}

export function sideViewBiomeForProfile(profileId: string): SideViewBiomeDefinition {
  return BIOME_BY_PROFILE_ID[profileId] ?? BIOME_BY_PRESET_ID['coastal-megacity'];
}

export function createSideViewTacticalPreset(
  biome: SideViewBiomeDefinition,
  profile: BattleGameplayProfile,
  generatedTargets: AbsorbableTargetDefinition[],
  facilities: FacilityDefinition[],
): TacticalPreset {
  const landmarkTarget = generatedTargets.find((target) => target.optional) ?? generatedTargets[generatedTargets.length - 1];
  return {
    id: `${biome.id}-side-view-runtime`,
    label: biome.label,
    terrain: biome.terrain,
    landmark: {
      id: `${biome.id}:landmark`,
      label: biome.landmarkLabel,
      position: { x: 0, z: 0 },
      atlasFrame: 0,
      width: 1,
      height: 1,
      objectiveTargetId: landmarkTarget?.id ?? '',
      objectiveLabel: landmarkTarget ? `OPTIONAL: ABSORB ${landmarkTarget.label}` : 'OPTIONAL SIGNAL',
    },
    urbanPlan: { roads: [], reservedZones: [] },
    clusters: [],
    sectors: [{ id: `${biome.id}:side-view`, label: 'GROUND ABSORPTION CORRIDOR', center: { x: 0, z: 0 }, radius: profile.worldMaxX }],
    absorbableTargets: generatedTargets,
    populationZones: biome.populationZones.map((zone) => ({ ...zone, center: { x: zone.center.x, z: 0 } })),
    facilities,
    controlNodes: biome.controlNodes.map((node, index) => ({ ...node, position: { x: node.position.x, z: 0 }, requiredForOccupation: index < Math.min(profile.occupationNodeCount, biome.controlNodes.length) })),
    groundDefenders: biome.groundDefenders.map((defender) => ({
      ...defender,
      position: { x: defender.position.x, z: 0 },
      health: defender.health * profile.groundPressureMultiplier,
      attackDamagePerSecond: defender.attackDamagePerSecond * profile.groundPressureMultiplier,
    })),
    breachObjectiveIds: biome.breachObjectiveIds,
  };
}

function createBiome(
  id: string,
  label: string,
  terrain: TacticalPreset['terrain'],
  positions: { sam: [number, number, number]; radar: number; airbase: number; power: number },
): SideViewBiomeDefinition {
  const facilityId = (name: string) => `${id}:${name}`;
  const nodeId = (name: string) => `${id}:${name}-node`;
  const facilities: FacilityDefinition[] = [
    { id: facilityId('sam-west'), kind: 'SAM', position: { x: positions.sam[0], z: 0 }, health: 350 },
    { id: facilityId('sam-central'), kind: 'SAM', position: { x: positions.sam[1], z: 0 }, health: 350 },
    { id: facilityId('sam-east'), kind: 'SAM', position: { x: positions.sam[2], z: 0 }, health: 350 },
    { id: facilityId('radar'), kind: 'RADAR', position: { x: positions.radar, z: 0 }, health: 280 },
    { id: facilityId('airbase'), kind: 'AIRBASE', position: { x: positions.airbase, z: 0 }, health: 500 },
    { id: facilityId('power'), kind: 'POWER', position: { x: positions.power, z: 0 }, health: 420 },
  ];
  const controlNodes: TacticalControlNodeDefinition[] = [
    { id: nodeId('command'), label: 'CITY COMMAND', position: { x: positions.radar, z: 0 }, radius: 7, linkedFacilityId: facilityId('radar'), requiredForOccupation: true },
    { id: nodeId('air'), label: 'AIR CONTROL', position: { x: positions.airbase, z: 0 }, radius: 7, linkedFacilityId: facilityId('airbase'), requiredForOccupation: true },
    { id: nodeId('power'), label: 'POWER CONTROL', position: { x: positions.power, z: 0 }, radius: 7, linkedFacilityId: facilityId('power'), requiredForOccupation: false },
  ];
  return {
    id,
    label,
    terrain,
    landmarkLabel: `${label} SIGNAL`,
    absorbableTargets: createAbsorbableTemplates(id, facilityId),
    populationZones: [
      { id: `${id}:population-west`, center: { x: -34, z: 0 }, radius: 14, initialPopulationRatio: 0.18, density: 1, visualSpriteBudget: 0 },
      { id: `${id}:population-east`, center: { x: 34, z: 0 }, radius: 14, initialPopulationRatio: 0.18, density: 1.1, visualSpriteBudget: 0 },
    ],
    facilities,
    controlNodes,
    groundDefenders: [
      { id: `${id}:guard-command`, label: 'COMMAND GUARD', position: { x: positions.radar, z: 0 }, health: 120, attackRange: 12, attackDamagePerSecond: 7, linkedControlNodeId: nodeId('command') },
      { id: `${id}:guard-air`, label: 'AIR GUARD', position: { x: positions.airbase, z: 0 }, health: 105, attackRange: 12, attackDamagePerSecond: 6, linkedControlNodeId: nodeId('air') },
      { id: `${id}:guard-power`, label: 'POWER GUARD', position: { x: positions.power, z: 0 }, health: 140, attackRange: 13, attackDamagePerSecond: 8, linkedControlNodeId: nodeId('power') },
    ],
    breachObjectiveIds: [facilityId('power'), facilityId('radar')],
  };
}

function createAbsorbableTemplates(id: string, facilityId: (name: string) => string): AbsorbableTargetDefinition[] {
  return [
    target(id, 'organic-crowd', 'CIVILIAN MASS', 'ORGANIC', 15_000, { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 }),
    target(id, 'organic-residential', 'RESIDENTIAL MASS', 'ORGANIC', 16_000, { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 }),
    target(id, 'vehicle-column', 'VEHICLE COLUMN', 'VEHICLE', 8_000, { captives: 0, biomass: 2, alloy: 7, intel: 0, coreCharge: 0 }),
    target(id, 'fabrication-line', 'FABRICATION LINE', 'MACHINERY', 12_000, { captives: 0, biomass: 0, alloy: 9, intel: 1, coreCharge: 0 }),
    target(id, 'power-cache', 'POWER CACHE', 'POWER', 8_000, { captives: 0, biomass: 0, alloy: 0, intel: 0, coreCharge: 1.2 }, 'NONE', undefined, true),
    target(id, 'radar-datacore', 'RADAR DATA CORE', 'DATA', 7_000, { captives: 0, biomass: 0, alloy: 1, intel: 8, coreCharge: 0 }, 'EMP_WINDOW', facilityId('radar'), true),
    target(id, 'archive-datacore', 'ARCHIVE DATA CORE', 'DATA', 4_000, { captives: 0, biomass: 0, alloy: 2, intel: 10, coreCharge: 0 }, 'EMP_WINDOW', facilityId('radar'), true),
    target(id, 'airbase-relic', 'AIRBASE RELIC', 'RELIC', 4_000, { captives: 0, biomass: 2, alloy: 3, intel: 12, coreCharge: 0 }, 'PLASMA_OPENING', facilityId('airbase'), true),
  ];
}

function target(
  biomeId: string,
  suffix: string,
  label: string,
  kind: AbsorbableKind,
  baseAmount: number,
  yieldPerThousand: AbsorbableTargetDefinition['yieldPerThousand'],
  requirement: AbsorbableTargetDefinition['requirement'] = 'NONE',
  linkedFacilityId?: string,
  optional = false,
): AbsorbableTargetDefinition {
  return {
    id: `${biomeId}:${suffix}`,
    sectorId: `${biomeId}:side-view`,
    label,
    kind,
    weight: ABSORBABLE_WEIGHT_BY_KIND[kind],
    center: { x: 0, z: 0 },
    radius: kind === 'ORGANIC' ? 9 : 5,
    baseAmount,
    density: kind === 'ORGANIC' ? 1.08 : 0.96,
    yieldPerThousand,
    energyCostMultiplier: 1,
    alertMultiplier: requirement === 'NONE' ? 1 : 1.2,
    requirement,
    linkedFacilityId,
    optional,
    visualBudget: kind === 'ORGANIC' ? 32 : 12,
  };
}
