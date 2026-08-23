import type { BattleMapDefinition } from '../contracts/BattleMapDefinition';

export const DEFAULT_BATTLE_MAP_ID = 'city-day';

export const CITY_DAY_MAP: BattleMapDefinition = {
  id: 'city-day',
  version: 1,
  displayName: 'City Day',
  assetRoot: 'battlescene/maps/city-day',
  backgrounds: {
    sky: 'backgrounds/sky-day-base.webp',
    far: 'backgrounds/city-far-day.webp',
    middle: 'backgrounds/city-middle-day.webp',
    near: 'backgrounds/city-near-day.webp',
    ground: 'backgrounds/ground-road-day.webp',
    foregroundAtmosphere: 'backgrounds/foreground-atmosphere-day.webp',
  },
  sharedMaterials: {
    mothershipHullBaseColor: 'battlescene/shared/mothership/mapping/mothership-hull-basecolor.webp',
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
    far: 0.15,
    middle: 0.35,
    near: 0.6,
    ground: 1,
    foregroundAtmosphere: 0.8,
  },
};

const MAP_CATALOG: Record<string, BattleMapDefinition> = {
  [CITY_DAY_MAP.id]: CITY_DAY_MAP,
};

export function getBattleMapDefinition(mapId: string | undefined): BattleMapDefinition {
  return MAP_CATALOG[mapId ?? DEFAULT_BATTLE_MAP_ID] ?? CITY_DAY_MAP;
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

