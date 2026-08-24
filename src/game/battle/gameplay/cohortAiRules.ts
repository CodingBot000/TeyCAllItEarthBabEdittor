import { BALANCE } from '../../domain/balance';
import { commandCohortAssault, commandCohortRetreat, commandCohortSecure, deployCohort } from '../../domain/cohortRules';
import type { CombatState, DeployedCohortState } from '../../domain/types';

export function tickSideViewCohortAi(state: CombatState): void {
  if (state.battleMode !== 'SIDE_VIEW' || state.result !== 'ACTIVE' || state.deployedCohorts.length === 0) return;
  autoDeployCohorts(state);
  for (const cohort of state.deployedCohorts) {
    if (!cohort.deployed || !cohort.recoverable || cohort.strength <= 0) continue;
    if (state.extractionStatus === 'IN_PROGRESS' || state.extractionStatus === 'COMPLETE') {
      const occupationGarrisonHold = state.missionType === 'OCCUPATION' && state.occupationReady;
      if (!occupationGarrisonHold && cohort.order !== 'RETREAT') commandCohortRetreat(state, cohort.cohortId);
      continue;
    }
    const currentTargetAlive = cohort.targetEntityId ? targetAlive(state, cohort.targetEntityId) : false;
    if (cohort.order === 'ASSAULT' && currentTargetAlive) continue;
    if (cohort.order === 'SECURE' && currentTargetAlive) continue;
    const assaultTarget = nearestAssaultTarget(state, cohort);
    if (assaultTarget) {
      commandCohortAssault(state, cohort.cohortId, assaultTarget.id);
      continue;
    }
    if (state.missionType === 'OCCUPATION') {
      const claimedNodeIds = new Set(state.deployedCohorts
        .filter((candidate) => candidate.cohortId !== cohort.cohortId && candidate.order === 'SECURE' && candidate.targetEntityId)
        .map((candidate) => candidate.targetEntityId!));
      const node = state.controlNodes
        .filter((candidate) => candidate.requiredForOccupation && candidate.owner !== 'ALIEN' && !claimedNodeIds.has(candidate.id))
        .sort((a, b) => Math.abs(a.position.x - cohort.position.x) - Math.abs(b.position.x - cohort.position.x))[0];
      if (node) commandCohortSecure(state, cohort.cohortId, node.id);
    }
  }
}

function autoDeployCohorts(state: CombatState): void {
  if (state.elapsedSeconds < BALANCE.sideViewCohort.deploymentDelay) return;
  const undeployed = state.deployedCohorts.filter((cohort) => !cohort.deployed && cohort.recoverable && cohort.strength > 0);
  undeployed.forEach((cohort, index) => {
    const centeredIndex = index - (undeployed.length - 1) / 2;
    deployCohort(state, cohort.cohortId, { x: state.mothership.position.x + centeredIndex * BALANCE.sideViewCohort.deploymentSpacing, z: 0 });
  });
}

function nearestAssaultTarget(state: CombatState, cohort: DeployedCohortState): { id: string; position: { x: number; z: number } } | null {
  return [
    ...state.groundDefenders.filter((target) => target.health > 0),
    ...state.facilities.filter((target) => !target.destroyed && target.health > 0),
  ]
    .map((target) => ({ target, distance: Math.abs(target.position.x - cohort.position.x) }))
    .sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
}

function targetAlive(state: CombatState, targetId: string): boolean {
  const defender = state.groundDefenders.find((target) => target.id === targetId);
  if (defender) return defender.health > 0;
  const facility = state.facilities.find((target) => target.id === targetId);
  if (facility) return !facility.destroyed && facility.health > 0;
  const node = state.controlNodes.find((target) => target.id === targetId);
  return Boolean(node && node.owner !== 'ALIEN');
}
