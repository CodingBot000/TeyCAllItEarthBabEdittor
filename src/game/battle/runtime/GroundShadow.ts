import { Color3, Engine, Mesh, MeshBuilder, Material, StandardMaterial, Texture, TransformNode, type Scene } from '@babylonjs/core';

export const GROUND_SHADOW_TEXTURE_URL = '/assets/runtime/sprites/ground-unit-shadow.svg';
export const GROUND_SHADOW_HEIGHT = 0.58;
export const GROUND_SHADOW_WIDTH_RATIO = 1.08;
export const GROUND_SHADOW_X_OFFSET = 0.3;
export const GROUND_SHADOW_Y_OFFSET = -0.06;
export const GROUND_SHADOW_ACTIVE_VISIBILITY = 0.82;

interface SharedGroundShadowResource {
  texture: Texture;
  material: StandardMaterial;
  references: number;
}

export interface GroundShadowMaterialHandle {
  material: StandardMaterial;
  release: () => void;
}

const resourcesByScene = new WeakMap<Scene, SharedGroundShadowResource>();

export function acquireGroundShadowMaterial(scene: Scene): GroundShadowMaterialHandle {
  let resource = resourcesByScene.get(scene);
  if (!resource) {
    const texture = new Texture(GROUND_SHADOW_TEXTURE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial('battle-ground-unit-shadow', scene);
    material.diffuseColor = new Color3(1, 1, 1);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    material.diffuseTexture = texture;
    resource = { texture, material, references: 0 };
    resourcesByScene.set(scene, resource);
  }
  resource.references += 1;
  let released = false;
  return {
    material: resource.material,
    release: () => {
      if (released) return;
      released = true;
      resource!.references -= 1;
      if (resource!.references > 0) return;
      resource!.material.dispose();
      resource!.texture.dispose();
      resourcesByScene.delete(scene);
    },
  };
}

export function createGroundShadowMesh(name: string, scene: Scene, parent: TransformNode, material: StandardMaterial): Mesh {
  const shadow = MeshBuilder.CreatePlane(name, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
  shadow.parent = parent;
  shadow.billboardMode = Mesh.BILLBOARDMODE_ALL;
  shadow.material = material;
  shadow.renderingGroupId = 3;
  shadow.alphaIndex = 0;
  shadow.isPickable = false;
  shadow.visibility = 0;
  return shadow;
}

export function groundShadowScaleForWidth(width: number): number {
  return Math.max(0, Math.abs(width)) * GROUND_SHADOW_WIDTH_RATIO;
}

export function placeGroundShadow(shadow: Mesh, width: number, bottomLocalY: number): void {
  shadow.position.set(
    GROUND_SHADOW_X_OFFSET,
    bottomLocalY + GROUND_SHADOW_HEIGHT / 2 + GROUND_SHADOW_Y_OFFSET,
    0.08,
  );
  shadow.scaling.set(groundShadowScaleForWidth(width), GROUND_SHADOW_HEIGHT, 1);
}

export function syncGroundShadow(shadow: Mesh, visible: boolean, visibility = GROUND_SHADOW_ACTIVE_VISIBILITY): void {
  shadow.visibility = visible ? visibility : 0;
}
