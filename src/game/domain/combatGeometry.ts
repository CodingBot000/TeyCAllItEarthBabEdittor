import { BALANCE } from './balance';
import type { CombatState, Vec3 } from './types';
import type { TargetVolume } from './units/unitCombatTypes';

export const GEOMETRY_EPSILON = 1e-9;
export function mothershipContactVolume(state: Pick<CombatState, 'mothership'>, projectileRadius = 0): TargetVolume {
  const shielded = state.mothership.shield > 0;
  const radius = (shielded ? BALANCE.mothership.shieldHitRadius : BALANCE.mothership.hullHitRadius) + projectileRadius;
  return {
    center: { ...state.mothership.position, y: BALANCE.mothership.baseAltitude },
    radii: { x: radius, y: (shielded ? BALANCE.mothership.shieldHitHalfHeight : BALANCE.mothership.hullHitHalfHeight) + projectileRadius, z: radius },
    kind: shielded ? 'SHIELD' : 'HULL', revision: shielded ? 1 : 0,
  };
}
export function ellipsoidMetric(point: Vec3, volume: TargetVolume): number {
  return (['x', 'y', 'z'] as const).reduce((sum, axis) => sum + ((point[axis] - volume.center[axis]) / volume.radii[axis]) ** 2, 0);
}
/** Distances along a normalized ray (also works with an arbitrary direction). */
export function rayEllipsoidInterval(origin: Vec3, direction: Vec3, volume: TargetVolume): [number, number] | null {
  let a = 0; let b = 0; let c = -1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const p = (origin[axis] - volume.center[axis]) / volume.radii[axis];
    const d = direction[axis] / volume.radii[axis];
    a += d * d; b += 2 * p * d; c += p * p;
  }
  if (a <= 1e-20) return c <= GEOMETRY_EPSILON ? [0, Infinity] : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -GEOMETRY_EPSILON * Math.max(b * b, 4 * a * Math.abs(c), 1e-12)) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  const far = (-b + root) / (2 * a);
  return far < -GEOMETRY_EPSILON ? null : [Math.max(0, (-b - root) / (2 * a)), Math.max(0, far)];
}
export function segmentIntersectsEllipsoid(start: Vec3, end: Vec3, volume: TargetVolume): boolean {
  const interval = rayEllipsoidInterval(start, { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }, volume);
  return interval !== null && interval[0] <= 1 + GEOMETRY_EPSILON;
}
