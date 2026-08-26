import { describe, expect, it } from 'vitest';
import { ellipsoidMetric, segmentIntersectsEllipsoid } from '../combatGeometry';
import { elevationSectorPolicy } from './attackGeometry';
import type { FacingX, TargetVolume } from './unitCombatTypes';

const radians = (degrees: number) => degrees * Math.PI / 180;
const policy = elevationSectorPolicy({ minAngleRadians: radians(20), maxAngleRadians: radians(40) });
const target = (x: number, y: number, rx = 9.7, ry = 2.35, z = 0): TargetVolume => ({ center: { x, y, z }, radii: { x: rx, y: ry, z: rx }, kind: 'TEST', revision: 1 });
const origin = { x: 0, y: 0, z: 0 };

describe('elevation sector geometry', () => {
  it.each([-1, 1] as FacingX[])('includes exact 20/40 degree contacts, facing %s', (facingX) => {
    for (const angle of [20, 40]) {
      const volume = target(facingX * 50 * Math.cos(radians(angle)), 50 * Math.sin(radians(angle)), 0.001, 0.001);
      const shot = policy.evaluateShot({ origin, facingX, target: volume });
      expect(shot.allowed).toBe(true);
      if (!shot.allowed) return;
      expect(ellipsoidMetric(shot.aimPoint, volume)).toBeLessThanOrEqual(1 + 1e-6);
      expect(shot.launchAngleRadians).toBeGreaterThanOrEqual(radians(20));
      expect(shot.launchAngleRadians).toBeLessThanOrEqual(radians(40));
      expect(Math.sign(shot.launchDirection.x)).toBe(facingX);
    }
  });
  it.each([19.9, 40.1])('rejects the entire volume outside the sector at %s degrees', (angle) => {
    const volume = target(50 * Math.cos(radians(angle)), 50 * Math.sin(radians(angle)), 0.001, 0.001);
    expect(policy.evaluateShot({ origin, facingX: 1, target: volume }).allowed).toBe(false);
  });
  it('aims at the intersecting edge when the center is outside, even for a very narrow tangent overlap', () => {
    for (const offset of [0, 1e-7]) {
      const angle = radians(40) + Math.asin(1 / 50) - offset;
      const volume = target(50 * Math.cos(angle), 50 * Math.sin(angle), 1, 1);
      const shot = policy.evaluateShot({ origin, facingX: 1, target: volume });
      expect(shot.allowed).toBe(true);
      if (!shot.allowed) return;
      expect(ellipsoidMetric(shot.aimPoint, volume)).toBeLessThanOrEqual(1 + 1e-7);
      expect(shot.launchAngleRadians).toBeLessThanOrEqual(radians(40));
    }
  });
  it.each([[0, 33], [-50, 28], [50, -10]])('rejects overhead, behind and below targets (%s, %s)', (x, y) => {
    expect(policy.evaluateShot({ origin, facingX: 1, target: target(x, y) }).allowed).toBe(false);
  });
  it('uses the actual Z slice, not the projected silhouette', () => {
    const volume = target(40, 30, 10, 3, 11);
    expect(policy.evaluateShot({ origin, facingX: 1, target: volume })).toEqual({ allowed: false, reason: 'NO_TARGET_CROSS_SECTION' });
    expect(policy.findFiringIntervals({ target: volume, rootY: 0, rootZ: 0, muzzle: origin })).toEqual([]);
  });
  it('includes a tangent Z plane with a single valid target point', () => {
    const volume = target(50, 28, 10, 3, 10);
    expect(policy.evaluateShot({ origin, facingX: 1, target: volume }).allowed).toBe(true);
  });
  it.each([
    { minRange: 0, maxRange: Infinity }, { minRange: 35, maxRange: 55 },
    { minRange: 45, maxRange: 45 }, { minRange: 1, maxRange: 12 },
  ])('returns legal interval endpoints and interior points for ranges %j', (range) => {
    const attack = elevationSectorPolicy({ minAngleRadians: radians(20), maxAngleRadians: radians(40), ...range });
    for (const height of [28.4, 2, -1]) {
      const volume = target(7, height, 10.9, 3.1);
      const intervals = attack.findFiringIntervals({ target: volume, rootY: 0, rootZ: 0, muzzle: { x: -0.9, y: 0, z: 0 } });
      for (const interval of intervals) {
        for (const t of [0, 0.2, 0.5, 0.8, 1]) {
          const x = interval.minX + (interval.maxX - interval.minX) * t + interval.facingX * -0.9;
          const shot = attack.evaluateShot({ origin: { x, y: 0, z: 0 }, facingX: interval.facingX, target: volume });
          expect(shot.allowed, JSON.stringify({ range, height, interval, x })).toBe(true);
          if (!shot.allowed) continue;
          const distance = Math.hypot(shot.aimPoint.x - x, shot.aimPoint.y);
          expect(distance).toBeGreaterThanOrEqual(range.minRange - 1e-7);
          expect(distance).toBeLessThanOrEqual(range.maxRange + 1e-7);
        }
      }
    }
  });
  it('matches analytical support intervals, including mirrored muzzle offsets', () => {
    const volume = target(0, 28.4, 10.9, 3.1);
    const intervals = policy.findFiringIntervals({ target: volume, rootY: 0, rootZ: 0, muzzle: { x: -0.9, y: 0, z: 0 } });
    const cot = 1 / Math.tan(radians(20));
    expect(intervals[0].minX).toBeCloseTo(-28.4 * cot - Math.hypot(10.9, 3.1 * cot) + 0.9, 8);
    expect(intervals[0].minX).toBeCloseTo(-intervals[1].maxX, 8);
  });
  it('detects a swept hit through a small volume without endpoint overlap', () => {
    const volume = target(0, 33);
    expect(segmentIntersectsEllipsoid({ x: -20, y: 33, z: 0 }, { x: 20, y: 33, z: 0 }, volume)).toBe(true);
    expect(segmentIntersectsEllipsoid({ x: -20, y: 40, z: 0 }, { x: 20, y: 40, z: 0 }, volume)).toBe(false);
  });
});
