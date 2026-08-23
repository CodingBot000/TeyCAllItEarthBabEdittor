import type { TacticalPreset } from '../domain/types';

/**
 * The editor-first battle scene only needs a compact preset to exercise the
 * already-tested combat rules. More detailed city presets can be added later
 * without changing the CombatState or renderer contracts.
 */
export const COASTAL_MEGACITY_PRESET: TacticalPreset = {
  id: 'coastal-megacity',
  label: 'COASTAL MEGACITY',
  terrain: 'coastal',
  waterPosition: { x: 58, z: -24 },
  landmark: {
    id: 'ocean-arcology',
    label: 'HARBOR OBSERVATION TOWER',
    position: { x: 0, z: 5 },
    atlasFrame: 0,
    width: 12,
    height: 18,
    objectiveTargetId: 'arcology-archive',
    objectiveLabel: 'OPTIONAL: ABSORB HARBOR TOWER ARCHIVE',
  },
  urbanPlan: {
    roads: [
      { axis: 'x', coordinate: -42, width: 3.2 },
      { axis: 'x', coordinate: -2, width: 3.2 },
      { axis: 'x', coordinate: 38, width: 3.2 },
      { axis: 'z', coordinate: -34, width: 2.6 },
      { axis: 'z', coordinate: 14, width: 2.6 },
    ],
    reservedZones: [{ id: 'central-plaza', center: { x: 0, z: 5 }, radius: 12 }],
  },
  clusters: [
    { id: 'downtown', center: { x: 0, z: 4 }, radiusX: 27, radiusZ: 24, density: 0.9, heightRange: [5, 19], populationDensity: 0.8, style: 'downtown' },
    { id: 'residential-east', center: { x: 37, z: 28 }, radiusX: 22, radiusZ: 17, density: 0.72, heightRange: [3, 9], populationDensity: 1, style: 'residential' },
    { id: 'industrial-west', center: { x: -39, z: -18 }, radiusX: 19, radiusZ: 15, density: 0.55, heightRange: [2, 7], populationDensity: 0.25, style: 'industrial' },
  ],
  sectors: [
    { id: 'coastal-transit', label: 'NORTHERN TRANSIT', center: { x: 0, z: 49 }, radius: 20 },
    { id: 'coastal-civic', label: 'CIVIC CORE', center: { x: 8, z: 6 }, radius: 27 },
    { id: 'coastal-industrial', label: 'INDUSTRIAL BELT', center: { x: -38, z: -16 }, radius: 23 },
    { id: 'coastal-strategic', label: 'STRATEGIC GRID', center: { x: 38, z: 15 }, radius: 31 },
  ],
  absorbableTargets: [
    { id: 'transit-convoy', sectorId: 'coastal-transit', label: 'TRANSIT CONVOY', kind: 'VEHICLE', weight: 12, center: { x: 0, z: 49 }, radius: 5, baseAmount: 8000, density: 1.05, yieldPerThousand: { captives: 0, biomass: 2, alloy: 7, intel: 0, coreCharge: 0 }, energyCostMultiplier: 0.9, alertMultiplier: 0.8, requirement: 'NONE', optional: false, visualBudget: 12 },
    { id: 'downtown-crowd', sectorId: 'coastal-civic', label: 'DOWNTOWN POPULATION', kind: 'ORGANIC', weight: 1, center: { x: 4, z: 7 }, radius: 9, baseAmount: 14000, density: 1.1, yieldPerThousand: { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 }, energyCostMultiplier: 1, alertMultiplier: 1, requirement: 'NONE', optional: false, visualBudget: 34 },
    { id: 'residential-crowd', sectorId: 'coastal-strategic', label: 'RESIDENTIAL POPULATION', kind: 'ORGANIC', weight: 1, center: { x: 37, z: 27 }, radius: 8, baseAmount: 16000, density: 1.15, yieldPerThousand: { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 }, energyCostMultiplier: 1, alertMultiplier: 1.1, requirement: 'NONE', optional: false, visualBudget: 38 },
    { id: 'west-fabricators', sectorId: 'coastal-industrial', label: 'FABRICATION LINE', kind: 'MACHINERY', weight: 18, center: { x: -39, z: -18 }, radius: 7, baseAmount: 12000, density: 0.9, yieldPerThousand: { captives: 0, biomass: 0, alloy: 9, intel: 1, coreCharge: 0 }, energyCostMultiplier: 1.15, alertMultiplier: 1, requirement: 'NONE', optional: false, visualBudget: 16 },
    { id: 'grid-battery-cache', sectorId: 'coastal-strategic', label: 'GRID BATTERY CACHE', kind: 'POWER', weight: 24, center: { x: 39, z: 16 }, radius: 5, baseAmount: 8000, density: 0.85, yieldPerThousand: { captives: 0, biomass: 0, alloy: 0, intel: 0, coreCharge: 1.2 }, energyCostMultiplier: 1.05, alertMultiplier: 0.9, requirement: 'NONE', optional: true, visualBudget: 10 },
    { id: 'radar-datacore', sectorId: 'coastal-strategic', label: 'RADAR DATA CORE', kind: 'DATA', weight: 3, center: { x: 23, z: -18 }, radius: 5, baseAmount: 7000, density: 0.75, yieldPerThousand: { captives: 0, biomass: 0, alloy: 1, intel: 8, coreCharge: 0 }, energyCostMultiplier: 1.25, alertMultiplier: 1.35, requirement: 'EMP_WINDOW', linkedFacilityId: 'radar-central', optional: true, visualBudget: 10 },
    { id: 'airbase-prototype', sectorId: 'coastal-industrial', label: 'AIRBASE PROTOTYPE', kind: 'RELIC', weight: 6, center: { x: -47, z: 27 }, radius: 4, baseAmount: 4000, density: 0.65, yieldPerThousand: { captives: 0, biomass: 2, alloy: 3, intel: 12, coreCharge: 0 }, energyCostMultiplier: 1.4, alertMultiplier: 1.5, requirement: 'PLASMA_OPENING', linkedFacilityId: 'airbase', optional: true, visualBudget: 6 },
    { id: 'arcology-archive', sectorId: 'coastal-civic', label: 'HARBOR TOWER ARCHIVE', kind: 'DATA', weight: 3, center: { x: 0, z: 5 }, radius: 4, baseAmount: 4000, density: 0.7, yieldPerThousand: { captives: 0, biomass: 0, alloy: 2, intel: 10, coreCharge: 0 }, energyCostMultiplier: 1.3, alertMultiplier: 1.4, requirement: 'EMP_WINDOW', linkedFacilityId: 'radar-central', optional: true, visualBudget: 5 },
  ],
  populationZones: [
    { id: 'downtown-pop', center: { x: 4, z: 7 }, radius: 16, initialPopulationRatio: 0.36, density: 1, visualSpriteBudget: 90 },
    { id: 'residential-pop', center: { x: 37, z: 27 }, radius: 14, initialPopulationRatio: 0.3, density: 1.2, visualSpriteBudget: 70 },
  ],
  facilities: [
    { id: 'sam-north', kind: 'SAM', position: { x: -29, z: -35 }, health: 350 },
    { id: 'sam-east', kind: 'SAM', position: { x: 42, z: -11 }, health: 350 },
    { id: 'sam-south', kind: 'SAM', position: { x: -22, z: 39 }, health: 350 },
    { id: 'radar-central', kind: 'RADAR', position: { x: 23, z: -18 }, health: 280 },
    { id: 'airbase', kind: 'AIRBASE', position: { x: -47, z: 27 }, health: 500 },
    { id: 'power-plant', kind: 'POWER', position: { x: 50, z: 38 }, health: 420 },
  ],
  controlNodes: [
    { id: 'coastal-command', label: 'CITY COMMAND', position: { x: 0, z: 5 }, radius: 7, linkedFacilityId: 'radar-central', requiredForOccupation: true },
    { id: 'coastal-comms', label: 'COMMS NODE', position: { x: 23, z: -18 }, radius: 6, linkedFacilityId: 'radar-central', requiredForOccupation: true },
    { id: 'coastal-power', label: 'POWER CONTROL', position: { x: 50, z: 38 }, radius: 7, linkedFacilityId: 'power-plant', requiredForOccupation: false },
  ],
  groundDefenders: [
    { id: 'coastal-guard-command', label: 'COMMAND GUARD', position: { x: 7, z: 10 }, health: 120, attackRange: 12, attackDamagePerSecond: 7, linkedControlNodeId: 'coastal-command' },
    { id: 'coastal-guard-comms', label: 'COMMS GUARD', position: { x: 27, z: -14 }, health: 105, attackRange: 12, attackDamagePerSecond: 6, linkedControlNodeId: 'coastal-comms' },
    { id: 'coastal-guard-power', label: 'POWER GUARD', position: { x: 45, z: 34 }, health: 140, attackRange: 13, attackDamagePerSecond: 8, linkedControlNodeId: 'coastal-power' },
  ],
  breachObjectiveIds: ['power-plant', 'radar-central'],
};

function createVariantPreset(id: string, label: string, terrain: TacticalPreset['terrain'], waterPosition?: TacticalPreset['waterPosition']): TacticalPreset {
  const ids = [
    COASTAL_MEGACITY_PRESET.landmark.id,
    ...COASTAL_MEGACITY_PRESET.clusters.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.sectors.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.absorbableTargets.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.populationZones.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.facilities.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.controlNodes.map((item) => item.id),
    ...COASTAL_MEGACITY_PRESET.groundDefenders.map((item) => item.id),
  ];
  const namespaced = new Map(ids.map((value) => [value, `${id}:${value}`]));
  const ref = (value: string) => namespaced.get(value) ?? value;
  const namespace = (value: string) => ref(value);
  return {
    ...COASTAL_MEGACITY_PRESET,
    id,
    label,
    terrain,
    waterPosition,
    landmark: { ...COASTAL_MEGACITY_PRESET.landmark, id: namespace(COASTAL_MEGACITY_PRESET.landmark.id), objectiveTargetId: ref(COASTAL_MEGACITY_PRESET.landmark.objectiveTargetId) },
    clusters: COASTAL_MEGACITY_PRESET.clusters.map((item) => ({ ...item, id: namespace(item.id) })),
    sectors: COASTAL_MEGACITY_PRESET.sectors.map((item) => ({ ...item, id: namespace(item.id) })),
    absorbableTargets: COASTAL_MEGACITY_PRESET.absorbableTargets.map((item) => ({ ...item, id: namespace(item.id), sectorId: ref(item.sectorId), linkedFacilityId: item.linkedFacilityId ? ref(item.linkedFacilityId) : undefined })),
    populationZones: COASTAL_MEGACITY_PRESET.populationZones.map((item) => ({ ...item, id: namespace(item.id) })),
    facilities: COASTAL_MEGACITY_PRESET.facilities.map((item) => ({ ...item, id: namespace(item.id) })),
    controlNodes: COASTAL_MEGACITY_PRESET.controlNodes.map((item) => ({ ...item, id: namespace(item.id), linkedFacilityId: item.linkedFacilityId ? ref(item.linkedFacilityId) : undefined })),
    groundDefenders: COASTAL_MEGACITY_PRESET.groundDefenders.map((item) => ({ ...item, id: namespace(item.id), linkedControlNodeId: item.linkedControlNodeId ? ref(item.linkedControlNodeId) : undefined })),
    breachObjectiveIds: COASTAL_MEGACITY_PRESET.breachObjectiveIds.map(ref),
  };
}

/** The first runtime shares one tactical contract across all currently playable city archetypes. */
export const RIVER_METROPOLIS_PRESET = createVariantPreset('river-metropolis', 'RIVER METROPOLIS', 'river', { x: 0, z: 0 });
export const DESERT_TECH_HUB_PRESET = createVariantPreset('desert-tech-hub', 'DESERT TECH HUB', 'desert');

export const TACTICAL_PRESETS: Record<string, TacticalPreset> = {
  [COASTAL_MEGACITY_PRESET.id]: COASTAL_MEGACITY_PRESET,
  [RIVER_METROPOLIS_PRESET.id]: RIVER_METROPOLIS_PRESET,
  [DESERT_TECH_HUB_PRESET.id]: DESERT_TECH_HUB_PRESET,
};
