import { BALANCE } from './balance';
import { resolveRecoveredCohorts } from './cohortRules';
import type { CampaignState, CityState, CombatOutcome, CombatState, CohortState, CommandResult, OccupationRequirementState, PendingDebriefState } from './types';

export function isOccupationAvailable(city: CityState): boolean {
  return city.conquest.controlState === 'BREACHED' || city.conquest.controlState === 'OCCUPIED' || city.conquest.controlState === 'ASSIMILATED';
}

export function occupationRequirements(state: CombatState): OccupationRequirementState {
  const requiredNodes = state.controlNodes.filter((node) => node.requiredForOccupation);
  const capturedRequiredNodeCount = requiredNodes.filter((node) => node.owner === 'ALIEN').length;
  const survivingGarrisonCandidates = state.deployedCohorts.filter((cohort) => cohort.deployed && cohort.recoverable && cohort.strength > 0).length;
  const coreDefenseReady = state.facilities.filter((facility) => facility.kind === 'SAM' || facility.kind === 'AIRBASE').every((facility) => facility.destroyed);
  return {
    requiredNodeCount: requiredNodes.length,
    capturedRequiredNodeCount,
    survivingGarrisonCandidates,
    coreDefenseReady,
    occupationReady: requiredNodes.length > 0
      && capturedRequiredNodeCount === requiredNodes.length
      && coreDefenseReady
      && survivingGarrisonCandidates >= BALANCE.occupation.requiredGarrisonCohorts,
  };
}

export function resolveMissionOutcome(state: CombatState): CombatOutcome {
  if (state.result === 'FAILED' || state.mothership.hull <= 0) return 'FAILED';
  if (state.mothership.extractionStatus !== 'COMPLETE') return 'PARTIAL';
  if (state.missionType === 'OCCUPATION') return occupationRequirements(state).occupationReady ? 'SUCCESS' : 'PARTIAL';
  return state.objectives.find((objective) => objective.id === 'harvest')?.complete ? 'SUCCESS' : 'PARTIAL';
}

export function calculateBreachProgress(state: CombatState, outcome: CombatOutcome, currentProgress: number): number {
  if (state.missionType !== 'RAID') return currentProgress;
  let gain = outcome === 'SUCCESS' ? 0.5 : outcome === 'PARTIAL' ? 0.25 : 0;
  const objectiveFulfilled = state.breachObjectiveIds.some((objectiveId) => {
    const facility = state.facilities.find((item) => item.id === objectiveId);
    if (facility) return facility.destroyed;
    const target = state.absorbableTargets.find((item) => item.id === objectiveId);
    return Boolean(target && target.remainingAmount <= 0);
  });
  if (outcome === 'SUCCESS' && objectiveFulfilled) gain += 0.5;
  return Math.min(1, Math.max(0, currentProgress + gain));
}

export function validateGarrisonSelection(pending: PendingDebriefState | null, garrisonIds: string[], cohorts?: Record<string, CohortState>): CommandResult {
  if (!pending) return { ok: false, reason: 'NO PENDING DEBRIEF' };
  if (pending.missionType !== 'OCCUPATION' || pending.outcome !== 'SUCCESS') return { ok: false, reason: 'OCCUPATION NOT READY' };
  const uniqueIds = [...new Set(garrisonIds)];
  if (uniqueIds.length < BALANCE.occupation.requiredGarrisonCohorts) return { ok: false, reason: 'GARRISON REQUIRED' };
  if (uniqueIds.some((cohortId) => !pending.garrisonCandidateIds.includes(cohortId))) return { ok: false, reason: 'INVALID GARRISON CANDIDATE' };
  if (cohorts && uniqueIds.some((cohortId) => !cohorts[cohortId] || cohorts[cohortId].status === 'LOST')) return { ok: false, reason: 'GARRISON COHORT UNAVAILABLE' };
  return { ok: true };
}

export function applyOccupationGarrison(campaign: CampaignState, pending: PendingDebriefState, garrisonIds: string[]): CampaignState {
  const validation = validateGarrisonSelection(pending, garrisonIds, campaign.cohorts);
  if (!validation.ok) return campaign;
  const city = campaign.cities[pending.cityId];
  if (!city) return campaign;
  const selected = new Set(garrisonIds);
  const cohorts: Record<string, CohortState> = { ...campaign.cohorts };
  for (const cohortId of pending.garrisonCandidateIds) {
    const cohort = cohorts[cohortId];
    if (!cohort) continue;
    cohorts[cohortId] = selected.has(cohortId)
      ? { ...cohort, status: 'GARRISON', assignedCityId: pending.cityId }
      : { ...cohort, status: 'RESERVE', assignedCityId: null };
  }
  return {
    ...campaign,
    cohorts,
    cities: {
      ...campaign.cities,
      [pending.cityId]: {
        ...city,
        conquest: {
          ...city.conquest,
          controlState: 'OCCUPIED',
          occupationProgress: 1,
          garrisonCohortIds: [...new Set(garrisonIds)],
          lastControlChangeAtMinutes: pending.createdAtMinutes,
        },
      },
    },
  };
}

export function finalizeOccupation(campaign: CampaignState, pending: PendingDebriefState, garrisonIds: string[]): CampaignState {
  const next = applyOccupationGarrison(campaign, pending, garrisonIds);
  return next === campaign ? campaign : { ...next, pendingDebrief: null };
}

export function recoverableCohortIds(state: CombatState): string[] {
  return resolveRecoveredCohorts(state).filter((result) => result.status !== 'LOST').map((result) => result.cohortId);
}
