import { z } from 'zod';
import {
  BUILDING_CATALOG,
  FACE_KEYS,
  getBuildingDefinition,
  type BuildingId,
  type FaceKey,
  type Rotation,
  type TextureName,
} from './buildingCatalog';

const rotationSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const faceSchema = z.object({
  id: z.string(),
  texture: z.string().min(1),
  rotationDeg: z.number(),
  offset: z.tuple([z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number()]),
  flipU: z.boolean(),
  flipV: z.boolean(),
});

export const projectSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  displayName: z.string().min(1),
  model: z.object({
    source: z.string().min(1),
    dimensions: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    rotationDeg: rotationSchema,
    importedGlb: z.object({ key: z.string().min(1), fileName: z.string().min(1) }).optional(),
  }),
  faces: z.object({
    front: faceSchema,
    back: faceSchema,
    right: faceSchema,
    left: faceSchema,
    roof: faceSchema,
    bottom: faceSchema,
  }),
});

export type MapperProject = z.infer<typeof projectSchema>;

export function createDefaultProject(buildingId: BuildingId): MapperProject {
  const definition = getBuildingDefinition(buildingId);
  const faces = Object.fromEntries(FACE_KEYS.map((key) => {
    const face = definition.faces[key];
    return [key, {
      id: face.id,
      texture: face.texture,
      rotationDeg: face.uvRotationDeg,
      offset: [0, 0],
      scale: [1, 1],
      flipU: false,
      flipV: false,
    }];
  })) as MapperProject['faces'];

  return {
    schemaVersion: 1,
    id: buildingId,
    displayName: definition.displayName,
    model: {
      source: `models/${buildingId}.glb`,
      dimensions: {
        x: definition.dimensions.width,
        y: definition.dimensions.height,
        z: definition.dimensions.depth,
      },
      rotationDeg: { ...definition.defaultRotation },
    },
    faces,
  };
}

export function parseProjectFile(value: unknown): MapperProject {
  return projectSchema.parse(value);
}

export function faceConfig(project: MapperProject, face: FaceKey) {
  return project.faces[face];
}

export function rotationForProject(project: MapperProject): Rotation {
  return project.model.rotationDeg;
}

export function normaliseDegrees(value: number): number {
  const rounded = Math.round(value) % 360;
  const normalised = rounded > 180 ? rounded - 360 : rounded < -180 ? rounded + 360 : rounded;
  return normalised === 0 ? 0 : normalised;
}

export function snapQuarterTurn(value: number): number {
  return normaliseDegrees(Math.round(value / 90) * 90);
}

export function cloneProject(project: MapperProject): MapperProject {
  return structuredClone(project);
}

export function buildingIdFromProject(project: MapperProject): BuildingId {
  return project.id in BUILDING_CATALOG ? project.id as BuildingId : 'building-001';
}

export function textureName(value: string): TextureName {
  return ['front', 'back', 'right', 'left', 'roof', 'bottom'].includes(value)
    ? value as TextureName
    : 'front';
}
