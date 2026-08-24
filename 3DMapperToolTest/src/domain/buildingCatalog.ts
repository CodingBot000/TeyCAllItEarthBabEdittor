export const FACE_KEYS = ['front', 'back', 'right', 'left', 'roof', 'bottom'] as const;
export type FaceKey = (typeof FACE_KEYS)[number];
export type BuildingId = 'building-001' | 'building-002' | 'building-003' | 'building-004';

export const TEXTURE_OPTIONS = ['front', 'back', 'right', 'left', 'roof', 'bottom'] as const;
export type TextureName = (typeof TEXTURE_OPTIONS)[number];

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface BuildingFaceDefinition {
  id: string;
  texture: TextureName;
  uvRotationDeg: number;
}

export interface BuildingDefinition {
  id: BuildingId;
  displayName: string;
  dimensions: Dimensions;
  defaultRotation: Rotation;
  faces: Record<FaceKey, BuildingFaceDefinition>;
}

export interface Rotation {
  x: number;
  y: number;
  z: number;
}

const COMMON_FACES: Record<FaceKey, BuildingFaceDefinition> = {
  front: { id: 'F-01', texture: 'front', uvRotationDeg: 0 },
  back: { id: 'B-02', texture: 'back', uvRotationDeg: 0 },
  right: { id: 'R-03', texture: 'right', uvRotationDeg: 0 },
  left: { id: 'L-04', texture: 'left', uvRotationDeg: -90 },
  roof: { id: 'T-05', texture: 'roof', uvRotationDeg: 0 },
  bottom: { id: 'D-06', texture: 'bottom', uvRotationDeg: 0 },
};

export const BUILDING_CATALOG = {
  'building-001': {
    id: 'building-001',
    displayName: 'Brown Mid-rise Texture Test',
    dimensions: { width: 6, height: 11, depth: 5 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    faces: COMMON_FACES,
  },
  'building-002': {
    id: 'building-002',
    displayName: 'Foreground Light Office Tower',
    dimensions: { width: 6, height: 12, depth: 5 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    faces: COMMON_FACES,
  },
  'building-003': {
    id: 'building-003',
    displayName: 'Warm Brown Balcony Mid-rise',
    dimensions: { width: 8, height: 8, depth: 5 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    faces: COMMON_FACES,
  },
  'building-004': {
    id: 'building-004',
    displayName: 'White and Brown Stepped Apartments',
    dimensions: { width: 8, height: 9, depth: 6 },
    defaultRotation: { x: 0, y: 0, z: 0 },
    faces: COMMON_FACES,
  },
} satisfies Record<BuildingId, BuildingDefinition>;

export function getBuildingDefinition(id: string): BuildingDefinition {
  return BUILDING_CATALOG[id as BuildingId] ?? BUILDING_CATALOG['building-001'];
}

export function getTexturePath(buildingId: BuildingId, texture: string): string {
  if (texture.startsWith('data:') || texture.startsWith('blob:') || texture.startsWith('/') || texture.startsWith('http')) {
    return texture;
  }
  return `/assets/buildings/${buildingId}/${texture}.webp`;
}
