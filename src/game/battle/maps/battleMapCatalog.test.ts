import { describe, expect, it } from 'vitest';
import { CITY_DAY_MAP, getBattleMapDefinition, mapBackgroundUrl, sharedMaterialUrl } from './battleMapCatalog';
import { parseBattleMapDefinition } from '../contracts/BattleMapDefinition';

describe('battle map catalog', () => {
  it('keeps city-day compatible with the manifest contract', () => {
    expect(parseBattleMapDefinition(CITY_DAY_MAP)).toEqual(CITY_DAY_MAP);
    expect(mapBackgroundUrl(CITY_DAY_MAP, 'near')).toBe('/assets/runtime/battlescene/maps/city-day/backgrounds/city-near-day.webp');
    expect(sharedMaterialUrl(CITY_DAY_MAP, 'mothershipHullBaseColor')).toBe('/assets/runtime/battlescene/shared/mothership/mapping/mothership-hull-basecolor.webp');
  });

  it('falls back to the first map when a map is not catalogued yet', () => {
    expect(getBattleMapDefinition('city-night')).toBe(CITY_DAY_MAP);
  });
});

