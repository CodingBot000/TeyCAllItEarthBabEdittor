import { BALANCE } from './balance';
import type { CampaignState, CohortMissionResult, CommandResult, CombatState, ControlNodeState, DeployedCohortState, GroundDefenderDefinition, GroundDefenderState, TacticalControlNodeDefinition, Vec2 } from './types';

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createDeployedCohorts(campaign: CampaignState): DeployedCohortState[] {
  const cohortIds = campaign.plannedMission?.cohortIds ?? [];
  return [...new Set(cohortIds)].flatMap((cohortId) => {
    const cohort = campaign.cohorts[cohortId];
    if (!cohort || cohort.status === 'LOST' || cohort.status === 'GARRISON' || cohort.type !== 'ASSAULT') return [];
    return [{
      cohortId: cohort.id,
      type: cohort.type,
      position: { x: 0, z: 66 },
      strength: cohort.strength,
      cohesion: cohort.cohesion,
      control: cohort.control,
      order: 'IDLE' as const,
      targetPosition: null,
      targetEntityId: null,
      deployed: false,
      recoverable: true,
    }];
  });
}

export function createGroundDefenders(definitions: GroundDefenderDefinition[], defenseMultiplier: number, resistance: number): GroundDefenderState[] {
  const resistanceMultiplier = 1 + clamp(resistance, 0, 100) / 500;
  return definitions.map((definition) => ({
    ...definition,
    health: definition.health * defenseMultiplier * resistanceMultiplier,
    attackDamagePerSecond: definition.attackDamagePerSecond * defenseMultiplier * resistanceMultiplier,
    disabledUntil: 0,
  }));
}

export function createControlNodes(definitions: TacticalControlNodeDefinition[]): ControlNodeState[] {
  return definitions.map((definition) => ({
    ...definition,
    captureProgress: 0,
    owner: 'EARTH' as const,
  }));
}

export function deployCohort(state: CombatState, cohortId: string, position: Vec2): CommandResult {
  const cohort = state.deployedCohorts.find((item) => item.cohortId === cohortId);
  if (!cohort) return { ok: false, reason: 'COHORT NOT IN LOADOUT' };
  if (cohort.deployed) return { ok: false, reason: 'COHORT ALREADY DEPLOYED' };
  if (cohort.strength <= 0 || !cohort.recoverable) return { ok: false, reason: 'COHORT CANNOT DEPLOY' };
  const deployedCount = state.deployedCohorts.filter((item) => item.deployed).length;
  if (deployedCount >= state.modifiers.dropCapacity) return { ok: false, reason: 'DROP CAPACITY FULL' };
  cohort.position = { ...position };
  cohort.targetPosition = null;
  cohort.targetEntityId = null;
  cohort.order = 'IDLE';
  cohort.deployed = true;
  return { ok: true };
}

export function commandCohortMove(state: CombatState, cohortId: string, target: Vec2): CommandResult {
  const cohort = commandableCohort(state, cohortId);
  if (!cohort) return { ok: false, reason: 'COHORT UNAVAILABLE' };
  const bandwidth = ensureCommandBandwidth(state, cohort);
  if (!bandwidth.ok) return bandwidth;
  cohort.order = 'MOVE';
  cohort.targetPosition = { ...target };
  cohort.targetEntityId = null;
  return { ok: true };
}

export function commandCohortAssault(state: CombatState, cohortId: string, targetId: string): CommandResult {
  const cohort = commandableCohort(state, cohortId);
  if (!cohort) return { ok: false, reason: 'COHORT UNAVAILABLE' };
  const target = state.groundDefenders.find((defender) => defender.id === targetId)
    ?? state.facilities.find((facility) => facility.id === targetId);
  if (!target) return { ok: false, reason: 'ASSAULT TARGET NOT FOUND' };
  const bandwidth = ensureCommandBandwidth(state, cohort);
  if (!bandwidth.ok) return bandwidth;
  cohort.order = 'ASSAULT';
  cohort.targetEntityId = targetId;
  cohort.targetPosition = { ...target.position };
  return { ok: true };
}

export function commandCohortSecure(state: CombatState, cohortId: string, nodeId: string): CommandResult {
  const cohort = commandableCohort(state, cohortId);
  if (!cohort) return { ok: false, reason: 'COHORT UNAVAILABLE' };
  const node = state.controlNodes.find((item) => item.id === nodeId);
  if (!node) return { ok: false, reason: 'CONTROL NODE NOT FOUND' };
  const bandwidth = ensureCommandBandwidth(state, cohort);
  if (!bandwidth.ok) return bandwidth;
  cohort.order = 'SECURE';
  cohort.targetEntityId = nodeId;
  cohort.targetPosition = { ...node.position };
  return { ok: true };
}

export function commandCohortRetreat(state: CombatState, cohortId: string): CommandResult {
  const cohort = commandableCohort(state, cohortId);
  if (!cohort) return { ok: false, reason: 'COHORT UNAVAILABLE' };
  cohort.order = 'RETREAT';
  cohort.targetPosition = { ...state.mothership.position };
  cohort.targetEntityId = null;
  return { ok: true };
}

export function tickCohorts(state: CombatState, dt: number, unitInvincibilityEnabled = false): void {
  const step = Math.min(dt, 0.25);
  for (const cohort of state.deployedCohorts) {
    if (!cohort.deployed || cohort.strength <= 0 || !cohort.recoverable) continue;
    const target = cohortTargetPosition(state, cohort);
    if (target) {
      cohort.targetPosition = { ...target };
      moveCohort(cohort, target, step, state.modifiers.cohortMoveSpeedMultiplier);
    }
    if (cohort.order === 'ASSAULT' && cohort.targetEntityId && distance(cohort.position, cohort.targetPosition ?? cohort.position) <= BALANCE.cohort.assaultRange) {
      applyCohortAssault(state, cohort, cohort.targetEntityId, step, unitInvincibilityEnabled);
    } else if (cohort.order === 'SECURE' && cohort.targetPosition && distance(cohort.position, cohort.targetPosition) <= BALANCE.cohort.assaultRange) {
      cohort.cohesion = clamp(cohort.cohesion + step * 0.35, 0, 100);
    }
    // Keep a recovered cohort in the combat state until the mission is staged.
    // That lets reconciliation persist losses/cohesion changes made before it
    // reached the mothership instead of treating it as an untouched reserve.
    if (cohort.order === 'RETREAT' && distance(cohort.position, state.mothership.position) <= BALANCE.cohort.recoveryRadius * state.modifiers.cohortRecoveryRadiusMultiplier) {
      cohort.order = 'IDLE';
      cohort.targetPosition = null;
    }
    cohort.cohesion = clamp(cohort.cohesion + step * 0.18, 0, 100);
  }
  tickGroundDefenders(state, step, unitInvincibilityEnabled);
}

export function updateControlNodes(state: CombatState, dt: number): void {
  const step = Math.min(dt, 0.25);
  for (const node of state.controlNodes) {
    const cohortsPresent = state.deployedCohorts.some((cohort) => cohort.deployed && cohort.strength > 0 && distance(cohort.position, node.position) <= node.radius);
    const defendersPresent = state.groundDefenders.some((defender) => defender.health > 0 && distance(defender.position, node.position) <= node.radius && defender.disabledUntil <= state.elapsedSeconds);
    if (cohortsPresent && defendersPresent) {
      node.owner = 'CONTESTED';
      continue;
    }
    if (cohortsPresent) {
      node.captureProgress = clamp(node.captureProgress + step / BALANCE.occupation.captureSeconds, 0, 1);
      if (node.captureProgress >= 1) node.owner = 'ALIEN';
      else node.owner = 'CONTESTED';
      continue;
    }
    if (node.owner === 'ALIEN') {
      node.captureProgress = clamp(node.captureProgress - step / (BALANCE.occupation.captureSeconds * 2), 0, 1);
      if (node.captureProgress <= 0) node.owner = 'EARTH';
    } else {
      node.captureProgress = clamp(node.captureProgress - step / (BALANCE.occupation.captureSeconds * 2), 0, 1);
      node.owner = 'EARTH';
    }
  }
  state.occupationReady = requiredControlNodesCaptured(state) && state.groundDefenders.filter((defender) => defender.health > 0 && defender.linkedControlNodeId !== undefined).length === 0;
}

export function resolveRecoveredCohorts(state: CombatState): CohortMissionResult[] {
  return state.deployedCohorts.flatMap((cohort) => {
    if (!cohort.deployed) return [];
    const position = { ...cohort.position };
    if (state.result === 'FAILED' || cohort.strength <= 0 || !cohort.recoverable) return [{ ...cohortResult(cohort, 'LOST'), position }];
    const holdingRequiredOccupationNode = state.missionType === 'OCCUPATION'
      && state.result === 'SUCCESS'
      && state.extractionStatus === 'COMPLETE'
      && state.occupationReady
      && state.controlNodes.some((node) => node.requiredForOccupation && node.owner === 'ALIEN' && distance(position, node.position) <= node.radius + BALANCE.cohort.assaultRange);
    if (holdingRequiredOccupationNode) return [{ ...cohortResult(cohort, 'GARRISON_CANDIDATE'), position }];
    const inRecoveryRange = distance(position, state.mothership.position) <= BALANCE.cohort.recoveryRadius * state.modifiers.cohortRecoveryRadiusMultiplier;
    if (inRecoveryRange) return [{ ...cohortResult(cohort, 'RECOVERED'), position }];
    return [{ ...cohortResult(cohort, 'LOST'), position }];
  });
}

function commandableCohort(state: CombatState, cohortId: string): DeployedCohortState | null {
  const cohort = state.deployedCohorts.find((item) => item.cohortId === cohortId);
  return cohort && cohort.deployed && cohort.strength > 0 && cohort.recoverable ? cohort : null;
}

function ensureCommandBandwidth(state: CombatState, cohort: DeployedCohortState): CommandResult {
  const activeCommands = state.deployedCohorts.filter((item) => item.deployed && item.cohortId !== cohort.cohortId && item.order !== 'IDLE' && item.order !== 'RETREAT').length;
  if (cohort.order === 'IDLE' && activeCommands >= state.modifiers.commandBandwidth) return { ok: false, reason: 'COMMAND BANDWIDTH FULL' };
  return { ok: true };
}

function cohortTargetPosition(state: CombatState, cohort: DeployedCohortState): Vec2 | null {
  if (cohort.order === 'RETREAT') return state.mothership.position;
  if (cohort.targetEntityId) {
    const defender = state.groundDefenders.find((item) => item.id === cohort.targetEntityId);
    if (defender) return defender.position;
    const facility = state.facilities.find((item) => item.id === cohort.targetEntityId);
    if (facility) return facility.position;
    const node = state.controlNodes.find((item) => item.id === cohort.targetEntityId);
    if (node) return node.position;
  }
  return cohort.targetPosition;
}

function moveCohort(cohort: DeployedCohortState, target: Vec2, dt: number, speedMultiplier: number): void {
  const dx = target.x - cohort.position.x;
  const dz = target.z - cohort.position.z;
  const remaining = Math.hypot(dx, dz);
  if (remaining <= BALANCE.cohort.assaultRange) {
    cohort.position = { ...target };
    return;
  }
  const travel = Math.min(remaining, BALANCE.cohort.moveSpeed * dt * speedMultiplier);
  cohort.position.x += dx / remaining * travel;
  cohort.position.z += dz / remaining * travel;
}

function applyCohortAssault(state: CombatState, cohort: DeployedCohortState, targetId: string, dt: number, unitInvincibilityEnabled: boolean): void {
  if (unitInvincibilityEnabled) return;
  const damage = BALANCE.cohort.assaultDamagePerSecond * state.modifiers.cohortAssaultDamageMultiplier * (cohort.strength / 100) * (cohort.cohesion / 100) * dt;
  const defender = state.groundDefenders.find((item) => item.id === targetId);
  if (defender) {
    if (defender.disabledUntil <= state.elapsedSeconds) defender.health = Math.max(0, defender.health - damage);
    return;
  }
  const facility = state.facilities.find((item) => item.id === targetId);
  if (!facility || facility.destroyed) return;
  facility.health = Math.max(0, facility.health - damage);
  if (facility.health === 0) {
    facility.destroyed = true;
    state.destroyedInfrastructure += 1;
  }
}

function tickGroundDefenders(state: CombatState, dt: number, unitInvincibilityEnabled: boolean): void {
  for (const defender of state.groundDefenders) {
    if (defender.health <= 0 || defender.disabledUntil > state.elapsedSeconds) continue;
    const target = state.deployedCohorts
      .filter((cohort) => cohort.deployed && cohort.strength > 0 && cohort.recoverable)
      .sort((a, b) => distance(a.position, defender.position) - distance(b.position, defender.position))[0];
    if (!target || distance(target.position, defender.position) > defender.attackRange) continue;
    const incomingDamage = defender.attackDamagePerSecond * state.modifiers.cohortLossMultiplier * dt;
    if (!unitInvincibilityEnabled) {
      target.strength = Math.max(0, target.strength - incomingDamage);
      target.cohesion = clamp(target.cohesion - incomingDamage * 0.18, 0, 100);
      if (target.strength <= 0) {
        target.recoverable = false;
        target.order = 'IDLE';
      }
    }
  }
}

function requiredControlNodesCaptured(state: CombatState): boolean {
  const required = state.controlNodes.filter((node) => node.requiredForOccupation);
  return required.length > 0 && required.every((node) => node.owner === 'ALIEN');
}

function cohortResult(cohort: DeployedCohortState, status: CohortMissionResult['status']): CohortMissionResult {
  return {
    cohortId: cohort.cohortId,
    status,
    strength: clamp(cohort.strength, 0, 200),
    cohesion: clamp(cohort.cohesion, 0, 100),
    control: clamp(cohort.control, 0, 100),
    experience: status === 'LOST' ? 0 : 1,
    position: { ...cohort.position },
  };
}
