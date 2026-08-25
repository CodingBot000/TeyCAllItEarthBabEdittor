import { describe, expect, it } from 'vitest';
import { CITY_BY_ID } from '../../data/world';
import { battleMapIdForCity } from './battleSetupRules';

describe('battle background map selection', () => {
  it('uses the London-compatible city-day background for Cairo, Dubai and Paris', () => {
    expect(battleMapIdForCity(CITY_BY_ID.london)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.cairo)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.dubai)).toBe('city-day');
    expect(battleMapIdForCity(CITY_BY_ID.paris)).toBe('city-day');
  });

  it('preserves independent River and Desert backgrounds for other cities', () => {
    expect(battleMapIdForCity(CITY_BY_ID.shanghai)).toBe('river-day');
    expect(battleMapIdForCity(CITY_BY_ID.seoul)).toBe('city-day');
  });
});
