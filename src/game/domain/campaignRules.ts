import { BALANCE } from './balance';
import { CITIES } from '../data/cities';
import { isPlayableCity } from '../data/playableCities';
import { WORLD_DATA_VERSION } from '../data/world';
import { resolveRecoveredCohorts } from './cohortRules';
import { calculateBreachProgress } from './missionRules';
import type { CampaignState, CityConquestState, CityDefinition, CityState, CombatModifiers, CombatState, LogisticsState, MissionCargo, PendingDebriefState, RepairAssessment, ResourceWallet } from './types';
import { createCitySideViewResourceState } from '../battle/gameplay/sideViewResourcePools';

export function createCityConquestState(alert = 0, visits = 0): CityConquestState {
  return {
    controlState: visits > 0 ? 'RAIDED' : 'UNTOUCHED',
    breachProgress: 0,
    occupationProgress: 0,
    resistance: Math.max(0, alert),
    garrisonCohortIds: [],
    commandNodesCaptured: [],
    lastControlChangeAtMinutes: null,
  };
}

export function createLogisticsState(): LogisticsState {
  return {
    coreCharge: BALANCE.conquest.initialCoreCharge,
    maxCoreCharge: BALANCE.conquest.maxCoreCharge,
    captiveReserve: 0,
    maxCaptiveReserve: BALANCE.conversion.baseCaptiveReserve,
    conversionCapacity: BALANCE.conversion.baseConversionCapacity,
    maxOverchargeCells: BALANCE.conquest.maxOverchargeCells,
    commandBandwidth: BALANCE.cohort.baseCommandBandwidth,
    dropCapacity: BALANCE.cohort.baseDropCapacity,
    emergencyChargeUsed: 0,
  };
}

export function createCityState(city: CityDefinition): CityState {
  return {
    cityId: city.id,
    remainingPopulation: city.basePopulation,
    evacuatedPopulation: 0,
    destruction: 0,
    alert: 0,
    visits: 0,
    facilities: {},
    absorbables: {},
    sideViewResources: createCitySideViewResourceState(city),
    conquest: createCityConquestState(),
    lastVisitedAtMinutes: null,
  };
}

export function createNewCampaign(seed = 48021): CampaignState {
  return {
    schemaVersion: 5,
    worldDataVersion: WORLD_DATA_VERSION,
    campaignId: `campaign-${seed}`,
    seed,
    currentTimeMinutes: 0,
    globalThreat: 8,
    currentCityId: null,
    mothership: {
      maxHull: BALANCE.mothership.maxHull,
      maxShield: BALANCE.mothership.maxShield,
      maxEnergy: BALANCE.mothership.maxEnergy,
      hull: BALANCE.mothership.maxHull,
      shield: BALANCE.mothership.maxShield,
    },
    resources: { biomass: 120, alloy: 80, intel: 12 },
    cities: Object.fromEntries(CITIES.map((city) => [city.id, createCityState(city)])),
    upgrades: {},
    completedBattles: 0,
    settings: { reducedMotion: false },
    logistics: createLogisticsState(),
    cohorts: {},
    nextCohortId: 1,
    plannedMission: null,
    activeTransit: null,
    pendingDebrief: null,
  };
}

export function applyCombatResult(campaign: CampaignState, combat: CombatState, city: CityDefinition): CampaignState {
  const previous = campaign.cities[city.id] ?? createCityState(city);
  const earned = combat.result === 'FAILED'
    ? scaleResources(combat.earned, combat.endReason === 'ABORTED' ? BALANCE.abort.cargoRecoveryRate : 0.5)
    : combat.result === 'PARTIAL'
      ? scaleResources(combat.earned, 0.8)
    : combat.earned;
  const destructionGain = Math.min(28, combat.destroyedInfrastructure * 4 + combat.collateralPopulationLoss / Math.max(1, city.basePopulation / 100));
  const populationLoss = Math.min(previous.remainingPopulation, combat.harvestedPopulation + combat.collateralPopulationLoss);
  const nextCity: CityState = {
    ...previous,
    remainingPopulation: Math.max(0, Math.round(previous.remainingPopulation - populationLoss)),
    destruction: Math.min(100, previous.destruction + destructionGain),
    alert: Math.min(100, combat.localAlert),
    visits: previous.visits + 1,
    lastVisitedAtMinutes: campaign.currentTimeMinutes,
    facilities: {
      ...previous.facilities,
      ...Object.fromEntries(combat.facilities.map((facility) => [facility.id, {
        destroyed: facility.destroyed,
        healthRatio: facility.destroyed ? 0 : facility.health / facility.maxHealth,
        repairProgress: 0,
      }])),
    },
    absorbables: persistAbsorbableTargetStates(previous, combat),
    sideViewResources: applySideViewResourceResult(previous, combat),
  };
  const globalThreatDelta = Math.min(18, 2 + combat.elapsedSeconds / 80 + combat.totalAbsorbed / 250000 + combat.destroyedInfrastructure * 1.5);
  const resourcesWithEarnings = addResources(campaign.resources, earned);
  const repairAssessment = combat.result === 'FAILED' && combat.endReason !== 'ABORTED' ? calculateRepairAssessment(resourcesWithEarnings, combat) : null;
  return {
    ...campaign,
    currentTimeMinutes: campaign.currentTimeMinutes + combat.elapsedSeconds / 60,
    globalThreat: Math.min(100, campaign.globalThreat + globalThreatDelta),
    currentCityId: city.id,
    resources: repairAssessment ? subtractRepairCost(resourcesWithEarnings, repairAssessment) : resourcesWithEarnings,
    mothership: {
      ...campaign.mothership,
      hull: combat.result === 'FAILED' && combat.endReason !== 'ABORTED' ? campaign.mothership.maxHull * BALANCE.repair.emergencyHullRatio : combat.mothership.hull,
      shield: combat.result === 'FAILED' && combat.endReason !== 'ABORTED' ? campaign.mothership.maxShield : combat.mothership.shield,
    },
    cities: { ...campaign.cities, [city.id]: nextCity },
    completedBattles: campaign.completedBattles + 1,
  };
}

export function stageMissionResult(campaign: CampaignState, combat: CombatState, city: CityDefinition): CampaignState {
  const previous = campaign.cities[city.id] ?? createCityState(city);
  const outcome = combat.result === 'ACTIVE' ? 'FAILED' : combat.result;
  const recoveryRate = outcome === 'FAILED'
    ? combat.endReason === 'ABORTED'
      ? BALANCE.abort.cargoRecoveryRate
      : Math.min(1, 0.2 + upgradeLevel(campaign, 'recovery-protocol') * 0.1)
    : 1;
  const cargoRecovered = recoverMissionCargo(combat.cargo, recoveryRate);
  const unusedCells = Math.max(0, Math.floor(combat.overchargeCells));
  cargoRecovered.coreCharge += Math.floor(unusedCells * BALANCE.conquest.coreChargePerCell * recoveryRate);
  const destructionGain = Math.min(28, combat.destroyedInfrastructure * 4 + combat.collateralPopulationLoss / Math.max(1, city.basePopulation / 100));
  const populationLoss = Math.min(previous.remainingPopulation, combat.harvestedPopulation + combat.collateralPopulationLoss);
  const cohortResults = resolveRecoveredCohorts(combat);
  const recoveredCohortIds = cohortResults.filter((result) => result.status === 'RECOVERED').map((result) => result.cohortId);
  const garrisonCandidateIds = cohortResults.filter((result) => result.status === 'GARRISON_CANDIDATE').map((result) => result.cohortId);
  const lostCohortIds = cohortResults.filter((result) => result.status === 'LOST').map((result) => result.cohortId);
  const nextCohorts = { ...campaign.cohorts };
  for (const result of cohortResults) {
    const cohort = nextCohorts[result.cohortId];
    if (!cohort) continue;
    nextCohorts[result.cohortId] = {
      ...cohort,
      strength: result.strength,
      cohesion: result.cohesion,
      control: result.control,
      experience: cohort.experience + result.experience,
      status: result.status === 'LOST' ? 'LOST' : 'RESERVE',
      assignedCityId: null,
    };
  }
  const breachProgress = calculateBreachProgress(combat, outcome, previous.conquest.breachProgress);
  const resistance = calculateResistance(campaign, combat, outcome, previous.conquest.resistance);
  const controlState = previous.conquest.controlState === 'OCCUPIED' || previous.conquest.controlState === 'ASSIMILATED'
    ? previous.conquest.controlState
    : breachProgress >= 1 ? 'BREACHED' : 'RAIDED';
  const nextCity: CityState = {
    ...previous,
    remainingPopulation: Math.max(0, Math.round(previous.remainingPopulation - populationLoss)),
    destruction: Math.min(100, previous.destruction + destructionGain),
    alert: Math.min(100, combat.localAlert),
    visits: previous.visits + 1,
    lastVisitedAtMinutes: campaign.currentTimeMinutes,
    facilities: {
      ...previous.facilities,
      ...Object.fromEntries(combat.facilities.map((facility) => [facility.id, {
        destroyed: facility.destroyed,
        healthRatio: facility.destroyed ? 0 : facility.health / facility.maxHealth,
        repairProgress: 0,
      }])),
    },
    absorbables: persistAbsorbableTargetStates(previous, combat),
    sideViewResources: applySideViewResourceResult(previous, combat),
    conquest: {
      ...previous.conquest,
      controlState,
      breachProgress,
      resistance,
      commandNodesCaptured: combat.controlNodes.filter((node) => node.owner === 'ALIEN').map((node) => node.id),
      lastControlChangeAtMinutes: controlState !== previous.conquest.controlState
        ? campaign.currentTimeMinutes + combat.elapsedSeconds / 60
        : previous.conquest.lastControlChangeAtMinutes,
    },
  };
  const globalThreatDelta = Math.min(18, 2 + combat.elapsedSeconds / 80 + combat.totalAbsorbed / 250000 + combat.destroyedInfrastructure * 1.5);
  const repairAssessment = outcome === 'FAILED' && combat.endReason !== 'ABORTED' ? calculateRepairAssessment(campaign.resources, combat) : null;
  const pendingDebrief: PendingDebriefState = {
    id: `debrief-${campaign.campaignId}-${campaign.completedBattles + 1}`,
    cityId: city.id,
    missionType: campaign.plannedMission?.missionType ?? 'RAID',
    outcome,
    cargoRecovered,
    absorbedByKind: { ...combat.absorbedByKind },
    recoveredCohortIds,
    lostCohortIds,
    garrisonCandidateIds,
    cityControlBefore: previous.conquest.controlState,
    cityControlAfterCombat: nextCity.conquest.controlState,
    destruction: nextCity.destruction,
    globalThreatDelta,
    createdAtMinutes: campaign.currentTimeMinutes + combat.elapsedSeconds / 60,
    repairAssessment,
    endReason: combat.endReason,
  };
  return {
    ...campaign,
    currentTimeMinutes: campaign.currentTimeMinutes + combat.elapsedSeconds / 60,
    globalThreat: Math.min(100, campaign.globalThreat + globalThreatDelta),
    currentCityId: city.id,
    mothership: {
      ...campaign.mothership,
      hull: combat.result === 'FAILED' && combat.endReason !== 'ABORTED' ? campaign.mothership.maxHull * BALANCE.repair.emergencyHullRatio : combat.mothership.hull,
      shield: combat.result === 'FAILED' && combat.endReason !== 'ABORTED' ? campaign.mothership.maxShield : combat.mothership.shield,
    },
    cities: { ...campaign.cities, [city.id]: nextCity },
    cohorts: nextCohorts,
    completedBattles: campaign.completedBattles + 1,
    plannedMission: null,
    activeTransit: null,
    pendingDebrief,
    resources: repairAssessment ? subtractRepairCost(campaign.resources, repairAssessment) : campaign.resources,
  };
}

function persistAbsorbableTargetStates(previous: CityState, combat: CombatState): CityState['absorbables'] {
  if (combat.battleMode === 'SIDE_VIEW') return { ...previous.absorbables };
  return {
    ...previous.absorbables,
    ...Object.fromEntries(combat.absorbableTargets.map((target) => [target.id, {
      remainingAmount: Math.max(0, Math.round(target.remainingAmount)),
      destroyedAmount: Math.max(0, Math.round(target.destroyedAmount)),
      discovered: target.discovered,
    }])),
  };
}

function applySideViewResourceResult(previous: CityState, combat: CombatState): CityState['sideViewResources'] {
  if (combat.battleMode !== 'SIDE_VIEW') return previous.sideViewResources;
  const pools = Object.fromEntries(Object.entries(previous.sideViewResources.pools).map(([kind, pool]) => [kind, { ...pool }])) as CityState['sideViewResources']['pools'];
  for (const target of combat.absorbableTargets) {
    const pool = pools[target.kind];
    if (!pool) continue;
    const depletedAmount = Math.max(0, Math.min(pool.remainingAmount, target.initialAmount - target.remainingAmount));
    const destroyedAmount = Math.max(0, Math.min(depletedAmount, target.destroyedAmount));
    pool.remainingAmount = Math.max(0, pool.remainingAmount - depletedAmount);
    pool.destroyedAmount = Math.min(pool.initialAmount - pool.remainingAmount, pool.destroyedAmount + destroyedAmount);
  }
  return { ...previous.sideViewResources, pools };
}

export function calculateRepairAssessment(resources: ResourceWallet, combat: CombatState): RepairAssessment {
  const hullDamageRatio = Math.min(1, Math.max(0, 1 - combat.mothership.hull / Math.max(1, combat.mothership.maxHull)));
  const requestedBiomass = Math.ceil(BALANCE.repair.biomassAtTotalLoss * hullDamageRatio);
  const requestedAlloy = Math.ceil(BALANCE.repair.alloyAtTotalLoss * hullDamageRatio);
  const biomassCost = Math.min(requestedBiomass, Math.floor(resources.biomass * BALANCE.repair.maximumWalletRatio));
  const alloyCost = Math.min(requestedAlloy, Math.floor(resources.alloy * BALANCE.repair.maximumWalletRatio));
  return {
    hullDamageRatio,
    biomassCost,
    alloyCost,
    unpaidBiomass: Math.max(0, requestedBiomass - biomassCost),
    unpaidAlloy: Math.max(0, requestedAlloy - alloyCost),
  };
}

function subtractRepairCost(resources: ResourceWallet, repair: RepairAssessment): ResourceWallet {
  return {
    biomass: Math.max(0, resources.biomass - repair.biomassCost),
    alloy: Math.max(0, resources.alloy - repair.alloyCost),
    intel: resources.intel,
  };
}

function recoverMissionCargo(cargo: MissionCargo, recoveryRate: number): MissionCargo {
  return {
    captives: Math.floor(cargo.captives * recoveryRate),
    biomass: Math.floor(cargo.biomass * recoveryRate),
    alloy: Math.floor(cargo.alloy * recoveryRate),
    intel: Math.floor(cargo.intel * recoveryRate),
    coreCharge: Math.floor(cargo.coreCharge * recoveryRate),
  };
}

export function deriveCombatModifiers(campaign: CampaignState): CombatModifiers {
  const conditioningLevel = upgradeLevel(campaign, 'cohort-conditioning');
  const recoveryLevel = upgradeLevel(campaign, 'recovery-protocol');
  return {
    beamRateMultiplier: 1 + upgradeLevel(campaign, 'beam-capacity') * 0.2,
    beamRadiusBonus: upgradeLevel(campaign, 'beam-radius'),
    beamEnergyCostMultiplier: Math.max(0.64, 1 - upgradeLevel(campaign, 'beam-efficiency') * 0.12),
    beamHeatMultiplier: Math.max(0.7, 1 - upgradeLevel(campaign, 'beam-efficiency') * 0.1),
    beamAlertMultiplier: Math.max(0.7, 1 - upgradeLevel(campaign, 'signature-dampener') * 0.1),
    plasmaDamageMultiplier: 1 + upgradeLevel(campaign, 'plasma-damage') * 0.15,
    energyRegenBonus: upgradeLevel(campaign, 'energy-core') * 4,
    scanRangeBonus: upgradeLevel(campaign, 'scanner-array') * 6,
    cargoCapacityBonus: upgradeLevel(campaign, 'cargo-bay') * BALANCE.cargo.capacityPerUpgrade,
    resourceYieldMultiplier: 1 + upgradeLevel(campaign, 'selective-filter') * 0.12,
    cohortMoveSpeedMultiplier: 1 + conditioningLevel * 0.08,
    cohortAssaultDamageMultiplier: 1 + conditioningLevel * 0.1,
    cohortLossMultiplier: Math.max(0.55, 1 - recoveryLevel * 0.12),
    cohortRecoveryRadiusMultiplier: 1 + recoveryLevel * 0.25,
    empDurationMultiplier: 1 + upgradeLevel(campaign, 'emp-duration') * 0.2,
    airDefenseLaserIntervalMultiplier: 1,
    threatForecastMultiplier: Math.max(0.55, 1 - upgradeLevel(campaign, 'threat-forecast') * 0.15),
    commandBandwidth: campaign.logistics.commandBandwidth,
    dropCapacity: campaign.logistics.dropCapacity,
  };
}

export function upgradeLevel(campaign: CampaignState, id: string): number {
  return campaign.upgrades[id] ?? 0;
}

export const UPGRADE_DEFINITIONS = [
  { id: 'beam-capacity', label: 'BEAM CAPACITY', group: 'HARVEST', description: '+20% harvest rate per level', maxLevel: 3, cost: (level: number) => ({ biomass: 90 * (level + 1), alloy: 0, intel: level === 2 ? 4 : 0 }) },
  { id: 'beam-radius', label: 'BEAM RADIUS', group: 'HARVEST', description: '+1.0 capture radius per level', maxLevel: 3, cost: (level: number) => ({ biomass: 120 * (level + 1), alloy: 0, intel: 0 }) },
  { id: 'beam-efficiency', label: 'BEAM EFFICIENCY', group: 'HARVEST', description: '-10% beam heat gain per level', maxLevel: 3, cost: (level: number) => ({ biomass: 100 * (level + 1), alloy: 70 * (level + 1), intel: 0 }) },
  { id: 'cargo-bay', label: 'CARGO BAY', group: 'HARVEST', description: '+10,000 cargo capacity per level', maxLevel: 3, cost: (level: number) => ({ biomass: 100 * (level + 1), alloy: 120 * (level + 1), intel: 0 }) },
  { id: 'plasma-damage', label: 'PLASMA DAMAGE', group: 'WEAPON', description: '+15% strike damage per level', maxLevel: 3, cost: (level: number) => ({ biomass: 0, alloy: 110 * (level + 1), intel: level === 2 ? 3 : 0 }) },
  { id: 'shield-capacity', label: 'SHIELD CAPACITY', group: 'DEFENSE', description: '+120 maximum shield per level', maxLevel: 3, cost: (level: number) => ({ biomass: 0, alloy: 100 * (level + 1), intel: 0 }) },
  { id: 'energy-core', label: 'ENERGY CORE', group: 'DEFENSE', description: '+120 energy and +4 regen per level', maxLevel: 3, cost: (level: number) => ({ biomass: 80 * (level + 1), alloy: 80 * (level + 1), intel: 0 }) },
  { id: 'scanner-array', label: 'SCANNER ARRAY', group: 'UTILITY', description: '+6 scan range per level', maxLevel: 3, cost: (level: number) => ({ biomass: 0, alloy: 80 * (level + 1), intel: 6 * (level + 1) }) },
  { id: 'signature-dampener', label: 'SIGNATURE DAMPENER', group: 'UTILITY', description: '-10% beam alert per level', maxLevel: 3, cost: (level: number) => ({ biomass: 0, alloy: 90 * (level + 1), intel: 5 * (level + 1) }) },
  { id: 'selective-filter', label: 'SELECTIVE FILTER', group: 'HARVEST', description: '+12% mission yield per level', maxLevel: 3, cost: (level: number) => ({ biomass: 140 * (level + 1), alloy: 50 * (level + 1), intel: level * 2 }) },
  { id: 'neural-foundry', label: 'NEURAL FOUNDRY', group: 'ARMY', description: '+1 conversion capacity per level', maxLevel: 3, cost: (level: number) => ({ biomass: 180 * (level + 1), alloy: 130 * (level + 1), intel: 2 * (level + 1) }) },
  { id: 'command-bandwidth', label: 'COMMAND BANDWIDTH', group: 'ARMY', description: '+1 simultaneous command bandwidth per level', maxLevel: 3, cost: (level: number) => ({ biomass: 120 * (level + 1), alloy: 160 * (level + 1), intel: 3 * (level + 1) }) },
  { id: 'drop-capacity', label: 'DROP CAPACITY', group: 'ARMY', description: '+1 cohort drop capacity per level', maxLevel: 3, cost: (level: number) => ({ biomass: 160 * (level + 1), alloy: 140 * (level + 1), intel: 2 * (level + 1) }) },
  { id: 'cohort-conditioning', label: 'COHORT CONDITIONING', group: 'ARMY', description: '+8% base strength and movement, +10% assault damage per level', maxLevel: 3, cost: (level: number) => ({ biomass: 200 * (level + 1), alloy: 160 * (level + 1), intel: 4 * (level + 1) }) },
  { id: 'recovery-protocol', label: 'RECOVERY PROTOCOL', group: 'ARMY', description: '-12% cohort losses and +10% failed cargo recovery per level', maxLevel: 3, cost: (level: number) => ({ biomass: 170 * (level + 1), alloy: 130 * (level + 1), intel: 4 * (level + 1) }) },
  { id: 'core-reservoir', label: 'CORE RESERVOIR', group: 'ENERGY', description: '+20 maximum Core Charge per level', maxLevel: 3, cost: (level: number) => ({ biomass: 130 * (level + 1), alloy: 180 * (level + 1), intel: 2 * (level + 1) }) },
  { id: 'capacitor-rack', label: 'CAPACITOR RACK', group: 'ENERGY', description: '+1 Overcharge Cell capacity per level', maxLevel: 3, cost: (level: number) => ({ biomass: 120 * (level + 1), alloy: 220 * (level + 1), intel: 4 * (level + 1) }) },
  { id: 'emp-duration', label: 'EMP DURATION', group: 'WEAPON', description: '+20% EMP duration per level', maxLevel: 3, cost: (level: number) => ({ biomass: 80 * (level + 1), alloy: 190 * (level + 1), intel: 3 * (level + 1) }) },
  { id: 'emergency-bio-conversion', label: 'EMERGENCY BIO-CONVERSION', group: 'ENERGY', description: '+4 emergency Core Charge grant per level', maxLevel: 3, cost: (level: number) => ({ biomass: 220 * (level + 1), alloy: 100 * (level + 1), intel: 5 * (level + 1) }) },
  { id: 'threat-forecast', label: 'THREAT FORECAST', group: 'UTILITY', description: '-15% projected alert pressure per level', maxLevel: 3, cost: (level: number) => ({ biomass: 100 * (level + 1), alloy: 120 * (level + 1), intel: 8 * (level + 1) }) },
] as const;

export function purchaseUpgrade(campaign: CampaignState, id: string): { campaign: CampaignState; ok: boolean; reason?: string } {
  const definition = UPGRADE_DEFINITIONS.find((item) => item.id === id);
  if (!definition) return { campaign, ok: false, reason: 'Unknown upgrade' };
  const level = upgradeLevel(campaign, id);
  if (level >= definition.maxLevel) return { campaign, ok: false, reason: 'Maximum level reached' };
  const cost = definition.cost(level);
  if (!hasResources(campaign.resources, cost)) return { campaign, ok: false, reason: 'Insufficient resources' };
  const next: CampaignState = { ...campaign, resources: subtractResources(campaign.resources, cost), upgrades: { ...campaign.upgrades, [id]: level + 1 } };
  if (id === 'shield-capacity') {
    next.mothership = { ...next.mothership, maxShield: next.mothership.maxShield + 120, shield: next.mothership.shield + 120 };
  }
  if (id === 'energy-core') {
    next.mothership = { ...next.mothership, maxEnergy: next.mothership.maxEnergy + 120 };
  }
  if (id === 'neural-foundry') next.logistics = { ...next.logistics, conversionCapacity: next.logistics.conversionCapacity + 1 };
  if (id === 'command-bandwidth') next.logistics = { ...next.logistics, commandBandwidth: next.logistics.commandBandwidth + 1 };
  if (id === 'drop-capacity') next.logistics = { ...next.logistics, dropCapacity: next.logistics.dropCapacity + 1 };
  if (id === 'core-reservoir') next.logistics = { ...next.logistics, maxCoreCharge: next.logistics.maxCoreCharge + 20 };
  if (id === 'capacitor-rack') next.logistics = { ...next.logistics, maxOverchargeCells: next.logistics.maxOverchargeCells + 1 };
  return { campaign: next, ok: true };
}

export interface CampaignVictoryProgress {
  occupiedCityCount: number;
  targetCityCount: number;
  progress: number;
  ready: boolean;
}

export function getCampaignVictoryProgress(campaign: CampaignState): CampaignVictoryProgress {
  const targetCities = CITIES.filter((city) => isPlayableCity(city.id));
  const occupiedCityCount = targetCities.filter((city) => {
    const state = campaign.cities[city.id];
    return state?.conquest.controlState === 'OCCUPIED' || state?.conquest.controlState === 'ASSIMILATED';
  }).length;
  const targetCityCount = targetCities.length;
  return {
    occupiedCityCount,
    targetCityCount,
    progress: targetCityCount > 0 ? occupiedCityCount / targetCityCount : 0,
    ready: targetCityCount > 0 && occupiedCityCount >= targetCityCount,
  };
}

function calculateResistance(campaign: CampaignState, combat: CombatState, outcome: CombatState['result'] | 'PARTIAL', previousResistance: number): number {
  const occupiedCityCount = Object.values(campaign.cities).filter((city) => city.conquest.controlState === 'OCCUPIED' || city.conquest.controlState === 'ASSIMILATED').length;
  const deployedCohortCount = combat.deployedCohorts.filter((cohort) => cohort.deployed).length;
  const outcomePressure = outcome === 'SUCCESS' ? 4 : outcome === 'PARTIAL' ? 2 : 1;
  const gain = outcomePressure
    + combat.elapsedSeconds / 120
    + combat.absorbedByKind.ORGANIC / 5_000
    + combat.destroyedInfrastructure * 2
    + deployedCohortCount * 3
    + occupiedCityCount * 1.5
    + combat.plasmaUses * 1.5;
  return Math.min(100, Math.max(previousResistance, combat.localAlert * 0.35, previousResistance + Math.min(24, gain)));
}

function hasResources(wallet: ResourceWallet, cost: ResourceWallet): boolean {
  return wallet.biomass >= cost.biomass && wallet.alloy >= cost.alloy && wallet.intel >= cost.intel;
}

function subtractResources(wallet: ResourceWallet, cost: ResourceWallet): ResourceWallet {
  return { biomass: wallet.biomass - cost.biomass, alloy: wallet.alloy - cost.alloy, intel: wallet.intel - cost.intel };
}

function addResources(a: ResourceWallet, b: ResourceWallet): ResourceWallet {
  return { biomass: a.biomass + b.biomass, alloy: a.alloy + b.alloy, intel: a.intel + b.intel };
}

function scaleResources(resources: ResourceWallet, factor: number): ResourceWallet {
  return { biomass: Math.floor(resources.biomass * factor), alloy: Math.floor(resources.alloy * factor), intel: Math.floor(resources.intel * factor) };
}
