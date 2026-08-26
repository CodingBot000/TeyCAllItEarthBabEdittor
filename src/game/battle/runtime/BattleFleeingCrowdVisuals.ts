import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, type Scene } from '@babylonjs/core';
import type { CombatState } from '../../domain/types';
import { GROUND_ENTITY_ROOT_Y } from './battleVisualCoordinates';

const CROWD_TARGET_PREFIX = 'ambient:fleeing-crowd-';
const CROWD_PEOPLE_COUNT = 50;
const CROWD_AMOUNT_PER_PERSON = 100;
// Ground units use their root y as the visible bottom anchor. Raise the crowd
// by two world units so it reads above the road while preserving its sprite
// height and movement behavior.
const CROWD_GROUND_Y = GROUND_ENTITY_ROOT_Y + 2;
const CROWD_WIDTH = 11.5;
const CROWD_HEIGHT = 2.45;
const CROWD_FRAME_RATE = 8;
const CROWD_TRAVEL_RANGE = 11;

const CROWD_RIGHT_SPRITE_URL = '/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-1x4.png';
const CROWD_LEFT_SPRITE_URL = '/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-left-1x4.png';
const CROWD_RIGHT_NIGHT_SPRITE_URL = '/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-1x4-night.png';
const CROWD_LEFT_NIGHT_SPRITE_URL = '/assets/runtime/sprites/infected-fleeing-crowd-swarm-wiggle-left-1x4-night.png';

const CROWD_IDS = [
  'ambient:fleeing-crowd-west',
  'ambient:fleeing-crowd-west-center',
  'ambient:fleeing-crowd-center',
  'ambient:fleeing-crowd-east-center',
  'ambient:fleeing-crowd-east',
];

interface CrowdVisual {
  id: string;
  root: TransformNode;
  sprite: Mesh;
  flash: Mesh;
  labelPanel: Rectangle;
  label: TextBlock;
  anchorX: number;
  phase: number;
  speed: number;
  direction: 'LEFT' | 'RIGHT';
  visible: boolean;
  remainingAmount: number;
}

export interface FleeingCrowdVisualSnapshot {
  id: string;
  x: number;
  people: number;
  amountPerPerson: number;
  direction: 'LEFT' | 'RIGHT';
  moving: boolean;
  absorbing: boolean;
  flashIntensity: number;
  visible: boolean;
  remainingAmount: number;
  textureReady: boolean;
  worldY: number;
  worldZ: number;
}

export class BattleFleeingCrowdVisuals {
  private readonly root: TransformNode;
  private readonly labelUi: AdvancedDynamicTexture;
  private readonly rightTexture: Texture;
  private readonly leftTexture: Texture;
  private readonly rightFlashTexture: Texture;
  private readonly leftFlashTexture: Texture;
  private readonly rightMaterial: StandardMaterial;
  private readonly leftMaterial: StandardMaterial;
  private readonly rightFlashMaterial: StandardMaterial;
  private readonly leftFlashMaterial: StandardMaterial;
  private readonly visuals = new Map<string, CrowdVisual>();

  constructor(private readonly scene: Scene, nightMode = false) {
    this.root = new TransformNode('BattleFleeingCrowdVisualsRoot', scene);
    this.labelUi = AdvancedDynamicTexture.CreateFullscreenUI('BattleFleeingCrowdLabelsUi', true, scene);
    this.rightTexture = this.texture(nightMode ? CROWD_RIGHT_NIGHT_SPRITE_URL : CROWD_RIGHT_SPRITE_URL);
    this.leftTexture = this.texture(nightMode ? CROWD_LEFT_NIGHT_SPRITE_URL : CROWD_LEFT_SPRITE_URL);
    this.rightFlashTexture = this.rightTexture.clone();
    this.leftFlashTexture = this.leftTexture.clone();
    this.rightFlashMaterial = this.material('battle-fleeing-crowd-right-flash', this.rightFlashTexture, true);
    this.leftFlashMaterial = this.material('battle-fleeing-crowd-left-flash', this.leftFlashTexture, true);
    this.rightMaterial = this.material('battle-fleeing-crowd-right', this.rightTexture, false);
    this.leftMaterial = this.material('battle-fleeing-crowd-left', this.leftTexture, false);
  }

  sync(state: Readonly<CombatState>, elapsedSeconds: number, advanceMovement: boolean): void {
    const activeIds = new Set<string>();
    for (const target of state.absorbableTargets) {
      if (!target.id.startsWith(CROWD_TARGET_PREFIX)) continue;
      activeIds.add(target.id);
      const visual = this.visuals.get(target.id) ?? this.createVisual(target.id, target.center.x);
      const alive = target.remainingAmount > 0;
      const absorbing = alive && state.activeAbility === 'beam' && state.activeBeamTargetId === target.id;
      if (advanceMovement && alive && !absorbing) {
        const phase = elapsedSeconds * visual.speed + visual.phase;
        target.center.x = visual.anchorX + Math.sin(phase) * CROWD_TRAVEL_RANGE;
        visual.direction = Math.cos(phase) >= 0 ? 'RIGHT' : 'LEFT';
      }
      const phase = elapsedSeconds * visual.speed + visual.phase;
      const frame = Math.floor(elapsedSeconds * CROWD_FRAME_RATE + visual.phase * 2) % 4;
      const flashIntensity = absorbing ? 0.38 + (Math.sin(elapsedSeconds * 18 + visual.phase) * 0.5 + 0.5) * 0.42 : 0;
      const material = visual.direction === 'RIGHT' ? this.rightMaterial : this.leftMaterial;
      const flashMaterial = visual.direction === 'RIGHT' ? this.rightFlashMaterial : this.leftFlashMaterial;
      setSheetFrame(material.diffuseTexture instanceof Texture ? material.diffuseTexture : null, frame);
      setSheetFrame(flashMaterial.diffuseTexture instanceof Texture ? flashMaterial.diffuseTexture : null, frame);
      visual.root.position.x = target.center.x;
      visual.root.position.y = CROWD_GROUND_Y + CROWD_HEIGHT * 0.5;
      visual.sprite.material = material;
      visual.flash.material = flashMaterial;
      visual.sprite.visibility = alive ? absorbing ? 0.55 : 0.92 : 0;
      visual.flash.visibility = flashIntensity;
      visual.label.text = `+${CROWD_AMOUNT_PER_PERSON} / 인`;
      visual.labelPanel.isVisible = absorbing;
      visual.visible = alive;
      visual.remainingAmount = target.remainingAmount;
    }
    for (const [id, visual] of this.visuals) {
      if (activeIds.has(id)) continue;
      visual.sprite.visibility = 0;
      visual.flash.visibility = 0;
      visual.labelPanel.isVisible = false;
      visual.visible = false;
    }
  }

  getSnapshot(): FleeingCrowdVisualSnapshot[] {
    return CROWD_IDS.flatMap((id) => {
      const visual = this.visuals.get(id);
      if (!visual) return [];
      return [{ id, x: round(visual.root.position.x), people: CROWD_PEOPLE_COUNT, amountPerPerson: CROWD_AMOUNT_PER_PERSON, direction: visual.direction, moving: visual.visible && visual.flash.visibility <= 0, absorbing: visual.flash.visibility > 0, flashIntensity: round(visual.flash.visibility), visible: visual.visible, remainingAmount: round(visual.remainingAmount), textureReady: this.rightTexture.isReady() && this.leftTexture.isReady(), worldY: round(visual.root.getAbsolutePosition().y), worldZ: round(visual.root.getAbsolutePosition().z) }];
    });
  }

  dispose(): void {
    this.visuals.forEach((visual) => {
      visual.labelPanel.dispose();
      visual.sprite.dispose(false, true);
      visual.flash.dispose(false, true);
      visual.root.dispose(false, true);
    });
    this.visuals.clear();
    this.labelUi.dispose();
    this.rightMaterial.dispose();
    this.leftMaterial.dispose();
    this.rightFlashMaterial.dispose();
    this.leftFlashMaterial.dispose();
    this.rightTexture.dispose();
    this.leftTexture.dispose();
    this.rightFlashTexture.dispose();
    this.leftFlashTexture.dispose();
    this.root.dispose();
  }

  private createVisual(id: string, x: number): CrowdVisual {
    const root = new TransformNode(`battle-fleeing-crowd-${id}`, this.scene);
    root.parent = this.root;
    root.position.x = x;
    root.position.y = CROWD_GROUND_Y + CROWD_HEIGHT * 0.5;
    // Draw in front of the foreground/road layers while keeping the same ground y.
    root.position.z = -6;
    const sprite = MeshBuilder.CreatePlane(`${root.name}-sprite`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    sprite.parent = root;
    sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sprite.scaling.set(CROWD_WIDTH, CROWD_HEIGHT, 1);
    sprite.material = this.rightMaterial;
    sprite.renderingGroupId = 3;
    sprite.alphaIndex = 10;
    sprite.isPickable = false;
    const flash = MeshBuilder.CreatePlane(`${root.name}-flash`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    flash.parent = root;
    flash.position.z = -0.04;
    flash.billboardMode = Mesh.BILLBOARDMODE_ALL;
    flash.scaling.set(CROWD_WIDTH, CROWD_HEIGHT, 1);
    flash.material = this.rightFlashMaterial;
    flash.renderingGroupId = 3;
    flash.alphaIndex = 11;
    flash.isPickable = false;
    flash.visibility = 0;
    const labelPanel = new Rectangle(`${root.name}-label`);
    labelPanel.width = '60px';
    labelPanel.height = '18px';
    labelPanel.cornerRadius = 3;
    labelPanel.thickness = 1;
    labelPanel.color = '#ffffff';
    labelPanel.background = '#ffffff';
    labelPanel.alpha = 0.86;
    const label = new TextBlock(`${root.name}-label-text`, `+${CROWD_AMOUNT_PER_PERSON} / 인`);
    label.color = '#152629';
    label.fontFamily = 'Arial, sans-serif';
    label.fontSize = 10;
    label.fontWeight = '700';
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    labelPanel.addControl(label);
    this.labelUi.addControl(labelPanel);
    labelPanel.linkWithMesh(sprite);
    labelPanel.linkOffsetY = -42;
    labelPanel.isVisible = false;
    const visual: CrowdVisual = { id, root, sprite, flash, labelPanel, label, anchorX: x, phase: seededUnit(id.length * 31 + x) * Math.PI * 2, speed: 0.55 + seededUnit(id.length * 17 + Math.abs(x)) * 0.28, direction: 'RIGHT', visible: true, remainingAmount: CROWD_PEOPLE_COUNT * CROWD_AMOUNT_PER_PERSON };
    this.visuals.set(id, visual);
    return visual;
  }

  private texture(url: string): Texture {
    const texture = new Texture(url, this.scene, true, true, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.uScale = 0.25;
    texture.vScale = 1;
    return texture;
  }

  private material(name: string, texture: Texture, flash: boolean): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = flash ? Color3.White() : new Color3(0.9, 1, 1);
    material.emissiveColor = flash ? Color3.White() : Color3.White().scale(0.34);
    material.alpha = flash ? 0.78 : 0.96;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.alphaMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.disableDepthWrite = true;
    return material;
  }
}

export function isFleeingCrowdTarget(id: string): boolean {
  return id.startsWith(CROWD_TARGET_PREFIX);
}

export function registerFleeingCrowdTargets(state: CombatState): void {
  const definitions = [-168, -84, 0, 84, 168];
  definitions.forEach((x, index) => {
    const id = CROWD_IDS[index]!;
    const existing = state.absorbableTargets.find((target) => target.id === id);
    if (existing) return;
    state.absorbableTargets.push({
      id,
      sectorId: 'ambient',
      label: '도주 군중',
      kind: 'ORGANIC',
      weight: 1,
      center: { x, z: 0 },
      radius: 5.8,
      baseAmount: CROWD_PEOPLE_COUNT * CROWD_AMOUNT_PER_PERSON,
      density: 1,
      yieldPerThousand: { captives: 1000, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 },
      energyCostMultiplier: 1,
      alertMultiplier: 0.7,
      requirement: 'NONE',
      optional: true,
      visualBudget: 1,
      initialAmount: CROWD_PEOPLE_COUNT * CROWD_AMOUNT_PER_PERSON,
      remainingAmount: CROWD_PEOPLE_COUNT * CROWD_AMOUNT_PER_PERSON,
      absorbedAmount: 0,
      destroyedAmount: 0,
      discovered: true,
      status: 'AVAILABLE',
    });
  });
}

function setSheetFrame(texture: Texture | null, frame: number): void {
  if (!(texture instanceof Texture)) return;
  texture.uScale = 0.25;
  texture.vScale = 1;
  texture.uOffset = (Math.max(0, Math.min(3, frame)) % 4) / 4;
  texture.vOffset = 0;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
