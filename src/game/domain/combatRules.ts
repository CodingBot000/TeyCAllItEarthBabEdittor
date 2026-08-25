import { BALANCE } from './balance';
import { deriveCombatModifiers } from './campaignRules';
import { createControlNodes, createDeployedCohorts, createGroundDefenders, tickCohorts, updateControlNodes } from './cohortRules';
import { occupationRequirements, resolveMissionOutcome } from './missionRules';
import { ABSORBABLE_WEIGHT_BY_KIND } from './types';
import { clampTacticalPosition, TACTICAL_MAP_BOUNDS } from './tacticalBounds';
import type { AbsorbableKind, AbsorbableTargetState, AbsorptionPreview, AbilityId, BeamHeatState, BeamStopReason, CampaignState, CityDefinition, CityState, CombatFacilityState, CombatState, EnemyAbsorptionStatus, EnemyState, MissionCargo, MissionYieldPerThousand, MothershipHitEvent, PopulationZoneState, TacticalPreset, TacticalRiskForecast, TargetRecommendation, Vec2 } from './types';

export const EXIT_ZONES: Vec2[] = [
  { x: TACTICAL_MAP_BOUNDS.minX, z: TACTICAL_MAP_BOUNDS.minZ },
  { x: TACTICAL_MAP_BOUNDS.maxX, z: TACTICAL_MAP_BOUNDS.maxZ },
  { x: TACTICAL_MAP_BOUNDS.minX, z: TACTICAL_MAP_BOUNDS.maxZ },
];

export function getBeamHeatState(heat: number): BeamHeatState {
  const normalizedHeat = Math.max(0, Math.min(100, heat));
  if (normalizedHeat >= 100) return 'OVERHEATED';
  if (normalizedHeat >= BALANCE.beam.heatCriticalThreshold) return 'CRITICAL';
  if (normalizedHeat >= BALANCE.beam.heatWarningThreshold) return 'WARM';
  return 'STABLE';
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const EMPTY_MISSION_CARGO: MissionCargo = {
  captives: 0,
  biomass: 0,
  alloy: 0,
  intel: 0,
  coreCharge: 0,
};

export function rewardForAbsorbed(amount: number, yieldRate: MissionYieldPerThousand, yieldMultiplier = 1): MissionCargo {
  const scale = Number.isFinite(amount) ? Math.max(0, amount) / 1000 : 0;
  const multiplier = Number.isFinite(yieldMultiplier) ? Math.max(0, yieldMultiplier) : 1;
  return {
    captives: finiteNonNegative(scale * yieldRate.captives * multiplier),
    biomass: finiteNonNegative(scale * yieldRate.biomass * multiplier),
    alloy: finiteNonNegative(scale * yieldRate.alloy * multiplier),
    intel: finiteNonNegative(scale * yieldRate.intel * multiplier),
    coreCharge: finiteNonNegative(scale * yieldRate.coreCharge * multiplier),
  };
}

export function addMissionCargo(a: MissionCargo, b: MissionCargo): MissionCargo {
  return {
    captives: finiteNonNegative(a.captives + b.captives),
    biomass: finiteNonNegative(a.biomass + b.biomass),
    alloy: finiteNonNegative(a.alloy + b.alloy),
    intel: finiteNonNegative(a.intel + b.intel),
    coreCharge: finiteNonNegative(a.coreCharge + b.coreCharge),
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function createCombatState(campaign: CampaignState, city: CityDefinition, cityState: CityState, preset: TacticalPreset): CombatState {
  const modifiers = deriveCombatModifiers(campaign);
  const missionCells = Math.max(0, Math.floor(campaign.plannedMission?.overchargeCells ?? 0));
  const initialPosition = { x: 0, z: 66 };
  const defenseMultiplier = clamp(0.75 + city.defenseRating * 0.1, 1, 1.35);
  const zones: PopulationZoneState[] = preset.populationZones.map((zone) => ({
    ...zone,
    population: Math.round(city.basePopulation * zone.initialPopulationRatio * Math.max(0.45, 1 - cityState.destruction / 160)),
    harvested: 0,
    collateralLoss: 0,
  }));
  const facilities: CombatFacilityState[] = preset.facilities.map((facility) => {
    const saved = cityState.facilities[facility.id];
    return {
      ...facility,
      maxHealth: facility.health,
      health: saved?.destroyed ? 0 : facility.health * (saved?.healthRatio ?? 1),
      disabledUntil: 0,
      destroyed: saved?.destroyed ?? false,
    };
  });
  const absorbableTargets: AbsorbableTargetState[] = preset.absorbableTargets.map((target) => {
    const initialAmount = Math.max(0, Math.round(target.initialAmountOverride ?? target.baseAmount * targetAmountScale(city, target.kind) * Math.max(0.4, 1 - cityState.destruction / 140)));
    const saved = target.initialAmountOverride === undefined ? cityState.absorbables[target.id] : undefined;
    const remainingAmount = clamp(saved?.remainingAmount ?? initialAmount, 0, initialAmount);
    const destroyedAmount = clamp(saved?.destroyedAmount ?? 0, 0, initialAmount - remainingAmount);
    const discovered = saved?.discovered === true || distance(initialPosition, target.center) <= BALANCE.scan.autoRevealRange + target.radius;
    return {
      ...target,
      initialAmount,
      remainingAmount,
      absorbedAmount: 0,
      destroyedAmount,
      discovered,
      status: remainingAmount <= 0 ? (destroyedAmount > 0 ? 'DESTROYED' : 'DEPLETED') : discovered ? 'AVAILABLE' : 'HIDDEN',
    };
  });
  const state: CombatState = {
    cityId: city.id,
    elapsedSeconds: 0,
    battleMode: 'LEGACY_TACTICAL',
    survivalUnlockSeconds: 0,
    missionType: campaign.plannedMission?.missionType ?? 'RAID',
    breachObjectiveIds: [...preset.breachObjectiveIds],
    overchargeCells: missionCells,
    initialOverchargeCells: missionCells,
    localAlert: clamp(cityState.alert * 0.45 + campaign.globalThreat * 0.12, 0, 100),
    mothership: {
      position: initialPosition, velocity: { x: 0, z: 0 }, heading: 0, target: null,
      hull: campaign.mothership.hull, shield: campaign.mothership.shield, energy: campaign.mothership.maxEnergy,
      maxHull: campaign.mothership.maxHull, maxShield: campaign.mothership.maxShield, maxEnergy: campaign.mothership.maxEnergy,
      shieldRegenDelay: 0, beamHeat: 0, beamHeatState: getBeamHeatState(0), beamRecoverySeconds: 0, absorptionEnergyEarned: 0,
      overdriveSeconds: 0, extractionProgress: 0, extractionStatus: 'AVAILABLE',
      cargoUsed: 0, maxCargo: BALANCE.cargo.baseCapacity + modifiers.cargoCapacityBonus,
    },
    populationZones: zones,
    sectors: preset.sectors.map((sector) => ({ ...sector, center: { ...sector.center } })),
    persistentAbsorbables: { ...cityState.absorbables },
    absorbableTargets,
    facilities,
    deployedCohorts: createDeployedCohorts(campaign),
    groundDefenders: createGroundDefenders(preset.groundDefenders, defenseMultiplier, cityState.conquest.resistance),
    controlNodes: createControlNodes(preset.controlNodes),
    occupationReady: false,
    enemies: [],
    missiles: [],
    groundSwarmProjectiles: [],
    groundSwarmImpacts: [],
    lastAirDefenseShot: null,
    mothershipHits: [],
    objectives: [
      { id: 'harvest', label: `ABSORB ${BALANCE.objectives.absorbTarget.toLocaleString()} UNITS`, progress: 0, target: BALANCE.objectives.absorbTarget, complete: false },
      { id: 'landmark', label: preset.landmark.objectiveLabel, progress: landmarkProgress(absorbableTargets, preset.landmark.objectiveTargetId), target: absorbableTargets.find((target) => target.id === preset.landmark.objectiveTargetId)?.initialAmount ?? 1, complete: false, linkedTargetId: preset.landmark.objectiveTargetId },
      { id: 'survive', label: 'EXTRACT WITH HULL INTACT', progress: 0, target: 1, complete: false },
    ],
    cargo: { ...EMPTY_MISSION_CARGO },
    earned: { biomass: 0, alloy: 0, intel: 0 },
    collateralPopulationLoss: 0,
    harvestedPopulation: 0,
    totalAbsorbed: 0,
    absorbedByKind: { ORGANIC: 0, POWER: 0, VEHICLE: 0, MACHINERY: 0, DATA: 0, RELIC: 0 },
    destroyedInfrastructure: 0,
    plasmaUses: 0,
    extractionStatus: 'AVAILABLE',
    result: 'ACTIVE',
    endReason: null,
    activeAbility: null,
    abilityTarget: null,
    selectedTargetId: null,
    activeBeamTargetId: null,
    lastBeamStopReason: null,
    scanCount: 0,
    lastScanDiscovered: 0,
    defenseRating: city.defenseRating,
    defenseMultiplier,
    enemyPressureMultiplier: 1,
    modifiers,
    cooldowns: { beam: 0, scan: 0, plasma: 0, emp: 0, overdrive: 0 },
    disabledUntil: {},
    facilityCooldowns: Object.fromEntries(facilities.map((facility) => [facility.id, 1 + (facility.position.x + 80) % 2])),
    nextEntityId: 1,
    lastAirDefenseAt: -Infinity,
    lastPointDefenseAt: -Infinity,
    lastGroundSwarmAt: -Infinity,
    lastWaveAlert: -1,
  };
  refreshTargetStatuses(state);
  return state;
}

function landmarkProgress(targets: AbsorbableTargetState[], targetId: string): number {
  const target = targets.find((item) => item.id === targetId);
  return target ? Math.max(0, target.initialAmount - target.remainingAmount - target.destroyedAmount) : 0;
}

function targetAmountScale(city: CityDefinition, kind: AbsorbableKind): number {
  if (kind === 'ORGANIC') return clamp(0.85 + city.basePopulation / 50_000_000, 0.85, 1.2);
  if (kind === 'DATA' || kind === 'RELIC') return clamp(0.85 + city.technologyRating * 0.05, 0.9, 1.2);
  return clamp(0.85 + city.resourceRating * 0.05, 0.9, 1.2);
}

export function commandMove(state: CombatState, target: Vec2): void {
  state.mothership.target = clampTacticalPosition(target);
}

export function registerAmbientAbsorbableTarget(
  state: CombatState,
  ambient: { id: string; kind: 'ORGANIC' | 'VEHICLE'; weight: number; label: string; center: Vec2; radius: number },
): string {
  const existing = state.absorbableTargets.find((target) => target.id === ambient.id);
  if (existing) {
    existing.center = { ...ambient.center };
    return existing.id;
  }
  const isCivilian = ambient.kind === 'ORGANIC';
  const baseAmount = isCivilian ? 1000 : 3500;
  const saved = state.persistentAbsorbables[ambient.id];
  const remainingAmount = Math.max(0, Math.min(baseAmount, saved?.remainingAmount ?? baseAmount));
  const destroyedAmount = Math.max(0, Math.min(baseAmount - remainingAmount, saved?.destroyedAmount ?? 0));
  const target: AbsorbableTargetState = {
    id: ambient.id,
    sectorId: 'ambient',
    label: ambient.label,
    kind: ambient.kind,
    weight: Math.max(1, ambient.weight || ABSORBABLE_WEIGHT_BY_KIND[ambient.kind]),
    center: { ...ambient.center },
    radius: ambient.radius,
    baseAmount,
    density: isCivilian ? 1 : 0.95,
    yieldPerThousand: isCivilian
      ? { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 }
      : { captives: 0, biomass: 2, alloy: 7, intel: 0, coreCharge: 0 },
    energyCostMultiplier: isCivilian ? 1 : 0.95,
    alertMultiplier: isCivilian ? 0.75 : 0.8,
    requirement: 'NONE',
    optional: true,
    visualBudget: 1,
    initialAmount: baseAmount,
    remainingAmount,
    absorbedAmount: 0,
    destroyedAmount,
    discovered: true,
    status: remainingAmount <= 0 ? (destroyedAmount > 0 ? 'DESTROYED' : 'DEPLETED') : 'AVAILABLE',
  };
  state.absorbableTargets.push(target);
  return target.id;
}

export function stopBeam(state: CombatState, reason: BeamStopReason = 'MANUAL'): void {
  if (state.activeAbility === 'beam') state.activeAbility = null;
  state.abilityTarget = null;
  state.activeBeamTargetId = null;
  state.lastBeamStopReason = reason;
}

export function selectAbsorbableTarget(state: CombatState, targetId: string): { ok: boolean; reason?: string } {
  const target = state.absorbableTargets.find((item) => item.id === targetId);
  if (!target) return { ok: false, reason: 'TARGET NOT FOUND' };
  const directAccess = isAmbientDirectAccessTarget(target);
  if (!target.discovered && !directAccess) return { ok: false, reason: 'TARGET NOT SCANNED' };
  if (directAccess) target.discovered = true;
  refreshTargetStatus(state, target);
  state.selectedTargetId = target.id;
  if (target.status === 'DEPLETED') return { ok: false, reason: 'TARGET DEPLETED' };
  if (target.status === 'DESTROYED') return { ok: false, reason: 'TARGET DESTROYED' };
  if (target.status === 'LOCKED') return { ok: false, reason: targetLockReason(target) };
  return { ok: true };
}

export function startBeamOnTarget(state: CombatState, targetId: string): { ok: boolean; reason?: string } {
  const check = abilityCheck(state, 'beam');
  if (!check.ok) return check;
  const enemy = state.enemies.find((item) => item.id === targetId);
  if (enemy) {
    const enemyCheck = checkEnemyAbsorption(state, enemy.id);
    return { ok: false, reason: enemyCheck.reason ?? 'ENEMY NOT ABSORBABLE' };
  }
  if (state.mothership.cargoUsed >= state.mothership.maxCargo) return { ok: false, reason: 'CARGO FULL' };
  const selected = selectAbsorbableTarget(state, targetId);
  if (!selected.ok) return selected;
  const target = state.absorbableTargets.find((item) => item.id === targetId)!;
  if (distance(state.mothership.position, target.center) > BALANCE.beam.range + target.radius) return { ok: false, reason: 'OUT OF RANGE' };
  state.activeAbility = 'beam';
  state.activeBeamTargetId = target.id;
  state.abilityTarget = { ...target.center };
  state.mothership.target = null;
  state.lastBeamStopReason = null;
  return { ok: true };
}

export function getEnemyAbsorptionStatus(state: CombatState, enemy: EnemyState): EnemyAbsorptionStatus {
  if (enemy.health <= 0) return 'DESTROYED';
  if (enemy.disabledUntil > state.elapsedSeconds) return 'DISABLED';
  const distanceToShip = distance(enemy.position, state.mothership.position);
  if (distanceToShip >= BALANCE.defense.fighterMinAttackRange && distanceToShip <= BALANCE.defense.fighterAttackRange) return 'ATTACKING';
  return 'NEUTRAL';
}

export function checkEnemyAbsorption(state: CombatState, enemyId: string): { ok: boolean; reason?: string; status?: EnemyAbsorptionStatus } {
  const enemy = state.enemies.find((item) => item.id === enemyId);
  if (!enemy) return { ok: false, reason: 'ENEMY NOT FOUND' };
  const status = getEnemyAbsorptionStatus(state, enemy);
  if (status === 'ATTACKING') return { ok: false, reason: 'TARGET ATTACKING', status };
  if (status === 'DESTROYED') return { ok: false, reason: 'TARGET DESTROYED', status };
  if (status === 'DISABLED') return { ok: false, reason: 'TARGET DISABLED', status };
  return { ok: false, reason: 'ENEMY NOT ABSORBABLE', status };
}

function targetLockReason(target: AbsorbableTargetState): string {
  if (target.requirement === 'EMP_WINDOW') return 'EMP WINDOW REQUIRED';
  if (target.requirement === 'PLASMA_OPENING') return 'PLASMA OPENING REQUIRED';
  return 'FACILITY MUST BE DISABLED';
}

function isAmbientDirectAccessTarget(target: AbsorbableTargetState): boolean {
  return target.id.startsWith('ambient:') && (target.kind === 'ORGANIC' || target.kind === 'VEHICLE');
}

function targetAbsorbedAmount(target: AbsorbableTargetState): number {
  const persistedAbsorbed = target.initialAmount - target.remainingAmount - target.destroyedAmount;
  return Math.max(0, target.absorbedAmount, persistedAbsorbed);
}

function beamWeightHeatMultiplier(weight: number): number {
  const normalizedWeight = clamp(
    (Math.max(1, weight) - 1) / Math.max(1, BALANCE.beam.heatWeightReference - 1),
    0,
    1,
  );
  return 1 + normalizedWeight * (BALANCE.beam.heatWeightMaxMultiplier - 1);
}

function beamAbsorptionHeatMultiplier(absorbedAmount: number): number {
  const progress = clamp(absorbedAmount / BALANCE.beam.heatAbsorptionRampUnits, 0, 1);
  return 1 + progress * (BALANCE.beam.heatAbsorptionMaxMultiplier - 1);
}

function averageBeamAbsorptionHeatMultiplier(startAbsorbed: number, additionalAbsorbed: number): number {
  if (additionalAbsorbed <= 0) return beamAbsorptionHeatMultiplier(startAbsorbed);
  const rampUnits = BALANCE.beam.heatAbsorptionRampUnits;
  const start = Math.max(0, startAbsorbed);
  const end = start + additionalAbsorbed;
  const rampStart = Math.min(start, rampUnits);
  const rampEnd = Math.min(end, rampUnits);
  const rampLength = Math.max(0, rampEnd - rampStart);
  const rampProgressArea = rampLength * (rampStart + rampEnd) / (2 * rampUnits);
  const cappedLength = Math.max(0, end - Math.max(start, rampUnits));
  const averageProgress = (rampProgressArea + cappedLength) / additionalAbsorbed;
  return 1 + averageProgress * (BALANCE.beam.heatAbsorptionMaxMultiplier - 1);
}

export function getBeamHeatRate(state: CombatState, target?: AbsorbableTargetState): number {
  const activeTarget = target ?? state.absorbableTargets.find((item) => item.id === state.activeBeamTargetId);
  const weightMultiplier = activeTarget ? beamWeightHeatMultiplier(activeTarget.weight) : 1;
  const absorptionMultiplier = activeTarget ? beamAbsorptionHeatMultiplier(targetAbsorbedAmount(activeTarget)) : 1;
  return BALANCE.beam.heatPerSecond * state.modifiers.beamHeatMultiplier * weightMultiplier * absorptionMultiplier;
}

export function getAbsorptionPreview(state: CombatState, targetId: string): AbsorptionPreview | null {
  const target = state.absorbableTargets.find((item) => item.id === targetId);
  if (!target || (!target.discovered && !isAmbientDirectAccessTarget(target)) || target.remainingAmount <= 0) return null;
  const ratePerSecond = BALANCE.beam.harvestPerSecond * target.density * state.modifiers.beamRateMultiplier;
  const cargoRemaining = Math.max(0, state.mothership.maxCargo - state.mothership.cargoUsed);
  const absorbableAmount = Math.max(0, Math.min(target.remainingAmount, cargoRemaining));
  const estimatedSeconds = ratePerSecond > 0 ? absorbableAmount / ratePerSecond : 0;
  const activeRadars = state.facilities.filter((facility) => facility.kind === 'RADAR' && !facility.destroyed && facility.disabledUntil <= state.elapsedSeconds).length;
  const radarMultiplier = 1 + activeRadars * 0.2;
  const alertPerSecond = (BALANCE.alert.basePerSecond + BALANCE.alert.beamPerSecond * state.modifiers.beamAlertMultiplier * target.alertMultiplier) * radarMultiplier;
  let limitingFactor: AbsorptionPreview['limitingFactor'] = 'NONE';
  if (cargoRemaining <= absorbableAmount + 0.001) limitingFactor = 'CARGO';
  else if (target.remainingAmount <= absorbableAmount + 0.001) limitingFactor = 'TARGET';
  const generatedEnergy = absorbableAmount / 1000 * BALANCE.beam.tacticalEnergyPerThousand;
  const energyGain = Math.min(generatedEnergy, Math.max(0, state.mothership.maxEnergy - state.mothership.energy));
  return {
    absorbableAmount,
    estimatedSeconds,
    energyCost: 0,
    energyGain,
    heatGain: BALANCE.beam.heatPerSecond
      * state.modifiers.beamHeatMultiplier
      * beamWeightHeatMultiplier(target.weight)
      * averageBeamAbsorptionHeatMultiplier(targetAbsorbedAmount(target), absorbableAmount)
      * estimatedSeconds,
    alertGain: alertPerSecond * estimatedSeconds,
    rewards: rewardForAbsorbed(absorbableAmount, target.yieldPerThousand, state.modifiers.resourceYieldMultiplier),
    limitingFactor,
  };
}

export function getTargetRecommendation(state: CombatState): TargetRecommendation | null {
  const objective = state.objectives.find((item) => item.id === 'harvest');
  const objectiveRemaining = Math.max(0, (objective?.target ?? BALANCE.objectives.absorbTarget) - (objective?.progress ?? state.totalAbsorbed));
  const candidates = state.absorbableTargets.flatMap((target) => {
    if (!target.discovered || target.status !== 'AVAILABLE' || target.remainingAmount <= 0) return [];
    const preview = getAbsorptionPreview(state, target.id);
    if (!preview || preview.absorbableAmount <= 0) return [];
    const targetDistance = distance(state.mothership.position, target.center);
    const primaryReward = primaryRewardOf(preview.rewards);
    const rewardValue = preview.rewards.captives / 1000 * 0.35
      + preview.rewards.biomass * 0.35
      + preview.rewards.alloy * 1.25
      + preview.rewards.intel * 1.8
      + preview.rewards.coreCharge * 2.2;
    const objectiveValue = Math.min(preview.absorbableAmount, objectiveRemaining) / 1000 * 7;
    const completionBonus = preview.limitingFactor === 'TARGET' ? 8 : 0;
    const score = rewardValue + objectiveValue + completionBonus - preview.alertGain * 1.8 - preview.estimatedSeconds * 0.7 - targetDistance * 0.16;
    return [{
      targetId: target.id,
      score,
      distance: targetDistance,
      projectedAlert: clamp(state.localAlert + preview.alertGain * state.modifiers.threatForecastMultiplier, 0, 100),
      primaryReward,
      reason: recommendationReason(primaryReward, preview, targetDistance),
    } satisfies TargetRecommendation];
  });
  return candidates.sort((a, b) => b.score - a.score || a.distance - b.distance)[0] ?? null;
}

export function getTacticalRiskForecast(state: CombatState, preview: AbsorptionPreview | null = null): TacticalRiskForecast {
  const cargoRatio = state.mothership.cargoUsed / Math.max(1, state.mothership.maxCargo);
  const hullRatio = state.mothership.hull / Math.max(1, state.mothership.maxHull);
  const shieldRatio = state.mothership.shield / Math.max(1, state.mothership.maxShield);
  const incomingThreats = state.enemies.length + state.missiles.length;
  const projectedAlert = clamp(state.localAlert + (preview?.alertGain ?? 0) * state.modifiers.threatForecastMultiplier, 0, 100);
  const score = clamp(
    projectedAlert * 0.48
      + (1 - hullRatio) * 38
      + (1 - shieldRatio) * 12
      + Math.min(24, state.enemies.length * 1.5 + state.missiles.length * 4)
      + cargoRatio * 12,
    0,
    100,
  );
  const shouldExtract = cargoRatio >= 0.95 || hullRatio <= 0.25 || projectedAlert >= 92 || score >= 82;
  const level = shouldExtract ? 'CRITICAL' : score >= 64 || hullRatio < 0.5 ? 'HIGH' : score >= 36 ? 'GUARDED' : 'LOW';
  return {
    level,
    score,
    projectedAlert,
    cargoRatio,
    hullRatio,
    shieldRatio,
    incomingThreats,
    shouldExtract,
    warning: riskWarning(level, { cargoRatio, hullRatio, projectedAlert, incomingThreats }),
  };
}

function primaryRewardOf(rewards: MissionCargo): keyof MissionCargo {
  return (Object.keys(rewards) as Array<keyof MissionCargo>).sort((a, b) => rewards[b] - rewards[a])[0] ?? 'biomass';
}

function recommendationReason(primaryReward: keyof MissionCargo, preview: AbsorptionPreview, targetDistance: number): string {
  if (targetDistance <= BALANCE.beam.range) return `READY · BEST ${missionCargoLabel(primaryReward)} RETURN`;
  if (preview.limitingFactor === 'CARGO') return 'SHORT RUN · CARGO LIMITED';
  if (preview.limitingFactor === 'ENERGY') return 'ENERGY LIMITED · RECHARGE FIRST';
  return `APPROACH · BEST ${missionCargoLabel(primaryReward)} RETURN`;
}

function missionCargoLabel(key: keyof MissionCargo): string {
  return key === 'coreCharge' ? 'CORE CHARGE' : key.toUpperCase();
}

function riskWarning(level: TacticalRiskForecast['level'], input: { cargoRatio: number; hullRatio: number; projectedAlert: number; incomingThreats: number }): string {
  if (input.cargoRatio >= 0.95) return 'CARGO SECURED — EXTRACT NOW';
  if (input.hullRatio <= 0.25) return 'HULL FAILURE RISK — EXTRACT NOW';
  if (input.projectedAlert >= 92) return 'NEXT RUN TRIGGERS TOTAL RESPONSE';
  if (input.incomingThreats >= 6) return 'HEAVY CONTACT PRESSURE';
  if (level === 'HIGH') return 'LIMIT EXPOSURE OR DISABLE DEFENSES';
  if (level === 'GUARDED') return 'MONITOR ALERT BEFORE NEXT RUN';
  return 'BEAM WINDOW ACCEPTABLE';
}

export function heavyAbilityCellCost(ability: AbilityId): number {
  return ability === 'plasma' || ability === 'emp' || ability === 'overdrive' ? 1 : 0;
}

export function abilityCheck(state: CombatState, ability: AbilityId, target?: Vec2): { ok: boolean; reason?: string } {
  if (state.result !== 'ACTIVE') return { ok: false, reason: 'Combat is over' };
  if (ability === 'beam' && state.mothership.extractionStatus === 'IN_PROGRESS') return { ok: false, reason: 'EXTRACTION IN PROGRESS' };
  if (ability === 'beam' && state.mothership.beamRecoverySeconds > 0) return { ok: false, reason: 'BEAM OVERHEATED' };
  if (state.cooldowns[ability] > 0) return { ok: false, reason: `COOLDOWN ${state.cooldowns[ability].toFixed(1)}s` };
  if (target && (ability === 'plasma' || ability === 'emp') && distance(state.mothership.position, target) > (ability === 'emp' ? BALANCE.emp.range : BALANCE.plasma.range)) {
    return { ok: false, reason: 'OUT OF RANGE' };
  }
  const cost = ability === 'beam' ? 0
    : ability === 'scan' ? BALANCE.scan.energy
      : ability === 'plasma' ? BALANCE.plasma.energy
        : ability === 'emp' ? BALANCE.emp.energy
          : BALANCE.overdrive.energy;
  if (state.mothership.energy < cost) return { ok: false, reason: 'ENERGY LOW' };
  if (state.overchargeCells < heavyAbilityCellCost(ability)) return { ok: false, reason: 'NO OVERCHARGE CELLS' };
  if (ability === 'beam' && state.mothership.cargoUsed >= state.mothership.maxCargo) return { ok: false, reason: 'CARGO FULL' };
  return { ok: true };
}

export function scanTargets(state: CombatState): { ok: boolean; reason?: string; discovered?: number } {
  const check = abilityCheck(state, 'scan');
  if (!check.ok) return check;
  const range = BALANCE.scan.range + state.modifiers.scanRangeBonus;
  let discovered = 0;
  for (const target of state.absorbableTargets) {
    if (isAmbientDirectAccessTarget(target)) continue;
    if (!target.discovered && distance(state.mothership.position, target.center) <= range + target.radius) {
      target.discovered = true;
      discovered += 1;
      refreshTargetStatus(state, target);
    }
  }
  state.mothership.energy -= BALANCE.scan.energy;
  state.cooldowns.scan = BALANCE.scan.cooldown;
  state.scanCount += 1;
  state.lastScanDiscovered = discovered;
  return { ok: true, discovered };
}

export function activateAbility(state: CombatState, ability: AbilityId, target?: Vec2): { ok: boolean; reason?: string; discovered?: number } {
  if (ability === 'scan') return scanTargets(state);
  if (ability === 'overdrive') {
    const check = abilityCheck(state, ability);
    if (!check.ok) return check;
    state.mothership.energy -= BALANCE.overdrive.energy;
    state.overchargeCells -= heavyAbilityCellCost(ability);
    state.mothership.overdriveSeconds = BALANCE.overdrive.duration;
    state.cooldowns.overdrive = BALANCE.overdrive.cooldown;
    return { ok: true };
  }
  if (!target) return { ok: false, reason: 'TARGET REQUIRED' };
  if (ability === 'beam') {
    const check = abilityCheck(state, ability);
    if (!check.ok) return check;
    const absorbable = state.absorbableTargets
      .filter((item) => distance(item.center, target) <= item.radius + state.modifiers.beamRadiusBonus)
      .sort((a, b) => distance(a.center, target) - distance(b.center, target))[0];
    return absorbable ? startBeamOnTarget(state, absorbable.id) : { ok: false, reason: 'NO ABSORBABLE TARGET' };
  }
  const check = abilityCheck(state, ability, target);
  if (!check.ok) return check;
  state.abilityTarget = { ...target };
  if (ability === 'plasma') {
    state.mothership.energy -= BALANCE.plasma.energy;
    state.overchargeCells -= heavyAbilityCellCost(ability);
    state.cooldowns.plasma = BALANCE.plasma.cooldown;
    state.plasmaUses += 1;
    applyPlasma(state, target);
  } else {
    state.mothership.energy -= BALANCE.emp.energy;
    state.overchargeCells -= heavyAbilityCellCost(ability);
    state.cooldowns.emp = BALANCE.emp.cooldown;
    applyEmp(state, target);
  }
  state.activeAbility = null;
  return { ok: true };
}

function applyPlasma(state: CombatState, target: Vec2): void {
  for (const facility of state.facilities) {
    if (!facility.destroyed && distance(facility.position, target) <= BALANCE.plasma.radius) {
      facility.health = Math.max(0, facility.health - BALANCE.plasma.facilityDamage * state.modifiers.plasmaDamageMultiplier);
      if (facility.health === 0) {
        facility.destroyed = true;
        state.destroyedInfrastructure += 1;
      }
    }
  }
  for (const enemy of state.enemies) {
    if (distance(enemy.position, target) <= BALANCE.plasma.radius) enemy.health = 0;
  }
  for (const defender of state.groundDefenders) {
    if (defender.health > 0 && distance(defender.position, target) <= BALANCE.plasma.radius) defender.health = Math.max(0, defender.health - BALANCE.plasma.facilityDamage * state.modifiers.plasmaDamageMultiplier);
  }
  const collateral = damageAbsorbablesInRadius(state, target, BALANCE.plasma.radius, BALANCE.plasma.collateralRatio);
  state.collateralPopulationLoss += collateral;
  refreshTargetStatuses(state);
  state.localAlert = clamp(state.localAlert + 2, 0, 100);
}

function applyEmp(state: CombatState, target: Vec2): void {
  for (const facility of state.facilities) {
    if (!facility.destroyed && distance(facility.position, target) <= BALANCE.emp.radius) {
      facility.disabledUntil = Math.max(facility.disabledUntil, state.elapsedSeconds + BALANCE.emp.duration * state.modifiers.empDurationMultiplier);
    }
  }
  for (const defender of state.groundDefenders) {
    if (defender.health > 0 && distance(defender.position, target) <= BALANCE.emp.radius) defender.disabledUntil = Math.max(defender.disabledUntil, state.elapsedSeconds + BALANCE.emp.duration * state.modifiers.empDurationMultiplier);
  }
  state.missiles = state.missiles.filter((missile) => distance(missile.position, target) > BALANCE.emp.radius);
  refreshTargetStatuses(state);
}

function damageAbsorbablesInRadius(state: CombatState, center: Vec2, radius: number, ratio: number): number {
  let organicCollateral = 0;
  for (const target of state.absorbableTargets) {
    if (target.remainingAmount > 0 && distance(target.center, center) <= radius + target.radius) {
      const destroyed = Math.min(target.remainingAmount, target.remainingAmount * ratio);
      target.remainingAmount -= destroyed;
      target.destroyedAmount += destroyed;
      if (target.kind === 'ORGANIC') organicCollateral += destroyed;
    }
  }
  return organicCollateral;
}

export function refreshAbsorbableTargetStatuses(state: CombatState): void {
  for (const target of state.absorbableTargets) refreshTargetStatus(state, target);
}

const refreshTargetStatuses = refreshAbsorbableTargetStatuses;

function refreshTargetStatus(state: CombatState, target: AbsorbableTargetState): void {
  if (target.remainingAmount <= 0.001) {
    target.remainingAmount = 0;
    target.status = target.destroyedAmount >= target.initialAmount - 0.001 ? 'DESTROYED' : 'DEPLETED';
    return;
  }
  if (!target.discovered) {
    target.status = 'HIDDEN';
    return;
  }
  if (target.requirement === 'NONE') {
    target.status = 'AVAILABLE';
    return;
  }
  const facility = state.facilities.find((item) => item.id === target.linkedFacilityId);
  const disabled = Boolean(facility && (facility.destroyed || facility.disabledUntil > state.elapsedSeconds));
  if (target.requirement === 'EMP_WINDOW') target.status = facility && !facility.destroyed && facility.disabledUntil > state.elapsedSeconds ? 'AVAILABLE' : 'LOCKED';
  else if (target.requirement === 'PLASMA_OPENING') target.status = facility?.destroyed ? 'AVAILABLE' : 'LOCKED';
  else target.status = disabled ? 'AVAILABLE' : 'LOCKED';
}

export function tickCombat(state: CombatState, dt: number): void {
  if (state.result !== 'ACTIVE') return;
  const step = Math.min(dt, 0.25);
  state.elapsedSeconds += step;
  state.mothershipHits = state.mothershipHits.filter((hit) => state.elapsedSeconds - hit.occurredAt <= 2.5);
  refreshTargetStatuses(state);
  for (const ability of Object.keys(state.cooldowns) as AbilityId[]) state.cooldowns[ability] = Math.max(0, state.cooldowns[ability] - step);
  state.mothership.overdriveSeconds = Math.max(0, state.mothership.overdriveSeconds - step);
  if (state.activeAbility !== 'beam') {
    state.mothership.energy = clamp(state.mothership.energy + (BALANCE.mothership.energyRegen + state.modifiers.energyRegenBonus) * step, 0, state.mothership.maxEnergy);
  }
  state.mothership.shieldRegenDelay = Math.max(0, state.mothership.shieldRegenDelay - step);
  if (state.mothership.shieldRegenDelay === 0) state.mothership.shield = clamp(state.mothership.shield + BALANCE.mothership.shieldRegen * step, 0, state.mothership.maxShield);
  moveMothership(state, step);
  tickBeamHeat(state, step);
  if (state.activeAbility === 'beam') tickBeam(state, step);
  tickAlert(state, step);
  tickWaves(state);
  tickSamSites(state, step);
  tickMissiles(state, step);
  tickEnemies(state, step);
  tickAirDefenseLaser(state);
  tickCohorts(state, step);
  updateControlNodes(state, step);
  state.occupationReady = occupationRequirements(state).occupationReady;
  runPointDefense(state);
  updateObjectives(state);
  if (state.mothership.hull <= 0) {
    state.result = 'FAILED';
    state.endReason = 'MOTHERSHIP_DISABLED';
  }
  if (state.mothership.extractionStatus === 'COMPLETE') state.result = resolveMissionOutcome(state);
}

export function tickBeamHeat(state: CombatState, deltaSeconds: number): void {
  const step = Math.max(0, deltaSeconds);
  const mothership = state.mothership;

  if (mothership.beamRecoverySeconds > 0) {
    mothership.beamRecoverySeconds = Math.max(0, mothership.beamRecoverySeconds - step);
    mothership.beamHeat = Math.max(0, mothership.beamHeat - BALANCE.beam.heatRecoveryPerSecond * step);
    mothership.beamHeatState = mothership.beamRecoverySeconds > 0 ? 'OVERHEATED' : getBeamHeatState(mothership.beamHeat);
    return;
  }

  if (state.activeAbility === 'beam') {
    mothership.beamHeat = Math.min(100, mothership.beamHeat + getBeamHeatRate(state) * step);
    if (mothership.beamHeat >= 100) {
      mothership.beamHeat = 100;
      mothership.beamRecoverySeconds = BALANCE.beam.overheatRecoverySeconds;
      mothership.beamHeatState = 'OVERHEATED';
      stopBeam(state, 'OVERHEATED');
      return;
    }
  } else {
    mothership.beamHeat = Math.max(0, mothership.beamHeat - BALANCE.beam.heatRecoveryPerSecond * step);
  }

  mothership.beamHeatState = getBeamHeatState(mothership.beamHeat);
}

function moveMothership(state: CombatState, dt: number): void {
  const ship = state.mothership;
  if (!ship.target) {
    ship.velocity.x *= Math.max(0, 1 - BALANCE.mothership.deceleration * dt);
    ship.velocity.z *= Math.max(0, 1 - BALANCE.mothership.deceleration * dt);
    return;
  }
  const dx = ship.target.x - ship.position.x;
  const dz = ship.target.z - ship.position.z;
  const remaining = Math.hypot(dx, dz);
  if (remaining <= BALANCE.mothership.arrivalRadius) {
    ship.position = { ...ship.target };
    ship.target = null;
    ship.velocity = { x: 0, z: 0 };
    return;
  }
  const movementMultiplier = state.activeAbility === 'beam' ? BALANCE.beam.movementSpeedMultiplier : 1;
  const maxSpeed = BALANCE.mothership.maxSpeed * movementMultiplier;
  const desiredX = (dx / remaining) * maxSpeed;
  const desiredZ = (dz / remaining) * maxSpeed;
  const blend = Math.min(1, BALANCE.mothership.acceleration * movementMultiplier * dt / maxSpeed);
  ship.velocity.x += (desiredX - ship.velocity.x) * blend;
  ship.velocity.z += (desiredZ - ship.velocity.z) * blend;
  const desiredHeading = Math.atan2(dx, dz);
  const rotationMultiplier = state.activeAbility === 'beam' ? BALANCE.beam.rotationSpeedMultiplier : 1;
  const headingDelta = normalizeAngle(desiredHeading - ship.heading);
  ship.heading += headingDelta * Math.min(1, BALANCE.mothership.turnSpeed * rotationMultiplier * dt);
  const nextPosition = clampTacticalPosition({
    x: ship.position.x + ship.velocity.x * dt,
    z: ship.position.z + ship.velocity.z * dt,
  });
  ship.position.x = nextPosition.x;
  ship.position.z = nextPosition.z;
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function tickBeam(state: CombatState, dt: number): void {
  const target = state.absorbableTargets.find((item) => item.id === state.activeBeamTargetId);
  if (!target) {
    stopBeam(state, 'TARGET_DEPLETED');
    return;
  }
  refreshTargetStatus(state, target);
  if (target.status === 'LOCKED') {
    stopBeam(state, 'TARGET_LOCKED');
    return;
  }
  if (target.status === 'HIDDEN') {
    stopBeam(state, 'TARGET_LOCKED');
    return;
  }
  if (target.remainingAmount <= 0) {
    stopBeam(state, 'TARGET_DEPLETED');
    return;
  }
  if (distance(state.mothership.position, target.center) > BALANCE.beam.range + target.radius) {
    stopBeam(state, 'OUT_OF_RANGE');
    return;
  }
  const cargoRemaining = Math.max(0, state.mothership.maxCargo - state.mothership.cargoUsed);
  if (cargoRemaining <= 0) {
    stopBeam(state, 'CARGO_FULL');
    return;
  }

  const absorbed = Math.min(target.remainingAmount, cargoRemaining, BALANCE.beam.harvestPerSecond * target.density * state.modifiers.beamRateMultiplier * dt);
  const generatedEnergy = absorbed / 1000 * BALANCE.beam.tacticalEnergyPerThousand;
  const appliedEnergy = Math.min(generatedEnergy, Math.max(0, state.mothership.maxEnergy - state.mothership.energy));
  state.mothership.energy = Math.min(state.mothership.maxEnergy, state.mothership.energy + appliedEnergy);
  state.mothership.absorptionEnergyEarned += appliedEnergy;
  target.remainingAmount = Math.max(0, target.remainingAmount - absorbed);
  target.absorbedAmount += absorbed;
  state.totalAbsorbed += absorbed;
  state.mothership.cargoUsed += absorbed;
  state.absorbedByKind[target.kind] += absorbed;
  if (target.kind === 'ORGANIC') state.harvestedPopulation += absorbed;
  state.cargo = addMissionCargo(state.cargo, rewardForAbsorbed(absorbed, target.yieldPerThousand, state.modifiers.resourceYieldMultiplier));
  state.earned = {
    biomass: state.cargo.biomass,
    alloy: state.cargo.alloy,
    intel: state.cargo.intel,
  };
  refreshTargetStatus(state, target);
  if (target.remainingAmount <= 0) stopBeam(state, 'TARGET_DEPLETED');
  else if (state.mothership.cargoUsed >= state.mothership.maxCargo - 0.001) stopBeam(state, 'CARGO_FULL');
}

export function chargeShield(state: CombatState): { ok: boolean; reason?: string; energySpent?: number; shieldGained?: number } {
  if (state.result !== 'ACTIVE') return { ok: false, reason: 'COMBAT IS OVER' };
  if (state.mothership.shield >= state.mothership.maxShield - 0.001) return { ok: false, reason: 'SHIELD FULL' };
  if (state.mothership.energy <= 0) return { ok: false, reason: 'ENERGY LOW' };
  const shieldSpace = Math.max(0, state.mothership.maxShield - state.mothership.shield);
  const energySpent = Math.min(BALANCE.shieldCharge.energyPerUse, state.mothership.energy, shieldSpace / BALANCE.shieldCharge.efficiency);
  const shieldGained = energySpent * BALANCE.shieldCharge.efficiency;
  state.mothership.energy = Math.max(0, state.mothership.energy - energySpent);
  state.mothership.shield = Math.min(state.mothership.maxShield, state.mothership.shield + shieldGained);
  state.mothership.shieldRegenDelay = BALANCE.mothership.shieldRegenDelay;
  return { ok: true, energySpent, shieldGained };
}

function tickAlert(state: CombatState, dt: number): void {
  const activeRadars = state.facilities.filter((f) => f.kind === 'RADAR' && !f.destroyed && f.disabledUntil <= state.elapsedSeconds).length;
  const radarMultiplier = 1 + activeRadars * 0.2;
  const activeTarget = state.absorbableTargets.find((target) => target.id === state.activeBeamTargetId);
  const beamAlert = state.activeAbility === 'beam'
    ? BALANCE.alert.beamPerSecond * state.modifiers.beamAlertMultiplier * (activeTarget?.alertMultiplier ?? 1)
    : 0;
  state.localAlert = clamp(state.localAlert + (BALANCE.alert.basePerSecond + beamAlert) * radarMultiplier * dt, 0, 100);
}

function tickWaves(state: CombatState): void {
  const airbaseAlive = state.facilities.some((f) => f.kind === 'AIRBASE' && !f.destroyed);
  for (const threshold of [20, 40, 60, 80, 100]) {
    if (threshold <= state.lastWaveAlert || state.localAlert < threshold) continue;
    state.lastWaveAlert = threshold;
    if (!airbaseAlive && threshold > 40) continue;
    const baseCount = threshold >= 80 ? 6 : threshold >= 40 ? 5 : BALANCE.defense.fighterMinSquadSize;
    const requestedCount = Math.round((baseCount + Math.max(0, Math.round((state.defenseMultiplier - 1) * 4))) * state.enemyPressureMultiplier);
    const count = Math.max(0, Math.min(requestedCount, BALANCE.defense.fighterMaxCount - state.enemies.length));
    for (let index = 0; index < count; index += 1) spawnFighter(state, index, threshold);
  }
}

function tickSamSites(state: CombatState, dt: number): void {
  for (const facility of state.facilities) {
    if (facility.kind !== 'SAM' || facility.destroyed || facility.disabledUntil > state.elapsedSeconds) continue;
    const cooldown = Math.max(1.5, (BALANCE.defense.missileInterval - state.localAlert / 45) / (state.defenseMultiplier * state.enemyPressureMultiplier));
    state.facilityCooldowns[facility.id] = Math.max(0, (state.facilityCooldowns[facility.id] ?? 0) - dt);
    if (state.facilityCooldowns[facility.id] > 0) continue;
    state.facilityCooldowns[facility.id] = cooldown;
    spawnHostileProjectile(state, 'sam', facility.id, facility.position, 3.5, BALANCE.defense.missileSpeed * state.defenseMultiplier, (BALANCE.defense.missileDamage + state.localAlert * 0.25) * state.defenseMultiplier);
  }
}

function spawnFighter(state: CombatState, index: number, squadId: number): void {
  const orbitDirection: -1 | 1 = (squadId / 20) % 2 === 0 ? -1 : 1;
  const angularSpeed = fighterOrbitAngularSpeed(state);
  const spawnAngle = state.elapsedSeconds * 0.19 + squadId * 0.071;
  const orbitPhase = spawnAngle - state.elapsedSeconds * angularSpeed * orbitDirection;
  const orbitRadius = BALANCE.defense.fighterOrbitRadius + ((squadId / 20) % 2) * 2;
  const formation = fighterFormationOffset(index);
  const radial = { x: Math.cos(spawnAngle), z: Math.sin(spawnAngle) };
  const tangent = { x: -Math.sin(spawnAngle) * orbitDirection, z: Math.cos(spawnAngle) * orbitDirection };
  const spawnRadius = orbitRadius + 10 + formation.radial;
  const cruiseSpeed = fighterCruiseSpeed(state);
  const velocity = {
    x: state.mothership.velocity.x + tangent.x * cruiseSpeed,
    z: state.mothership.velocity.z + tangent.z * cruiseSpeed,
  };
  const enemy: EnemyState = {
    id: `fighter-${state.nextEntityId++}`,
    kind: 'fighter',
    position: {
      x: state.mothership.position.x + radial.x * spawnRadius + tangent.x * formation.trailing,
      z: state.mothership.position.z + radial.z * spawnRadius + tangent.z * formation.trailing,
    },
    velocity,
    altitude: BALANCE.defense.fighterAltitude + formation.altitude,
    heading: Math.atan2(velocity.x, velocity.z),
    bank: 0,
    squadId,
    formationSlot: index,
    orbitDirection,
    orbitRadius,
    orbitPhase,
    health: BALANCE.defense.fighterHealth * state.defenseMultiplier,
    attackCooldown: 1.8 + index * 0.32,
    disabledUntil: 0,
    absorptionStatus: 'NEUTRAL',
  };
  state.enemies.push(enemy);
}

function tickEnemies(state: CombatState, dt: number): void {
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    enemy.attackCooldown -= dt;
    if (enemy.disabledUntil > state.elapsedSeconds) {
      enemy.absorptionStatus = 'DISABLED';
      continue;
    }
    flyFighterFormation(state, enemy, dt);
    enemy.absorptionStatus = getEnemyAbsorptionStatus(state, enemy);
    const distanceToShip = distance(enemy.position, state.mothership.position);
    const inAttackEnvelope = distanceToShip >= BALANCE.defense.fighterMinAttackRange && distanceToShip <= BALANCE.defense.fighterAttackRange;
    if (enemy.attackCooldown <= 0 && inAttackEnvelope) {
      if (state.missiles.length < 16) spawnHostileProjectile(state, 'fighter', enemy.id, enemy.position, enemy.altitude, BALANCE.defense.fighterProjectileSpeed * state.defenseMultiplier, BALANCE.defense.fighterDamage * state.defenseMultiplier);
      enemy.attackCooldown = (BALANCE.defense.fighterInterval + enemy.formationSlot * 0.12) / (state.defenseMultiplier * state.enemyPressureMultiplier);
    }
  }
  state.enemies = state.enemies.filter((enemy) => enemy.health > 0);
}

function tickAirDefenseLaser(state: CombatState): void {
  const interval = BALANCE.defense.airDefenseLaser.interval * state.modifiers.airDefenseLaserIntervalMultiplier;
  if (state.elapsedSeconds - state.lastAirDefenseAt < interval) return;

  let nearest: EnemyState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    const distanceToShip = distance(enemy.position, state.mothership.position);
    if (distanceToShip >= nearestDistance) continue;
    nearest = enemy;
    nearestDistance = distanceToShip;
  }
  if (!nearest) return;

  state.lastAirDefenseAt = state.elapsedSeconds;
  const origin = { ...state.mothership.position };
  const target = { ...nearest.position };
  nearest.health = Math.max(0, nearest.health - BALANCE.defense.airDefenseLaser.damage);
  state.lastAirDefenseShot = {
    id: `air-defense-laser-${state.nextEntityId++}`,
    targetId: nearest.id,
    origin,
    target,
    targetAltitude: nearest.altitude,
    damage: BALANCE.defense.airDefenseLaser.damage,
    occurredAt: state.elapsedSeconds,
  };
  state.enemies = state.enemies.filter((enemy) => enemy.health > 0);
}

function flyFighterFormation(state: CombatState, enemy: EnemyState, dt: number): void {
  const angularSpeed = fighterOrbitAngularSpeed(state);
  const angle = enemy.orbitPhase + state.elapsedSeconds * angularSpeed * enemy.orbitDirection;
  const cycle = (state.elapsedSeconds + enemy.squadId * 0.13) % 8;
  const attackRun = (1 - Math.cos((cycle / 8) * Math.PI * 2)) * 0.5;
  const formation = fighterFormationOffset(enemy.formationSlot);
  const desiredRadius = enemy.orbitRadius - attackRun * BALANCE.defense.fighterAttackRunDepth + formation.radial;
  const radial = { x: Math.cos(angle), z: Math.sin(angle) };
  const tangent = { x: -Math.sin(angle) * enemy.orbitDirection, z: Math.cos(angle) * enemy.orbitDirection };
  const desiredPosition = {
    x: state.mothership.position.x + radial.x * desiredRadius + tangent.x * formation.trailing,
    z: state.mothership.position.z + radial.z * desiredRadius + tangent.z * formation.trailing,
  };
  const orbitVelocity = angularSpeed * Math.max(10, desiredRadius);
  let desiredVelocity = {
    x: state.mothership.velocity.x + tangent.x * orbitVelocity + (desiredPosition.x - enemy.position.x) * 1.45,
    z: state.mothership.velocity.z + tangent.z * orbitVelocity + (desiredPosition.z - enemy.position.z) * 1.45,
  };
  const maxSpeed = BALANCE.defense.fighterMaxSpeed * (1 + (state.defenseMultiplier - 1) * 0.5);
  const desiredSpeed = Math.hypot(desiredVelocity.x, desiredVelocity.z);
  if (desiredSpeed > maxSpeed) {
    desiredVelocity = { x: desiredVelocity.x / desiredSpeed * maxSpeed, z: desiredVelocity.z / desiredSpeed * maxSpeed };
  }
  const steer = { x: desiredVelocity.x - enemy.velocity.x, z: desiredVelocity.z - enemy.velocity.z };
  const steerLength = Math.hypot(steer.x, steer.z);
  const maxSteer = BALANCE.defense.fighterAcceleration * dt;
  if (steerLength > maxSteer) {
    steer.x = steer.x / steerLength * maxSteer;
    steer.z = steer.z / steerLength * maxSteer;
  }
  enemy.velocity.x += steer.x;
  enemy.velocity.z += steer.z;
  enemy.position.x += enemy.velocity.x * dt;
  enemy.position.z += enemy.velocity.z * dt;

  const previousHeading = enemy.heading;
  enemy.heading = Math.atan2(enemy.velocity.x, enemy.velocity.z);
  const turnRate = wrapAngle(enemy.heading - previousHeading) / Math.max(0.001, dt);
  const targetBank = clamp(turnRate / 1.8, -1, 1);
  enemy.bank += (targetBank - enemy.bank) * Math.min(1, dt * 5);

  const targetAltitude = BALANCE.defense.fighterAltitude + formation.altitude + attackRun * 2.4 + Math.sin(angle * 2 + enemy.formationSlot) * 0.7;
  enemy.altitude += clamp(targetAltitude - enemy.altitude, -7 * dt, 7 * dt);
}

function fighterOrbitAngularSpeed(state: CombatState): number {
  return BALANCE.defense.fighterOrbitAngularSpeed * (1 + (state.defenseMultiplier - 1) * 0.35);
}

function fighterCruiseSpeed(state: CombatState): number {
  return BALANCE.defense.fighterCruiseSpeed * (1 + (state.defenseMultiplier - 1) * 0.4);
}

function fighterFormationOffset(slot: number): { trailing: number; radial: number; altitude: number } {
  if (slot <= 0) return { trailing: 0, radial: 0, altitude: 1.2 };
  const row = Math.ceil(slot / 2);
  const side = slot % 2 === 1 ? -1 : 1;
  return {
    trailing: -row * 4,
    radial: side * (2.3 + row),
    altitude: side * 0.7 + row * 0.22,
  };
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function tickMissiles(state: CombatState, dt: number): void {
  for (const missile of state.missiles) {
    const previousPosition = { x: missile.position.x, y: missile.y, z: missile.position.z };
    missile.age += dt;
    missile.target = { ...state.mothership.position };
    missile.targetY = BALANCE.mothership.baseAltitude;
    const dx = missile.target.x - missile.position.x;
    const dy = missile.targetY - missile.y;
    const dz = missile.target.z - missile.position.z;
    const length = Math.max(0.001, Math.hypot(dx, dy, dz));
    const travel = Math.min(length, missile.speed * dt);
    missile.position.x += (dx / length) * travel;
    missile.y += (dy / length) * travel;
    missile.position.z += (dz / length) * travel;
    if (hostileProjectileIntersectsMothership(missile, state) || missile.age > 8) {
      if (missile.age <= 8) {
        applyMothershipProjectileDamage(state, missile.damage, missile.source, {
          x: previousPosition.x - state.mothership.position.x,
          y: previousPosition.y - BALANCE.mothership.baseAltitude,
          z: previousPosition.z - state.mothership.position.z,
        }, missile.id);
      }
      missile.age = 99;
    }
  }
  state.missiles = state.missiles.filter((missile) => missile.age < 9);
}

function hostileProjectileIntersectsMothership(missile: CombatState['missiles'][number], state: CombatState): boolean {
  const shielded = state.mothership.shield > 0;
  const projectileRadius = missile.source === 'sam'
    ? BALANCE.defense.samProjectileRadius
    : BALANCE.defense.fighterProjectileRadius;
  const horizontalRadius = (shielded ? BALANCE.mothership.shieldHitRadius : BALANCE.mothership.hullHitRadius) + projectileRadius;
  const verticalRadius = (shielded ? BALANCE.mothership.shieldHitHalfHeight : BALANCE.mothership.hullHitHalfHeight) + projectileRadius;
  const dx = missile.position.x - state.mothership.position.x;
  const dy = missile.y - BALANCE.mothership.baseAltitude;
  const dz = missile.position.z - state.mothership.position.z;
  return (dx * dx + dz * dz) / (horizontalRadius * horizontalRadius) + (dy * dy) / (verticalRadius * verticalRadius) <= 1;
}

function runPointDefense(state: CombatState): void {
  if (state.elapsedSeconds - state.lastPointDefenseAt < BALANCE.defense.pointDefenseInterval || state.mothership.energy < BALANCE.defense.pointDefenseEnergy) return;
  const missile = state.missiles.find((item) => hostileProjectileDistanceToShip(item, state) <= BALANCE.defense.pointDefenseRange);
  if (!missile) return;
  state.mothership.energy -= BALANCE.defense.pointDefenseEnergy;
  state.lastPointDefenseAt = state.elapsedSeconds;
  if ((state.nextEntityId * 17) % 4 !== 0) missile.age = 99;
}

function spawnHostileProjectile(state: CombatState, source: 'sam' | 'fighter', sourceId: string, position: Vec2, y: number, speed: number, damage: number): void {
  state.missiles.push({
    id: `${source}-projectile-${state.nextEntityId++}`,
    source,
    sourceId,
    launchPosition: { ...position },
    launchY: y,
    position: { ...position },
    y,
    target: { ...state.mothership.position },
    targetY: BALANCE.mothership.baseAltitude,
    speed,
    damage,
    age: 0,
  });
}

function hostileProjectileDistanceToShip(missile: CombatState['missiles'][number], state: CombatState): number {
  return Math.hypot(
    missile.position.x - state.mothership.position.x,
    missile.y - BALANCE.mothership.baseAltitude,
    missile.position.z - state.mothership.position.z,
  );
}

export function applyMothershipDamage(state: CombatState, rawDamage: number): number {
  const damage = state.mothership.overdriveSeconds > 0 ? rawDamage * (1 - BALANCE.overdrive.damageReduction) : rawDamage;
  state.mothership.shieldRegenDelay = BALANCE.mothership.shieldRegenDelay;
  if (state.activeAbility === 'beam') {
    state.mothership.beamHeat = Math.min(100, state.mothership.beamHeat + BALANCE.beam.impactHeatIncrease);
    if (state.mothership.beamHeat >= 100) {
      state.mothership.beamHeat = 100;
      state.mothership.beamRecoverySeconds = BALANCE.beam.overheatRecoverySeconds;
      state.mothership.beamHeatState = 'OVERHEATED';
      stopBeam(state, 'OVERHEATED');
    } else {
      state.mothership.beamHeatState = getBeamHeatState(state.mothership.beamHeat);
      stopBeam(state, 'IMPACTED');
    }
  }
  const shieldDamage = Math.min(state.mothership.shield, damage);
  state.mothership.shield -= shieldDamage;
  state.mothership.hull = Math.max(0, state.mothership.hull - (damage - shieldDamage));
  return damage;
}

export function applyMothershipProjectileDamage(
  state: CombatState,
  rawDamage: number,
  source: MothershipHitEvent['source'],
  incomingDirection: MothershipHitEvent['direction'],
  eventId = `mothership-hit-${state.nextEntityId++}`,
): number {
  const shieldBefore = state.mothership.shield;
  const hullBefore = state.mothership.hull;
  const damage = applyMothershipDamage(state, rawDamage);
  const length = Math.max(0.001, Math.hypot(incomingDirection.x, incomingDirection.y, incomingDirection.z));
  state.mothershipHits.push({
    id: eventId,
    source,
    kind: shieldBefore > 0 ? 'SHIELD' : 'HULL',
    direction: {
      x: incomingDirection.x / length,
      y: incomingDirection.y / length,
      z: incomingDirection.z / length,
    },
    shieldDamage: Math.max(0, shieldBefore - state.mothership.shield),
    hullDamage: Math.max(0, hullBefore - state.mothership.hull),
    occurredAt: state.elapsedSeconds,
  });
  return damage;
}

export function commandExtraction(state: CombatState, dt = 1 / 30): void {
  if (state.result !== 'ACTIVE') return;
  const inExit = EXIT_ZONES.some((zone) => distance(state.mothership.position, zone) <= BALANCE.extraction.radius);
  if (!inExit) {
    state.mothership.extractionProgress = 0;
    state.mothership.extractionStatus = 'AVAILABLE';
    state.extractionStatus = 'AVAILABLE';
    return;
  }
  if (state.activeAbility === 'beam') stopBeam(state, 'EXTRACTION_STARTED');
  state.mothership.extractionProgress = clamp(state.mothership.extractionProgress + dt / BALANCE.extraction.duration, 0, 1);
  state.mothership.extractionStatus = state.mothership.extractionProgress >= 1 ? 'COMPLETE' : 'IN_PROGRESS';
  state.extractionStatus = state.mothership.extractionStatus;
}

function updateObjectives(state: CombatState): void {
  const harvest = state.objectives.find((objective) => objective.id === 'harvest');
  if (harvest) {
    harvest.progress = state.totalAbsorbed;
    harvest.complete = harvest.progress >= harvest.target;
  }
  const landmark = state.objectives.find((objective) => objective.id === 'landmark');
  if (landmark) {
    const target = state.absorbableTargets.find((item) => item.id === landmark.linkedTargetId);
    if (target) {
      landmark.progress = landmarkProgress(state.absorbableTargets, target.id);
      landmark.target = target.initialAmount;
      landmark.complete = landmark.progress >= landmark.target - 0.001;
    }
  }
  const survive = state.objectives.find((objective) => objective.id === 'survive');
  if (survive) {
    survive.progress = state.mothership.extractionProgress;
    survive.complete = state.mothership.extractionStatus === 'COMPLETE';
  }
}

export function getWaveLevel(alert: number): number {
  if (alert >= 80) return 4;
  if (alert >= 60) return 3;
  if (alert >= 40) return 2;
  if (alert >= 20) return 1;
  return 0;
}
