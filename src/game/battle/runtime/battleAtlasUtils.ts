import { StandardMaterial, Texture } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';

export interface AtlasRegion {
  uScale: number;
  vScale: number;
  uOffset: number;
  vOffset: number;
}

export function atlasRegion(columns: number, rows: number, frame: number): AtlasRegion {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const safeFrame = Math.max(0, Math.min(safeColumns * safeRows - 1, Math.floor(frame)));
  return {
    uScale: 1 / safeColumns,
    vScale: 1 / safeRows,
    uOffset: (safeFrame % safeColumns) / safeColumns,
    vOffset: Math.floor(safeFrame / safeColumns) / safeRows,
  };
}

export function setAtlasFrame(texture: Texture, columns: number, rows: number, frame: number): void {
  const region = atlasRegion(columns, rows, frame);
  texture.uScale = region.uScale;
  texture.vScale = region.vScale;
  texture.uOffset = region.uOffset;
  texture.vOffset = region.vOffset;
}

export function setMeshAtlasFrame(mesh: Mesh, columns: number, rows: number, frame: number): void {
  const material = mesh.material;
  if (!(material instanceof StandardMaterial) || !(material.diffuseTexture instanceof Texture)) return;
  setAtlasFrame(material.diffuseTexture, columns, rows, frame);
  if (material.emissiveTexture instanceof Texture && material.emissiveTexture !== material.diffuseTexture) {
    setAtlasFrame(material.emissiveTexture, columns, rows, frame);
  }
}
