import { BALANCE } from '../../domain/balance';
import type { CombatFacilityState, CombatState, GroundDefenderState, GroundSwarmProjectileState } from '../../domain/types';
import type { BattleGameplayProfile } from './BattleGameplayProfile';

type GroundTarget = GroundDefenderState | CombatFacilityState;

export function tickGroundSwarm(state: CombatState, profile: BattleGameplayProfile, dt: number): void {
  if (state.battleMode !== 'SIDE_VIEW' || state.result !== 'ACTIVE') return;
  state.groundSwarmImpacts = state.groundSwarmImpacts.filter((impact) => state.elapsedSeconds - impact.occurredAt <= 1.2);
  updateProjectiles(state, dt);
  if (state.elapsedSeconds < BALANCE.groundSwarm.initialDelay) return;
  if (state.elapsedSeconds - state.lastGroundSwarmAt < BALANCE.groundSwarm.interval) return;
  if (state.groundSwarmProjectiles.length >= BALANCE.groundSwarm.maximumActiveProjectiles) return;
  const target = selectGroundSwarmTarget(state);
  if (!target) return;
  spawnGroundSwarmBurst(state, target, profile);
  state.lastGroundSwarmAt = state.elapsedSeconds;
}

export function selectGroundSwarmTarget(state: CombatState): GroundTarget | null {
  const defenders = state.groundDefenders.filter((target) => target.health > 0);
  const facilities = state.facilities.filter((target) => !target.destroyed && target.health > 0);
  return [...defenders, ...facilities]
    .map((target) => ({ target, distance: Math.abs(target.position.x - state.mothership.position.x) }))
    .sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
}

function spawnGroundSwarmBurst(state: CombatState, target: GroundTarget, profile: BattleGameplayProfile): void {
  const count = BALANCE.groundSwarm.projectilesPerBurst;
  const startX = state.mothership.position.x;
  const distance = Math.max(1, Math.abs(target.position.x - startX));
  const duration = clamp(distance / BALANCE.groundSwarm.travelSpeed, BALANCE.groundSwarm.minimumDuration, BALANCE.groundSwarm.maximumDuration);
  for (let index = 0; index < count; index += 1) {
    if (state.groundSwarmProjectiles.length >= BALANCE.groundSwarm.maximumActiveProjectiles) break;
    const offset = index - (count - 1) / 2;
    state.groundSwarmProjectiles.push({
      id: `ground-swarm-${state.nextEntityId++}`,
      targetId: target.id,
      startX,
      targetX: target.position.x,
      progress: -index * 0.08,
      duration: duration * (0.92 + index * 0.045),
      arcHeight: 4.8 + Math.abs(offset) * 1.25 + profile.groundPressureMultiplier * 0.6,
      weavePhase: index * 1.7 + (target.position.x >= startX ? 0 : Math.PI),
      damage: BALANCE.groundSwarm.damagePerProjectile * profile.groundPressureMultiplier,
    });
  }
}

function updateProjectiles(state: CombatState, dt: number): void {
  const survivors: GroundSwarmProjectileState[] = [];
  for (const projectile of state.groundSwarmProjectiles) {
    const target = findGroundTarget(state, projectile.targetId);
    if (!target || target.health <= 0 || 'destroyed' in target && target.destroyed) continue;
    projectile.targetX = target.position.x;
    projectile.progress += dt / projectile.duration;
    if (projectile.progress < 1) {
      survivors.push(projectile);
      continue;
    }
    target.health = Math.max(0, target.health - projectile.damage);
    if ('destroyed' in target && target.health <= 0 && !target.destroyed) {
      target.destroyed = true;
      state.destroyedInfrastructure += 1;
    }
    state.groundSwarmImpacts.push({
      id: `ground-swarm-impact-${projectile.id}`,
      targetId: projectile.targetId,
      x: projectile.targetX,
      occurredAt: state.elapsedSeconds,
    });
  }
  state.groundSwarmProjectiles = survivors;
}

function findGroundTarget(state: CombatState, targetId: string): GroundTarget | null {
  return state.groundDefenders.find((target) => target.id === targetId)
    ?? state.facilities.find((target) => target.id === targetId)
    ?? null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
