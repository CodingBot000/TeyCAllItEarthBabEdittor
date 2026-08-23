export interface BattleMapDefinition {
  id: string;
  version: number;
  displayName: string;
  assetRoot: string;
  backgrounds: {
    sky: string;
    far: string;
    middle: string;
    near: string;
    ground: string;
    foregroundAtmosphere?: string;
  };
  sharedMaterials: {
    mothershipHullBaseColor: string;
    mothershipHullHeightSource?: string;
    mothershipEmissiveDecals?: string;
  };
  camera: {
    viewportSpanScreens: number;
    travelScreensFromStart: number;
    fovDegrees: number;
  };
  parallax: {
    sky: number;
    far: number;
    middle: number;
    near: number;
    ground: number;
    foregroundAtmosphere?: number;
  };
}

export type BattleMapAssetKey = keyof BattleMapDefinition['backgrounds'];

const REQUIRED_BACKGROUND_KEYS: BattleMapAssetKey[] = ['sky', 'far', 'middle', 'near', 'ground'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string.`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string, path: string, minimum?: number): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    const suffix = minimum === undefined ? '' : ` greater than or equal to ${minimum}`;
    throw new Error(`${path}.${key} must be a finite number${suffix}.`);
  }
  return value;
}

function parseParallax(value: unknown): BattleMapDefinition['parallax'] {
  if (!isRecord(value)) throw new Error('manifest.parallax must be an object.');
  const result = {
    sky: requireNumber(value, 'sky', 'manifest.parallax'),
    far: requireNumber(value, 'far', 'manifest.parallax'),
    middle: requireNumber(value, 'middle', 'manifest.parallax'),
    near: requireNumber(value, 'near', 'manifest.parallax'),
    ground: requireNumber(value, 'ground', 'manifest.parallax'),
    foregroundAtmosphere: value.foregroundAtmosphere === undefined ? undefined : requireNumber(value, 'foregroundAtmosphere', 'manifest.parallax'),
  };
  if (Object.values(result).some((item) => item !== undefined && (item < 0 || item > 1))) {
    throw new Error('manifest.parallax values must be between 0 and 1.');
  }
  return result;
}

export function parseBattleMapDefinition(value: unknown): BattleMapDefinition {
  if (!isRecord(value)) throw new Error('Battle map manifest must be an object.');
  const backgroundsValue = value.backgrounds;
  if (!isRecord(backgroundsValue)) throw new Error('manifest.backgrounds must be an object.');
  const sharedMaterialsValue = value.sharedMaterials;
  if (!isRecord(sharedMaterialsValue)) throw new Error('manifest.sharedMaterials must be an object.');
  const cameraValue = value.camera;
  if (!isRecord(cameraValue)) throw new Error('manifest.camera must be an object.');

  const backgrounds = {
    sky: requireString(backgroundsValue, 'sky', 'manifest.backgrounds'),
    far: requireString(backgroundsValue, 'far', 'manifest.backgrounds'),
    middle: requireString(backgroundsValue, 'middle', 'manifest.backgrounds'),
    near: requireString(backgroundsValue, 'near', 'manifest.backgrounds'),
    ground: requireString(backgroundsValue, 'ground', 'manifest.backgrounds'),
    foregroundAtmosphere: backgroundsValue.foregroundAtmosphere === undefined ? undefined : requireString(backgroundsValue, 'foregroundAtmosphere', 'manifest.backgrounds'),
  };
  for (const key of REQUIRED_BACKGROUND_KEYS) {
    if (!backgrounds[key]) throw new Error(`manifest.backgrounds.${key} is required.`);
  }

  return {
    id: requireString(value, 'id', 'manifest'),
    version: requireNumber(value, 'version', 'manifest', 1),
    displayName: requireString(value, 'displayName', 'manifest'),
    assetRoot: requireString(value, 'assetRoot', 'manifest'),
    backgrounds,
    sharedMaterials: {
      mothershipHullBaseColor: requireString(sharedMaterialsValue, 'mothershipHullBaseColor', 'manifest.sharedMaterials'),
      mothershipHullHeightSource: sharedMaterialsValue.mothershipHullHeightSource === undefined ? undefined : requireString(sharedMaterialsValue, 'mothershipHullHeightSource', 'manifest.sharedMaterials'),
      mothershipEmissiveDecals: sharedMaterialsValue.mothershipEmissiveDecals === undefined ? undefined : requireString(sharedMaterialsValue, 'mothershipEmissiveDecals', 'manifest.sharedMaterials'),
    },
    camera: {
      viewportSpanScreens: requireNumber(cameraValue, 'viewportSpanScreens', 'manifest.camera', 1),
      travelScreensFromStart: requireNumber(cameraValue, 'travelScreensFromStart', 'manifest.camera', 0),
      fovDegrees: requireNumber(cameraValue, 'fovDegrees', 'manifest.camera', 1),
    },
    parallax: parseParallax(value.parallax),
  };
}

