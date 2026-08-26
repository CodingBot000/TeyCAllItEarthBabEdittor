import type { Vec3 } from '../types';
import { groundMuzzlePose } from '../sideViewSpatialRules';
import { clampX, containsX, deterministicFacing, intersectIntervals, moveGroundUnit, selectFiringDestination } from './groundAttackPositioning';
import type { AttackPolicy, GroundPositioningState, TargetVolume, UnitCombatProfile, XInterval } from './unitCombatTypes';

export function createGroundPositioningState(id: string): GroundPositioningState {
  return { mode: 'NO_TARGET', velocityX: 0, moveDirectionX: 0, facingX: deterministicFacing(id), committedSide: null,
    goalX: null, lastDecisionAt: 0, blockedReason: 'NO_TARGET', geometricallyEligible: false, canFire: false,
    shot: { allowed: false, reason: 'NO_TARGET' }, muzzle: null, visibleBounds: null, allowedBounds: null,
    lastLaunchAngle: null, lastLaunchPosition: null };
}
export interface GroundCombatInput {
  id: string; root: Vec3; target: TargetVolume | null; previous: GroundPositioningState;
  profile: UnitCombatProfile; policy: AttackPolicy; worldBounds: XInterval; visibleBounds: XInterval;
  baseSpeed: number; dt: number; now: number; disabled: boolean;
}
export function tickGroundCombatAi(input: GroundCombatInput): { x: number; state: GroundPositioningState } {
  const { root, target, profile, policy, previous } = input;
  const state: GroundPositioningState = { ...previous, velocityX: 0, moveDirectionX: 0, canFire: false, geometricallyEligible: false,
    shot: { allowed: false, reason: 'NO_TARGET' }, visibleBounds: { ...input.visibleBounds } };
  const padding = profile.boundary.halfWidth + profile.boundary.margin;
  const visible = { minX: input.visibleBounds.minX + padding, maxX: input.visibleBounds.maxX - padding };
  const bounds = intersectIntervals(input.worldBounds, visible);
  state.allowedBounds = bounds;
  const finish = (x: number, reason: string | null) => {
    state.blockedReason = reason;
    state.muzzle = groundMuzzlePose({ ...root, x }, profile.muzzle, state.facingX);
    return { x, state };
  };
  if (input.disabled) {
    state.mode = 'DISABLED'; state.goalX = null;
    return finish(root.x, 'DISABLED');
  }
  if (!target) {
    state.mode = 'NO_TARGET'; state.goalX = null;
    return finish(root.x, 'NO_TARGET');
  }
  if (!bounds) {
    state.mode = 'WAIT_FOR_SPACE'; state.goalX = null;
    return finish(root.x, 'NO_VISIBLE_SPACE');
  }
  const intervals = policy.findFiringIntervals({ muzzle: profile.muzzle, rootY: root.y, rootZ: root.z, target });
  const destination = selectFiringDestination(input.id, root.x, target.center.x, previous, intervals, bounds, profile.movement.arrivalInset);
  const inside = containsX(bounds, root.x);
  let goalX = destination?.goalX ?? null;
  if (!inside) {
    state.mode = 'ENTER_VIEW';
    goalX ??= clampX(root.x, bounds);
  } else if (!destination) {
    state.mode = 'WAIT_FOR_SPACE'; state.goalX = null;
    return finish(root.x, 'NO_REACHABLE_FIRING_POSITION');
  }
  if (inside && destination) {
    const facingX = destination.facingX;
    const shot = policy.evaluateShot({ origin: groundMuzzlePose(root, profile.muzzle, facingX), facingX, target });
    if (shot.allowed && (previous.mode === 'HOLD' || previous.goalX === null)) goalX = root.x;
    const currentSide = target.center.x >= root.x ? 1 : -1;
    state.mode = (previous.mode === 'REPOSITION' && previous.committedSide === facingX || facingX !== currentSide) ? 'REPOSITION'
      : Math.abs(goalX! - target.center.x) > Math.abs(root.x - target.center.x) ? 'RETREAT' : 'APPROACH';
  }
  if (goalX === null) return finish(root.x, 'NO_REACHABLE_FIRING_POSITION');
  if (state.goalX !== goalX || state.committedSide !== destination?.facingX) state.lastDecisionAt = input.now;
  state.goalX = goalX;
  if (destination) state.committedSide = destination.facingX;
  const x = moveGroundUnit(root.x, goalX, input.baseSpeed * profile.movement.speedRatio, input.dt);
  const arrived = Math.abs(goalX - x) <= 1e-9;
  state.velocityX = arrived ? 0 : (x - root.x) / Math.max(input.dt, 1e-9);
  state.moveDirectionX = Math.sign(state.velocityX) as -1 | 0 | 1;
  if (!arrived) state.facingX = x > root.x ? 1 : -1;
  else if (destination) state.facingX = destination.facingX;
  const muzzle = groundMuzzlePose({ ...root, x }, profile.muzzle, state.facingX);
  state.shot = policy.evaluateShot({ origin: muzzle, facingX: state.facingX, target });
  state.geometricallyEligible = state.shot.allowed;
  if (arrived && containsX(bounds, x)) state.mode = state.shot.allowed ? 'HOLD' : 'WAIT_FOR_SPACE';
  state.canFire = containsX(bounds, x) && state.shot.allowed && (profile.movement.canFireWhileMoving || state.mode === 'HOLD');
  return finish(x, state.canFire ? null : !containsX(bounds, x) ? 'OUTSIDE_VIEW'
    : !arrived ? 'MOVING' : state.shot.allowed ? null : state.shot.reason);
}
