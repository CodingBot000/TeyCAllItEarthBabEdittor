export const PLAYABLE_CITY_IDS = [
  'seoul',
  'tokyo',
  'new-york',
  'london',
  'shanghai',
  'paris',
  'dubai',
  'cairo',
] as const;

export type PlayableCityId = (typeof PLAYABLE_CITY_IDS)[number];

const PLAYABLE_CITY_ID_SET: ReadonlySet<string> = new Set(PLAYABLE_CITY_IDS);

export function isPlayableCity(cityId: string): cityId is PlayableCityId {
  return PLAYABLE_CITY_ID_SET.has(cityId);
}
