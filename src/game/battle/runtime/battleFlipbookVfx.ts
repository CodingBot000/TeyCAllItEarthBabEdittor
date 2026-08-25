import { Color3, Engine, Mesh, StandardMaterial } from '@babylonjs/core';
import type { Texture } from '@babylonjs/core';
import { setMeshAtlasFrame } from './battleAtlasUtils';
import type { BattleVfxMaterialFactory } from './BattleVfxMaterialFactory';

export type VfxBlendMode = 'ALPHA' | 'ADDITIVE';

export interface FlipbookPlaneOptions {
  name: string;
  texture: Texture;
  columns: number;
  rows: number;
  tint?: Color3;
  blendMode?: VfxBlendMode;
}

export function createFlipbookPlane(
  materials: BattleVfxMaterialFactory,
  options: FlipbookPlaneOptions,
): Mesh {
  const plane = materials.createAtlasPlane(
    options.name,
    options.texture,
    options.columns,
    options.rows,
    0,
    1,
    1,
    Mesh.BILLBOARDMODE_ALL,
  );
  const material = plane.material;
  if (material instanceof StandardMaterial) {
    const tint = options.tint ?? Color3.White();
    material.diffuseColor = tint;
    material.emissiveColor = tint.scale(options.blendMode === 'ADDITIVE' ? 0.95 : 0.42);
    material.alphaMode = options.blendMode === 'ADDITIVE' ? Engine.ALPHA_ADD : Engine.ALPHA_COMBINE;
    material.disableDepthWrite = true;
    material.needDepthPrePass = false;
  }
  return plane;
}

export function flipbookFrame(elapsed: number, frameRate: number, frameCount: number, loop: boolean): number {
  const safeCount = Math.max(1, Math.floor(frameCount));
  const frame = Math.max(0, Math.floor(Math.max(0, elapsed) * Math.max(0, frameRate)));
  return loop ? frame % safeCount : Math.min(safeCount - 1, frame);
}

export function setFlipbookFrame(
  mesh: Mesh,
  columns: number,
  rows: number,
  elapsed: number,
  frameRate: number,
  loop = false,
): void {
  setMeshAtlasFrame(mesh, columns, rows, flipbookFrame(elapsed, frameRate, columns * rows, loop));
}

export function disposeFlipbookPlane(mesh: Mesh): void {
  mesh.dispose(false, true);
}
