import { z } from 'zod';
import { CITIES } from '../../data/cities';
import { WORLD_DATA_VERSION } from '../../data/world';
import { createCityConquestState, createCityState, createLogisticsState } from '../../domain/campaignRules';
import type { CampaignState, CohortState, CityState, MissionLoadout } from '../../domain/types';

export const SAVE_KEY = 'they-call-it-earth.prototype.save.v1';

function hasBrowserStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();
const boundedProgress = finiteNumber.min(0).max(1);
const boundedPercentage = finiteNumber.min(0).max(100);

const walletSchema = z.object({ biomass: nonNegativeNumber, alloy: nonNegativeNumber, intel: nonNegativeNumber });
const facilitySchema = z.object({ destroyed: z.boolean(), healthRatio: finiteNumber, repairProgress: finiteNumber });
const absorbableSchema = z.object({ remainingAmount: nonNegativeNumber, destroyedAmount: nonNegativeNumber, discovered: z.boolean().default(false) });

const legacyCitySchema = z.object({
  cityId: z.string(), remainingPopulation: nonNegativeNumber, evacuatedPopulation: nonNegativeNumber, destruction: boundedPercentage,
  alert: boundedPercentage, visits: z.number().int().nonnegative(), facilities: z.record(z.string(), facilitySchema), lastVisitedAtMinutes: finiteNumber.nullable(),
});
const cityV3Schema = legacyCitySchema.extend({ absorbables: z.record(z.string(), absorbableSchema) });

const campaignFields = {
  campaignId: z.string(), seed: finiteNumber, currentTimeMinutes: nonNegativeNumber, globalThreat: boundedPercentage,
  currentCityId: z.string().nullable(),
  mothership: z.object({ maxHull: nonNegativeNumber, maxShield: nonNegativeNumber, maxEnergy: nonNegativeNumber, hull: nonNegativeNumber, shield: nonNegativeNumber }),
  resources: walletSchema, upgrades: z.record(z.string(), z.number().int().nonnegative()), completedBattles: z.number().int().nonnegative(),
  settings: z.object({ reducedMotion: z.boolean() }),
};

const campaignV1Schema = z.object({ schemaVersion: z.literal(1), ...campaignFields, cities: z.record(z.string(), legacyCitySchema) });
const campaignV2Schema = z.object({ schemaVersion: z.literal(2), worldDataVersion: z.string(), ...campaignFields, cities: z.record(z.string(), legacyCitySchema) });
const campaignV3Schema = z.object({ schemaVersion: z.literal(3), worldDataVersion: z.string(), ...campaignFields, cities: z.record(z.string(), cityV3Schema) });

const cityConquestSchema = z.object({
  controlState: z.enum(['UNTOUCHED', 'RAIDED', 'BREACHED', 'OCCUPIED', 'ASSIMILATED']),
  breachProgress: boundedProgress,
  occupationProgress: boundedProgress,
  resistance: boundedPercentage,
  garrisonCohortIds: z.array(z.string()),
  commandNodesCaptured: z.array(z.string()),
  lastControlChangeAtMinutes: nonNegativeNumber.nullable(),
});

const cityV4Schema = legacyCitySchema.extend({
  absorbables: z.record(z.string(), absorbableSchema),
  conquest: cityConquestSchema,
});

const logisticsSchema = z.object({
  coreCharge: nonNegativeNumber,
  maxCoreCharge: nonNegativeNumber,
  captiveReserve: nonNegativeNumber,
  maxCaptiveReserve: nonNegativeNumber,
  conversionCapacity: z.number().int().nonnegative(),
  maxOverchargeCells: z.number().int().nonnegative(),
  commandBandwidth: z.number().int().nonnegative(),
  dropCapacity: z.number().int().nonnegative(),
  emergencyChargeUsed: nonNegativeNumber,
}).refine((value) => value.coreCharge <= value.maxCoreCharge, {
  message: 'coreCharge cannot exceed maxCoreCharge',
  path: ['coreCharge'],
}).refine((value) => value.captiveReserve <= value.maxCaptiveReserve, {
  message: 'captiveReserve cannot exceed maxCaptiveReserve',
  path: ['captiveReserve'],
});

const cohortSchema = z.object({
  id: z.string(),
  type: z.enum(['ASSAULT', 'SABOTEUR', 'HARVEST']),
  strength: boundedPercentage,
  cohesion: boundedPercentage,
  control: boundedPercentage,
  experience: nonNegativeNumber,
  status: z.enum(['RESERVE', 'DEPLOYED', 'GARRISON', 'LOST']),
  assignedCityId: z.string().nullable(),
  createdAtBattle: nonNegativeNumber,
});

const missionLoadoutSchema = z.object({
  id: z.string(),
  cityId: z.string(),
  missionType: z.enum(['RAID', 'OCCUPATION']),
  cohortIds: z.array(z.string()),
  overchargeCells: z.number().int().nonnegative(),
  travelChargeCost: nonNegativeNumber,
  cellChargeCost: nonNegativeNumber,
  createdAtMinutes: nonNegativeNumber,
});

const transitSchema = z.object({
  fromCityId: z.string().nullable(),
  toCityId: z.string(),
  progress: boundedProgress,
  duration: nonNegativeNumber,
  loadoutId: z.string(),
});

const missionCargoSchema = z.object({
  captives: nonNegativeNumber,
  biomass: nonNegativeNumber,
  alloy: nonNegativeNumber,
  intel: nonNegativeNumber,
  coreCharge: nonNegativeNumber,
});

const pendingDebriefSchema = z.object({
  id: z.string(),
  cityId: z.string(),
  missionType: z.enum(['RAID', 'OCCUPATION']),
  outcome: z.enum(['SUCCESS', 'PARTIAL', 'FAILED']),
  cargoRecovered: missionCargoSchema,
  absorbedByKind: z.record(z.string(), nonNegativeNumber),
  recoveredCohortIds: z.array(z.string()),
  lostCohortIds: z.array(z.string()),
  garrisonCandidateIds: z.array(z.string()),
  cityControlBefore: z.enum(['UNTOUCHED', 'RAIDED', 'BREACHED', 'OCCUPIED', 'ASSIMILATED']),
  cityControlAfterCombat: z.enum(['UNTOUCHED', 'RAIDED', 'BREACHED', 'OCCUPIED', 'ASSIMILATED']),
  destruction: boundedPercentage,
  globalThreatDelta: nonNegativeNumber,
  createdAtMinutes: nonNegativeNumber,
  repairAssessment: z.object({
    hullDamageRatio: boundedProgress,
    biomassCost: nonNegativeNumber,
    alloyCost: nonNegativeNumber,
    unpaidBiomass: nonNegativeNumber,
    unpaidAlloy: nonNegativeNumber,
  }).nullable().optional(),
});

export const campaignV4Schema = z.object({
  schemaVersion: z.literal(4),
  worldDataVersion: z.string(),
  ...campaignFields,
  cities: z.record(z.string(), cityV4Schema),
  logistics: logisticsSchema,
  cohorts: z.record(z.string(), cohortSchema),
  nextCohortId: z.number().int().positive(),
  plannedMission: missionLoadoutSchema.nullable(),
  activeTransit: transitSchema.nullable(),
  pendingDebrief: pendingDebriefSchema.nullable(),
});

export function saveCampaign(campaign: CampaignState): void {
  if (!hasBrowserStorage()) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(campaign));
}

export function loadCampaign(): CampaignState | null {
  if (!hasBrowserStorage()) return null;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const current = campaignV4Schema.safeParse(parsed);
    if (current.success) {
      const reconciled = reconcileCampaign(current.data);
      if (JSON.stringify(reconciled) !== JSON.stringify(current.data)) saveCampaign(reconciled);
      return reconciled;
    }

    const previousV3 = campaignV3Schema.safeParse(parsed);
    if (previousV3.success) {
      preserveMigrationBackup(`${SAVE_KEY}.preMigrationV3`, raw);
      const migrated = migrateLegacyCampaign(previousV3.data);
      saveCampaign(migrated);
      return migrated;
    }

    const previousV2 = campaignV2Schema.safeParse(parsed);
    if (previousV2.success) {
      preserveMigrationBackup(`${SAVE_KEY}.preMigrationV2`, raw);
      const migrated = migrateLegacyCampaign(previousV2.data);
      saveCampaign(migrated);
      return migrated;
    }

    const legacy = campaignV1Schema.safeParse(parsed);
    if (legacy.success) {
      preserveMigrationBackup(`${SAVE_KEY}.preMigrationV1`, raw);
      const migrated = migrateLegacyCampaign(legacy.data);
      saveCampaign(migrated);
      return migrated;
    }

    console.warn('Save validation failed; starting a new campaign.', current.error.issues);
    localStorage.setItem(`${SAVE_KEY}.corruptSave`, raw);
    return null;
  } catch (error) {
    console.warn('Save parse failed; starting a new campaign.', error);
    localStorage.setItem(`${SAVE_KEY}.corruptSave`, raw);
    return null;
  }
}

function preserveMigrationBackup(key: string, raw: string): void {
  if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
}

function migrateLegacyCampaign(campaign: z.infer<typeof campaignV1Schema> | z.infer<typeof campaignV2Schema> | z.infer<typeof campaignV3Schema>): CampaignState {
  const cities = Object.fromEntries(Object.entries(campaign.cities).map(([cityId, city]) => {
    const absorbables: CityState['absorbables'] = 'absorbables' in city ? city.absorbables as CityState['absorbables'] : {};
    return [cityId, {
      ...city,
      absorbables,
      conquest: createCityConquestState(city.alert, city.visits),
    } satisfies CityState];
  }));
  return reconcileCampaign({
    schemaVersion: 4,
    worldDataVersion: WORLD_DATA_VERSION,
    campaignId: campaign.campaignId,
    seed: campaign.seed,
    currentTimeMinutes: campaign.currentTimeMinutes,
    globalThreat: campaign.globalThreat,
    currentCityId: campaign.currentCityId,
    mothership: campaign.mothership,
    resources: campaign.resources,
    cities,
    upgrades: campaign.upgrades,
    completedBattles: campaign.completedBattles,
    settings: campaign.settings,
    logistics: createLogisticsState(),
    cohorts: {},
    nextCohortId: 1,
    plannedMission: null,
    activeTransit: null,
    pendingDebrief: null,
  });
}

function reconcileCampaign(campaign: CampaignState): CampaignState {
  const missingStates = Object.fromEntries(CITIES.filter((city) => !campaign.cities[city.id]).map((city) => [city.id, createCityState(city)]));
  const cities = { ...missingStates, ...campaign.cities };
  const claimedGarrisons = new Set<string>();
  const reconciledCities: Record<string, CityState> = {};

  for (const [cityId, city] of Object.entries(cities)) {
    const garrisonCohortIds = city.conquest.garrisonCohortIds.filter((cohortId) => {
      const cohort = campaign.cohorts[cohortId];
      const valid = cohort?.status === 'GARRISON'
        && cohort.assignedCityId === cityId
        && !claimedGarrisons.has(cohortId);
      if (valid) claimedGarrisons.add(cohortId);
      return valid;
    });
    reconciledCities[cityId] = {
      ...city,
      conquest: {
        ...city.conquest,
        garrisonCohortIds,
        commandNodesCaptured: [...new Set(city.conquest.commandNodesCaptured)],
      },
    };
  }

  const cohorts: Record<string, CohortState> = Object.fromEntries(Object.entries(campaign.cohorts).map(([cohortId, cohort]) => {
    if (cohort.status === 'GARRISON' && !claimedGarrisons.has(cohortId)) {
      return [cohortId, { ...cohort, status: 'RESERVE', assignedCityId: null }];
    }
    return [cohortId, cohort];
  }));
  const plannedMission = campaign.plannedMission ? {
    ...campaign.plannedMission,
    cohortIds: uniqueValidReserveCohorts(campaign.plannedMission, cohorts),
  } : null;
  const pendingDebrief = campaign.pendingDebrief ? {
    ...campaign.pendingDebrief,
    recoveredCohortIds: uniqueExistingCohorts(campaign.pendingDebrief.recoveredCohortIds, cohorts),
    lostCohortIds: uniqueExistingCohorts(campaign.pendingDebrief.lostCohortIds, cohorts),
    garrisonCandidateIds: uniqueExistingCohorts(campaign.pendingDebrief.garrisonCandidateIds, cohorts),
  } : null;
  const activeTransit = campaign.activeTransit
    && plannedMission
    && plannedMission.id === campaign.activeTransit.loadoutId
    && plannedMission.cityId === campaign.activeTransit.toCityId
    && CITIES.some((city) => city.id === campaign.activeTransit?.toCityId)
    ? campaign.activeTransit
    : null;

  return {
    ...campaign,
    schemaVersion: 4,
    worldDataVersion: WORLD_DATA_VERSION,
    cities: reconciledCities,
    cohorts,
    plannedMission,
    activeTransit,
    pendingDebrief,
  };
}

function uniqueValidReserveCohorts(loadout: MissionLoadout, cohorts: Record<string, CohortState>): string[] {
  return [...new Set(loadout.cohortIds)].filter((cohortId) => cohorts[cohortId]?.status === 'RESERVE');
}

function uniqueExistingCohorts(cohortIds: string[], cohorts: Record<string, CohortState>): string[] {
  return [...new Set(cohortIds)].filter((cohortId) => Boolean(cohorts[cohortId]));
}

export function clearCampaign(): void {
  if (!hasBrowserStorage()) return;
  localStorage.removeItem(SAVE_KEY);
}
