import { BALANCE } from './balance';
import { CITIES } from '../data/cities';
import { isPlayableCity } from '../data/playableCities';
import { haversineDistanceKm, travelDurationSeconds } from './travelRules';
import type { CampaignState, CityDefinition, CommandResult, MissionLoadout } from './types';

const OCCUPIED_STATES = new Set(['OCCUPIED', 'ASSIMILATED']);

export function calculateTravelChargeCost(campaign: CampaignState, fromCity: CityDefinition | null, toCity: CityDefinition): number {
  if (!fromCity || fromCity.id === toCity.id) return 0;
  const distanceUnits = Math.ceil(haversineDistanceKm(fromCity, toCity) / 750);
  const rawCost = distanceUnits * 2;
  const originState = campaign.cities[fromCity.id]?.conquest.controlState;
  const stagingMultiplier = originState && OCCUPIED_STATES.has(originState) ? 0.8 : 1;
  return clamp(Math.ceil(rawCost * stagingMultiplier), 4, 24);
}

export function calculateCellChargeCost(cellCount: number): number {
  return Math.max(0, Math.ceil(Number.isFinite(cellCount) ? cellCount : 0)) * BALANCE.conquest.coreChargePerCell;
}

export function validateMissionLoadout(campaign: CampaignState, loadout: MissionLoadout): CommandResult {
  const destination = CITIES.find((city) => city.id === loadout.cityId);
  if (!destination || !isPlayableCity(destination.id)) return { ok: false, reason: 'CITY UNAVAILABLE' };
  if (campaign.pendingDebrief) return { ok: false, reason: 'DEBRIEF REQUIRES ALLOCATION' };
  if (campaign.activeTransit) return { ok: false, reason: 'TRAVEL ALREADY IN PROGRESS' };
  if (campaign.plannedMission) return { ok: false, reason: 'MISSION ALREADY PLANNED' };
  if (!loadout.id.trim()) return { ok: false, reason: 'MISSION ID REQUIRED' };
  if (loadout.missionType === 'OCCUPATION' && !canStartOccupation(campaign, destination.id)) return { ok: false, reason: 'CITY MUST BE BREACHED FIRST' };
  if (!Number.isInteger(loadout.overchargeCells) || loadout.overchargeCells < 0 || loadout.overchargeCells > campaign.logistics.maxOverchargeCells) {
    return { ok: false, reason: 'OVERCHARGE CELL LIMIT' };
  }

  const selectedCohorts = [...new Set(loadout.cohortIds)];
  const maxSelectedCohorts = Math.min(campaign.logistics.dropCapacity, campaign.logistics.commandBandwidth);
  if (selectedCohorts.length > maxSelectedCohorts) return { ok: false, reason: `MAX ${maxSelectedCohorts} COHORTS` };
  for (const cohortId of selectedCohorts) {
    const cohort = campaign.cohorts[cohortId];
    if (!cohort || cohort.status !== 'RESERVE') return { ok: false, reason: 'COHORT NOT IN RESERVE' };
    if (cohort.type !== 'ASSAULT') return { ok: false, reason: 'COHORT TYPE LOCKED' };
    if (cohort.strength <= 0) return { ok: false, reason: 'COHORT HAS NO STRENGTH' };
  }

  const origin = campaign.currentCityId ? CITIES.find((city) => city.id === campaign.currentCityId) ?? null : null;
  const travelCost = calculateTravelChargeCost(campaign, origin, destination);
  const cellCost = calculateCellChargeCost(loadout.overchargeCells);
  if (loadout.travelChargeCost !== travelCost) return { ok: false, reason: 'TRAVEL COST OUTDATED' };
  if (loadout.cellChargeCost !== cellCost) return { ok: false, reason: 'CELL COST OUTDATED' };
  if (travelCost + cellCost > campaign.logistics.coreCharge) return { ok: false, reason: 'INSUFFICIENT CORE CHARGE' };
  return { ok: true };
}

export function commitMissionLaunch(campaign: CampaignState, loadout: MissionLoadout): CampaignState {
  if (!validateMissionLoadout(campaign, loadout).ok) return campaign;
  const destination = CITIES.find((city) => city.id === loadout.cityId);
  if (!destination) return campaign;
  const origin = campaign.currentCityId ? CITIES.find((city) => city.id === campaign.currentCityId) ?? null : null;
  const duration = origin && origin.id === destination.id ? 0.25 : origin ? travelDurationSeconds(origin, destination) : 1.5;
  const totalChargeCost = loadout.travelChargeCost + loadout.cellChargeCost;
  return {
    ...campaign,
    logistics: {
      ...campaign.logistics,
      coreCharge: campaign.logistics.coreCharge - totalChargeCost,
    },
    plannedMission: { ...loadout, cohortIds: [...new Set(loadout.cohortIds)] },
    activeTransit: {
      fromCityId: origin?.id ?? null,
      toCityId: destination.id,
      progress: 0,
      duration,
      loadoutId: loadout.id,
    },
  };
}

export function advanceCampaignTransit(campaign: CampaignState, dtSeconds: number): CampaignState {
  const transit = campaign.activeTransit;
  if (!transit) return campaign;
  const safeDt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
  const elapsed = transit.duration * transit.progress;
  const remaining = Math.max(0, transit.duration - elapsed);
  const progressedSeconds = Math.min(safeDt, remaining);
  const progress = transit.duration <= 0 ? 1 : Math.min(1, (elapsed + progressedSeconds) / transit.duration);
  const nextTime = campaign.currentTimeMinutes + progressedSeconds / 60;
  if (progress >= 1) {
    return {
      ...campaign,
      currentTimeMinutes: nextTime,
      currentCityId: transit.toCityId,
      activeTransit: null,
    };
  }
  return {
    ...campaign,
    currentTimeMinutes: nextTime,
    activeTransit: { ...transit, progress },
  };
}

export function grantEmergencyTravelCharge(campaign: CampaignState): CampaignState {
  const available = Math.max(0, campaign.logistics.maxCoreCharge - campaign.logistics.coreCharge);
  const granted = Math.min(available, BALANCE.conquest.emergencyTravelCharge + upgradeLevel(campaign, 'emergency-bio-conversion') * 4);
  if (granted <= 0) return campaign;
  return {
    ...campaign,
    globalThreat: Math.min(100, campaign.globalThreat + BALANCE.conquest.emergencyChargePenaltyThreat),
    logistics: {
      ...campaign.logistics,
      coreCharge: campaign.logistics.coreCharge + granted,
      emergencyChargeUsed: campaign.logistics.emergencyChargeUsed + granted,
    },
  };
}

function upgradeLevel(campaign: CampaignState, id: string): number {
  return campaign.upgrades[id] ?? 0;
}

export function canStartOccupation(campaign: CampaignState, cityId: string): boolean {
  const controlState = campaign.cities[cityId]?.conquest.controlState;
  return controlState === 'BREACHED' || controlState === 'OCCUPIED' || controlState === 'ASSIMILATED';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
