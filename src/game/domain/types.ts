export type AppScreen =
  | 'BOOT'
  | 'MAIN_MENU'
  | 'ASSET_PREVIEW'
  | 'JC_LP_MEGACITY_DEMO'
  | 'WORLD_MAP'
  | 'MISSION_LOADOUT'
  | 'TRAVEL'
  | 'TACTICAL_LOADING'
  | 'TACTICAL_ACTIVE'
  | 'DEBRIEF'
  | 'DEBRIEF_ALLOCATION'
  | 'UPGRADE';

export type AbilityId = 'beam' | 'scan' | 'plasma' | 'emp' | 'overdrive';
export type CombatOutcome = 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type FacilityKind = 'SAM' | 'RADAR' | 'AIRBASE' | 'POWER' | 'RESEARCH';
export type AbsorbableKind = 'ORGANIC' | 'POWER' | 'VEHICLE' | 'MACHINERY' | 'DATA' | 'RELIC';
export type AbsorbableRequirement = 'NONE' | 'EMP_WINDOW' | 'FACILITY_DISABLED' | 'PLASMA_OPENING';
export type AbsorbableStatus = 'HIDDEN' | 'AVAILABLE' | 'LOCKED' | 'DEPLETED' | 'DESTROYED';
export type BeamHeatState = 'STABLE' | 'WARM' | 'CRITICAL' | 'OVERHEATED';
export type BeamStopReason = 'MANUAL' | 'MOVED' | 'IMPACTED' | 'ENERGY_DEPLETED' | 'TARGET_DEPLETED' | 'TARGET_LOCKED' | 'TARGET_ATTACKING' | 'OUT_OF_RANGE' | 'CARGO_FULL' | 'EXTRACTION_STARTED' | 'OVERHEATED';
export type EnemyAbsorptionStatus = 'NEUTRAL' | 'FLEEING' | 'ATTACKING' | 'DISABLED' | 'DESTROYED';
export type ExtractionStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETE';
export type BattleMode = 'LEGACY_TACTICAL' | 'SIDE_VIEW';
export type CombatEndReason = 'EXTRACTED' | 'MOTHERSHIP_DISABLED' | 'ABORTED';

export const ABSORBABLE_WEIGHT_BY_KIND: Record<AbsorbableKind, number> = {
  ORGANIC: 1,
  DATA: 3,
  RELIC: 6,
  VEHICLE: 12,
  MACHINERY: 18,
  POWER: 24,
};

export interface Vec2 {
  x: number;
  z: number;
}

export interface ResourceWallet {
  biomass: number;
  alloy: number;
  intel: number;
}

export interface MissionCargo {
  captives: number;
  biomass: number;
  alloy: number;
  intel: number;
  coreCharge: number;
}

export interface MissionYieldPerThousand {
  captives: number;
  biomass: number;
  alloy: number;
  intel: number;
  coreCharge: number;
}

export interface LogisticsState {
  coreCharge: number;
  maxCoreCharge: number;
  captiveReserve: number;
  maxCaptiveReserve: number;
  conversionCapacity: number;
  maxOverchargeCells: number;
  commandBandwidth: number;
  dropCapacity: number;
  emergencyChargeUsed: number;
}

export type CohortType = 'ASSAULT' | 'SABOTEUR' | 'HARVEST';
export type CohortStatus = 'RESERVE' | 'DEPLOYED' | 'GARRISON' | 'LOST';

export interface CohortState {
  id: string;
  type: CohortType;
  strength: number;
  cohesion: number;
  control: number;
  experience: number;
  status: CohortStatus;
  assignedCityId: string | null;
  createdAtBattle: number;
}

export type MissionType = 'RAID' | 'OCCUPATION';

export interface MissionLoadout {
  id: string;
  cityId: string;
  missionType: MissionType;
  cohortIds: string[];
  overchargeCells: number;
  travelChargeCost: number;
  cellChargeCost: number;
  createdAtMinutes: number;
  battleSetup: PlannedBattleSetup;
}

export interface PlannedBattleSetup {
  missionId: string;
  mapId: string;
  gameplayProfileId: string;
  gameplayProfileVersion: number;
  layoutSeed: number;
}

export interface CampaignTransitState {
  fromCityId: string | null;
  toCityId: string;
  progress: number;
  duration: number;
  loadoutId: string;
}

export type CohortOrder = 'IDLE' | 'MOVE' | 'ASSAULT' | 'SECURE' | 'RETREAT';

export interface DeployedCohortState {
  cohortId: string;
  type: CohortType;
  position: Vec2;
  strength: number;
  cohesion: number;
  control: number;
  order: CohortOrder;
  targetPosition: Vec2 | null;
  targetEntityId: string | null;
  deployed: boolean;
  recoverable: boolean;
}

export interface GroundDefenderDefinition {
  id: string;
  label: string;
  position: Vec2;
  health: number;
  attackRange: number;
  attackDamagePerSecond: number;
  linkedControlNodeId?: string;
}

export interface GroundDefenderState extends GroundDefenderDefinition {
  disabledUntil: number;
}

export interface TacticalControlNodeDefinition {
  id: string;
  label: string;
  position: Vec2;
  radius: number;
  linkedFacilityId?: string;
  requiredForOccupation: boolean;
}

export interface ControlNodeState {
  id: string;
  label: string;
  position: Vec2;
  radius: number;
  captureProgress: number;
  owner: 'EARTH' | 'CONTESTED' | 'ALIEN';
  requiredForOccupation: boolean;
}

export type CohortMissionResultStatus = 'RECOVERED' | 'GARRISON_CANDIDATE' | 'LOST';

export interface CohortMissionResult {
  cohortId: string;
  status: CohortMissionResultStatus;
  strength: number;
  cohesion: number;
  control: number;
  experience: number;
  position: Vec2;
}

export interface OccupationRequirementState {
  requiredNodeCount: number;
  capturedRequiredNodeCount: number;
  survivingGarrisonCandidates: number;
  coreDefenseReady: boolean;
  occupationReady: boolean;
}

export type CityControlState = 'UNTOUCHED' | 'RAIDED' | 'BREACHED' | 'OCCUPIED' | 'ASSIMILATED';

export interface CityConquestState {
  controlState: CityControlState;
  breachProgress: number;
  occupationProgress: number;
  resistance: number;
  garrisonCohortIds: string[];
  commandNodesCaptured: string[];
  lastControlChangeAtMinutes: number | null;
}

export interface PendingDebriefState {
  id: string;
  cityId: string;
  missionType: MissionType;
  outcome: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  cargoRecovered: MissionCargo;
  absorbedByKind: Record<AbsorbableKind, number>;
  recoveredCohortIds: string[];
  lostCohortIds: string[];
  garrisonCandidateIds: string[];
  cityControlBefore: CityControlState;
  cityControlAfterCombat: CityControlState;
  destruction: number;
  globalThreatDelta: number;
  createdAtMinutes: number;
  repairAssessment?: RepairAssessment | null;
  endReason?: CombatEndReason | null;
}

export interface RepairAssessment {
  hullDamageRatio: number;
  biomassCost: number;
  alloyCost: number;
  unpaidBiomass: number;
  unpaidAlloy: number;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface LocalizedName {
  ko: string;
  en: string;
}

export type CityRole = 'capital' | 'primary' | 'regional' | 'strategic';
export type CityMapTier = 1 | 2 | 3;

export interface MothershipProgress {
  maxHull: number;
  maxShield: number;
  maxEnergy: number;
  hull: number;
  shield: number;
}

export interface CityDefinition {
  id: string;
  name: string;
  localName: string;
  countryId: string;
  country: string;
  admin1Code: string;
  admin1Name: string;
  latitude: number;
  longitude: number;
  geonameId: number;
  population: number;
  role: CityRole;
  mapTier: CityMapTier;
  tacticalPresetId: string;
  basePopulation: number;
  defenseRating: number;
  resourceRating: number;
  technologyRating: number;
  colorAccent: string;
  source: {
    dataset: 'geonames';
    snapshot: string;
    geonameId: number;
    modificationDate: string;
  };
}

export interface CountryDefinition {
  id: string;
  isoAlpha3: string;
  m49Code: string;
  regionId: string;
  name: LocalizedName;
  colorAccent: string;
  labelCoordinate: { latitude: number; longitude: number };
  geometryId: string;
  cityIds: string[];
}

export interface RegionDefinition {
  id: string;
  name: LocalizedName;
  m49RegionCode: string;
  colorAccent: string;
  countryIds: string[];
}

export interface FacilityPersistentState {
  destroyed: boolean;
  healthRatio: number;
  repairProgress: number;
}

export interface AbsorbablePersistentState {
  remainingAmount: number;
  destroyedAmount: number;
  discovered: boolean;
}

export interface CityAbsorbablePoolState {
  initialAmount: number;
  remainingAmount: number;
  destroyedAmount: number;
}

export interface CitySideViewResourceState {
  profileId: string;
  profileVersion: number;
  pools: Record<AbsorbableKind, CityAbsorbablePoolState>;
  migrationBackup: Record<string, AbsorbablePersistentState>;
}

export interface CityState {
  cityId: string;
  remainingPopulation: number;
  evacuatedPopulation: number;
  destruction: number;
  alert: number;
  visits: number;
  facilities: Record<string, FacilityPersistentState>;
  absorbables: Record<string, AbsorbablePersistentState>;
  sideViewResources: CitySideViewResourceState;
  conquest: CityConquestState;
  lastVisitedAtMinutes: number | null;
}

export interface CampaignState {
  schemaVersion: 5;
  worldDataVersion: string;
  campaignId: string;
  seed: number;
  currentTimeMinutes: number;
  globalThreat: number;
  currentCityId: string | null;
  mothership: MothershipProgress;
  resources: ResourceWallet;
  cities: Record<string, CityState>;
  upgrades: Record<string, number>;
  completedBattles: number;
  settings: { reducedMotion: boolean };
  logistics: LogisticsState;
  cohorts: Record<string, CohortState>;
  nextCohortId: number;
  plannedMission: MissionLoadout | null;
  activeTransit: CampaignTransitState | null;
  pendingDebrief: PendingDebriefState | null;
}

export interface BuildingClusterDefinition {
  id: string;
  center: Vec2;
  radiusX: number;
  radiusZ: number;
  density: number;
  heightRange: [number, number];
  populationDensity: number;
  style: 'downtown' | 'residential' | 'industrial';
}

export interface TacticalRoadDefinition {
  /** Legacy combat-rule data only; phase-one and future battle navigation are road-independent. */
  axis: 'x' | 'z';
  coordinate: number;
  width: number;
}

export interface TacticalReservedZoneDefinition {
  id: string;
  center: Vec2;
  radius: number;
}

export interface TacticalUrbanPlan {
  /** Retained for save/rule compatibility; never consumed by the phase-one map or BattleGateway. */
  roads: TacticalRoadDefinition[];
  reservedZones: TacticalReservedZoneDefinition[];
}

export interface PopulationZoneDefinition {
  id: string;
  center: Vec2;
  radius: number;
  initialPopulationRatio: number;
  density: number;
  visualSpriteBudget: number;
}

export interface TacticalSectorDefinition {
  id: string;
  label: string;
  center: Vec2;
  radius: number;
}

export interface TacticalLandmarkDefinition {
  id: string;
  label: string;
  position: Vec2;
  atlasFrame: 0 | 1 | 2;
  width: number;
  height: number;
  objectiveTargetId: string;
  objectiveLabel: string;
}

export interface AbsorbableTargetDefinition {
  id: string;
  sectorId: string;
  label: string;
  kind: AbsorbableKind;
  weight: number;
  center: Vec2;
  radius: number;
  baseAmount: number;
  initialAmountOverride?: number;
  density: number;
  yieldPerThousand: MissionYieldPerThousand;
  energyCostMultiplier: number;
  alertMultiplier: number;
  requirement: AbsorbableRequirement;
  linkedFacilityId?: string;
  optional: boolean;
  visualBudget: number;
}

export interface FacilityDefinition {
  id: string;
  kind: FacilityKind;
  position: Vec2;
  health: number;
}

export interface TacticalPreset {
  id: string;
  label: string;
  terrain: 'coastal' | 'river' | 'desert';
  landmark: TacticalLandmarkDefinition;
  waterPosition?: Vec2;
  urbanPlan: TacticalUrbanPlan;
  clusters: BuildingClusterDefinition[];
  sectors: TacticalSectorDefinition[];
  absorbableTargets: AbsorbableTargetDefinition[];
  populationZones: PopulationZoneDefinition[];
  facilities: FacilityDefinition[];
  controlNodes: TacticalControlNodeDefinition[];
  groundDefenders: GroundDefenderDefinition[];
  breachObjectiveIds: string[];
}

export interface CombatMothershipState {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  target: Vec2 | null;
  hull: number;
  shield: number;
  energy: number;
  maxHull: number;
  maxShield: number;
  maxEnergy: number;
  shieldRegenDelay: number;
  beamHeat: number;
  beamHeatState: BeamHeatState;
  beamRecoverySeconds: number;
  absorptionEnergyEarned: number;
  overdriveSeconds: number;
  extractionProgress: number;
  extractionStatus: ExtractionStatus;
  cargoUsed: number;
  maxCargo: number;
}

export interface PopulationZoneState extends PopulationZoneDefinition {
  population: number;
  harvested: number;
  collateralLoss: number;
}

export interface AbsorbableTargetState extends AbsorbableTargetDefinition {
  initialAmount: number;
  remainingAmount: number;
  absorbedAmount: number;
  destroyedAmount: number;
  discovered: boolean;
  status: AbsorbableStatus;
}

export interface AbsorptionPreview {
  absorbableAmount: number;
  estimatedSeconds: number;
  energyCost: number;
  energyGain: number;
  heatGain: number;
  alertGain: number;
  rewards: MissionCargo;
  limitingFactor: 'TARGET' | 'ENERGY' | 'CARGO' | 'NONE';
}

export type TacticalRiskLevel = 'LOW' | 'GUARDED' | 'HIGH' | 'CRITICAL';

export interface TargetRecommendation {
  targetId: string;
  score: number;
  distance: number;
  projectedAlert: number;
  primaryReward: keyof MissionCargo;
  reason: string;
}

export interface TacticalRiskForecast {
  level: TacticalRiskLevel;
  score: number;
  projectedAlert: number;
  cargoRatio: number;
  hullRatio: number;
  shieldRatio: number;
  incomingThreats: number;
  shouldExtract: boolean;
  warning: string;
}

export interface CombatModifiers {
  beamRateMultiplier: number;
  beamRadiusBonus: number;
  beamEnergyCostMultiplier: number;
  beamHeatMultiplier: number;
  beamAlertMultiplier: number;
  plasmaDamageMultiplier: number;
  energyRegenBonus: number;
  scanRangeBonus: number;
  cargoCapacityBonus: number;
  resourceYieldMultiplier: number;
  cohortMoveSpeedMultiplier: number;
  cohortAssaultDamageMultiplier: number;
  cohortLossMultiplier: number;
  cohortRecoveryRadiusMultiplier: number;
  empDurationMultiplier: number;
  airDefenseLaserIntervalMultiplier: number;
  threatForecastMultiplier: number;
  commandBandwidth: number;
  dropCapacity: number;
}

export interface CombatFacilityState extends FacilityDefinition {
  maxHealth: number;
  disabledUntil: number;
  destroyed: boolean;
}

export interface EnemyState {
  id: string;
  kind: 'fighter';
  position: Vec2;
  velocity: Vec2;
  altitude: number;
  heading: number;
  bank: number;
  squadId: number;
  formationSlot: number;
  orbitDirection: -1 | 1;
  orbitRadius: number;
  orbitPhase: number;
  orbitAngularSpeed: number;
  orbitEccentricity: number;
  orbitVerticalAmplitude: number;
  orbitDepthAmplitude: number;
  orbitWobblePhase: number;
  attackRunPhase: number;
  attackRunStrength: number;
  health: number;
  attackCooldown: number;
  disabledUntil: number;
  absorptionStatus: EnemyAbsorptionStatus;
}

export interface MissileState {
  id: string;
  source: 'sam' | 'fighter';
  sourceId: string;
  launchPosition: Vec2;
  launchY: number;
  position: Vec2;
  y: number;
  target: Vec2;
  targetY: number;
  speed: number;
  damage: number;
  age: number;
}

export interface AirDefenseShotEvent {
  id: string;
  targetId: string;
  origin: Vec2;
  target: Vec2;
  targetAltitude: number;
  damage: number;
  occurredAt: number;
}

export interface PointDefenseShotEvent {
  id: string;
  targetId: string;
  origin: Vec2;
  target: Vec2;
  targetAltitude: number;
  occurredAt: number;
}

export interface MothershipHitEvent {
  id: string;
  source: 'sam' | 'fighter';
  kind: 'SHIELD' | 'HULL';
  direction: { x: number; y: number; z: number };
  shieldDamage: number;
  hullDamage: number;
  occurredAt: number;
}

export interface GroundSwarmProjectileState {
  id: string;
  targetId: string;
  startX: number;
  targetX: number;
  progress: number;
  duration: number;
  arcHeight: number;
  weavePhase: number;
  damage: number;
}

export interface GroundSwarmImpactEvent {
  id: string;
  targetId: string;
  x: number;
  occurredAt: number;
}

export interface CombatState {
  cityId: string;
  seed: number;
  elapsedSeconds: number;
  battleMode: BattleMode;
  survivalUnlockSeconds: number;
  missionType: MissionType;
  breachObjectiveIds: string[];
  overchargeCells: number;
  initialOverchargeCells: number;
  localAlert: number;
  mothership: CombatMothershipState;
  populationZones: PopulationZoneState[];
  sectors: TacticalSectorDefinition[];
  persistentAbsorbables: Record<string, AbsorbablePersistentState>;
  absorbableTargets: AbsorbableTargetState[];
  facilities: CombatFacilityState[];
  deployedCohorts: DeployedCohortState[];
  groundDefenders: GroundDefenderState[];
  controlNodes: ControlNodeState[];
  occupationReady: boolean;
  enemies: EnemyState[];
  missiles: MissileState[];
  groundSwarmProjectiles: GroundSwarmProjectileState[];
  groundSwarmImpacts: GroundSwarmImpactEvent[];
  lastAirDefenseShot: AirDefenseShotEvent | null;
  lastPointDefenseShot: PointDefenseShotEvent | null;
  mothershipHits: MothershipHitEvent[];
  objectives: { id: string; label: string; progress: number; target: number; complete: boolean; linkedTargetId?: string }[];
  cargo: MissionCargo;
  earned: ResourceWallet;
  collateralPopulationLoss: number;
  harvestedPopulation: number;
  totalAbsorbed: number;
  absorbedByKind: Record<AbsorbableKind, number>;
  destroyedInfrastructure: number;
  plasmaUses: number;
  extractionStatus: ExtractionStatus;
  result: 'ACTIVE' | CombatOutcome;
  endReason: CombatEndReason | null;
  activeAbility: AbilityId | null;
  abilityTarget: Vec2 | null;
  selectedTargetId: string | null;
  activeBeamTargetId: string | null;
  lastBeamStopReason: BeamStopReason | null;
  scanCount: number;
  lastScanDiscovered: number;
  defenseRating: number;
  defenseMultiplier: number;
  enemyPressureMultiplier: number;
  modifiers: CombatModifiers;
  cooldowns: Record<AbilityId, number>;
  disabledUntil: Record<string, number>;
  facilityCooldowns: Record<string, number>;
  facilityBurstRemaining: Record<string, number>;
  nextEntityId: number;
  lastAirDefenseAt: number;
  lastPointDefenseAt: number;
  lastGroundSwarmAt: number;
  lastWaveAlert: number;
}

export interface DebriefSummary {
  success: boolean;
  outcome: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  cityName: string;
  timeSeconds: number;
  harvestedPopulation: number;
  totalAbsorbed: number;
  cargoCapacity: number;
  cargo: MissionCargo;
  absorbedByKind: Record<AbsorbableKind, number>;
  earned: ResourceWallet;
  destruction: number;
  globalThreatDelta: number;
  destroyedInfrastructure: number;
  hullRatio: number;
  shieldRatio: number;
  repairAssessment?: RepairAssessment | null;
}
