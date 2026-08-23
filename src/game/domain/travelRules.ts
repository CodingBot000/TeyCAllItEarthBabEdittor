import { BALANCE } from './balance';
import type { CityDefinition, Vec2 } from './types';

export function lonLatToNormalized(longitude: number, latitude: number): Vec2 {
  return { x: (longitude + 180) / 360, z: (90 - latitude) / 180 };
}

export function haversineDistanceKm(a: CityDefinition, b: CityDefinition): number {
  const radius = 6371;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function travelDurationSeconds(a: CityDefinition, b: CityDefinition): number {
  const normalizedDistance = haversineDistanceKm(a, b) / 20000;
  return Math.min(BALANCE.travel.maxSeconds, Math.max(BALANCE.travel.minSeconds, 1.5 + normalizedDistance * 4.5));
}

export function wrappedMapDelta(fromX: number, toX: number): number {
  const raw = toX - fromX;
  if (Math.abs(raw) <= 0.5) return raw;
  return raw > 0 ? raw - 1 : raw + 1;
}
