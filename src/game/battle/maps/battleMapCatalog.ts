import { parseBattleMapDefinition, type BattleMapDefinition } from '../contracts/BattleMapDefinition';

export const DEFAULT_BATTLE_MAP_ID = 'city-day';

export const CITY_DAY_MAP: BattleMapDefinition = {
  id: 'city-day',
  version: 1,
  displayName: 'City Day',
  assetRoot: 'battlescene/maps/city-day',
  backgrounds: {
    sky: 'backgrounds/sky-day-base.webp',
    clouds: 'backgrounds/clouds-day.webp',
    far: 'backgrounds/city-far-day.webp',
    middle: 'backgrounds/city-middle-day.webp',
    near: 'backgrounds/city-near-day.webp',
    ground: 'backgrounds/ground-road-day.webp',
    foregroundAtmosphere: 'backgrounds/foreground-atmosphere-day.webp',
  },
  sharedMaterials: {
    mothershipHullBaseColor: 'battlescene/shared/mothership/mapping/mothership-hull-disc-basecolor.webp',
    mothershipHullHeightSource: 'battlescene/shared/mothership/mapping/mothership-hull-height-source.webp',
    mothershipEmissiveDecals: 'battlescene/shared/mothership/mapping/mothership-emissive-decals.webp',
  },
  camera: {
    viewportSpanScreens: 3,
    travelScreensFromStart: 1,
    fovDegrees: 35,
  },
  parallax: {
    sky: 0,
    clouds: 0,
    far: 0.15,
    middle: 0.35,
    near: 0.6,
    ground: 1,
    foregroundAtmosphere: 0.8,
  },
};

export const CITY_NIGHT_MAP: BattleMapDefinition = {
  ...CITY_DAY_MAP,
  id: 'city-night',
  displayName: 'City Night',
  assetRoot: 'battlescene/maps/city-night',
  backgrounds: {
    sky: 'backgrounds/sky-night-base.webp',
    clouds: 'backgrounds/clouds-night.webp',
    far: 'backgrounds/city-far-night.webp',
    middle: 'backgrounds/city-middle-night.webp',
    near: 'backgrounds/city-near-night.webp',
    ground: 'backgrounds/ground-road-night.webp',
    foregroundAtmosphere: 'backgrounds/foreground-atmosphere-night.webp',
  },
};

export const RIVER_DAY_MAP: BattleMapDefinition = {
  ...CITY_DAY_MAP,
  id: 'river-day',
  version: 2,
  displayName: 'River Metropolis',
  assetRoot: 'battlescene/maps/river-day',
  backgrounds: {
    sky: 'backgrounds/sky-river-day-base.webp',
    clouds: 'backgrounds/clouds-river-day.webp',
    far: 'backgrounds/city-far-river-day-v2.webp',
    middle: 'backgrounds/city-middle-river-day-v2.webp',
    near: 'backgrounds/city-near-river-day-v2.webp',
    ground: 'backgrounds/ground-river-day-v2.webp',
    foregroundAtmosphere: 'backgrounds/foreground-atmosphere-river-day.webp',
  },
};

export const DESERT_DAY_MAP: BattleMapDefinition = {
  ...CITY_DAY_MAP,
  id: 'desert-day',
  version: 2,
  displayName: 'Desert Tech Hub',
  assetRoot: 'battlescene/maps/desert-day',
  backgrounds: {
    sky: 'backgrounds/sky-desert-day-base.webp',
    clouds: 'backgrounds/clouds-desert-day.webp',
    far: 'backgrounds/city-far-desert-day-v2.webp',
    middle: 'backgrounds/city-middle-desert-day-v2.webp',
    near: 'backgrounds/city-near-desert-day-v2.webp',
    ground: 'backgrounds/ground-desert-day-v2.webp',
    foregroundAtmosphere: 'backgrounds/foreground-atmosphere-desert-day.webp',
  },
};

const MAP_CATALOG: Record<string, BattleMapDefinition> = {
  [CITY_DAY_MAP.id]: CITY_DAY_MAP,
  [CITY_NIGHT_MAP.id]: CITY_NIGHT_MAP,
  [RIVER_DAY_MAP.id]: RIVER_DAY_MAP,
  [DESERT_DAY_MAP.id]: DESERT_DAY_MAP,
};
const manifestRequests = new Map<string, Promise<BattleMapDefinition>>();

export const BATTLE_MAPS = Object.values(MAP_CATALOG);

export function getBattleMapDefinition(mapId: string | undefined): BattleMapDefinition {
  return MAP_CATALOG[mapId ?? DEFAULT_BATTLE_MAP_ID] ?? CITY_DAY_MAP;
}

/** Load a selected map package without duplicating the common Babylon scene. */
export function loadBattleMapDefinition(mapId: string | undefined): Promise<BattleMapDefinition> {
  const fallback = getBattleMapDefinition(mapId);
  const cached = manifestRequests.get(fallback.id);
  if (cached) return cached;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve(fallback);
  const request = fetch(battleMapAssetUrl(`${fallback.assetRoot}/map.manifest.json`))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Battle map manifest request failed (${response.status}).`);
      const parsed = parseBattleMapDefinition(await response.json());
      if (parsed.id !== fallback.id) throw new Error(`Battle map manifest ID mismatch: expected ${fallback.id}, received ${parsed.id}.`);
      return parsed;
    })
    .catch((error: unknown) => {
      console.warn('Battle map manifest could not be loaded; using the catalog fallback.', error);
      return fallback;
    });
  manifestRequests.set(fallback.id, request);
  return request;
}

export function battleMapAssetUrl(path: string): string {
  return `/assets/runtime/${path.replace(/^\/+/, '')}`;
}

export function mapBackgroundUrl(map: BattleMapDefinition, key: keyof BattleMapDefinition['backgrounds']): string | null {
  const relativePath = map.backgrounds[key];
  return relativePath ? battleMapAssetUrl(`${map.assetRoot}/${relativePath}`) : null;
}

export function sharedMaterialUrl(map: BattleMapDefinition, key: keyof BattleMapDefinition['sharedMaterials']): string | null {
  const relativePath = map.sharedMaterials[key];
  return relativePath ? battleMapAssetUrl(relativePath) : null;
}
