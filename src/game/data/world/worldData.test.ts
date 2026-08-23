import { describe, expect, it } from 'vitest';
import { CITIES, COUNTRIES, COUNTRY_GEOMETRY_BY_ID, WORLD_DATA_VERSION, WORLD_REGIONS } from '.';

describe('generated world data', () => {
  it('contains the fixed region, country and curated city scope', () => {
    expect(WORLD_DATA_VERSION).toMatch(/^2026-08-19/);
    expect(WORLD_REGIONS).toHaveLength(8);
    expect(COUNTRIES).toHaveLength(50);
    expect(CITIES.length).toBeGreaterThanOrEqual(240);
    expect(CITIES.length).toBeLessThanOrEqual(280);
    expect(new Set(COUNTRIES.map((country) => country.id)).size).toBe(50);
    expect(new Set(CITIES.map((city) => city.geonameId)).size).toBe(CITIES.length);
  });

  it('preserves legacy city IDs and source-derived coordinates', () => {
    for (const legacyId of ['seoul', 'tokyo', 'shanghai', 'singapore', 'dubai', 'paris', 'new-york', 'los-angeles']) {
      expect(CITIES.some((city) => city.id === legacyId)).toBe(true);
    }
    for (const city of CITIES) {
      expect(city.latitude).toBeGreaterThanOrEqual(-90);
      expect(city.latitude).toBeLessThanOrEqual(90);
      expect(city.longitude).toBeGreaterThanOrEqual(-180);
      expect(city.longitude).toBeLessThanOrEqual(180);
      expect(city.source.geonameId).toBe(city.geonameId);
      expect([1, 2, 3]).toContain(city.mapTier);
    }
  });

  it('provides geometry and a Tier 1 city for every country', () => {
    for (const country of COUNTRIES) {
      expect(COUNTRY_GEOMETRY_BY_ID[country.id]?.path.length).toBeGreaterThan(4);
      expect(CITIES.some((city) => city.countryId === country.id && city.mapTier === 1)).toBe(true);
    }
  });
});
