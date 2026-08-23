import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITIES } from '../../data/cities';
import { createNewCampaign } from '../../domain/campaignRules';
import type { CampaignState } from '../../domain/types';
import { loadCampaign, SAVE_KEY, saveCampaign } from './saveRepository';

afterEach(() => vi.unstubAllGlobals());

describe('save repository v4 migration', () => {
  it('migrates a v1 eight-city save and preserves its existing city state', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const current = createNewCampaign(77);
    const preservedSeoul = { ...withoutConquest(current.cities.seoul), destruction: 42, visits: 3 };
    const legacy: Record<string, unknown> = { ...withoutV4Fields(current), schemaVersion: 1, cities: { seoul: preservedSeoul } };
    delete legacy.worldDataVersion;
    const raw = JSON.stringify(legacy);
    storage.setItem(SAVE_KEY, raw);

    const migrated = loadCampaign();

    expect(migrated?.schemaVersion).toBe(4);
    expect(Object.keys(migrated?.cities ?? {})).toHaveLength(CITIES.length);
    expect(migrated?.cities.seoul.destruction).toBe(42);
    expect(migrated?.cities.seoul.visits).toBe(3);
    expect(migrated?.cities.seoul.absorbables).toEqual({});
    expect(migrated?.cities.seoul.conquest).toMatchObject({ controlState: 'RAIDED', resistance: 0 });
    expect(migrated?.logistics).toMatchObject({ coreCharge: 48, maxCoreCharge: 100, maxCaptiveReserve: 50_000, conversionCapacity: 2, maxOverchargeCells: 3, commandBandwidth: 2, dropCapacity: 2 });
    expect(storage.getItem(`${SAVE_KEY}.preMigrationV1`)).toBe(raw);
  });

  it('migrates a v2 save to per-city absorbable inventories and v4 state', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const current = createNewCampaign(78);
    const legacyCities = Object.fromEntries(Object.entries(current.cities).map(([cityId, city]) => [cityId, withoutConquest(city)]));
    const legacy = { ...withoutV4Fields(current), schemaVersion: 2, cities: legacyCities };
    const raw = JSON.stringify(legacy);
    storage.setItem(SAVE_KEY, raw);

    const migrated = loadCampaign();

    expect(migrated?.schemaVersion).toBe(4);
    expect(migrated?.cities.seoul.absorbables).toEqual({});
    expect(migrated?.cities.seoul.conquest.controlState).toBe('UNTOUCHED');
    expect(storage.getItem(`${SAVE_KEY}.preMigrationV2`)).toBe(raw);
  });

  it('migrates a v3 save, preserves facilities and discovery, and creates a one-time backup', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const current = createNewCampaign(79);
    const previousV3 = makeV3Save(current, {
      cities: {
        ...current.cities,
        seoul: {
          ...withoutConquest(current.cities.seoul),
          facilities: { 'power-plant': { destroyed: false, healthRatio: 0.55, repairProgress: 0.2 } },
          absorbables: { 'transit-convoy': { remainingAmount: 7000, destroyedAmount: 120, discovered: true } },
          destruction: 18,
          visits: 2,
          alert: 31,
        },
      },
      resources: { biomass: 321, alloy: 654, intel: 27 },
      upgrades: { 'beam-capacity': 2 },
    });
    const raw = JSON.stringify(previousV3);
    storage.setItem(SAVE_KEY, raw);

    const migrated = loadCampaign();
    const backup = storage.getItem(`${SAVE_KEY}.preMigrationV3`);

    expect(migrated?.schemaVersion).toBe(4);
    expect(migrated?.resources).toEqual({ biomass: 321, alloy: 654, intel: 27 });
    expect(migrated?.upgrades).toEqual({ 'beam-capacity': 2 });
    expect(migrated?.cities.seoul.facilities['power-plant']).toEqual({ destroyed: false, healthRatio: 0.55, repairProgress: 0.2 });
    expect(migrated?.cities.seoul.absorbables['transit-convoy']).toEqual({ remainingAmount: 7000, destroyedAmount: 120, discovered: true });
    expect(migrated?.cities.seoul.conquest).toMatchObject({ controlState: 'RAIDED', resistance: 31 });
    expect(backup).toBe(raw);

    const v4Raw = storage.getItem(SAVE_KEY);
    expect(v4Raw).not.toBe(raw);
    expect(loadCampaign()?.schemaVersion).toBe(4);
    expect(storage.getItem(`${SAVE_KEY}.preMigrationV3`)).toBe(backup);
    expect(storage.getItem(SAVE_KEY)).toBe(v4Raw);
  });

  it('reconciles missing cohort and garrison references without discarding the save', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const campaign = createNewCampaign(80);
    const validCohort = {
      id: 'cohort-1', type: 'ASSAULT' as const, strength: 88, cohesion: 76, control: 95, experience: 3,
      status: 'GARRISON' as const, assignedCityId: 'seoul', createdAtBattle: 1,
    };
    const reserveCohort = {
      ...validCohort, id: 'cohort-2', status: 'RESERVE' as const, assignedCityId: null,
    };
    const plannedMission = {
      id: 'mission-1', cityId: 'seoul', missionType: 'RAID' as const, cohortIds: ['cohort-2', 'missing-cohort', 'cohort-2'],
      overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 2,
    };
    const withReferences: CampaignState = {
      ...campaign,
      cohorts: { 'cohort-1': validCohort, 'cohort-2': reserveCohort },
      plannedMission,
      cities: {
        ...campaign.cities,
        seoul: { ...campaign.cities.seoul, conquest: { ...campaign.cities.seoul.conquest, garrisonCohortIds: ['cohort-1', 'missing-cohort', 'cohort-1'] } },
        busan: { ...campaign.cities.busan, conquest: { ...campaign.cities.busan.conquest, garrisonCohortIds: ['cohort-1'] } },
      },
    };
    saveCampaign(withReferences);

    const loaded = loadCampaign();

    expect(loaded).not.toBeNull();
    expect(loaded?.cities.seoul.conquest.garrisonCohortIds).toEqual(['cohort-1']);
    expect(loaded?.cities.busan.conquest.garrisonCohortIds).toEqual([]);
    expect(loaded?.plannedMission?.cohortIds).toEqual(['cohort-2']);
    expect(loaded?.cohorts['cohort-1'].status).toBe('GARRISON');
  });

  it('round-trips v4 logistics, transit, mission and pending debrief state', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const campaign = createNewCampaign(81);
    const roundTrip: CampaignState = {
      ...campaign,
      logistics: { ...campaign.logistics, coreCharge: 39, captiveReserve: 12_500, emergencyChargeUsed: 1 },
      cohorts: {
        'cohort-1': { id: 'cohort-1', type: 'ASSAULT', strength: 100, cohesion: 92, control: 98, experience: 4, status: 'RESERVE', assignedCityId: null, createdAtBattle: 2 },
      },
      nextCohortId: 2,
      plannedMission: { id: 'mission-4', cityId: 'seoul', missionType: 'RAID', cohortIds: ['cohort-1'], overchargeCells: 2, travelChargeCost: 6, cellChargeCost: 16, createdAtMinutes: 10 },
      activeTransit: { fromCityId: 'busan', toCityId: 'seoul', progress: 0.4, duration: 8, loadoutId: 'mission-4' },
      pendingDebrief: {
        id: 'debrief-4', cityId: 'seoul', missionType: 'RAID', outcome: 'PARTIAL',
        cargoRecovered: { captives: 12_000, biomass: 0, alloy: 20, intel: 3, coreCharge: 8 },
        absorbedByKind: { ORGANIC: 12_000, POWER: 0, VEHICLE: 0, MACHINERY: 0, DATA: 0, RELIC: 0 },
        recoveredCohortIds: ['cohort-1'], lostCohortIds: [], garrisonCandidateIds: [],
        cityControlBefore: 'RAIDED', cityControlAfterCombat: 'BREACHED', destruction: 22, globalThreatDelta: 4, createdAtMinutes: 11,
      },
      cities: {
        ...campaign.cities,
        seoul: {
          ...campaign.cities.seoul,
          conquest: { ...campaign.cities.seoul.conquest, controlState: 'BREACHED', breachProgress: 1, commandNodesCaptured: ['command-1'] },
        },
      },
    };
    saveCampaign(roundTrip);

    const loaded = loadCampaign();

    expect(loaded).toEqual(roundTrip);
    expect(loaded?.pendingDebrief?.cargoRecovered.captives).toBe(12_000);
    expect(loaded?.activeTransit?.loadoutId).toBe('mission-4');
  });
});

function withoutConquest(city: CampaignState['cities'][string]): Omit<CampaignState['cities'][string], 'conquest'> {
  const legacyCity = { ...city } as Omit<CampaignState['cities'][string], 'conquest'> & { conquest?: CampaignState['cities'][string]['conquest'] };
  delete legacyCity.conquest;
  return legacyCity;
}

function withoutV4Fields(campaign: CampaignState): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...campaign };
  for (const field of ['logistics', 'cohorts', 'nextCohortId', 'plannedMission', 'activeTransit', 'pendingDebrief']) delete legacy[field];
  return legacy;
}

function makeV3Save(campaign: CampaignState, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return { ...withoutV4Fields(campaign), ...overrides, schemaVersion: 3, worldDataVersion: campaign.worldDataVersion };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}
