import { GEOMETRY_EPSILON as EPS, rayEllipsoidInterval } from '../combatGeometry';
import type { AttackPolicy, AttackQuery, ElevationSector, FacingInterval, PositionQuery, ShotSolution, TargetVolume } from './unitCombatTypes';

function sectionAtZ(target: TargetVolume, z: number) {
  const k2 = 1 - ((z - target.center.z) / target.radii.z) ** 2;
  if (k2 < -EPS) return null;
  const k = Math.sqrt(Math.max(0, k2));
  return { a: target.radii.x * k, b: target.radii.y * k };
}

const polynomialValue = (p: number[], x: number): number => p.reduceRight((v, c) => v * x + c, 0);
const multiply = (a: number[], b: number[]): number[] => {
  const result = Array(a.length + b.length - 1).fill(0) as number[];
  a.forEach((v, i) => b.forEach((w, j) => { result[i + j] += v * w; }));
  return result;
};

/** Isolate all real roots using derivative roots, including repeated/tangent roots.
 * This is continuous root solving, not an angular or world-position sample grid. */
function realRoots(coefficients: number[]): number[] {
  const scale = Math.max(...coefficients.map(Math.abs));
  if (scale === 0) return [];
  const p = coefficients.map((v) => v / scale);
  while (p.length > 1 && Math.abs(p[p.length - 1]) < 1e-14) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) return [-p[0] / p[1]];
  const bound = 1 + Math.max(...p.slice(0, -1).map((v) => Math.abs(v / p[p.length - 1])));
  const critical = realRoots(p.slice(1).map((v, i) => v * (i + 1))).filter((x) => Math.abs(x) < bound);
  const points = [-bound, ...critical, bound].sort((a, b) => a - b);
  const roots = critical.filter((x) => Math.abs(polynomialValue(p, x)) < 1e-9);
  for (let i = 1; i < points.length; i += 1) {
    let lo = points[i - 1]; let hi = points[i];
    if (polynomialValue(p, lo) * polynomialValue(p, hi) >= 0) continue;
    for (let j = 0; j < 100; j += 1) {
      const mid = (lo + hi) / 2;
      if (polynomialValue(p, lo) * polynomialValue(p, mid) <= 0) hi = mid;
      else lo = mid;
    }
    roots.push((lo + hi) / 2);
  }
  return roots;
}

export function elevationSectorPolicy(shape: ElevationSector): AttackPolicy {
  if (!(shape.minAngleRadians > 0 && shape.maxAngleRadians < Math.PI / 2 && shape.minAngleRadians <= shape.maxAngleRadians)
    || (shape.minRange ?? 0) < 0 || (shape.maxRange ?? Infinity) < (shape.minRange ?? 0)) {
    throw new Error('Invalid elevation sector');
  }
  return {
    evaluateShot: (query) => evaluateSectorShot(query, shape),
    findFiringIntervals: (query) => findSectorFiringIntervals(query, shape),
  };
}

function evaluateSectorShot({ origin, facingX, target }: AttackQuery, shape: ElevationSector): ShotSolution {
  const section = sectionAtZ(target, origin.z);
  if (!section) return { allowed: false, reason: 'NO_TARGET_CROSS_SECTION' };
  const { a, b } = section;
  const dx = facingX * (target.center.x - origin.x);
  const dy = target.center.y - origin.y;
  const minRange = shape.minRange ?? 0; const maxRange = shape.maxRange ?? Infinity;
  const angles = [shape.minAngleRadians, shape.maxAngleRadians];
  const addAngle = (x: number, y: number) => {
    if (x <= 0 || y <= 0) return;
    const angle = Math.atan2(y, x);
    if (angle >= shape.minAngleRadians - EPS && angle <= shape.maxAngleRadians + EPS) {
      angles.push(Math.max(shape.minAngleRadians, Math.min(shape.maxAngleRadians, angle)));
    }
  };
  addAngle(dx, dy);
  if (a > EPS && b > EPS) {
    // Tangency points of the unit circle viewed from the scaled ray origin.
    const px = -dx / a; const py = -dy / b; const q = px * px + py * py;
    if (q >= 1) {
      const t = Math.sqrt(Math.max(0, q - 1));
      for (const sign of [-1, 1]) addAngle(dx + a * (px - sign * py * t) / q, dy + b * (py + sign * px * t) / q);
    }
    // Range boundaries split angular feasibility at circle/ellipse intersections.
    for (const range of [minRange, maxRange]) {
      if (!(range > 0 && Number.isFinite(range))) continue;
      const xx = multiply([dx + a, 0, dx - a], [dx + a, 0, dx - a]);
      const yy = multiply([dy, 2 * b, dy], [dy, 2 * b, dy]);
      const polynomial = xx.map((v, i) => v + yy[i] - range * range * ([1, 0, 2, 0, 1][i]));
      for (const t of realRoots(polynomial)) addAngle(dx + a * (1 - t * t) / (1 + t * t), dy + 2 * b * t / (1 + t * t));
      addAngle(dx - a, dy); // t=infinity
    }
  }
  angles.sort((x, y) => x - y);
  const candidates = [...angles];
  for (let i = 1; i < angles.length; i += 1) candidates.push((angles[i - 1] + angles[i]) / 2);
  // Prefer a central, stable launch direction, without relaxing the legal sector.
  const preferred = (shape.minAngleRadians + shape.maxAngleRadians) / 2;
  candidates.sort((x, y) => Math.abs(x - preferred) - Math.abs(y - preferred));
  for (const angle of candidates) {
    const direction = { x: facingX * Math.cos(angle), y: Math.sin(angle), z: 0 };
    const hit = rayEllipsoidInterval(origin, direction, target);
    if (!hit) continue;
    const near = Math.max(hit[0], minRange, EPS); const far = Math.min(hit[1], maxRange);
    if (near > far + EPS) continue;
    const distance = (near + far) / 2;
    const aimPoint = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z };
    return { allowed: true, aimPoint, launchDirection: direction, launchAngleRadians: angle, targetVolumeRevision: target.revision, targetKind: target.kind };
  }
  return { allowed: false, reason: 'OUTSIDE_ATTACK_SECTOR' };
}

function findSectorFiringIntervals(query: PositionQuery, shape: ElevationSector): FacingInterval[] {
  const { target, muzzle, rootY, rootZ } = query;
  const section = sectionAtZ(target, rootZ + muzzle.z);
  if (!section) return [];
  const { a, b } = section;
  const height = target.center.y - rootY - muzzle.y;
  const minRange = shape.minRange ?? 0; const maxRange = shape.maxRange ?? Infinity;
  const lo = Math.max(EPS, height - b, minRange * Math.sin(shape.minAngleRadians));
  const hi = Math.min(height + b, maxRange * Math.sin(shape.maxAngleRadians));
  if (lo > hi + EPS || hi <= 0) return [];
  const cotMin = 1 / Math.tan(shape.minAngleRadians); const cotMax = 1 / Math.tan(shape.maxAngleRadians);
  // At each height, the ellipse and sector both have a continuous horizontal
  // section. Their difference projects to one interval per facing. Extrema are
  // ellipse supports, range/angle joins, or stationary ellipse/circle supports.
  const heights = [lo, hi];
  for (const cot of [cotMin, cotMax]) {
    const offset = b * b * cot / Math.hypot(a, b * cot);
    heights.push(height - offset, height + offset);
  }
  for (const range of [minRange, maxRange]) {
    if (!(range > 0 && Number.isFinite(range))) continue;
    heights.push(range * Math.sin(shape.minAngleRadians), range * Math.sin(shape.maxAngleRadians));
    const square = [height * height, -2 * height, 1];
    const first = multiply(square, [range * range, 0, -1]).map((v) => a * a * v);
    const second = multiply([0, 0, b * b], [b * b - height * height, 2 * height, -1]);
    heights.push(...realRoots(first.map((v, i) => v - second[i])));
  }
  let min = Infinity; let max = -Infinity;
  for (const h of heights) {
    if (!Number.isFinite(h) || h < lo - EPS || h > hi + EPS) continue;
    const y = Math.max(lo, Math.min(hi, h));
    const extent = b <= EPS ? a : a * Math.sqrt(Math.max(0, 1 - ((y - height) / b) ** 2));
    const horizontalMin = Math.max(y * cotMax, Math.sqrt(Math.max(0, minRange * minRange - y * y)));
    const horizontalMax = Math.min(y * cotMin, Math.sqrt(Math.max(0, maxRange * maxRange - y * y)));
    if (horizontalMin > horizontalMax + EPS) continue;
    min = Math.min(min, -extent - horizontalMax);
    max = Math.max(max, extent - horizontalMin);
  }
  if (min > max) return [];
  return [
    { minX: target.center.x + min - muzzle.x, maxX: target.center.x + max - muzzle.x, facingX: 1 },
    { minX: target.center.x - max + muzzle.x, maxX: target.center.x - min + muzzle.x, facingX: -1 },
  ];
}
