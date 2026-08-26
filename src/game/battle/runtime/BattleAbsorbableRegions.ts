import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import type { AbsorbableKind, CombatState } from '../../domain/types';
import { isShelterOrganicTarget } from '../../domain/shelterRules';
import { GROUND_ENTITY_ROOT_Y, GROUND_SAM_BODY_HEIGHT, GROUND_SAM_BODY_LOCAL_Y } from './battleVisualCoordinates';
import { isFleeingCrowdTarget } from './BattleFleeingCrowdVisuals';
import { acquireGroundShadowMaterial, createGroundShadowMesh, placeGroundShadow, syncGroundShadow, type GroundShadowMaterialHandle } from './GroundShadow';

interface RegionVisual {
  root: TransformNode;
  pad: Mesh;
  core: Mesh;
  beacon: Mesh;
  sprite: Mesh;
  shadow: Mesh;
  spriteTexture: Texture;
  spriteBaseScaleX: number;
  spriteBaseScaleY: number;
  crowdOverlay?: Mesh;
  labelPanel: Rectangle;
  baseScaleX: number;
}

const COLOR_BY_KIND: Record<AbsorbableKind, Color3> = {
  ORGANIC: new Color3(0.25, 0.95, 0.66),
  VEHICLE: new Color3(0.98, 0.68, 0.25),
  MACHINERY: new Color3(0.78, 0.64, 0.95),
  POWER: new Color3(0.4, 0.8, 1),
  DATA: new Color3(0.35, 0.95, 1),
  RELIC: new Color3(1, 0.46, 0.74),
};

const SPRITE_URL_BY_KIND: Record<AbsorbableKind, string> = {
  ORGANIC: '/assets/runtime/sprites/target-organic-shelter-intact-y0-web.webp',
  VEHICLE: '/assets/runtime/sprites/ground-sam-mobile-side-elevated.png',
  MACHINERY: '/assets/runtime/sprites/target-machinery-fabrication-line-y0-web.png',
  POWER: '/assets/runtime/sprites/target-power-grid-battery-cache-y0-web.png',
  DATA: '/assets/runtime/sprites/target-data-radar-archive-core-y0-web.png',
  RELIC: '/assets/runtime/sprites/target-relic-airbase-prototype-y0-web.png',
};

const ORGANIC_SHELTER_DAMAGED_URL = '/assets/runtime/sprites/target-organic-shelter-damaged-y0-web.webp';
const ORGANIC_SHELTER_CROWD_OVERLAY_URL = '/assets/runtime/sprites/target-organic-shelter-crowd-overlay-y0-web.webp';

const LABEL_BY_KIND: Record<AbsorbableKind, string> = {
  ORGANIC: '시민 주거',
  VEHICLE: '군용 차량',
  MACHINERY: '생산 설비',
  POWER: '전력 저장고',
  DATA: '레이더 데이터',
  RELIC: '공군기지 유물',
};

// All cleaned sprites are staged with their visible bottom at y=224 in the
// 256px canvas, so they share one world-space ground anchor.
const SPRITE_GROUND_ANCHOR_BY_KIND: Record<AbsorbableKind, number> = {
  ORGANIC: 0.5,
  VEHICLE: 0.375,
  MACHINERY: 0.5,
  POWER: 0.375,
  DATA: 0.375,
  RELIC: 0.375,
};

const ORGANIC_SHELTER_ASPECT = 1393 / 809;
const ORGANIC_SHELTER_CROWD_ASPECT = 972 / 334;
const ORGANIC_SHELTER_CROWD_WIDTH_RATIO = 972 / 1393;
const ORGANIC_SHELTER_CROWD_FLOOR_OFFSET_RATIO = 0.06;
const MACHINERY_SPRITE_ASPECT = 460 / 259;
const SPRITE_GROUND_Y = GROUND_ENTITY_ROOT_Y + GROUND_SAM_BODY_LOCAL_Y - GROUND_SAM_BODY_HEIGHT * 0.375;

export class BattleAbsorbableRegions {
  private readonly root: TransformNode;
  private readonly visuals = new Map<string, RegionVisual>();
  private readonly materials = new Map<AbsorbableKind, StandardMaterial>();
  private readonly hiddenMaterial: StandardMaterial;
  private readonly lockedMaterial: StandardMaterial;
  private readonly depletedMaterial: StandardMaterial;
  private readonly spriteTextures = new Map<AbsorbableKind, Texture>();
  private readonly spriteMaterials = new Map<AbsorbableKind, StandardMaterial>();
  private readonly organicShelterDamagedTexture: Texture;
  private readonly organicShelterDamagedMaterial: StandardMaterial;
  private readonly organicShelterCrowdTexture: Texture;
  private readonly organicShelterCrowdMaterial: StandardMaterial;
  private readonly labelUi: AdvancedDynamicTexture;
  private readonly groundShadowMaterial: GroundShadowMaterialHandle;

  constructor(private readonly scene: Scene, private readonly language: 'ko' | 'en' = 'ko') {
    this.root = new TransformNode('BattleAbsorbableRegionsRoot', scene);
    this.labelUi = AdvancedDynamicTexture.CreateFullscreenUI('BattleAbsorbableLabelsUi', true, scene);
    this.groundShadowMaterial = acquireGroundShadowMaterial(scene);
    this.hiddenMaterial = this.material('battle-region-hidden', new Color3(0.2, 0.42, 0.45), 0.2);
    this.lockedMaterial = this.material('battle-region-locked', new Color3(1, 0.34, 0.2), 0.52);
    this.depletedMaterial = this.material('battle-region-depleted', new Color3(0.2, 0.25, 0.27), 0.16);
    for (const [kind, color] of Object.entries(COLOR_BY_KIND) as Array<[AbsorbableKind, Color3]>) {
      this.materials.set(kind, this.material(`battle-region-${kind.toLowerCase()}`, color, 0.56));
      const texture = new Texture(SPRITE_URL_BY_KIND[kind], scene, true, true, Texture.NEAREST_SAMPLINGMODE);
      texture.hasAlpha = true;
      texture.wrapU = Texture.CLAMP_ADDRESSMODE;
      texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      this.spriteTextures.set(kind, texture);
      const spriteMaterial = new StandardMaterial(`battle-region-sprite-${kind.toLowerCase()}`, scene);
      spriteMaterial.diffuseColor = Color3.White();
      spriteMaterial.emissiveColor = Color3.White();
      spriteMaterial.disableLighting = true;
      spriteMaterial.backFaceCulling = false;
      spriteMaterial.useAlphaFromDiffuseTexture = true;
      spriteMaterial.transparencyMode = Engine.ALPHA_COMBINE;
      spriteMaterial.diffuseTexture = texture;
      spriteMaterial.emissiveTexture = texture;
      this.spriteMaterials.set(kind, spriteMaterial);
    }
    this.organicShelterDamagedTexture = this.texture(ORGANIC_SHELTER_DAMAGED_URL);
    this.organicShelterDamagedMaterial = this.spriteMaterial('battle-region-shelter-damaged', this.organicShelterDamagedTexture);
    this.organicShelterCrowdTexture = this.texture(ORGANIC_SHELTER_CROWD_OVERLAY_URL);
    this.organicShelterCrowdMaterial = this.spriteMaterial('battle-region-shelter-crowd-overlay', this.organicShelterCrowdTexture);
  }

  sync(state: Readonly<CombatState>): void {
    const activeIds = new Set<string>();
    for (const target of state.absorbableTargets) {
      activeIds.add(target.id);
      const visual = this.visuals.get(target.id) ?? this.createVisual(target.id, target.center.x, target.radius, target.kind);
      const shelterOrganic = isShelterOrganicTarget(target);
      const remainingRatio = target.remainingAmount / Math.max(1, target.initialAmount);
      const nearShip = Math.abs(target.center.x - state.mothership.position.x) <= target.radius + 3;
      const active = state.activeBeamTargetId === target.id;
      const isCrowd = isFleeingCrowdTarget(target.id);
      visual.root.position.x = target.center.x;
      visual.sprite.position.x = target.center.x;
      visual.pad.scaling.x = visual.baseScaleX * Math.max(0.18, remainingRatio);
      visual.pad.scaling.y = 1;
      visual.core.scaling.setAll(nearShip ? 1.15 : 0.88);
      visual.beacon.scaling.y = target.discovered ? 1.5 : 0.62;
      visual.beacon.visibility = target.remainingAmount <= 0 ? 0 : target.discovered ? 0.62 : 0.16;
      const spriteScaleX = target.kind === 'VEHICLE'
        ? facingScaleX(visual.spriteBaseScaleX, target.center.x, state.mothership.position.x)
        : visual.spriteBaseScaleX;
      visual.sprite.scaling.set(spriteScaleX, visual.spriteBaseScaleY, 1);
      visual.sprite.position.y = SPRITE_GROUND_Y + visual.spriteBaseScaleY * SPRITE_GROUND_ANCHOR_BY_KIND[target.kind];
      placeGroundShadow(visual.shadow, visual.spriteBaseScaleX, visual.sprite.position.y - visual.spriteBaseScaleY / 2 - GROUND_ENTITY_ROOT_Y);
      visual.sprite.material = shelterOrganic && target.shelterBreachState === 'DESTROYED'
        ? this.organicShelterDamagedMaterial
        : this.spriteMaterials.get(target.kind)!;
      const spriteVisibility = isCrowd ? 0 : target.discovered
        ? target.remainingAmount <= 0 ? 0 : active ? 1 : nearShip ? 0.9 : 0.68
        : 0.08;
      visual.sprite.visibility = visual.spriteTexture.isReady() ? spriteVisibility : 0;
      syncGroundShadow(visual.shadow, !isCrowd && visual.spriteTexture.isReady() && spriteVisibility > 0, spriteVisibility * 0.82);
      if (visual.crowdOverlay) {
        const crowdWidth = visual.spriteBaseScaleX * ORGANIC_SHELTER_CROWD_WIDTH_RATIO;
        const crowdHeight = crowdWidth / ORGANIC_SHELTER_CROWD_ASPECT;
        visual.crowdOverlay.scaling.set(crowdWidth, crowdHeight, 1);
        visual.crowdOverlay.position.x = target.center.x;
        visual.crowdOverlay.position.y = SPRITE_GROUND_Y
          + visual.spriteBaseScaleY * ORGANIC_SHELTER_CROWD_FLOOR_OFFSET_RATIO
          + crowdHeight * 0.5;
        visual.crowdOverlay.visibility = shelterOrganic && target.discovered && target.remainingAmount > 0
          ? target.shelterBreachState === 'DESTROYED' ? active ? 1 : nearShip ? 0.9 : 0.68 : 0.92
          : 0;
      }
      visual.labelPanel.isVisible = !isCrowd && target.discovered && target.remainingAmount > 0 && visual.spriteTexture.isReady();
      const material = target.remainingAmount <= 0
        ? this.depletedMaterial
        : !target.discovered
          ? this.hiddenMaterial
          : target.status === 'LOCKED'
            ? this.lockedMaterial
            : this.materials.get(target.kind)!;
      visual.pad.material = material;
      visual.core.material = material;
      visual.pad.visibility = 0;
      visual.core.visibility = 0;
    }
    for (const [id, visual] of this.visuals) {
      if (activeIds.has(id)) continue;
      visual.labelPanel.dispose();
      visual.sprite.dispose(false, true);
      visual.shadow.dispose();
      visual.crowdOverlay?.dispose(false, true);
      visual.root.dispose(false, true);
      this.visuals.delete(id);
    }
  }

  dispose(): void {
    this.visuals.forEach((visual) => {
      visual.labelPanel.dispose();
      visual.sprite.dispose(false, true);
      visual.shadow.dispose();
      visual.crowdOverlay?.dispose(false, true);
      visual.root.dispose(false, true);
    });
    this.visuals.clear();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.spriteMaterials.forEach((material) => material.dispose());
    this.spriteMaterials.clear();
    this.spriteTextures.forEach((texture) => texture.dispose());
    this.spriteTextures.clear();
    this.groundShadowMaterial.release();
    this.organicShelterDamagedMaterial.dispose();
    this.organicShelterDamagedTexture.dispose();
    this.organicShelterCrowdMaterial.dispose();
    this.organicShelterCrowdTexture.dispose();
    this.labelUi.dispose();
    this.hiddenMaterial.dispose();
    this.lockedMaterial.dispose();
    this.depletedMaterial.dispose();
    this.root.dispose();
  }

  private createVisual(id: string, x: number, radius: number, kind: AbsorbableKind): RegionVisual {
    const root = new TransformNode(`battle-region-${id}`, this.scene);
    root.parent = this.root;
    root.position = new Vector3(x, GROUND_ENTITY_ROOT_Y, 1.3);
    const pad = MeshBuilder.CreateDisc(`${root.name}-pad`, { radius: 1, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    pad.parent = root;
    pad.scaling.set(radius, Math.max(1.2, radius * 0.24), 1);
    pad.renderingGroupId = 3;
    pad.isPickable = false;
    const core = MeshBuilder.CreateDisc(`${root.name}-core`, { radius: 0.62, tessellation: 36, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    core.parent = root;
    core.position.z = -0.03;
    core.scaling.set(2.2, 0.58, 1);
    core.renderingGroupId = 3;
    core.isPickable = false;
    const beacon = MeshBuilder.CreatePlane(`${root.name}-beacon`, { width: 0.16, height: 4.8, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    beacon.parent = root;
    beacon.position.y = 2.4;
    beacon.material = this.hiddenMaterial;
    beacon.renderingGroupId = 3;
    beacon.isPickable = false;
    const spriteTexture = this.spriteTextures.get(kind)!;
    const sprite = MeshBuilder.CreatePlane(`${root.name}-sprite`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sprite.position.x = x;
    sprite.position.z = root.position.z - 0.34;
    sprite.material = this.spriteMaterials.get(kind)!;
    sprite.renderingGroupId = 3;
    sprite.isPickable = false;
    const { width: spriteBaseScaleX, height: spriteBaseScaleY } = spriteDimensionsForKind(kind, radius);
    sprite.scaling.set(spriteBaseScaleX, spriteBaseScaleY, 1);
    sprite.position.y = SPRITE_GROUND_Y + spriteBaseScaleY * SPRITE_GROUND_ANCHOR_BY_KIND[kind];
    const shadow = createGroundShadowMesh(`${root.name}-shadow`, this.scene, root, this.groundShadowMaterial.material);
    shadow.position.z = 0.08;
    const crowdOverlay = isShelterOrganicTarget({ id, kind })
      ? MeshBuilder.CreatePlane(`${root.name}-crowd-overlay`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene)
      : undefined;
    if (crowdOverlay) {
      crowdOverlay.billboardMode = Mesh.BILLBOARDMODE_ALL;
      crowdOverlay.position.z = sprite.position.z - 0.02;
      crowdOverlay.renderingGroupId = 3;
      crowdOverlay.alphaIndex = 1;
      crowdOverlay.isPickable = false;
      crowdOverlay.material = this.organicShelterCrowdMaterial;
      crowdOverlay.scaling.set(spriteBaseScaleX * ORGANIC_SHELTER_CROWD_WIDTH_RATIO, spriteBaseScaleX * ORGANIC_SHELTER_CROWD_WIDTH_RATIO / ORGANIC_SHELTER_CROWD_ASPECT, 1);
      crowdOverlay.position.y = SPRITE_GROUND_Y
        + spriteBaseScaleY * ORGANIC_SHELTER_CROWD_FLOOR_OFFSET_RATIO
        + crowdOverlay.scaling.y * 0.5;
      crowdOverlay.visibility = 0;
    }
    const labelPanel = new Rectangle(`${root.name}-label`);
    labelPanel.width = '112px';
    labelPanel.height = '26px';
    labelPanel.cornerRadius = 4;
    labelPanel.thickness = 1;
    labelPanel.color = '#ffffff';
    labelPanel.background = '#000000';
    labelPanel.alpha = 0.9;
    const label = new TextBlock(`${root.name}-label-text`, LABEL_BY_KIND[kind]);
    label.color = '#ffffff';
    label.fontFamily = 'Arial, sans-serif';
    label.fontSize = 14;
    label.fontWeight = '700';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    labelPanel.addControl(label);
    this.labelUi.addControl(labelPanel);
    labelPanel.linkWithMesh(sprite);
    labelPanel.linkOffsetY = -64;
    const visual = { root, pad, core, beacon, sprite, shadow, spriteTexture, spriteBaseScaleX, spriteBaseScaleY, crowdOverlay, labelPanel, baseScaleX: radius };
    this.visuals.set(id, visual);
    return visual;
  }

  private material(name: string, color: Color3, alpha: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.45);
    material.emissiveColor = color;
    material.alpha = alpha;
    material.alphaMode = Engine.ALPHA_ADD;
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    return material;
  }

  private texture(url: string): Texture {
    const texture = new Texture(url, this.scene, true, true, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  }

  private spriteMaterial(name: string, texture: Texture): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    return material;
  }
}

function spriteDimensionsForKind(kind: AbsorbableKind, radius: number): { width: number; height: number } {
  if (kind === 'ORGANIC') {
    const width = Math.max(13.5, radius * 1.5);
    return { width, height: width / ORGANIC_SHELTER_ASPECT };
  }
  if (kind === 'MACHINERY') {
    const width = Math.max(12.8, radius * 2.84);
    return { width, height: width / MACHINERY_SPRITE_ASPECT };
  }
  const size = Math.max(6.4, radius * 1.42);
  return { width: size, height: size };
}

function facingScaleX(baseScaleX: number, unitX: number, referenceX: number): number {
  // The vehicle source sprite faces right. Face it toward the mothership.
  const direction = Math.sign(referenceX - unitX) || 1;
  return Math.abs(baseScaleX) * direction;
}
