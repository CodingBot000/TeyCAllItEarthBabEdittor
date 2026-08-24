import type { FaceKey } from './buildingCatalog';

export interface SceneTreeNode {
  id: string;
  name: string;
  type: 'group' | 'mesh';
  depth: number;
  parentId?: string;
  face?: FaceKey;
  imported?: boolean;
  assetId?: string;
  instanceId?: string;
  category?: string;
  packageId?: string;
  sourcePath?: string;
  glbPath?: string;
}
