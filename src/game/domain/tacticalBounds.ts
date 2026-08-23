import { BALANCE } from './balance';
import type { Vec2 } from './types';

export interface TacticalMapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Legacy/provisional compatibility boundary. Phase-one map presentation and the
// replacement battle runtime must not treat this rectangle as a road/Nav graph.
export const TACTICAL_MAP_BOUNDS: TacticalMapBounds = {
  minX: -BALANCE.tacticalMap.playableHalfExtent,
  maxX: BALANCE.tacticalMap.playableHalfExtent,
  minZ: -BALANCE.tacticalMap.playableHalfExtent,
  maxZ: BALANCE.tacticalMap.playableHalfExtent,
};

export function clampTacticalPosition(position: Vec2): Vec2 {
  return {
    x: clamp(position.x, TACTICAL_MAP_BOUNDS.minX, TACTICAL_MAP_BOUNDS.maxX),
    z: clamp(position.z, TACTICAL_MAP_BOUNDS.minZ, TACTICAL_MAP_BOUNDS.maxZ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
