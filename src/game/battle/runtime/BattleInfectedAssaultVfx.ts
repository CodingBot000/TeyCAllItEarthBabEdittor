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
  arms: [AbstractMesh, AbstractMesh];
  legs: [AbstractMesh, AbstractMesh];
  halo: AbstractMesh;
  trail: AbstractMesh;
  position: Vector3;
  previousPosition: Vector3;
  start: Vector3;
  target: Vector3;
  delay: number;
  duration: number;
  baseScale: number;
  phase: number;
  index: number;
  landed: boolean;
}

interface GroundImpact {
  flash: AbstractMesh;
  ring: AbstractMesh;
  position: Vector3;
  age: number;
  duration: number;
  baseScale: number;
}

interface InfectedDropWave {
  id: number;
  elapsed: number;
  drops: InfectedDrop[];
  impacts: GroundImpact[];
  completeAt: number;
}

export interface InfectedAssaultVfxSnapshot {
  active: boolean;
  activeWaves: number;
  fallingCount: number;
  groundImpactCount: number;
  totalDrops: number;
}

const DROP_COUNT = 112;
const MAX_ACTIVE_WAVES = 3;
const MAX_GROUND_IMPACTS = 36;
const FALL_GRAVITY_EXPONENT = 1.72;
const GROUND_IMPACT_DURATION = 0.72;
const TARGET_GROUND_Y = GROUND_ATTACK_TARGET_Y;

/**
 * Purely visual prototype for the infected assault drop.
 * It intentionally does not inspect or mutate campaign/combat cohort state.
 */
export class BattleInfectedAssaultVfx {
  private readonly root: TransformNode;
  private readonly bodyTemplate: Mesh;
  private readonly headTemplate: Mesh;
  private readonly limbTemplate: Mesh;
  private readonly haloTemplate: Mesh;
  private readonly trailTemplate: Mesh;
  private readonly impactFlashTemplate: Mesh;
  private readonly impactRingTemplate: Mesh;
  private readonly bodyMaterial: StandardMaterial;
  private readonly headMaterial: StandardMaterial;
  private readonly haloMaterial: StandardMaterial;
  private readonly trailMaterial: StandardMaterial;
  private readonly impactFlashMaterial: StandardMaterial;
  private readonly impactRingMaterial: StandardMaterial;
  private readonly waves: InfectedDropWave[] = [];
  private nextWaveId = 1;
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleInfectedAssaultVfxRoot', scene);
    this.bodyMaterial = this.createMaterial('battle-infected-body', new Color3(0.92, 0.05, 0.44), new Color3(1, 0.04, 0.34), 0.96);
    this.headMaterial = this.createMaterial('battle-infected-head', new Color3(0.66, 1, 0.22), new Color3(0.46, 1, 0.08), 1);
    this.haloMaterial = this.createMaterial('battle-infected-halo', new Color3(0.16, 0.95, 0.86), new Color3(0.08, 1, 0.86), 0.24);
    this.trailMaterial = this.createMaterial('battle-infected-trail', new Color3(0.28, 0.82, 1), new Color3(0.22, 0.86, 1), 0.78);
    this.impactFlashMaterial = this.createMaterial('battle-infected-impact-flash', new Color3(1, 0.14, 0.48), new Color3(1, 0.04, 0.36), 0.78);
    this.impactRingMaterial = this.createMaterial('battle-infected-impact-ring', new Color3(0.36, 1, 0.7), new Color3(0.16, 1, 0.74), 0.82);
    // Keep the tiny body silhouettes pink instead of washing the whole swarm to white.
    this.bodyMaterial.alphaMode = Engine.ALPHA_COMBINE;

    this.bodyTemplate = MeshBuilder.CreateCapsule('battle-infected-body-template', { radius: 0.5, height: 1.8, tessellation: 6 }, scene);
    this.headTemplate = MeshBuilder.CreateSphere('battle-infected-head-template', { diameter: 1, segments: 8 }, scene);
    this.limbTemplate = MeshBuilder.CreateCapsule('battle-infected-limb-template', { radius: 0.5, height: 1.1, tessellation: 6 }, scene);
    this.haloTemplate = MeshBuilder.CreateSphere('battle-infected-halo-template', { diameter: 1, segments: 8 }, scene);
    this.trailTemplate = MeshBuilder.CreateCylinder('battle-infected-trail-template', { diameter: 1, height: 1, tessellation: 6 }, scene);
    this.impactFlashTemplate = MeshBuilder.CreateSphere('battle-infected-impact-flash-template', { diameter: 1, segments: 8 }, scene);
    this.impactRingTemplate = MeshBuilder.CreateTorus('battle-infected-impact-ring-template', { diameter: 1, thickness: 0.06, tessellation: 18 }, scene);

    this.bodyTemplate.material = this.bodyMaterial;
    this.headTemplate.material = this.headMaterial;
    this.limbTemplate.material = this.bodyMaterial;
    this.haloTemplate.material = this.haloMaterial;
    this.trailTemplate.material = this.trailMaterial;
    this.impactFlashTemplate.material = this.impactFlashMaterial;
    this.impactRingTemplate.material = this.impactRingMaterial;
    [this.bodyTemplate, this.headTemplate, this.limbTemplate, this.haloTemplate, this.trailTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => {
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      // Keep the source mesh alive for instances, but park it outside the camera.
      // Babylon instances inherit some source visibility state when the source is hidden.
      mesh.position.set(0, -1000, 0);
      mesh.visibility = 1;
    });
  }

  trigger(origin: Vector3): void {
    if (this.disposed) return;
    const waveId = this.nextWaveId++;
    const startCenter = origin.clone();
    startCenter.y += 0.7;
    const drops = Array.from({ length: DROP_COUNT }, (_, index) => this.createDrop(waveId, index, startCenter));
    const completeAt = Math.max(...drops.map((drop) => drop.delay + drop.duration)) + GROUND_IMPACT_DURATION;
    this.waves.push({ id: waveId, elapsed: 0, drops, impacts: [], completeAt });
    while (this.waves.length > MAX_ACTIVE_WAVES) this.disposeWave(this.waves.shift()!);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, deltaSeconds);
    for (let waveIndex = this.waves.length - 1; waveIndex >= 0; waveIndex -= 1) {
      const wave = this.waves[waveIndex];
      wave.elapsed += dt;
      for (const drop of wave.drops) this.updateDrop(wave, drop, dt);
      for (let impactIndex = wave.impacts.length - 1; impactIndex >= 0; impactIndex -= 1) {
        const impact = wave.impacts[impactIndex];
        impact.age += dt;
        const progress = Math.min(1, impact.age / impact.duration);
        const fade = Math.max(0, 1 - progress);
        impact.flash.position.copyFrom(impact.position);
        impact.flash.scaling.set(impact.baseScale * (0.65 + progress * 0.8), impact.baseScale * 0.16, impact.baseScale * (0.65 + progress * 0.8));
        impact.flash.visibility = fade * 0.75;
        impact.ring.position.copyFrom(impact.position);
        impact.ring.scaling.setAll(impact.baseScale * (0.35 + progress * 1.8));
        impact.ring.visibility = fade * 0.82;
        if (progress < 1) continue;
        impact.flash.dispose();
        impact.ring.dispose();
        wave.impacts.splice(impactIndex, 1);
      }
      if (wave.elapsed < wave.completeAt) continue;
      this.disposeWave(wave);
      this.waves.splice(waveIndex, 1);
    }
  }

  getSnapshot(): InfectedAssaultVfxSnapshot {
    let fallingCount = 0;
    let groundImpactCount = 0;
    let totalDrops = 0;
    for (const wave of this.waves) {
      totalDrops += wave.drops.length;
      groundImpactCount += wave.impacts.length;
      fallingCount += wave.drops.filter((drop) => !drop.landed && wave.elapsed >= drop.delay).length;
    }
    return { active: this.waves.length > 0, activeWaves: this.waves.length, fallingCount, groundImpactCount, totalDrops };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.waves.splice(0).forEach((wave) => this.disposeWave(wave));
    [this.bodyTemplate, this.headTemplate, this.limbTemplate, this.haloTemplate, this.trailTemplate, this.impactFlashTemplate, this.impactRingTemplate].forEach((mesh) => mesh.dispose());
    [this.bodyMaterial, this.headMaterial, this.haloMaterial, this.trailMaterial, this.impactFlashMaterial, this.impactRingMaterial].forEach((material) => material.dispose());
    this.root.dispose();
  }

  private createDrop(waveId: number, index: number, startCenter: Vector3): InfectedDrop {
    const seed = waveId * 1000 + index * 17;
    const startSpread = 3.2 + seededUnit(seed + 1) * 6.4;
    const targetSpread = 4 + seededUnit(seed + 2) * 17;
    const start = startCenter.clone();
    start.x += (seededUnit(seed + 3) - 0.5) * startSpread;
    start.z += (seededUnit(seed + 4) - 0.5) * 1.8;
    const target = new Vector3(
      startCenter.x + (seededUnit(seed + 5) - 0.5) * targetSpread,
      TARGET_GROUND_Y + 0.12,
      (seededUnit(seed + 6) - 0.5) * 1.8,
    );
    const body = this.bodyTemplate.createInstance(`battle-infected-${waveId}-body-${index}`);
    const head = this.headTemplate.createInstance(`battle-infected-${waveId}-head-${index}`);
    const arms = [
      this.limbTemplate.createInstance(`battle-infected-${waveId}-arm-left-${index}`),
      this.limbTemplate.createInstance(`battle-infected-${waveId}-arm-right-${index}`),
    ] as [AbstractMesh, AbstractMesh];
    const legs = [
      this.limbTemplate.createInstance(`battle-infected-${waveId}-leg-left-${index}`),
      this.limbTemplate.createInstance(`battle-infected-${waveId}-leg-right-${index}`),
    ] as [AbstractMesh, AbstractMesh];
    const halo = this.haloTemplate.createInstance(`battle-infected-${waveId}-halo-${index}`);
    const trail = this.trailTemplate.createInstance(`battle-infected-${waveId}-trail-${index}`);
    [body, head, ...arms, ...legs, halo, trail].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
      mesh.visibility = 0;
    });
    return {
      body,
      head,
      arms,
      legs,
      halo,
      trail,
      position: start.clone(),
      previousPosition: start.clone(),
      start,
      target,
      delay: seededUnit(seed + 7) * 0.62,
      duration: 1.42 + seededUnit(seed + 8) * 0.55,
      baseScale: 0.16 + seededUnit(seed + 9) * 0.1,
      phase: seededUnit(seed + 10) * Math.PI * 2,
      index,
      landed: false,
    };
  }

  private updateDrop(wave: InfectedDropWave, drop: InfectedDrop, deltaSeconds: number): void {
    if (drop.landed) return;
    if (wave.elapsed < drop.delay) {
      this.setDropVisible(drop, false);
      return;
    }
    const progress = Math.min(1, (wave.elapsed - drop.delay) / drop.duration);
    if (progress >= 1) {
      drop.landed = true;
      drop.position.copyFrom(drop.target);
      this.setDropVisible(drop, false);
      if (drop.index % 4 === 0) this.spawnImpact(wave, drop.target, drop.baseScale * 2.4);
      return;
    }
    drop.previousPosition.copyFrom(drop.position);
    const fall = Math.pow(progress, FALL_GRAVITY_EXPONENT);
    const sway = Math.sin(drop.phase + progress * 11) * (1 - progress) * 0.45;
    drop.position.x = drop.start.x + (drop.target.x - drop.start.x) * fall + sway;
    drop.position.y = drop.start.y + (drop.target.y - drop.start.y) * fall;
    drop.position.z = drop.start.z + (drop.target.z - drop.start.z) * fall + Math.cos(drop.phase + progress * 8) * 0.08;

    const bodyPulse = 0.88 + Math.sin(drop.phase + wave.elapsed * 13) * 0.12;
    drop.body.position.copyFrom(drop.position);
    drop.body.scaling.set(drop.baseScale * bodyPulse, drop.baseScale * 1.45 * bodyPulse, drop.baseScale);
    drop.body.rotation.z = Math.sin(drop.phase + progress * 15) * 0.2;
    drop.body.rotation.y = Math.cos(drop.phase + progress * 10) * 0.18;
    drop.head.position.copyFrom(drop.position).addInPlaceFromFloats(0, drop.baseScale * 1.2, 0);
    drop.head.scaling.setAll(drop.baseScale * 0.72 * bodyPulse);

    // Panic motion: each tiny body throws its limbs on a different rhythm while tumbling.
    const panicA = Math.sin(drop.phase + wave.elapsed * 22);
    const panicB = Math.sin(drop.phase * 1.37 + wave.elapsed * 29);
    const panicC = Math.cos(drop.phase * 0.83 + wave.elapsed * 17);
    const armOffset = drop.baseScale * 0.42;
    drop.arms[0].position.set(drop.position.x - armOffset + panicA * drop.baseScale * 0.13, drop.position.y + drop.baseScale * 0.26 + panicB * drop.baseScale * 0.12, drop.position.z);
    drop.arms[1].position.set(drop.position.x + armOffset - panicA * drop.baseScale * 0.13, drop.position.y + drop.baseScale * 0.26 - panicB * drop.baseScale * 0.12, drop.position.z);
    drop.arms[0].scaling.set(drop.baseScale * 0.18, drop.baseScale * 0.62, drop.baseScale * 0.18);
    drop.arms[1].scaling.set(drop.baseScale * 0.18, drop.baseScale * 0.62, drop.baseScale * 0.18);
    drop.arms[0].rotation.z = -0.9 + panicA * 1.35;
    drop.arms[1].rotation.z = 0.9 - panicA * 1.35;
    drop.arms[0].rotation.x = panicC * 0.7;
    drop.arms[1].rotation.x = -panicC * 0.7;
    const legOffset = drop.baseScale * 0.2;
    drop.legs[0].position.set(drop.position.x - legOffset, drop.position.y - drop.baseScale * 0.58, drop.position.z);
    drop.legs[1].position.set(drop.position.x + legOffset, drop.position.y - drop.baseScale * 0.58, drop.position.z);
    drop.legs[0].scaling.set(drop.baseScale * 0.2, drop.baseScale * 0.7, drop.baseScale * 0.2);
    drop.legs[1].scaling.set(drop.baseScale * 0.2, drop.baseScale * 0.7, drop.baseScale * 0.2);
    drop.legs[0].rotation.z = 0.55 + panicB * 1.15;
    drop.legs[1].rotation.z = -0.55 - panicB * 1.15;
    drop.legs[0].rotation.x = -panicC * 0.5;
    drop.legs[1].rotation.x = panicC * 0.5;
    drop.halo.position.copyFrom(drop.position);
    drop.halo.scaling.setAll(drop.baseScale * (1.9 + Math.sin(drop.phase + wave.elapsed * 9) * 0.25));
    drop.halo.visibility = 0.44 + Math.sin(drop.phase + wave.elapsed * 12) * 0.14;

    const tail = drop.position.clone();
    const travel = drop.position.subtract(drop.previousPosition);
    tail.y += Math.max(0.2, Math.min(1.05, travel.length() * 5.4 + deltaSeconds * 2));
    alignCylinder(drop.trail, tail, drop.position);
    drop.trail.scaling.x = drop.baseScale * 0.46;
    drop.trail.scaling.z = drop.baseScale * 0.46;
    drop.trail.visibility = 0.48 + (1 - progress) * 0.34;
    this.setDropVisible(drop, true);
  }

  private spawnImpact(wave: InfectedDropWave, position: Vector3, baseScale: number): void {
    const flash = this.impactFlashTemplate.createInstance(`battle-infected-impact-flash-${wave.id}-${wave.impacts.length}`);
    const ring = this.impactRingTemplate.createInstance(`battle-infected-impact-ring-${wave.id}-${wave.impacts.length}`);
    [flash, ring].forEach((mesh) => {
      mesh.parent = this.root;
      mesh.isPickable = false;
      mesh.renderingGroupId = 3;
    });
    wave.impacts.push({ flash, ring, position: position.clone(), age: 0, duration: GROUND_IMPACT_DURATION, baseScale });
    while (wave.impacts.length > MAX_GROUND_IMPACTS) {
      const expired = wave.impacts.shift();
      expired?.flash.dispose();
      expired?.ring.dispose();
    }
  }

  private setDropVisible(drop: InfectedDrop, visible: boolean): void {
    const value = visible ? 1 : 0;
    drop.body.visibility = value;
    drop.head.visibility = value;
    drop.arms.forEach((limb) => { limb.visibility = value; });
    drop.legs.forEach((limb) => { limb.visibility = value; });
    drop.trail.visibility = visible ? drop.trail.visibility : 0;
    drop.halo.visibility = visible ? drop.halo.visibility : 0;
  }

  private disposeWave(wave: InfectedDropWave): void {
    wave.drops.forEach((drop) => {
      drop.body.dispose();
      drop.head.dispose();
      drop.arms.forEach((limb) => limb.dispose());
      drop.legs.forEach((limb) => limb.dispose());
      drop.halo.dispose();
      drop.trail.dispose();
    });
    wave.impacts.forEach((impact) => {
      impact.flash.dispose();
      impact.ring.dispose();
    });
  }

  private createMaterial(name: string, diffuse: Color3, emissive: Color3, alpha: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
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
  mesh.position.copyFrom(start.add(end).scale(0.5));
  mesh.scaling.y = direction.length();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), new Quaternion());
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
