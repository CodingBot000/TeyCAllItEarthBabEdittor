import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { setAtlasFrame } from './battleAtlasUtils';

export class BattleVfxMaterialFactory {
  constructor(private readonly scene: Scene) {}

  create(name: string, diffuse: Color3, emissive = new Color3(0, 0, 0)): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.specularColor = new Color3(0.05, 0.08, 0.1);
    material.disableDepthWrite = true;
    return material;
  }

  createAtlasPlane(
    name: string,
    texture: Texture | null,
    columns: number,
    rows: number,
    frame: number,
    width: number,
    height: number,
    billboardMode = 0,
  ): Mesh {
    const plane = MeshBuilder.CreatePlane(name, { size: 1 }, this.scene);
    plane.scaling = new Vector3(width, height, 1);
    plane.billboardMode = billboardMode;
    plane.isPickable = false;
    plane.renderingGroupId = 3;
    const material = new StandardMaterial(`${name}-material`, this.scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = new Color3(0.24, 0.32, 0.38);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    if (texture) {
      const region = texture.clone();
      region.hasAlpha = texture.hasAlpha;
      setAtlasFrame(region, columns, rows, frame);
      material.diffuseTexture = region;
      material.emissiveTexture = region;
      material.useAlphaFromDiffuseTexture = texture.hasAlpha;
      material.transparencyMode = texture.hasAlpha ? Engine.ALPHA_COMBINE : Engine.ALPHA_DISABLE;
    }
    plane.material = material;
    return plane;
  }
}
