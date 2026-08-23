import { describe, expect, it } from 'vitest';
import { CITY_DAY_MAP, CITY_NIGHT_MAP, getBattleMapDefinition, loadBattleMapDefinition, mapBackgroundUrl, sharedMaterialUrl } from './battleMapCatalog';
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

  it('returns the catalog fallback for an unknown manifest request', async () => {
    expect(await loadBattleMapDefinition('unknown-map')).toBe(CITY_DAY_MAP);
  });
});
