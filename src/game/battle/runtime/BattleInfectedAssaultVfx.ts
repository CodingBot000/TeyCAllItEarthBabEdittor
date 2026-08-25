import {
  AbstractMesh,
  Color3,
  Engine,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import { GROUND_ATTACK_TARGET_Y } from './battleVisualCoordinates';

interface InfectedDrop {
  body: AbstractMesh;
  head: AbstractMesh;
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
  index: number;
  landed: boolean;
}

interface SporeParticle {
  mesh: AbstractMesh;
  position: Vector3;
  start: Vector3;
  target: Vector3;
  delay: number;
  duration: number;
  baseScale: number;
  phase: number;
  active: boolean;
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

interface InfectedDropWave {
  slot: number;
  id: number;
  elapsed: number;
  completeAt: number;
  startCenter: Vector3;
  drops: InfectedDrop[];
  spores: SporeParticle[];
  impacts: GroundImpact[];
  active: boolean;
}

export interface InfectedAssaultVfxSnapshot {
  active: boolean;
  activeWaves: number;
  fallingCount: number;
  groundImpactCount: number;
  totalDrops: number;
}

const DROP_COUNT = 64;
const SPORE_COUNT = 96;
const MAX_ACTIVE_WAVES = 2;
const MAX_GROUND_IMPACTS = 18;
const FALL_GRAVITY_EXPONENT = 1.72;
const GROUND_IMPACT_DURATION = 0.72;
const TARGET_GROUND_Y = GROUND_ATTACK_TARGET_Y;

/**
 * Pooled, purely visual prototype for the infected assault drop.
 * It intentionally does not inspect or mutate campaign/combat cohort state.
 */
export class BattleInfectedAssaultVfx {
  private readonly root: TransformNode;
  private readonly bodyTemplate: Mesh;
  private readonly headTemplate: Mesh;
  private readonly trailTemplate: Mesh;
  private readonly sporeTemplate: Mesh;
  private readonly impactFlashTemplate: Mesh;
  private readonly impactRingTemplate: Mesh;
  private readonly bodyMaterial: StandardMaterial;
  private readonly headMaterial: StandardMaterial;
  private readonly trailMaterial: StandardMaterial;
  private readonly sporeMaterial: StandardMaterial;
  private readonly impactFlashMaterial: StandardMaterial;
  private readonly impactRingMaterial: StandardMaterial;
  private readonly waves: InfectedDropWave[];
  private nextWaveId = 1;
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleInfectedAssaultVfxRoot', scene);
    this.bodyMaterial = this.createMaterial('battle-infected-body', new Color3(0.92, 0.05, 0.44), new Color3(1, 0.04, 0.34), 0.96, Engine.ALPHA_COMBINE);
    this.headMaterial = this.createMaterial('battle-infected-head', new Color3(0.66, 1, 0.22), new Color3(0.46, 1, 0.08), 1, Engine.ALPHA_ADD);
    this.trailMaterial = this.createMaterial('battle-infected-trail', new Color3(0.28, 0.82, 1), new Color3(0.22, 0.86, 1), 0.78, Engine.ALPHA_ADD);
    this.sporeMaterial = this.createMaterial('battle-infected-spore', new Color3(0.14, 0.9, 1), new Color3(0.08, 0.96, 1), 0.7, Engine.ALPHA_ADD);
    this.impactFlashMaterial = this.createMaterial('battle-infected-impact-flash', new Color3(1, 0.14, 0.48), new Color3(1, 0.04, 0.36), 0.78, Engine.ALPHA_ADD);
    this.impactRingMaterial = this.createMaterial('battle-infected-impact-ring', new Color3(0.36, 1, 0.7), new Color3(0.16, 1, 0.74), 0.82, Engine.ALPHA_ADD);

    this.bodyTemplate = MeshBuilder.CreateCapsule('battle-infected-body-template', { radius: 0.5, height: 1.8, tessellation: 6 }, scene);
    this.headTemplate = MeshBuilder.CreateSphere('battle-infected-head-template', { diameter: 1, segments: 8 }, scene);
    this.trailTemplate = MeshBuilder.CreateCylinder('battle-infected-trail-template', { diameter: 1, height: 1, tessellation: 6 }, scene);
    this.sporeTemplate = MeshBuilder.CreateSphere('battle-infected-spore-template', { diameter: 1, segments: 5 }, scene);
    this.impactFlashTemplate = MeshBuilder.CreateSphere('battle-infected-impact-flash-template', { diameter: 1, segments: 8 }, scene);
    this.impactRingTemplate = MeshBuilder.CreateTorus('battle-infected-impact-ring-template', { diameter: 1, thickness: 0.06, tessellation: 18 }, scene);

    this.bodyTemplate.material = this.bodyMaterial;
    this.headTemplate.material = this.headMaterial;
    this.trailTemplate.material = this.trailMaterial;
    this.sporeTemplate.material = this.sporeMaterial;
    this.impactFlashTemplate.material = this.impactFlashMaterial;
    this.impactRingTemplate.material = this.impactRingMaterial;
    [this.bodyTemplate, this.headTemplate, this.trailTemplate, this.sporeTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      // Keep source geometry alive for instances without drawing the source itself.
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
    wave.startCenter.y += 0.7;
    wave.active = true;

    let completeAt = 0;
    wave.drops.forEach((drop, index) => {
      this.resetDrop(drop, wave.id, index, wave.startCenter);
      completeAt = Math.max(completeAt, drop.delay + drop.duration);
    });
    wave.spores.forEach((spore, index) => {
      this.resetSpore(spore, wave.id, index, wave.startCenter);
      completeAt = Math.max(completeAt, spore.delay + spore.duration);
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
      for (const spore of wave.spores) this.updateSpore(wave, spore);
      for (const impact of wave.impacts) this.updateImpact(impact, dt);
      if (wave.elapsed >= wave.completeAt) this.resetWave(wave);
    }
  }

  getSnapshot(): InfectedAssaultVfxSnapshot {
    let activeWaves = 0;
    let fallingCount = 0;
    let groundImpactCount = 0;
    let totalDrops = 0;
    for (const wave of this.waves) {
      if (!wave.active) continue;
      activeWaves += 1;
      totalDrops += wave.drops.length;
      for (const drop of wave.drops) if (!drop.landed && wave.elapsed >= drop.delay) fallingCount += 1;
      for (const impact of wave.impacts) if (impact.active) groundImpactCount += 1;
    }
    return { active: activeWaves > 0, activeWaves, fallingCount, groundImpactCount, totalDrops };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.waves.forEach((wave) => this.disposeWave(wave));
    [this.bodyTemplate, this.headTemplate, this.trailTemplate, this.sporeTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => mesh.dispose());
    [this.bodyMaterial, this.headMaterial, this.trailMaterial, this.sporeMaterial, this.impactFlashMaterial, this.impactRingMaterial].forEach((material) => material.dispose());
    this.root.dispose();
  }

  private createWavePool(slot: number): InfectedDropWave {
    const drops = Array.from({ length: DROP_COUNT }, (_, index) => this.createDrop(slot, index));
    const spores = Array.from({ length: SPORE_COUNT }, (_, index) => this.createSpore(slot, index));
    const impacts = Array.from({ length: MAX_GROUND_IMPACTS }, (_, index) => this.createImpact(slot, index));
    return { slot, id: 0, elapsed: 0, completeAt: 0, startCenter: Vector3.Zero(), drops, spores, impacts, active: false };
  }

  private createDrop(slot: number, index: number): InfectedDrop {
    const body = this.bodyTemplate.createInstance(`battle-infected-pool-${slot}-body-${index}`);
    const head = this.headTemplate.createInstance(`battle-infected-pool-${slot}-head-${index}`);
    const trail = this.trailTemplate.createInstance(`battle-infected-pool-${slot}-trail-${index}`);
    [body, head, trail].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.setEnabled(false);
    });
    return {
      body,
      head,
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
      index,
      landed: false,
    };
  }

  private createSpore(slot: number, index: number): SporeParticle {
    const mesh = this.sporeTemplate.createInstance(`battle-infected-pool-${slot}-spore-${index}`);
    mesh.parent = this.root;
    mesh.isPickable = false;
    mesh.renderingGroupId = 3;
    mesh.setEnabled(false);
    return { mesh, position: Vector3.Zero(), start: Vector3.Zero(), target: Vector3.Zero(), delay: 0, duration: 0, baseScale: 0, phase: 0, active: false };
  }

  private createImpact(slot: number, index: number): GroundImpact {
    const flash = this.impactFlashTemplate.createInstance(`battle-infected-pool-${slot}-impact-flash-${index}`);
    const ring = this.impactRingTemplate.createInstance(`battle-infected-pool-${slot}-impact-ring-${index}`);
    [flash, ring].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.setEnabled(false);
    });
    return { flash, ring, position: Vector3.Zero(), age: 0, duration: GROUND_IMPACT_DURATION, baseScale: 0, active: false };
  }

  private resetDrop(drop: InfectedDrop, waveId: number, index: number, startCenter: Vector3): void {
    const seed = waveId * 1000 + index * 17;
    const startSpread = 3.2 + seededUnit(seed + 1) * 6.4;
    const targetSpread = 4 + seededUnit(seed + 2) * 17;
    drop.start.copyFrom(startCenter);
    drop.start.x += (seededUnit(seed + 3) - 0.5) * startSpread;
    drop.start.z += (seededUnit(seed + 4) - 0.5) * 1.8;
    drop.target.set(
      startCenter.x + (seededUnit(seed + 5) - 0.5) * targetSpread,
      TARGET_GROUND_Y + 0.12,
      (seededUnit(seed + 6) - 0.5) * 1.8,
    );
    drop.position.copyFrom(drop.start);
    drop.previousPosition.copyFrom(drop.start);
    drop.delay = seededUnit(seed + 7) * 0.62;
    drop.duration = 1.42 + seededUnit(seed + 8) * 0.55;
    drop.baseScale = 0.16 + seededUnit(seed + 9) * 0.1;
    drop.phase = seededUnit(seed + 10) * Math.PI * 2;
    drop.landed = false;
    this.setDropEnabled(drop, false);
  }

  private resetSpore(spore: SporeParticle, waveId: number, index: number, startCenter: Vector3): void {
    const seed = waveId * 2000 + index * 13;
    spore.start.copyFrom(startCenter);
    spore.start.x += (seededUnit(seed + 1) - 0.5) * 10;
    spore.start.z += (seededUnit(seed + 2) - 0.5) * 2.4;
    spore.target.set(
      startCenter.x + (seededUnit(seed + 3) - 0.5) * 24,
      TARGET_GROUND_Y + 0.08,
      (seededUnit(seed + 4) - 0.5) * 2.4,
    );
    spore.position.copyFrom(spore.start);
    spore.delay = seededUnit(seed + 5) * 0.8;
    spore.duration = 1.15 + seededUnit(seed + 6) * 1.05;
    spore.baseScale = 0.035 + seededUnit(seed + 7) * 0.055;
    spore.phase = seededUnit(seed + 8) * Math.PI * 2;
    spore.active = true;
    spore.mesh.setEnabled(false);
  }

  private updateDrop(wave: InfectedDropWave, drop: InfectedDrop, deltaSeconds: number): void {
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
      this.spawnImpact(wave, drop.target, drop.baseScale * 2.4);
      return;
    }
    drop.previousPosition.copyFrom(drop.position);
    const fall = Math.pow(progress, FALL_GRAVITY_EXPONENT);
    const sway = Math.sin(drop.phase + progress * 11) * (1 - progress) * 0.45;
    drop.position.x = drop.start.x + (drop.target.x - drop.start.x) * fall + sway;
    drop.position.y = drop.start.y + (drop.target.y - drop.start.y) * fall;
    drop.position.z = drop.start.z + (drop.target.z - drop.start.z) * fall + Math.cos(drop.phase + progress * 8) * 0.08;

    const tumble = Math.sin(drop.phase + progress * 15) * 0.2;
    drop.body.position.copyFrom(drop.position);
    drop.body.scaling.set(drop.baseScale, drop.baseScale * 1.45, drop.baseScale);
    drop.body.rotation.z = tumble;
    drop.body.rotation.y = Math.cos(drop.phase + progress * 10) * 0.18;
    drop.head.position.copyFrom(drop.position).addInPlaceFromFloats(0, drop.baseScale * 1.2, 0);
    drop.head.scaling.setAll(drop.baseScale * 0.72);

    drop.position.subtractToRef(drop.previousPosition, drop.travel);
    drop.tail.copyFrom(drop.position);
    drop.tail.y += Math.max(0.2, Math.min(1.05, drop.travel.length() * 5.4 + deltaSeconds * 2));
    alignCylinder(drop.trail, drop.tail, drop.position);
    drop.trail.scaling.x = drop.baseScale * 0.46;
    drop.trail.scaling.z = drop.baseScale * 0.46;
    this.setDropEnabled(drop, true);
  }

  private updateSpore(wave: InfectedDropWave, spore: SporeParticle): void {
    if (!spore.active) return;
    if (wave.elapsed < spore.delay) {
      spore.mesh.setEnabled(false);
      return;
    }
    const progress = Math.min(1, (wave.elapsed - spore.delay) / spore.duration);
    if (progress >= 1) {
      spore.active = false;
      spore.mesh.setEnabled(false);
      return;
    }
    const fall = Math.pow(progress, 1.35);
    spore.position.x = spore.start.x + (spore.target.x - spore.start.x) * fall + Math.sin(spore.phase + wave.elapsed * 12) * 0.6;
    spore.position.y = spore.start.y + (spore.target.y - spore.start.y) * fall;
    spore.position.z = spore.start.z + (spore.target.z - spore.start.z) * fall;
    spore.mesh.position.copyFrom(spore.position);
    spore.mesh.scaling.setAll(spore.baseScale * (0.85 + Math.sin(spore.phase + wave.elapsed * 15) * 0.2));
    spore.mesh.setEnabled(true);
  }

  private spawnImpact(wave: InfectedDropWave, position: Vector3, baseScale: number): void {
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
    const fade = Math.max(0, 1 - progress);
    impact.flash.position.copyFrom(impact.position);
    impact.flash.scaling.set(impact.baseScale * (0.65 + progress * 0.8), impact.baseScale * 0.16, impact.baseScale * (0.65 + progress * 0.8));
    impact.ring.position.copyFrom(impact.position);
    impact.ring.scaling.setAll(impact.baseScale * (0.35 + progress * 1.8));
    if (progress >= 1) {
      impact.active = false;
      impact.flash.setEnabled(false);
      impact.ring.setEnabled(false);
    } else if (fade <= 0) {
      impact.flash.setEnabled(false);
      impact.ring.setEnabled(false);
    }
  }

  private setDropEnabled(drop: InfectedDrop, enabled: boolean): void {
    drop.body.setEnabled(enabled);
    drop.head.setEnabled(enabled);
    drop.trail.setEnabled(enabled);
  }

  private resetWave(wave: InfectedDropWave): void {
    wave.active = false;
    wave.elapsed = 0;
    wave.drops.forEach((drop) => this.setDropEnabled(drop, false));
    wave.spores.forEach((spore) => { spore.active = false; spore.mesh.setEnabled(false); });
    wave.impacts.forEach((impact) => { impact.active = false; impact.flash.setEnabled(false); impact.ring.setEnabled(false); });
  }

  private disposeWave(wave: InfectedDropWave): void {
    wave.drops.forEach((drop) => { drop.body.dispose(); drop.head.dispose(); drop.trail.dispose(); });
    wave.spores.forEach((spore) => spore.mesh.dispose());
    wave.impacts.forEach((impact) => { impact.flash.dispose(); impact.ring.dispose(); });
  }

  private createMaterial(name: string, diffuse: Color3, emissive: Color3, alpha: number, alphaMode: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.alphaMode = alphaMode;
    return material;
  }
}

function alignCylinder(mesh: AbstractMesh, start: Vector3, end: Vector3): void {
  const direction = end.subtract(start);
  mesh.position.copyFrom(start.add(end).scale(0.5));
  mesh.scaling.y = direction.length();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), new Quaternion());
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
