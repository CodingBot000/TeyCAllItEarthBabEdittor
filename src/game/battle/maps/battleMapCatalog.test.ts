import { describe, expect, it } from 'vitest';
import { CITY_DAY_MAP, CITY_NIGHT_MAP, DESERT_DAY_MAP, getBattleMapDefinition, loadBattleMapDefinition, mapBackgroundUrl, RIVER_DAY_MAP, sharedMaterialUrl } from './battleMapCatalog';
import { parseBattleMapDefinition } from '../contracts/BattleMapDefinition';

describe('battle map catalog', () => {
  it('keeps city-day compatible with the manifest contract', () => {
    expect(parseBattleMapDefinition(CITY_DAY_MAP)).toEqual(CITY_DAY_MAP);
    expect(mapBackgroundUrl(CITY_DAY_MAP, 'near')).toBe('/assets/runtime/battlescene/maps/city-day/backgrounds/city-near-day.webp');
    expect(sharedMaterialUrl(CITY_DAY_MAP, 'mothershipHullBaseColor')).toBe('/assets/runtime/battlescene/shared/mothership/mapping/mothership-hull-disc-basecolor.webp');
  });

  it('resolves the second map through the same manifest contract', () => {
    expect(parseBattleMapDefinition(CITY_NIGHT_MAP)).toEqual(CITY_NIGHT_MAP);
    expect(getBattleMapDefinition('city-night')).toBe(CITY_NIGHT_MAP);
    expect(mapBackgroundUrl(CITY_NIGHT_MAP, 'sky')).toBe('/assets/runtime/battlescene/maps/city-night/backgrounds/sky-night-base.webp');
  });

  it('falls back to the day map for an unknown map', () => {
    expect(getBattleMapDefinition('unknown-map')).toBe(CITY_DAY_MAP);
  });

  it('registers independent River and Desert parallax packages', () => {
    expect(getBattleMapDefinition('river-day')).toBe(RIVER_DAY_MAP);
    expect(getBattleMapDefinition('desert-day')).toBe(DESERT_DAY_MAP);
    expect(RIVER_DAY_MAP.version).toBe(2);
    expect(DESERT_DAY_MAP.version).toBe(2);
    expect(mapBackgroundUrl(RIVER_DAY_MAP, 'ground')).toContain('/river-day/backgrounds/ground-river-day-v2.webp');
    expect(mapBackgroundUrl(DESERT_DAY_MAP, 'far')).toContain('/desert-day/backgrounds/city-far-desert-day-v2.webp');
  });

  it('returns the catalog fallback for an unknown manifest request', async () => {
    expect(await loadBattleMapDefinition('unknown-map')).toBe(CITY_DAY_MAP);
  });
});
