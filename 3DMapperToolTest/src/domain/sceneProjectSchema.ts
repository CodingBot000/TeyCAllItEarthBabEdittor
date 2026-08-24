import { z } from 'zod';

const transformSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotationEuler: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
});

export const sceneObjectSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1),
  hierarchyPath: z.string(),
  parentPath: z.string(),
  assetId: z.string().min(1),
  category: z.string().min(1),
  sourcePath: z.string(),
  glbPath: z.string().min(1),
  active: z.boolean(),
  isStatic: z.boolean(),
  layer: z.number().int(),
  tag: z.string(),
  ...transformSchema.shape,
  componentTypes: z.array(z.string()),
});

export const sceneProjectSchema = z.object({
  mapId: z.string().min(1),
  sourceScene: z.string().min(1),
  generatedAtUtc: z.string().min(1),
  totalSceneRoots: z.number().int().nonnegative(),
  exportedObjectCount: z.number().int().nonnegative(),
  skippedObjectCount: z.number().int().nonnegative(),
  skippedObjects: z.array(z.string()),
  objects: z.array(sceneObjectSchema),
});

export type SceneProject = z.infer<typeof sceneProjectSchema>;

export function parseSceneProject(value: unknown): SceneProject {
  return sceneProjectSchema.parse(value);
}
