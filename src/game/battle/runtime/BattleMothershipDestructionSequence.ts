import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { createFlipbookPlane, disposeFlipbookPlane, setFlipbookFrame } from './battleFlipbookVfx';
import { alignCylinder } from './battleGeometryUtils';
import { BattleVfxMaterialFactory } from './BattleVfxMaterialFactory';
import { GROUND_ATTACK_TARGET_Y } from './battleVisualCoordinates';

export type BattleVfxQualityTier = 'LOW' | 'BALANCED' | 'HIGH';

export interface MothershipDestructionPose {
  position: Vector3;
  rotation: Vector3;
}

export type MothershipDestructionPhase = 'IDLE' | 'CASCADE' | 'FALLING' | 'IMPACT' | 'COMPLETE';

export interface MothershipDestructionVfxSnapshot {
  active: boolean;
  phase: MothershipDestructionPhase;
  elapsedSeconds: number;
  durationSeconds: number;
  altitude: number;
  fireCount: number;
  flameFallbackActive: boolean;
  triggeredExplosions: number;
  activeExplosions: number;
  smokeCount: number;
  debrisCount: number;
  impactTriggered: boolean;
}

interface ExplosionBurst {
  elapsed: number;
  duration: number;
  scale: number;
  core: Mesh;
  smoke: Mesh;
  ring: Mesh;
  sprite: Mesh;
}

interface SmokePuff {
  age: number;
  duration: number;
  mesh: Mesh;
  velocity: Vector3;
  baseSize: number;
  textured: boolean;
}

interface CrashDebris {
  mesh: Mesh;
  velocity: Vector3;
  rotationVelocity: Vector3;
}

interface MothershipDestructionVfxAssets {
  explosionTexture: Texture;
  flameTexture: Texture;
  smokeTexture: Texture;
  isExplosionReady: () => boolean;
  isFlameReady: () => boolean;
  isSmokeReady: () => boolean;
}

export const MOTHERSHIP_DESTRUCTION_TIMING = { impactSeconds: 4.35, durationSeconds: 5.8 } as const;
const IMPACT_TIME = MOTHERSHIP_DESTRUCTION_TIMING.impactSeconds;
const DESTRUCTION_DURATION = MOTHERSHIP_DESTRUCTION_TIMING.durationSeconds;
const IMPACT_ALTITUDE = GROUND_ATTACK_TARGET_Y + 7.4;
const IMPACT_GROUND_Y = GROUND_ATTACK_TARGET_Y + 0.65;
const SIDE_VIEW_VFX_FRONT_Z = -20;
const EXPLOSION_TIMES = [0, 0.26, 0.58, 0.94, 1.36, 1.82, 2.3, 2.82, 3.32, 3.78, 4.12];
const EXPLOSION_OFFSETS = [
  new Vector3(-5.8, 0.1, -2.2),
  new Vector3(4.7, 0.8, 2.9),
  new Vector3(-2.4, 1.6, 5.5),
  new Vector3(6.1, -0.4, -1.1),
  new Vector3(1.5, 1.2, -5.8),
  new Vector3(-6.4, -0.5, 1.8),
  new Vector3(3.8, 1.7, 4.4),
  new Vector3(-3.7, 0.5, -5.1),
  new Vector3(6.3, 0.3, 1.4),
  new Vector3(-1.1, 1.8, 3.2),
  new Vector3(2.2, -0.2, -4.9),
];

export class BattleMothershipDestructionSequence {
  private readonly flameOuter: Mesh;
  private readonly flameCore: Mesh;
  private readonly flameSprites: Mesh[];
  private readonly bursts: ExplosionBurst[] = [];
  private readonly smokePuffs: SmokePuff[] = [];
  private readonly debris: CrashDebris[] = [];
  private readonly fireMaterial: StandardMaterial;
  private readonly fireCoreMaterial: StandardMaterial;
  private readonly smokeMaterial: StandardMaterial;
  private readonly explosionMaterial: StandardMaterial;
  private readonly shockMaterial: StandardMaterial;
  private readonly debrisMaterial: StandardMaterial;
  private active = false;
  private elapsed = 0;
  private nextExplosionIndex = 0;
  private smokeAccumulator = 0;
  private impactTriggered = false;
  private initialPosition = Vector3.Zero();
  private initialRotation = Vector3.Zero();
  private pose: MothershipDestructionPose | null = null;
  private smokeBudget = 30;
  private disposed = false;
  private readonly materials: BattleVfxMaterialFactory;
  private readonly vfx: MothershipDestructionVfxAssets;
  private readonly assetReady = { explosion: false, flame: false, smoke: false };

  constructor(private readonly scene: Scene) {
    this.materials = new BattleVfxMaterialFactory(scene);
    const explosionTexture = this.loadTexture('explosion', '/assets/runtime/vfx/mothership-explosion-5x5.webp');
    const flameTexture = this.loadTexture('flame', '/assets/runtime/vfx/mothership-flame-16x4.webp');
    const smokeTexture = this.loadTexture('smoke', '/assets/runtime/vfx/mothership-smoke-8x8.webp');
    this.vfx = {
      explosionTexture,
      flameTexture,
      smokeTexture,
      isExplosionReady: () => this.assetReady.explosion,
      isFlameReady: () => this.assetReady.flame,
      isSmokeReady: () => this.assetReady.smoke,
    };
    this.fireMaterial = this.materials.create('mothership-destruction-fire-material', new Color3(1, 0.22, 0.025), new Color3(1, 0.08, 0.005));
    this.fireMaterial.alpha = 0.78;
    this.fireMaterial.alphaMode = Engine.ALPHA_ADD;
    this.fireCoreMaterial = this.materials.create('mothership-destruction-fire-core-material', new Color3(1, 0.9, 0.28), new Color3(1, 0.44, 0.02));
    this.fireCoreMaterial.alpha = 0.95;
    this.fireCoreMaterial.alphaMode = Engine.ALPHA_ADD;
    this.smokeMaterial = this.materials.create('mothership-destruction-smoke-material', new Color3(0.15, 0.16, 0.17), new Color3(0.025, 0.026, 0.028));
    this.smokeMaterial.alpha = 0.66;
    this.smokeMaterial.backFaceCulling = false;
    this.explosionMaterial = this.materials.create('mothership-destruction-explosion-material', new Color3(1, 0.42, 0.06), new Color3(1, 0.12, 0.005));
    this.explosionMaterial.alpha = 0.95;
    this.shockMaterial = this.materials.create('mothership-destruction-shock-material', new Color3(1, 0.72, 0.18), new Color3(1, 0.25, 0.015));
    this.shockMaterial.alpha = 0.82;
    this.debrisMaterial = this.materials.create('mothership-destruction-debris-material', new Color3(0.42, 0.14, 0.045), new Color3(0.82, 0.12, 0.008));
    this.flameOuter = MeshBuilder.CreateCylinder('mothership-destruction-flame', { diameter: 2.8, height: 1, tessellation: 12 }, this.scene);
    this.flameOuter.material = this.fireMaterial;
    this.configureMesh(this.flameOuter);
    this.flameOuter.isVisible = false;
    this.flameCore = MeshBuilder.CreateCylinder('mothership-destruction-flame-core', { diameter: 1.25, height: 1, tessellation: 10 }, this.scene);
    this.flameCore.material = this.fireCoreMaterial;
    this.configureMesh(this.flameCore);
    this.flameCore.isVisible = false;
    this.flameSprites = Array.from({ length: 3 }, (_, index) => {
      const sprite = createFlipbookPlane(this.materials, {
        name: `mothership-destruction-flame-flipbook-${index}`,
        texture: this.vfx.flameTexture,
        columns: 16,
        rows: 4,
        blendMode: 'ALPHA',
      });
      sprite.isVisible = false;
      return sprite;
    });
  }

  start(initialPose: MothershipDestructionPose): void {
    if (this.active || this.disposed) return;
    this.active = true;
    this.elapsed = 0;
    this.nextExplosionIndex = 0;
    this.smokeAccumulator = 0;
    this.impactTriggered = false;
    this.initialPosition.copyFrom(initialPose.position);
    this.initialRotation.copyFrom(initialPose.rotation);
    this.pose = this.calculatePose(0);
  }

  sync(dt: number): MothershipDestructionPose | null {
    if (!this.active || this.disposed) return null;
    this.elapsed = Math.min(DESTRUCTION_DURATION, this.elapsed + dt);
    this.pose = this.calculatePose(this.elapsed);
    while (this.nextExplosionIndex < EXPLOSION_TIMES.length && EXPLOSION_TIMES[this.nextExplosionIndex] <= this.elapsed) {
      const offset = EXPLOSION_OFFSETS[this.nextExplosionIndex] ?? Vector3.Zero();
      this.createExplosion(this.effectPosition(this.pose, offset), 1 + (this.nextExplosionIndex % 3) * 0.18);
      this.nextExplosionIndex += 1;
    }
    if (this.elapsed < IMPACT_TIME) {
      this.updateFlameTrail(this.pose, this.elapsed);
      this.spawnSmokeTrail(dt, this.pose);
    } else {
      this.flameOuter.isVisible = false;
      this.flameCore.isVisible = false;
      this.flameSprites.forEach((sprite) => { sprite.isVisible = false; });
      if (!this.impactTriggered) this.triggerGroundImpact(this.pose);
    }
    this.updateBursts(dt);
    this.updateSmoke(dt);
    this.updateDebris(dt);
    return this.pose;
  }

  setQuality(tier: BattleVfxQualityTier): void {
    this.smokeBudget = tier === 'LOW' ? 16 : tier === 'BALANCED' ? 23 : 30;
    while (this.smokePuffs.length > this.smokeBudget) this.disposeSmokePuff(this.smokePuffs.shift()!);
  }

  isComplete(): boolean {
    return this.active && this.elapsed >= DESTRUCTION_DURATION;
  }

  getSnapshot(): MothershipDestructionVfxSnapshot {
    const flameVisible = this.active && this.elapsed < IMPACT_TIME;
    const flameReady = this.vfx.isFlameReady();
    return {
      active: this.active,
      phase: this.phase(),
      elapsedSeconds: Number(this.elapsed.toFixed(3)),
      durationSeconds: DESTRUCTION_DURATION,
      altitude: Number((this.pose?.position.y ?? this.initialPosition.y).toFixed(2)),
      fireCount: flameVisible ? flameReady ? this.flameSprites.length : 2 : 0,
      flameFallbackActive: flameVisible && !flameReady,
      triggeredExplosions: this.nextExplosionIndex + (this.impactTriggered ? 3 : 0),
      activeExplosions: this.bursts.length,
      smokeCount: this.smokePuffs.length,
      debrisCount: this.debris.length,
      impactTriggered: this.impactTriggered,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flameOuter.dispose();
    this.flameCore.dispose();
    this.flameSprites.forEach(disposeFlipbookPlane);
    this.bursts.splice(0).forEach((burst) => this.disposeBurst(burst));
    this.smokePuffs.splice(0).forEach((puff) => this.disposeSmokePuff(puff));
    this.debris.splice(0).forEach((piece) => piece.mesh.dispose());
    [this.fireMaterial, this.fireCoreMaterial, this.smokeMaterial, this.explosionMaterial, this.shockMaterial, this.debrisMaterial].forEach((material) => material.dispose());
    [this.vfx.explosionTexture, this.vfx.flameTexture, this.vfx.smokeTexture].forEach((texture) => texture.dispose());
  }

  private calculatePose(elapsed: number): MothershipDestructionPose {
    const fallProgress = Math.max(0, Math.min(1, (elapsed - 0.22) / (IMPACT_TIME - 0.22)));
    const fallEase = Math.pow(fallProgress, 1.5);
    const shudder = elapsed < 0.75 ? Math.sin(elapsed * 44) * (1 - elapsed / 0.75) : 0;
    return {
      position: new Vector3(
        this.initialPosition.x + fallProgress * 10.5 + shudder * 0.22,
        this.initialPosition.y - (this.initialPosition.y - IMPACT_ALTITUDE) * fallEase,
        this.initialPosition.z - fallProgress * 7.5 + shudder * 0.16,
      ),
      rotation: new Vector3(
        this.initialRotation.x + fallProgress * 0.38 + shudder * 0.015,
        this.initialRotation.y + fallProgress * 2.65,
        this.initialRotation.z - fallProgress * 0.88 + shudder * 0.024,
      ),
    };
  }

  private updateFlameTrail(pose: MothershipDestructionPose, seconds: number): void {
    const direction = new Vector3(-0.38, 1, 0.28).normalize();
    const originalLocalOffset = new Vector3(-2.3, 0.3, 1.7);
    const origin = new Vector3(
      pose.position.x + originalLocalOffset.x,
      pose.position.y + originalLocalOffset.y,
      pose.position.z + SIDE_VIEW_VFX_FRONT_Z + originalLocalOffset.z * 0.08,
    );
    if (this.vfx.isFlameReady()) {
      this.flameOuter.isVisible = false;
      this.flameCore.isVisible = false;
      this.flameSprites.forEach((sprite, index) => {
        const trailDistance = index * 2.45;
        const flicker = 1 + Math.sin(seconds * (25 + index * 3) + index * 1.7) * 0.12;
        sprite.position = origin.add(direction.scale(trailDistance));
        sprite.scaling.x = (3.3 - index * 0.42) * flicker;
        sprite.scaling.y = (5.8 - index * 0.72) * flicker;
        sprite.scaling.z = 1;
        sprite.isVisible = true;
        sprite.visibility = 0.96 - index * 0.17;
        setFlipbookFrame(sprite, 16, 4, seconds + index * 0.37, 24, true);
      });
      return;
    }
    this.flameSprites.forEach((sprite) => { sprite.isVisible = false; });
    const flicker = 1 + Math.sin(seconds * 29) * 0.13;
    const outerEnd = origin.add(direction.scale(9.5 * flicker));
    const coreEnd = origin.add(direction.scale(6.2 * (1 + Math.sin(seconds * 37) * 0.1)));
    alignCylinder(this.flameOuter, origin, outerEnd);
    alignCylinder(this.flameCore, origin, coreEnd);
    this.flameOuter.isVisible = true;
    this.flameCore.isVisible = true;
    this.flameOuter.visibility = 0.72 + Math.sin(seconds * 23) * 0.18;
    this.flameCore.visibility = 0.88;
  }

  private spawnSmokeTrail(dt: number, pose: MothershipDestructionPose): void {
    this.smokeAccumulator += dt;
    const interval = this.smokeBudget <= 16 ? 0.21 : this.smokeBudget <= 23 ? 0.16 : 0.12;
    while (this.smokeAccumulator >= interval) {
      this.smokeAccumulator -= interval;
      const index = this.smokePuffs.length + Math.floor(this.elapsed * 10);
      const seed = seededUnit(index * 29 + 7);
      const baseSize = 2 + seed * 2.2;
      const textured = this.vfx.isSmokeReady();
      const mesh = textured
        ? createFlipbookPlane(this.materials, {
            name: 'mothership-destruction-smoke-flipbook',
            texture: this.vfx.smokeTexture,
            columns: 8,
            rows: 8,
            tint: new Color3(0.2, 0.2, 0.205),
            blendMode: 'ALPHA',
          })
        : MeshBuilder.CreateSphere('mothership-destruction-smoke-puff', { diameter: baseSize, segments: 8 }, this.scene);
      mesh.position.set(
        pose.position.x - 3 + (seed - 0.5) * 1.6,
        pose.position.y + 4.5 + seed * 2.4,
        pose.position.z + SIDE_VIEW_VFX_FRONT_Z + (seededUnit(index * 43) - 0.5) * 0.3,
      );
      if (!textured) mesh.material = this.smokeMaterial;
      this.configureMesh(mesh);
      this.smokePuffs.push({ age: 0, duration: 2.2 + seed * 0.8, mesh, velocity: new Vector3(-0.7 + seed * 0.5, 2.1 + seed, 0.12), baseSize, textured });
      while (this.smokePuffs.length > this.smokeBudget) this.disposeSmokePuff(this.smokePuffs.shift()!);
    }
  }

  private createExplosion(position: Vector3, scale: number): void {
    const core = MeshBuilder.CreateSphere('mothership-destruction-burst', { diameter: 2.1, segments: 12 }, this.scene);
    core.position = position;
    core.material = this.explosionMaterial;
    this.configureMesh(core);
    const smoke = MeshBuilder.CreateSphere('mothership-destruction-burst-smoke', { diameter: 2.6, segments: 9 }, this.scene);
    smoke.position = position.add(new Vector3(0, 0.4, 0));
    smoke.material = this.smokeMaterial;
    this.configureMesh(smoke);
    const ring = MeshBuilder.CreateTorus('mothership-destruction-burst-ring', { diameter: 2.4, thickness: 0.18, tessellation: 28 }, this.scene);
    ring.position = position;
    ring.material = this.shockMaterial;
    this.configureMesh(ring);
    const sprite = createFlipbookPlane(this.materials, {
      name: 'mothership-destruction-burst-flipbook',
      texture: this.vfx.explosionTexture,
      columns: 5,
      rows: 5,
      blendMode: 'ALPHA',
    });
    sprite.position = position.add(new Vector3(0, 0.35, -0.2));
    sprite.isVisible = this.vfx.isExplosionReady();
    this.bursts.push({ elapsed: 0, duration: 0.9, scale, core, smoke, ring, sprite });
  }

  private triggerGroundImpact(pose: MothershipDestructionPose): void {
    this.impactTriggered = true;
    const impact = new Vector3(pose.position.x, IMPACT_GROUND_Y, pose.position.z + SIDE_VIEW_VFX_FRONT_Z);
    this.createExplosion(impact, 3.4);
    this.createExplosion(impact.add(new Vector3(3.2, 0.8, -0.2)), 2.1);
    this.createExplosion(impact.add(new Vector3(-2.8, 1.1, 0.2)), 1.8);
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      const speed = 5.5 + seededUnit(index * 31 + 9) * 7;
      const size = 0.3 + seededUnit(index * 17 + 3) * 0.55;
      const mesh = MeshBuilder.CreateBox(`mothership-crash-debris-${index}`, { width: size * 1.6, height: size * 0.7, depth: size }, this.scene);
      mesh.position = impact.add(new Vector3(Math.cos(angle) * 1.6, 0.7, Math.sin(angle) * 0.25));
      mesh.material = this.debrisMaterial;
      this.configureMesh(mesh);
      this.debris.push({
        mesh,
        velocity: new Vector3(Math.cos(angle) * speed, 5 + seededUnit(index * 41) * 6.5, Math.sin(angle) * speed * 0.2),
        rotationVelocity: new Vector3(4 + index % 3, 7 - index % 4, 5 + index % 5),
      });
    }
  }

  private updateBursts(dt: number): void {
    const externalReady = this.vfx.isExplosionReady();
    for (const burst of this.bursts) {
      burst.elapsed += dt;
      const progress = Math.min(1, burst.elapsed / burst.duration);
      const flash = Math.max(0, 1 - progress * 1.45);
      setFlipbookFrame(burst.sprite, 5, 5, burst.elapsed, 27);
      burst.sprite.isVisible = externalReady;
      burst.sprite.scaling.setAll(burst.scale * (3.2 + Math.sin(progress * Math.PI / 2) * 2.9));
      burst.sprite.visibility = Math.max(0, 1 - Math.max(0, progress - 0.82) / 0.18);
      burst.core.scaling.setAll(burst.scale * (0.6 + Math.sin(Math.min(1, progress * 2) * Math.PI / 2) * 2.4));
      burst.core.visibility = externalReady ? 0 : flash;
      burst.ring.scaling.setAll(burst.scale * (0.45 + progress * 3.4));
      burst.ring.visibility = Math.max(0, 1 - progress * 1.2);
      burst.smoke.position.y += dt * 1.3;
      burst.smoke.scaling.setAll(burst.scale * (0.7 + progress * 1.8));
      burst.smoke.visibility = externalReady ? 0 : Math.max(0, 0.82 - progress * 0.68);
    }
    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      if (this.bursts[index].elapsed < this.bursts[index].duration) continue;
      this.disposeBurst(this.bursts[index]);
      this.bursts.splice(index, 1);
    }
  }

  private updateSmoke(dt: number): void {
    for (const puff of this.smokePuffs) {
      puff.age += dt;
      puff.mesh.position.addInPlace(puff.velocity.scale(dt));
      const progress = Math.min(1, puff.age / puff.duration);
      if (puff.textured) {
        setFlipbookFrame(puff.mesh, 8, 8, puff.age, 64 / puff.duration);
        const scale = puff.baseSize * (0.75 + progress * 1.6);
        puff.mesh.scaling.set(scale, scale, 1);
      } else {
        puff.mesh.scaling.setAll(1 + progress * 2.4);
      }
      puff.mesh.visibility = Math.max(0, 0.72 - progress * 0.68);
    }
    for (let index = this.smokePuffs.length - 1; index >= 0; index -= 1) {
      if (this.smokePuffs[index].age < this.smokePuffs[index].duration) continue;
      this.disposeSmokePuff(this.smokePuffs[index]);
      this.smokePuffs.splice(index, 1);
    }
  }

  private updateDebris(dt: number): void {
    for (const piece of this.debris) {
      piece.velocity.y -= 13 * dt;
      piece.mesh.position.addInPlace(piece.velocity.scale(dt));
      piece.mesh.rotation.x += piece.rotationVelocity.x * dt;
      piece.mesh.rotation.y += piece.rotationVelocity.y * dt;
      piece.mesh.rotation.z += piece.rotationVelocity.z * dt;
      if (piece.mesh.position.y < IMPACT_GROUND_Y) {
        piece.mesh.position.y = IMPACT_GROUND_Y;
        piece.velocity.scaleInPlace(0.38);
        piece.velocity.y = Math.abs(piece.velocity.y) * 0.22;
      }
    }
  }

  private phase(): MothershipDestructionPhase {
    if (!this.active) return 'IDLE';
    if (this.elapsed >= DESTRUCTION_DURATION) return 'COMPLETE';
    if (this.elapsed >= IMPACT_TIME) return 'IMPACT';
    return this.elapsed < 0.82 ? 'CASCADE' : 'FALLING';
  }

  private effectPosition(pose: MothershipDestructionPose, offset: Vector3): Vector3 {
    return new Vector3(
      pose.position.x + offset.x * 1.35,
      pose.position.y + offset.y * 1.35,
      pose.position.z + SIDE_VIEW_VFX_FRONT_Z + offset.z * 0.08,
    );
  }

  private configureMesh(mesh: Mesh): void {
    mesh.isPickable = false;
    mesh.renderingGroupId = 3;
  }

  private loadTexture(key: keyof typeof this.assetReady, url: string): Texture {
    const texture = new Texture(
      url,
      this.scene,
      true,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => { this.assetReady[key] = true; },
      () => { this.assetReady[key] = false; },
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    return texture;
  }

  private disposeBurst(burst: ExplosionBurst): void {
    burst.core.dispose();
    burst.smoke.dispose();
    burst.ring.dispose();
    disposeFlipbookPlane(burst.sprite);
  }

  private disposeSmokePuff(puff: SmokePuff): void {
    if (puff.textured) disposeFlipbookPlane(puff.mesh);
    else puff.mesh.dispose();
  }
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
