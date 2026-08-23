import { BALANCE } from './balance';
import { upgradeLevel } from './campaignRules';
import { applyOccupationGarrison, validateGarrisonSelection } from './missionRules';
import type { CampaignState, CohortState, CommandResult, PendingDebriefState, ResourceWallet } from './types';

export type ConversionDoctrine = 'LEGION' | 'BALANCED' | 'SUSTAIN' | 'CUSTOM';

export interface ConversionPlan {
  doctrine: ConversionDoctrine;
  cohortCount: number;
  biomassCaptives: number;
  reserveCaptives: number;
  garrisonCohortIds?: string[];
}

export interface ConversionPreview {
  recoveredCaptives: number;
  cohortCaptives: number;
  biomassCaptives: number;
  biomassGained: number;
  reserveCaptives: number;
  remainingCaptives: number;
  cohortCount: number;
  finalCaptiveReserve: number;
  finalResources: ResourceWallet;
  valid: boolean;
  reason?: string;
}

const doctrineCohortRatio: Record<Exclude<ConversionDoctrine, 'CUSTOM'>, number> = {
  LEGION: 0.7,
  BALANCED: 0.4,
  SUSTAIN: 0.2,
};

export function defaultConversionPlan(campaign: CampaignState, pending: PendingDebriefState, doctrine: ConversionDoctrine): ConversionPlan {
  const recoveredCaptives = Math.floor(pending.cargoRecovered.captives);
  const ratio = doctrine === 'CUSTOM' ? doctrineCohortRatio.BALANCED : doctrineCohortRatio[doctrine];
  const cohortCount = Math.min(campaign.logistics.conversionCapacity, Math.floor(recoveredCaptives * ratio / BALANCE.conversion.captivesPerCohort));
  const cohortCaptives = cohortCount * BALANCE.conversion.captivesPerCohort;
  const remaining = Math.max(0, recoveredCaptives - cohortCaptives);
  const reserveRatio = doctrine === 'LEGION' ? 0.1 : doctrine === 'SUSTAIN' ? 0.7 : 0.35;
  const reserveCaptives = Math.min(
    Math.max(0, campaign.logistics.maxCaptiveReserve - campaign.logistics.captiveReserve),
    remaining % BALANCE.conversion.captivesPerBiomass + Math.floor(remaining * reserveRatio / BALANCE.conversion.captivesPerBiomass) * BALANCE.conversion.captivesPerBiomass,
  );
  return {
    doctrine,
    cohortCount,
    biomassCaptives: remaining - reserveCaptives,
    reserveCaptives,
  };
}

export function previewConversion(campaign: CampaignState, pending: PendingDebriefState, plan: ConversionPlan): ConversionPreview {
  const result = validateConversionPlan(campaign, pending, plan);
  const recoveredCaptives = Math.floor(pending.cargoRecovered.captives);
  const cohortCaptives = Math.max(0, Math.floor(plan.cohortCount)) * BALANCE.conversion.captivesPerCohort;
  const biomassGained = Math.max(0, Math.floor(plan.biomassCaptives / BALANCE.conversion.captivesPerBiomass));
  return {
    recoveredCaptives,
    cohortCaptives,
    biomassCaptives: plan.biomassCaptives,
    biomassGained,
    reserveCaptives: plan.reserveCaptives,
    remainingCaptives: recoveredCaptives - cohortCaptives - plan.biomassCaptives - plan.reserveCaptives,
    cohortCount: plan.cohortCount,
    finalCaptiveReserve: Math.min(campaign.logistics.maxCaptiveReserve, campaign.logistics.captiveReserve + Math.max(0, plan.reserveCaptives)),
    finalResources: {
      biomass: campaign.resources.biomass + pending.cargoRecovered.biomass + biomassGained,
      alloy: campaign.resources.alloy + pending.cargoRecovered.alloy,
      intel: campaign.resources.intel + pending.cargoRecovered.intel,
    },
    valid: result.ok,
    reason: result.reason,
  };
}

export function validateConversionPlan(campaign: CampaignState, pending: PendingDebriefState | null, plan: ConversionPlan): CommandResult {
  if (!pending) return { ok: false, reason: 'NO PENDING DEBRIEF' };
  if (!['LEGION', 'BALANCED', 'SUSTAIN', 'CUSTOM'].includes(plan.doctrine)) return { ok: false, reason: 'UNKNOWN DOCTRINE' };
  if (!Number.isInteger(plan.cohortCount) || plan.cohortCount < 0 || plan.cohortCount > campaign.logistics.conversionCapacity) {
    return { ok: false, reason: 'COHORT CAPACITY EXCEEDED' };
  }
  if (!Number.isInteger(plan.biomassCaptives) || plan.biomassCaptives < 0 || plan.biomassCaptives % BALANCE.conversion.captivesPerBiomass !== 0) {
    return { ok: false, reason: 'BIOMASS INPUT MUST USE 100 CAPTIVES' };
  }
  if (!Number.isInteger(plan.reserveCaptives) || plan.reserveCaptives < 0) return { ok: false, reason: 'INVALID CAPTIVE RESERVE' };
  if (plan.reserveCaptives + campaign.logistics.captiveReserve > campaign.logistics.maxCaptiveReserve) return { ok: false, reason: 'CAPTIVE RESERVE FULL' };
  const garrisonIds = plan.garrisonCohortIds ?? [];
  if (pending.missionType === 'OCCUPATION' && pending.outcome === 'SUCCESS') {
    const garrisonValidation = validateGarrisonSelection(pending, garrisonIds, campaign.cohorts);
    if (!garrisonValidation.ok) return garrisonValidation;
  } else if (garrisonIds.length > 0) {
    return { ok: false, reason: 'GARRISON ONLY APPLIES TO OCCUPATION' };
  }
  const recoveredCaptives = Math.floor(pending.cargoRecovered.captives);
  const cohortCaptives = plan.cohortCount * BALANCE.conversion.captivesPerCohort;
  if (cohortCaptives + plan.biomassCaptives + plan.reserveCaptives !== recoveredCaptives) return { ok: false, reason: 'CAPTIVE ALLOCATION MUST BALANCE' };
  return { ok: true };
}

export function finalizeDebriefAllocation(campaign: CampaignState, plan: ConversionPlan): CampaignState {
  const pending = campaign.pendingDebrief;
  const validation = validateConversionPlan(campaign, pending, plan);
  if (!validation.ok || !pending) return campaign;
  const occupationCampaign = pending.missionType === 'OCCUPATION' && pending.outcome === 'SUCCESS'
    ? applyOccupationGarrison(campaign, pending, plan.garrisonCohortIds ?? [])
    : campaign;
  const cohorts: Record<string, CohortState> = { ...occupationCampaign.cohorts };
  for (let index = 0; index < plan.cohortCount; index += 1) {
    const id = `cohort-${campaign.nextCohortId + index}`;
    cohorts[id] = {
      id,
      type: 'ASSAULT',
      strength: BALANCE.cohort.baseStrength * (1 + upgradeLevel(campaign, 'cohort-conditioning') * 0.08),
      cohesion: BALANCE.cohort.baseCohesion,
      control: BALANCE.cohort.baseControl,
      experience: 0,
      status: 'RESERVE',
      assignedCityId: null,
      createdAtBattle: campaign.completedBattles,
    };
  }
  return {
    ...occupationCampaign,
    resources: {
      biomass: occupationCampaign.resources.biomass + pending.cargoRecovered.biomass + plan.biomassCaptives / BALANCE.conversion.captivesPerBiomass,
      alloy: occupationCampaign.resources.alloy + pending.cargoRecovered.alloy,
      intel: occupationCampaign.resources.intel + pending.cargoRecovered.intel,
    },
    logistics: {
      ...campaign.logistics,
      coreCharge: Math.min(occupationCampaign.logistics.maxCoreCharge, occupationCampaign.logistics.coreCharge + pending.cargoRecovered.coreCharge),
      captiveReserve: occupationCampaign.logistics.captiveReserve + plan.reserveCaptives,
    },
    cohorts,
    nextCohortId: occupationCampaign.nextCohortId + plan.cohortCount,
    pendingDebrief: null,
  };
}
