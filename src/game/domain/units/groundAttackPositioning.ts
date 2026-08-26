import type { FacingInterval, FacingX, GroundPositioningState, XInterval } from './unitCombatTypes';

export function intersectIntervals(a: XInterval, b: XInterval): XInterval | null {
  const minX = Math.max(a.minX, b.minX); const maxX = Math.min(a.maxX, b.maxX);
  return minX <= maxX ? { minX, maxX } : null;
}
export const containsX = (interval: XInterval, x: number): boolean => x >= interval.minX - 1e-9 && x <= interval.maxX + 1e-9;
export const clampX = (x: number, bounds: XInterval): number => Math.min(bounds.maxX, Math.max(bounds.minX, x));

export function deterministicFacing(id: string): FacingX {
  let hash = 0;
  for (const character of id) hash = Math.imul(hash, 31) + character.charCodeAt(0) | 0;
  return (hash & 1) === 0 ? 1 : -1;
}

/** Policy-independent selection. A committed side survives crossing under a target. */
export function selectFiringDestination(id: string, x: number, targetX: number, previous: GroundPositioningState,
  intervals: FacingInterval[], bounds: XInterval, inset: number): { goalX: number; facingX: FacingX } | null {
  const reachable = intervals.flatMap((interval) => {
    const clipped = intersectIntervals(interval, bounds);
    return clipped ? [{ ...clipped, facingX: interval.facingX }] : [];
  });
  if (!reachable.length) return null;
  const committed = reachable.find((interval) => interval.facingX === previous.committedSide);
  if (committed && previous.goalX !== null && containsX(committed, previous.goalX)) {
    return { goalX: previous.goalX, facingX: committed.facingX };
  }
  const preferredSide = previous.mode === 'REPOSITION' && committed ? committed.facingX
    : Math.abs(targetX - x) < 1e-9 ? previous.committedSide ?? deterministicFacing(id) : targetX > x ? 1 : -1;
  reachable.sort((a, b) => Number(b.facingX === preferredSide) - Number(a.facingX === preferredSide)
    || Math.abs(clampX(x, a) - x) - Math.abs(clampX(x, b) - x)
    || a.facingX - b.facingX);
  const chosen = reachable[0];
  const margin = Math.min(inset, (chosen.maxX - chosen.minX) / 2);
  return { goalX: clampX(x, { minX: chosen.minX + margin, maxX: chosen.maxX - margin }), facingX: chosen.facingX };
}

export function moveGroundUnit(x: number, goalX: number, speed: number, dt: number): number {
  const delta = goalX - x;
  return x + Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, speed * dt));
}
