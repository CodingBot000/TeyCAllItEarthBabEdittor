import {
  AbstractMesh,
  Color3,
  Engine,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import { GROUND_ATTACK_TARGET_Y } from './battleVisualCoordinates';
import { COHORT_ACTIVE_COLOR } from './BattleCohortVisuals';

interface HumanDrop {
  sprite: AbstractMesh;
  trail: AbstractMesh;
  position: Vector3;
  previousPosition: Vector3;
  start: Vector3;
  target: Vector3;
  tail: Vector3;
  travel: Vector3;
  delay: number;
  duration: number;
  baseScale: number;
  phase: number;
  landed: boolean;
}

interface GroundImpact {
  flash: AbstractMesh;
  ring: AbstractMesh;
  position: Vector3;
  age: number;
  duration: number;
  baseScale: number;
  active: boolean;
}

interface HumanDropWave {
  slot: number;
  id: number;
  elapsed: number;
  completeAt: number;
  startCenter: Vector3;
  drops: HumanDrop[];
  impacts: GroundImpact[];
  active: boolean;
}

export interface CohortHumanDropVfxSnapshot {
  active: boolean;
  activeWaves: number;
  fallingCount: number;
  groundImpactCount: number;
  totalDrops: number;
  landedCount: number;
  spriteReady: boolean;
  tailCount: number;
  tint: string;
}

const DROP_COUNT = 64;
const MAX_ACTIVE_WAVES = 2;
const MAX_GROUND_IMPACTS = 18;
const FRAME_COUNT = 5;
const FRAME_WIDTH = 1.7;
const FRAME_HEIGHT = 3.3;
const FALL_GRAVITY_EXPONENT = 1.38;
const GROUND_IMPACT_DURATION = 0.5;
const TARGET_GROUND_Y = GROUND_ATTACK_TARGET_Y;
const HUMAN_SPRITE_URL = '/assets/runtime/sprites/absorption-virtual-human-silhouettes-5x1.webp';

/**
 * Sprite-based assault drop that reuses the human silhouettes from the
 * absorption beam. It is intentionally a separate VFX from the original
 * procedural infected drop so either presentation can be kept independently.
 */
export class BattleCohortHumanDropVfx {
  private readonly root: TransformNode;
  private readonly sourceTexture: Texture;
  private readonly spriteTemplates: Mesh[];
  private readonly spriteMaterials: StandardMaterial[];
  private readonly spriteFrameTextures: Texture[];
  private readonly trailTemplate: Mesh;
  private readonly impactFlashTemplate: Mesh;
  private readonly impactRingTemplate: Mesh;
  private readonly trailMaterial: StandardMaterial;
  private readonly impactFlashMaterial: StandardMaterial;
  private readonly impactRingMaterial: StandardMaterial;
  private readonly waves: HumanDropWave[];
  private nextWaveId = 1;
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleCohortHumanDropVfxRoot', scene);
    this.sourceTexture = new Texture(HUMAN_SPRITE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.sourceTexture.hasAlpha = true;
    this.sourceTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.sourceTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

    this.spriteFrameTextures = Array.from({ length: FRAME_COUNT }, (_, frame) => this.createFrameTexture(frame));
    this.spriteMaterials = this.spriteFrameTextures.map((texture, frame) => this.createSpriteMaterial(frame, texture));
    this.spriteTemplates = this.spriteMaterials.map((material, frame) => {
      const sprite = MeshBuilder.CreatePlane(`battle-cohort-human-drop-sprite-template-${frame}`, {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        sideOrientation: Mesh.DOUBLESIDE,
      }, scene);
      sprite.material = material;
      sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
      sprite.renderingGroupId = 3;
      sprite.isPickable = false;
      sprite.position.set(0, -1000, 0);
      return sprite;
    });

    this.trailMaterial = this.createGlowMaterial('battle-cohort-human-drop-trail', COHORT_ACTIVE_COLOR, 0.64);
    this.impactFlashMaterial = this.createGlowMaterial('battle-cohort-human-drop-impact-flash', COHORT_ACTIVE_COLOR, 0.74);
    this.impactRingMaterial = this.createGlowMaterial('battle-cohort-human-drop-impact-ring', COHORT_ACTIVE_COLOR, 0.7);
    this.trailTemplate = MeshBuilder.CreateCylinder('battle-cohort-human-drop-trail-template', { diameter: 1, height: 1, tessellation: 6 }, scene);
    this.impactFlashTemplate = MeshBuilder.CreateSphere('battle-cohort-human-drop-impact-flash-template', { diameter: 1, segments: 8 }, scene);
    this.impactRingTemplate = MeshBuilder.CreateTorus('battle-cohort-human-drop-impact-ring-template', { diameter: 1, thickness: 0.06, tessellation: 18 }, scene);
    this.trailTemplate.material = this.trailMaterial;
    this.impactFlashTemplate.material = this.impactFlashMaterial;
    this.impactRingTemplate.material = this.impactRingMaterial;
    [this.trailTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.position.set(0, -1000, 0);
    });

    this.waves = Array.from({ length: MAX_ACTIVE_WAVES }, (_, slot) => this.createWavePool(slot));
  }

  trigger(origin: Vector3): void {
    if (this.disposed) return;
    const wave = this.waves.find((candidate) => !candidate.active)
      ?? this.waves.reduce((oldest, candidate) => candidate.elapsed > oldest.elapsed ? candidate : oldest);
    this.resetWave(wave);
    wave.id = this.nextWaveId++;
    wave.elapsed = 0;
    wave.startCenter.copyFrom(origin);
    wave.startCenter.y -= 0.7;
    wave.active = true;

    let completeAt = 0;
    wave.drops.forEach((drop, index) => {
      this.resetDrop(drop, wave.id, index, wave.startCenter);
      completeAt = Math.max(completeAt, drop.delay + drop.duration);
    });
    wave.completeAt = completeAt + GROUND_IMPACT_DURATION;
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, deltaSeconds);
    for (const wave of this.waves) {
      if (!wave.active) continue;
      wave.elapsed += dt;
      for (const drop of wave.drops) this.updateDrop(wave, drop, dt);
      for (const impact of wave.impacts) this.updateImpact(impact, dt);
      if (wave.elapsed >= wave.completeAt) this.resetWave(wave);
    }
  }

  getSnapshot(): CohortHumanDropVfxSnapshot {
    let activeWaves = 0;
    let fallingCount = 0;
    let groundImpactCount = 0;
    let totalDrops = 0;
    let landedCount = 0;
    for (const wave of this.waves) {
      if (!wave.active) continue;
      activeWaves += 1;
      totalDrops += wave.drops.length;
      for (const drop of wave.drops) {
        if (drop.landed) landedCount += 1;
        else if (wave.elapsed >= drop.delay) fallingCount += 1;
      }
      for (const impact of wave.impacts) if (impact.active) groundImpactCount += 1;
    }
    return {
      active: activeWaves > 0,
      activeWaves,
      fallingCount,
      groundImpactCount,
      totalDrops,
      landedCount,
      spriteReady: this.sourceTexture.isReady(),
      tailCount: fallingCount,
      tint: colorToHex(COHORT_ACTIVE_COLOR),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.waves.forEach((wave) => this.disposeWave(wave));
    this.spriteTemplates.forEach((mesh) => mesh.dispose());
    this.spriteMaterials.forEach((material) => material.dispose());
    this.spriteFrameTextures.forEach((texture) => texture.dispose());
    this.sourceTexture.dispose();
    [this.trailTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => mesh.dispose());
    [this.trailMaterial, this.impactFlashMaterial, this.impactRingMaterial].forEach((material) => material.dispose());
    this.root.dispose();
  }

  private createWavePool(slot: number): HumanDropWave {
    const drops = Array.from({ length: DROP_COUNT }, (_, index) => this.createDrop(slot, index));
    const impacts = Array.from({ length: MAX_GROUND_IMPACTS }, (_, index) => this.createImpact(slot, index));
    return { slot, id: 0, elapsed: 0, completeAt: 0, startCenter: Vector3.Zero(), drops, impacts, active: false };
  }

  private createDrop(slot: number, index: number): HumanDrop {
    const frame = index % FRAME_COUNT;
    const sprite = this.spriteTemplates[frame]!.createInstance(`battle-cohort-human-drop-pool-${slot}-sprite-${index}`);
    const trail = this.trailTemplate.createInstance(`battle-cohort-human-drop-pool-${slot}-trail-${index}`);
    [sprite, trail].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.setEnabled(false);
    });
    sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
    return {
      sprite,
      trail,
      position: Vector3.Zero(),
      previousPosition: Vector3.Zero(),
      start: Vector3.Zero(),
      target: Vector3.Zero(),
      tail: Vector3.Zero(),
      travel: Vector3.Zero(),
      delay: 0,
      duration: 0,
      baseScale: 0,
      phase: 0,
      landed: false,
    };
  }

  private createImpact(slot: number, index: number): GroundImpact {
    const flash = this.impactFlashTemplate.createInstance(`battle-cohort-human-drop-pool-${slot}-impact-flash-${index}`);
    const ring = this.impactRingTemplate.createInstance(`battle-cohort-human-drop-pool-${slot}-impact-ring-${index}`);
    [flash, ring].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.setEnabled(false);
    });
    return { flash, ring, position: Vector3.Zero(), age: 0, duration: GROUND_IMPACT_DURATION, baseScale: 0, active: false };
  }

  private resetDrop(drop: HumanDrop, waveId: number, index: number, startCenter: Vector3): void {
    const seed = waveId * 1000 + index * 19;
    const startSpread = 3.2 + seededUnit(seed + 1) * 6.4;
    const targetSpread = 6.5 + seededUnit(seed + 2) * 20.5;
    drop.start.copyFrom(startCenter);
    drop.start.x += (seededUnit(seed + 3) - 0.5) * startSpread;
    drop.start.y -= 0.2 + seededUnit(seed + 4) * 0.9;
    drop.start.z -= 0.65 + seededUnit(seed + 5) * 0.55;
    drop.target.set(
      startCenter.x + (seededUnit(seed + 6) - 0.5) * targetSpread,
      TARGET_GROUND_Y + 0.9,
      (seededUnit(seed + 7) - 0.5) * 1.6,
    );
    drop.position.copyFrom(drop.start);
    drop.previousPosition.copyFrom(drop.start);
    drop.delay = seededUnit(seed + 8) * 0.58;
    drop.duration = 1.22 + seededUnit(seed + 9) * 0.54;
    drop.baseScale = 1.02 + seededUnit(seed + 10) * 0.42;
    drop.phase = seededUnit(seed + 11) * Math.PI * 2;
    drop.landed = false;
    this.setDropEnabled(drop, false);
  }

  private updateDrop(wave: HumanDropWave, drop: HumanDrop, deltaSeconds: number): void {
    if (drop.landed) return;
    if (wave.elapsed < drop.delay) {
      this.setDropEnabled(drop, false);
      return;
    }
    const progress = Math.min(1, (wave.elapsed - drop.delay) / drop.duration);
    if (progress >= 1) {
      drop.landed = true;
      drop.position.copyFrom(drop.target);
      this.setDropEnabled(drop, false);
      this.spawnImpact(wave, drop.target, drop.baseScale * 0.82);
      return;
    }

    drop.previousPosition.copyFrom(drop.position);
    const fall = Math.pow(progress, FALL_GRAVITY_EXPONENT);
    const sway = Math.sin(drop.phase + progress * 10.5) * (1 - progress) * 0.62;
    drop.position.x = drop.start.x + (drop.target.x - drop.start.x) * fall + sway;
    drop.position.y = drop.start.y + (drop.target.y - drop.start.y) * fall;
    drop.position.z = drop.start.z + (drop.target.z - drop.start.z) * fall + Math.cos(drop.phase + progress * 8.2) * 0.1;

    const tumble = Math.sin(drop.phase + progress * 13) * 0.34;
    drop.sprite.position.copyFrom(drop.position);
    drop.sprite.position.y += drop.baseScale * 0.56;
    drop.sprite.scaling.setAll(drop.baseScale);
    drop.sprite.rotation.z = tumble;

    drop.position.subtractToRef(drop.previousPosition, drop.travel);
    drop.tail.copyFrom(drop.position);
    drop.tail.y += Math.max(0.34, Math.min(1.7, drop.travel.length() * 8.2 + deltaSeconds * 3));
    drop.tail.z += 0.08;
    alignCylinder(drop.trail, drop.tail, drop.position);
    drop.trail.scaling.x = drop.baseScale * 0.22;
    drop.trail.scaling.z = drop.baseScale * 0.22;

    this.setDropEnabled(drop, true);
  }

  private spawnImpact(wave: HumanDropWave, position: Vector3, baseScale: number): void {
    const impact = wave.impacts.find((candidate) => !candidate.active);
    if (!impact) return;
    impact.position.copyFrom(position);
    impact.age = 0;
    impact.duration = GROUND_IMPACT_DURATION;
    impact.baseScale = baseScale;
    impact.active = true;
    impact.flash.setEnabled(true);
    impact.ring.setEnabled(true);
  }

  private updateImpact(impact: GroundImpact, deltaSeconds: number): void {
    if (!impact.active) return;
    impact.age += deltaSeconds;
    const progress = Math.min(1, impact.age / impact.duration);
    impact.flash.position.copyFrom(impact.position);
    impact.flash.scaling.set(impact.baseScale * (0.42 + progress * 0.78), impact.baseScale * 0.12, impact.baseScale * (0.42 + progress * 0.78));
    impact.ring.position.copyFrom(impact.position);
    impact.ring.scaling.setAll(impact.baseScale * (0.38 + progress * 1.85));
    if (progress >= 1) {
      impact.active = false;
      impact.flash.setEnabled(false);
      impact.ring.setEnabled(false);
    }
  }

  private setDropEnabled(drop: HumanDrop, enabled: boolean): void {
    drop.sprite.setEnabled(enabled);
    drop.trail.setEnabled(enabled);
  }

  private resetWave(wave: HumanDropWave): void {
    wave.active = false;
    wave.elapsed = 0;
    wave.drops.forEach((drop) => this.setDropEnabled(drop, false));
    wave.impacts.forEach((impact) => {
      impact.active = false;
      impact.flash.setEnabled(false);
      impact.ring.setEnabled(false);
    });
  }

  private disposeWave(wave: HumanDropWave): void {
    wave.drops.forEach((drop) => { drop.sprite.dispose(); drop.trail.dispose(); });
    wave.impacts.forEach((impact) => { impact.flash.dispose(); impact.ring.dispose(); });
  }

  private createFrameTexture(frame: number): Texture {
    const texture = this.sourceTexture.clone();
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.uScale = 1 / FRAME_COUNT;
    texture.uOffset = frame / FRAME_COUNT;
    texture.vScale = 1;
    texture.vOffset = 0;
    return texture;
  }

  private createSpriteMaterial(frame: number, texture: Texture): StandardMaterial {
    const material = new StandardMaterial(`battle-cohort-human-drop-material-${frame}`, this.scene);
    material.diffuseColor = COHORT_ACTIVE_COLOR;
    material.emissiveColor = COHORT_ACTIVE_COLOR.scale(0.84);
    material.alpha = 0.96;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    material.disableLighting = true;
    material.alphaMode = Engine.ALPHA_COMBINE;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    return material;
  }

  private createGlowMaterial(name: string, color: Color3, alpha: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.2);
    material.emissiveColor = color;
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.alphaMode = Engine.ALPHA_ADD;
    return material;
  }
}

function alignCylinder(mesh: AbstractMesh, start: Vector3, end: Vector3): void {
  const direction = end.subtract(start);
  const length = Math.max(0.001, direction.length());
  mesh.position.copyFrom(start.add(end).scale(0.5));
  mesh.scaling.y = length;
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.scale(1 / length), new Quaternion());
}

function colorToHex(color: Color3): string {
  const toByte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
