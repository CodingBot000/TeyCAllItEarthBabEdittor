import type { Vec3 } from '../types';

export type FacingX = -1 | 1;
export interface XInterval { minX: number; maxX: number }
export interface FacingInterval extends XInterval { facingX: FacingX }
export interface TargetVolume { center: Vec3; radii: Vec3; kind: string; revision: number }
export type ShotSolution = { allowed: false; reason: string } | {
  allowed: true;
  aimPoint: Vec3;
  launchDirection: Vec3;
  launchAngleRadians: number;
  targetVolumeRevision: number;
  targetKind: string;
};
export interface AttackQuery { origin: Vec3; facingX: FacingX; target: TargetVolume }
export interface PositionQuery { muzzle: Vec3; rootY: number; rootZ: number; target: TargetVolume }
export interface AttackPolicy {
  evaluateShot(query: AttackQuery): ShotSolution;
  findFiringIntervals(query: PositionQuery): FacingInterval[];
}
export interface ElevationSector {
  minAngleRadians: number;
  maxAngleRadians: number;
  minRange?: number;
  maxRange?: number;
}
export type PositioningMode = 'APPROACH' | 'RETREAT' | 'REPOSITION' | 'HOLD' | 'WAIT_FOR_SPACE' | 'ENTER_VIEW' | 'DISABLED' | 'NO_TARGET';
export interface GroundPositioningState {
  mode: PositioningMode;
  velocityX: number;
  moveDirectionX: -1 | 0 | 1;
  facingX: FacingX;
  committedSide: FacingX | null;
  goalX: number | null;
  lastDecisionAt: number;
  blockedReason: string | null;
  geometricallyEligible: boolean;
  canFire: boolean;
  shot: ShotSolution;
  muzzle: Vec3 | null;
  visibleBounds: XInterval | null;
  allowedBounds: XInterval | null;
  lastLaunchAngle: number | null;
  lastLaunchPosition: Vec3 | null;
}
export interface UnitCombatProfile {
  movement: { speedRatio: number; canFireWhileMoving: boolean; arrivalInset: number };
  attackShape: ElevationSector;
  muzzle: Vec3;
  boundary: { halfWidth: number; margin: number };
  weapon: { burstCount: number; burstInterval: number };
}
