import { createCombatState, refreshAbsorbableTargetStatuses, stopBeam } from '../../domain/combatRules';
import { resolveMissionOutcome } from '../../domain/missionRules';
import type { AbilityId, AbsorbableTargetState, CampaignState, CityDefinition, CityState, CombatState, TacticalPreset, Vec2 } from '../../domain/types';
import { gameplayProfileForPreset, type BattleGameplayProfile } from './BattleGameplayProfile';
import { generateAbsorbableClusters } from './generateAbsorbableClusters';
import { tickGroundSwarm } from './groundSwarmRules';
import { tickSideViewCohortAi } from './cohortAiRules';

export interface SideViewBattleSession {
  combatState: CombatState;
  profile: BattleGameplayProfile;
}

export function createSideViewBattleSession(
  campaign: CampaignState,
  city: CityDefinition,
  cityState: CityState,
  sourcePreset: TacticalPreset,
  missionId = campaign.plannedMission?.id ?? `${campaign.campaignId}:${city.id}:visit-${cityState.visits + 1}`,
): SideViewBattleSession {
  const profile = gameplayProfileForPreset(sourcePreset.id);
  const generatedTargets = generateAbsorbableClusters({
    campaignSeed: campaign.seed,
    cityId: city.id,
    visit: cityState.visits + 1,
    missionId,
    profile,
    sourceTargets: sourcePreset.absorbableTargets,
  });
  const landmarkTarget = generatedTargets.find((target) => target.optional) ?? generatedTargets[generatedTargets.length - 1];
  const preset: TacticalPreset = {
    ...sourcePreset,
    landmark: {
      ...sourcePreset.landmark,
      objectiveTargetId: landmarkTarget?.id ?? sourcePreset.landmark.objectiveTargetId,
      objectiveLabel: landmarkTarget ? `OPTIONAL: ABSORB ${landmarkTarget.label}` : sourcePreset.landmark.objectiveLabel,
    },
    sectors: [{ id: `${city.id}:side-view`, label: 'GROUND ABSORPTION CORRIDOR', center: { x: 0, z: 0 }, radius: profile.worldMaxX }],
    absorbableTargets: generatedTargets,
    populationZones: sourcePreset.populationZones.map((zone) => ({ ...zone, center: { x: zone.center.x, z: 0 } })),
    facilities: sourcePreset.facilities.map((facility) => ({ ...facility, position: { x: facility.position.x, z: 0 } })),
    controlNodes: sourcePreset.controlNodes.map((node) => ({ ...node, position: { x: node.position.x, z: 0 } })),
    groundDefenders: sourcePreset.groundDefenders.map((defender) => ({ ...defender, position: { x: defender.position.x, z: 0 } })),
  };
  const combatState = createCombatState(campaign, city, cityState, preset);
  combatState.battleMode = 'SIDE_VIEW';
  combatState.survivalUnlockSeconds = profile.survivalUnlockSeconds;
  combatState.mothership.position = { x: 0, z: 0 };
  combatState.mothership.velocity = { x: 0, z: 0 };
  combatState.mothership.target = null;
  combatState.mothership.extractionStatus = 'LOCKED';
  combatState.mothership.extractionProgress = 0;
  combatState.extractionStatus = 'LOCKED';
  discoverNearbySideViewTargets(combatState, profile);
  return { combatState, profile };
}

export function tickSideViewBattle(state: CombatState, profile: BattleGameplayProfile, dt: number): void {
  if (state.battleMode !== 'SIDE_VIEW' || state.result !== 'ACTIVE') return;
  discoverNearbySideViewTargets(state, profile);
  tickGroundSwarm(state, profile, dt);
  tickSideViewCohortAi(state);
  if (state.extractionStatus === 'LOCKED' && state.elapsedSeconds >= state.survivalUnlockSeconds) {
    state.extractionStatus = 'AVAILABLE';
    state.mothership.extractionStatus = 'AVAILABLE';
  }
  if (state.extractionStatus !== 'IN_PROGRESS') return;
  state.mothership.extractionProgress = clamp(state.mothership.extractionProgress + dt / profile.extractionChannelSeconds, 0, 1);
  if (state.mothership.extractionProgress < 1) return;
  state.extractionStatus = 'COMPLETE';
  state.mothership.extractionStatus = 'COMPLETE';
  state.result = resolveMissionOutcome(state);
}

export function beginSideViewExtraction(state: CombatState): { ok: boolean; reason?: string } {
  if (state.result !== 'ACTIVE') return { ok: false, reason: 'COMBAT IS OVER' };
  if (state.extractionStatus === 'LOCKED') return { ok: false, reason: 'EXTRACTION LOCKED' };
  if (state.extractionStatus === 'COMPLETE') return { ok: false, reason: 'EXTRACTION COMPLETE' };
  if (state.extractionStatus === 'IN_PROGRESS') return { ok: true };
  if (state.activeAbility === 'beam') stopBeam(state, 'EXTRACTION_STARTED');
  state.extractionStatus = 'IN_PROGRESS';
  state.mothership.extractionStatus = 'IN_PROGRESS';
  state.mothership.extractionProgress = 0;
  return { ok: true };
}

export function discoverNearbySideViewTargets(state: CombatState, profile: BattleGameplayProfile): number {
  let discovered = 0;
  for (const target of state.absorbableTargets) {
    if (target.discovered || target.remainingAmount <= 0) continue;
    if (Math.abs(target.center.x - state.mothership.position.x) > profile.autoScanRange + target.radius) continue;
    target.discovered = true;
    discovered += 1;
  }
  if (discovered > 0) {
    state.scanCount += 1;
    state.lastScanDiscovered = discovered;
    refreshAbsorbableTargetStatuses(state);
  }
  return discovered;
}

export function nearestUsableSideViewTarget(state: CombatState): AbsorbableTargetState | null {
  return state.absorbableTargets
    .filter((target) => target.discovered && target.status === 'AVAILABLE' && target.remainingAmount > 0)
    .map((target) => ({ target, distance: Math.abs(target.center.x - state.mothership.position.x) }))
    .filter(({ target, distance }) => distance <= target.radius + state.modifiers.beamRadiusBonus + 2)
    .sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
}

export function selectAutomaticSideViewAbilityTarget(state: CombatState, ability: Extract<AbilityId, 'emp' | 'plasma'>): Vec2 | null {
  const range = ability === 'emp' ? 28 : 28;
  const linkedTarget = state.absorbableTargets
    .filter((target) => target.discovered && target.status === 'LOCKED' && target.linkedFacilityId)
    .sort((a, b) => Math.abs(a.center.x - state.mothership.position.x) - Math.abs(b.center.x - state.mothership.position.x))[0];
  const linkedFacility = linkedTarget
    ? state.facilities.find((facility) => facility.id === linkedTarget.linkedFacilityId && !facility.destroyed)
    : undefined;
  const candidates = [
    ...(linkedFacility ? [{ position: linkedFacility.position, priority: 0 }] : []),
    ...state.groundDefenders.filter((defender) => defender.health > 0).map((defender) => ({ position: defender.position, priority: 1 })),
    ...state.facilities.filter((facility) => !facility.destroyed).map((facility) => ({ position: facility.position, priority: 2 })),
    ...state.enemies.filter((enemy) => enemy.health > 0).map((enemy) => ({ position: enemy.position, priority: 3 })),
  ];
  return candidates
    .map((candidate) => ({ ...candidate, distance: Math.hypot(candidate.position.x - state.mothership.position.x, candidate.position.z - state.mothership.position.z) }))
    .filter((candidate) => candidate.distance <= range)
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance)[0]?.position ?? null;
}

export function sideViewBattleTimeRemaining(state: CombatState): number {
  return Math.max(0, state.survivalUnlockSeconds - state.elapsedSeconds);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
