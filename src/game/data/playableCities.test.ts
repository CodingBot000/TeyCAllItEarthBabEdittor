import { describe, expect, it } from 'vitest';
import { CITY_BY_ID } from './cities';
import { isPlayableCity, PLAYABLE_CITY_IDS } from './playableCities';

describe('playableCities', () => {
  it('enables only the eight cities with bespoke landmark content', () => {
    expect(PLAYABLE_CITY_IDS).toEqual([
      'seoul',
      'tokyo',
      'new-york',
      'london',
      'shanghai',
      'paris',
      'dubai',
      'cairo',
    ]);
    expect(PLAYABLE_CITY_IDS.every((cityId) => Boolean(CITY_BY_ID[cityId]))).toBe(true);
    expect(isPlayableCity('seoul')).toBe(true);
    expect(isPlayableCity('sydney')).toBe(false);
  });
});
