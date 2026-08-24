import type { FaceKey } from './buildingCatalog';

export interface SceneTreeNode {
  id: string;
  name: string;
  type: 'group' | 'mesh';
  depth: number;
  face?: FaceKey;
  imported?: boolean;
}
