import { createCombatState, refreshAbsorbableTargetStatuses, stopBeam } from '../../domain/combatRules';
import { resolveMissionOutcome } from '../../domain/missionRules';
import { ENABLE_DYNAMIC_CIVILIAN_SHELTER_MOVEMENT, isShelterOrganicTarget, tickCivilianShelters } from '../../domain/shelterRules';
import type { AbilityId, AbsorbableTargetState, CampaignState, CityDefinition, CityState, CombatState, TacticalPreset, Vec2 } from '../../domain/types';
import { gameplayProfileById, gameplayProfileForPreset, type BattleGameplayProfile } from './BattleGameplayProfile';
import { createPlannedBattleSetup } from './battleSetupRules';
import { generateAbsorbableClusters } from './generateAbsorbableClusters';
import { tickGroundSwarm } from './groundSwarmRules';
import { tickSideViewCohortAi } from './cohortAiRules';
import { createGroundPositioningState } from '../../domain/units/groundCombatAi';
import { createSideViewTacticalPreset, sideViewBiomeForProfile } from './sideViewBiomeCatalog';

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
  const setup = campaign.plannedMission?.cityId === city.id
    ? campaign.plannedMission.battleSetup
    : createPlannedBattleSetup(campaign, city, missionId);
  const profile = gameplayProfileById(setup.gameplayProfileId) ?? gameplayProfileForPreset(sourcePreset.id);
  const biome = sideViewBiomeForProfile(profile.id);
  const generatedTargets = generateAbsorbableClusters({
    campaignSeed: campaign.seed,
    cityId: city.id,
    visit: cityState.visits + 1,
    missionId,
    profile,
    sourceTargets: biome.absorbableTargets,
    layoutSeed: setup.layoutSeed,
    availableAmountsByKind: Object.fromEntries(Object.entries(cityState.sideViewResources.pools).map(([kind, pool]) => [kind, pool.remainingAmount])),
  });
  const facilities = profileFacilities(biome.facilities, profile);
  const preset = createSideViewTacticalPreset(biome, profile, generatedTargets, facilities);
  const combatState = createCombatState(campaign, city, cityState, preset);
  combatState.battleMode = 'SIDE_VIEW';
  combatState.groundUnitAi = Object.fromEntries(combatState.facilities.filter((facility) => facility.kind === 'SAM' && !facility.destroyed)
    .map((facility) => [facility.id, createGroundPositioningState(facility.id)]));
  combatState.enemyPressureMultiplier = profile.enemyPressureMultiplier;
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

function profileFacilities(sourceFacilities: TacticalPreset['facilities'], profile: BattleGameplayProfile): TacticalPreset['facilities'] {
  const maximumWeight = Math.max(1, ...Object.values(profile.defenseWeights));
  return sourceFacilities.filter((facility) => {
    const ofKind = sourceFacilities.filter((candidate) => candidate.kind === facility.kind);
    const allowedCount = Math.min(ofKind.length, Math.max(1, Math.ceil(ofKind.length * profile.defenseWeights[facility.kind] / maximumWeight)));
    return ofKind.indexOf(facility) < allowedCount;
  }).map((facility) => ({ ...facility, position: { x: facility.position.x, z: 0 } }));
}

export function tickSideViewBattle(state: CombatState, profile: BattleGameplayProfile, dt: number, unitInvincibilityEnabled = false): void {
  if (state.battleMode !== 'SIDE_VIEW' || state.result !== 'ACTIVE') return;
  discoverNearbySideViewTargets(state, profile);
  if (ENABLE_DYNAMIC_CIVILIAN_SHELTER_MOVEMENT) tickCivilianShelters(state, dt);
  tickGroundSwarm(state, profile, dt, unitInvincibilityEnabled);
  for (const facility of state.facilities) if (facility.destroyed || facility.health <= 0) delete state.groundUnitAi[facility.id];
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
  state.endReason = 'EXTRACTED';
  state.result = resolveMissionOutcome(state);
  state.groundUnitAi = {};
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

export function abortSideViewBattle(state: CombatState): { ok: boolean; reason?: string } {
  if (state.result !== 'ACTIVE') return { ok: false, reason: 'COMBAT IS OVER' };
  if (state.activeAbility === 'beam') stopBeam(state, 'MANUAL');
  state.result = 'FAILED';
  state.groundUnitAi = {};
  state.endReason = 'ABORTED';
  state.mothership.extractionStatus = 'AVAILABLE';
  state.extractionStatus = 'AVAILABLE';
  return { ok: true };
}

export function discoverNearbySideViewTargets(state: CombatState, profile: BattleGameplayProfile): number {
  let discovered = 0;
  const effectiveAutoScanRange = profile.autoScanRange + state.modifiers.scanRangeBonus;
  for (const target of state.absorbableTargets) {
    if (target.discovered || (!isShelterOrganicTarget(target) && target.remainingAmount <= 0)) continue;
    if (Math.abs(target.center.x - state.mothership.position.x) > effectiveAutoScanRange + target.radius) continue;
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
    .filter((target) => target.discovered
      && (target.remainingAmount > 0 || isShelterOrganicTarget(target) && target.shelterBreachState !== 'DESTROYED')
      && (target.status === 'AVAILABLE' || isShelterOrganicTarget(target) && target.shelterBreachState !== 'DESTROYED'))
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
