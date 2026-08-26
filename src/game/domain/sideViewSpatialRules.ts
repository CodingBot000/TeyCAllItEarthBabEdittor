import type { Vec3 } from './types';
import type { FacingX, XInterval } from './units/unitCombatTypes';

export const MOTHERSHIP_SIDE_VIEW_MAX_SPEED = 17;
export const SIDE_VIEW_COMBAT_Y_OFFSET = 16.5;
export const GROUND_SAM_ROOT_Y = -16.5;
export const GROUND_UNIT_ROOT_Z = 1.1;
export const GROUND_SAM_ATTACK_SPAWN_LOCAL: Readonly<Vec3> = { x: -0.9, y: 4.6, z: -1 };
export const SIDE_VIEW_FIXED_STEP = 1 / 60;

/** Numeric snapshot made after ship movement and camera tracking, once per tick. */
export interface SideViewSpatialContext {
  worldBounds: XInterval;
  visibleBounds: XInterval;
  groundRootY: number;
  groundRootZ: number;
}
export function combatToWorld(point: Vec3): Vec3 {
  return { x: point.x, y: point.y - SIDE_VIEW_COMBAT_Y_OFFSET, z: point.z };
}
export function worldToCombat(point: Vec3): Vec3 {
  return { x: point.x, y: point.y + SIDE_VIEW_COMBAT_Y_OFFSET, z: point.z };
}
export function groundMuzzlePose(root: Vec3, local: Vec3, facingX: FacingX): Vec3 {
  return { x: root.x + local.x * facingX, y: root.y + local.y, z: root.z + local.z };
}

/** Both RAF and automation use this accumulator; fractional frames are preserved. */
export function createFixedStepper(step: (dt: number) => void): (seconds: number) => void {
  let remainder = 0;
  return (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    remainder += seconds;
    while (remainder + 1e-10 >= SIDE_VIEW_FIXED_STEP) {
      remainder -= SIDE_VIEW_FIXED_STEP;
      step(SIDE_VIEW_FIXED_STEP);
    }
  };
}
