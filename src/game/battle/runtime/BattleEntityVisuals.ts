import { Color3, Engine, Material, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, Control, Rectangle, TextBlock } from '@babylonjs/gui';
import { BALANCE } from '../../domain/balance';
import { fighterCombatCenter, fighterKeepOutMetric } from '../../domain/combatRules';
import type { CombatState, EnemyState, FacilityKind } from '../../domain/types';
import { GROUND_ENTITY_ROOT_Y, GROUND_SAM_ATTACK_SPAWN_LOCAL, GROUND_SAM_BODY_HEIGHT, GROUND_SAM_BODY_LOCAL_Y, GROUND_SAM_HEALTH_BAR_LOCAL_Y, GROUND_SAM_ROOT_Y } from './battleVisualCoordinates';

const FIGHTER_SPRITE_URL = '/assets/runtime/sprites/fighter-side-4way.webp';
const GROUND_SAM_SPRITE_URL = '/assets/runtime/sprites/ground-sam-mobile-side-elevated.png';
const FIGHTER_ATLAS_COLUMNS = 4;
const FIGHTER_ATLAS_ROWS = 1;
// Temporary finalization: the fighter atlas already contains engine flames.
// Keep all additional exhaust planes, trail segments, and smoke disabled until
// a texture-based exhaust tail is redesigned.
const FIGHTER_AUXILIARY_EXHAUST_ENABLED = false;
const FIGHTER_NOZZLE_OFFSET = 1.15;
const FIGHTER_TRAIL_WIDTH = 0.2;
const FIGHTER_TRAIL_LIFETIME = 0.36;
const FIGHTER_TRAIL_SPAWN_DISTANCE = 0.06;
const FIGHTER_TRAIL_BREAK_DISTANCE = 3.5;
const FIGHTER_TRAIL_MAX_SEGMENTS = 9;
const FIGHTER_SMOKE_INTERVAL = 0.14;
const FIGHTER_SMOKE_LIFETIME = 0.55;
const FIGHTER_SMOKE_MAX_PER_FIGHTER = 4;
const FIGHTER_SMOKE_MAX_TOTAL = 60;
const FIGHTER_HIT_FLASH_DURATION = 0.14;
const FIGHTER_EXPLOSION_DURATION = 0.62;
const FIGHTER_EXPLOSION_FRAMES = [1, 5, 8, 9, 10, 11];
const GROUND_HIT_FLASH_DURATION = 0.18;

type GroundSpriteKey = 'DEFENDER' | 'RADAR' | 'AIRBASE' | 'POWER';
export type GroundUnitGroup = GroundSpriteKey | 'SAM';

const GROUND_SPRITE_URLS: Record<GroundSpriteKey, string> = {
  DEFENDER: '/assets/runtime/sprites/ground-defender-mobile-side.png',
  RADAR: '/assets/runtime/sprites/ground-radar-facility-side.png',
  AIRBASE: '/assets/runtime/sprites/ground-airbase-facility-side.png',
  POWER: '/assets/runtime/sprites/ground-power-facility-side.png',
};

// Width/height are derived from the trimmed source PNGs. Every sprite's bottom
// pixel is its gameplay footline, so the body sits directly on the ground lane.
const GROUND_SPRITE_DIMENSIONS: Record<GroundSpriteKey, { width: number; height: number }> = {
  DEFENDER: { width: 7.2, height: 7.77 },
  RADAR: { width: 7.2, height: 7.17 },
  AIRBASE: { width: 7.2, height: 5.71 },
  POWER: { width: 7.2, height: 4.78 },
};

interface FighterVisual {
  id: string;
  root: TransformNode;
  sprite: Mesh;
  fallback: Mesh;
  material: StandardMaterial;
  texture: Texture;
  nozzle: TransformNode;
  trailSegments: FighterTrailSegment[];
  trailLastPosition: Vector3 | null;
  jetFlame: Mesh;
  jetCore: Mesh;
  hitFlash: Mesh;
  smokePuffs: FighterSmokePuff[];
  previousHealth: number;
  hitElapsed: number;
  smokeAccumulator: number;
  trailActive: boolean;
  relativeDistance3D: number;
  keepOutMetric: number;
  keepOutCorrected: boolean;
  behindMothership: boolean;
  occluded: boolean;
  flightMode: EnemyState['flightMode'];
}

interface FighterSmokePuff {
  mesh: Mesh;
  age: number;
}

interface FighterTrailSegment {
  mesh: Mesh;
  age: number;
  baseWidth: number;
}

interface FighterExplosion {
  sprite: Mesh;
  core: Mesh;
  ring: Mesh;
  material: StandardMaterial;
  texture: Texture;
  elapsed: number;
  scale: number;
}

interface GroundVisual {
  id: string;
  kind: 'DEFENDER' | 'FACILITY';
  group: GroundUnitGroup;
  root: TransformNode;
  body: Mesh;
  bodyBaseScaleX: number;
  healthFill: Mesh;
  healthTrack: Mesh;
  maximumHealth: number;
  isSam: boolean;
  isDirectional: boolean;
  spriteKey: GroundSpriteKey | null;
  attackSpawn?: TransformNode;
  destroyed: boolean;
  labelAnchor?: Mesh;
  labelPanel?: Rectangle;
  hitFlash: Mesh;
  previousHealth: number;
  hitElapsed: number;
}

export interface BattleEntityVisualSnapshot {
  fighters: Array<{ id: string; x: number; y: number; z: number; bank: number; pitch: number; relativeDistance3D: number; keepOutMetric: number; keepOutCorrected: boolean; flightMode: EnemyState['flightMode']; behindMothership: boolean; occluded: boolean; trailVisible: boolean; smokePuffCount: number }>;
  ground: Array<{ id: string; kind: 'DEFENDER' | 'FACILITY'; group: GroundUnitGroup; x: number; y: number; z: number; destroyed: boolean }>;
}

export class BattleEntityVisuals {
  private readonly fighterVisuals = new Map<string, FighterVisual>();
  private readonly groundVisuals = new Map<string, GroundVisual>();
  private readonly groundPositionOverrides = new Map<GroundUnitGroup, number>();
  private readonly root: TransformNode;
  private readonly fighterVisualRoot: TransformNode;
  private readonly groundVisualRoot: TransformNode;
  private readonly fighterFallbackMaterial: StandardMaterial;
  private readonly fighterTrailMaterial: StandardMaterial;
  private readonly fighterCoreTrailMaterial: StandardMaterial;
  private readonly fighterSmokeMaterial: StandardMaterial;
  private readonly fighterHitMaterial: StandardMaterial;
  private readonly fighterExplosionMaterial: StandardMaterial;
  private readonly fighterExplosionTexture: Texture;
  private readonly fighterSmokeTexture: Texture;
  private readonly healthTrackMaterial: StandardMaterial;
  private readonly healthFillMaterial: StandardMaterial;
  private readonly samTexture: Texture;
  private readonly samMaterial: StandardMaterial;
  private readonly groundSpriteTextures = new Map<GroundSpriteKey, Texture>();
  private readonly groundSpriteMaterials = new Map<GroundSpriteKey, StandardMaterial>();
  private readonly groundLabelUi: AdvancedDynamicTexture;
  private readonly fighterExplosions: FighterExplosion[] = [];

  constructor(private readonly scene: Scene, fighterRoot: TransformNode, groundRoot: TransformNode, private readonly mothershipRoot: TransformNode) {
    this.root = new TransformNode('BattleEntityVisualsRoot', scene);
    this.fighterVisualRoot = new TransformNode('BattleEnemyVisualsRoot', scene);
    this.fighterVisualRoot.parent = fighterRoot;
    this.groundVisualRoot = new TransformNode('BattleGroundEntityVisualsRoot', scene);
    this.groundVisualRoot.parent = groundRoot;
    this.fighterFallbackMaterial = this.material('battle-entity-fighter-fallback', new Color3(0.98, 0.34, 0.16));
    this.fighterTrailMaterial = this.material('battle-fighter-trail', new Color3(1, 0.3, 0.06));
    this.fighterTrailMaterial.alpha = 0.55;
    this.fighterTrailMaterial.disableDepthWrite = true;
    this.fighterCoreTrailMaterial = this.material('battle-fighter-core-trail', new Color3(1, 0.86, 0.24));
    this.fighterCoreTrailMaterial.alpha = 0.95;
    this.fighterCoreTrailMaterial.alphaMode = Engine.ALPHA_ADD;
    this.fighterCoreTrailMaterial.disableDepthWrite = true;
    this.fighterSmokeTexture = new Texture('/assets/runtime/vfx/mothership-smoke-8x8.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.fighterSmokeTexture.hasAlpha = true;
    this.fighterSmokeTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.fighterSmokeTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    setAtlasFrame(this.fighterSmokeTexture, 8, 8, 10);
    this.fighterSmokeMaterial = new StandardMaterial('battle-fighter-smoke', scene);
    this.fighterSmokeMaterial.diffuseColor = new Color3(0.64, 0.69, 0.7);
    this.fighterSmokeMaterial.emissiveColor = new Color3(0.08, 0.09, 0.1);
    this.fighterSmokeMaterial.disableLighting = true;
    this.fighterSmokeMaterial.backFaceCulling = false;
    this.fighterSmokeMaterial.useAlphaFromDiffuseTexture = true;
    this.fighterSmokeMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;
    this.fighterSmokeMaterial.alpha = 0.48;
    this.fighterSmokeMaterial.disableDepthWrite = true;
    this.fighterSmokeMaterial.diffuseTexture = this.fighterSmokeTexture;
    this.fighterHitMaterial = this.material('battle-fighter-hit', new Color3(1, 0.92, 0.64));
    this.fighterExplosionMaterial = this.material('battle-fighter-explosion', new Color3(1, 0.45, 0.08));
    this.fighterExplosionMaterial.alphaMode = Engine.ALPHA_ADD;
    this.fighterExplosionTexture = new Texture('/assets/runtime/vfx/vfx-atlas.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.fighterExplosionTexture.hasAlpha = true;
    this.healthTrackMaterial = this.material('battle-entity-health-track', new Color3(0.14, 0.16, 0.18));
    this.healthFillMaterial = this.material('battle-entity-health-fill', new Color3(0.36, 1, 0.64));
    this.groundLabelUi = AdvancedDynamicTexture.CreateFullscreenUI('BattleGroundLabelsUi', true, scene);
    this.samTexture = new Texture(GROUND_SAM_SPRITE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.samTexture.hasAlpha = true;
    this.samTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.samTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.samMaterial = new StandardMaterial('battle-entity-sam', scene);
    this.samMaterial.diffuseColor = Color3.White();
    this.samMaterial.emissiveColor = Color3.White();
    this.samMaterial.disableLighting = true;
    this.samMaterial.backFaceCulling = false;
    this.samMaterial.useAlphaFromDiffuseTexture = true;
    this.samMaterial.transparencyMode = Engine.ALPHA_COMBINE;
    this.samMaterial.diffuseTexture = this.samTexture;
    this.samMaterial.emissiveTexture = this.samTexture;
  }

  sync(state: Readonly<CombatState>, dt = 0): void {
    this.updateFighterEffects(dt);
    const activeFighterIds = new Set<string>();
    for (const enemy of state.enemies) {
      if (enemy.health <= 0) continue;
      activeFighterIds.add(enemy.id);
      const visual = this.fighterVisuals.get(enemy.id) ?? this.createFighter(enemy, this.fighterVisualRoot);
      if (enemy.health < visual.previousHealth - 0.001) visual.hitElapsed = FIGHTER_HIT_FLASH_DURATION;
      visual.previousHealth = enemy.health;
      this.syncFighter(visual, enemy, state, dt);
    }
    for (const [id, visual] of this.fighterVisuals) {
      if (activeFighterIds.has(id)) continue;
      this.createFighterExplosion(visual.root.getAbsolutePosition().clone());
      this.disposeFighter(visual);
      this.fighterVisuals.delete(id);
    }

    const activeGroundIds = new Set<string>();
    for (const defender of state.groundDefenders) {
      const id = `defender:${defender.id}`;
      activeGroundIds.add(id);
      const visual = this.groundVisuals.get(id) ?? this.createGround(id, 'DEFENDER', this.groundVisualRoot, Math.max(1, defender.health));
      this.syncGround(visual, defender.position.x, state.mothership.position.x, defender.health, defender.health <= 0, defender.disabledUntil > state.elapsedSeconds);
    }
    for (const facility of state.facilities) {
      const id = `facility:${facility.id}`;
      activeGroundIds.add(id);
      const visual = this.groundVisuals.get(id) ?? this.createGround(id, 'FACILITY', this.groundVisualRoot, facility.maxHealth, facility.kind);
      this.syncGround(visual, facility.position.x, state.mothership.position.x, facility.health, facility.destroyed, facility.disabledUntil > state.elapsedSeconds);
    }
    for (const [id, visual] of this.groundVisuals) {
      if (activeGroundIds.has(id)) continue;
      visual.labelPanel?.dispose();
      visual.labelAnchor?.dispose(false, true);
      visual.root.dispose(false, true);
      this.groundVisuals.delete(id);
    }
  }

  getSnapshot(): BattleEntityVisualSnapshot {
    return {
      fighters: [...this.fighterVisuals.values()].map((visual) => ({
        id: visual.id,
        x: round(visual.root.position.x),
        y: round(visual.root.position.y),
        z: round(visual.root.position.z),
        bank: round(-visual.sprite.rotation.z),
        pitch: round(-visual.fallback.rotation.x),
        relativeDistance3D: round(visual.relativeDistance3D),
        keepOutMetric: round(visual.keepOutMetric),
        keepOutCorrected: visual.keepOutCorrected,
        flightMode: visual.flightMode,
        behindMothership: visual.behindMothership,
        occluded: visual.occluded,
        trailVisible: visual.trailActive,
        smokePuffCount: visual.smokePuffs.length,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      ground: [...this.groundVisuals.values()].map((visual) => ({
        id: visual.id.replace(/^(defender|facility):/, ''),
        kind: visual.kind,
        group: visual.group,
        x: round(visual.root.position.x),
        y: round(visual.root.position.y),
        z: round(visual.root.position.z),
        destroyed: visual.destroyed,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  setGroundUnitGroupPosition(group: GroundUnitGroup, y: number): void {
    this.groundPositionOverrides.set(group, y);
    for (const visual of this.groundVisuals.values()) {
      if (visual.group === group) this.applyGroundPosition(visual, visual.root.position.x, y);
    }
  }

  resetGroundUnitPositions(): void {
    this.groundPositionOverrides.clear();
  }

  getGroundAttackSpawnPosition(facilityId: string): Vector3 | null {
    const visual = this.groundVisuals.get(`facility:${facilityId}`);
    if (!visual?.isSam || !visual.attackSpawn) return null;
    visual.attackSpawn.computeWorldMatrix(true);
    return visual.attackSpawn.getAbsolutePosition().clone();
  }

  getFighterMuzzlePosition(fighterId: string): Vector3 | null {
    const visual = this.fighterVisuals.get(fighterId);
    if (!visual) return null;
    visual.nozzle.computeWorldMatrix(true);
    return visual.nozzle.getAbsolutePosition().clone();
  }

  dispose(): void {
    this.fighterVisuals.forEach((visual) => this.disposeFighter(visual));
    this.fighterVisuals.clear();
    this.groundVisuals.forEach((visual) => {
      visual.labelPanel?.dispose();
      visual.labelAnchor?.dispose(false, true);
      visual.root.dispose(false, true);
    });
    this.groundVisuals.clear();
    this.groundPositionOverrides.clear();
    this.groundLabelUi.dispose();
    this.groundSpriteMaterials.forEach((material) => material.dispose());
    this.groundSpriteTextures.forEach((texture) => texture.dispose());
    this.groundSpriteMaterials.clear();
    this.groundSpriteTextures.clear();
    this.fighterExplosions.splice(0).forEach((effect) => this.disposeFighterExplosion(effect));
    [this.fighterFallbackMaterial, this.fighterTrailMaterial, this.fighterCoreTrailMaterial, this.fighterSmokeMaterial, this.fighterHitMaterial, this.fighterExplosionMaterial, this.healthTrackMaterial, this.healthFillMaterial, this.samMaterial].forEach((material) => material.dispose());
    this.fighterSmokeTexture.dispose();
    this.samTexture.dispose();
    this.fighterExplosionTexture.dispose();
    this.fighterVisualRoot.dispose(false, true);
    this.groundVisualRoot.dispose(false, true);
    this.root.dispose(false, true);
  }

  private createFighter(enemy: EnemyState, parent: TransformNode): FighterVisual {
    const root = new TransformNode(`battle-enemy-${enemy.id}`, this.scene);
    root.parent = parent;
    const sprite = MeshBuilder.CreatePlane(`${root.name}-sprite`, { size: 5.4 }, this.scene);
    sprite.parent = root;
    sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sprite.isPickable = false;
    sprite.renderingGroupId = 3;
    const texture = new Texture(FIGHTER_SPRITE_URL, this.scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    texture.hasAlpha = true;
    const material = new StandardMaterial(`${root.name}-material`, this.scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = new Color3(0.26, 0.34, 0.42);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
    material.alphaCutOff = 0.08;
    material.needDepthPrePass = true;
    material.forceDepthWrite = true;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    sprite.material = material;
    const fallback = MeshBuilder.CreatePolyhedron(`${root.name}-fallback`, { type: 1, size: 1.7 }, this.scene);
    fallback.parent = root;
    fallback.material = this.fighterFallbackMaterial;
    fallback.isPickable = false;
    fallback.renderingGroupId = 3;
    const nozzle = new TransformNode(`${root.name}-nozzle`, this.scene);
    nozzle.parent = root;
    nozzle.position.y = -0.14;
    nozzle.isVisible = false;
    const jetFlame = MeshBuilder.CreatePlane(`${root.name}-jet-flame`, { width: 1.8, height: 0.42 }, this.scene);
    jetFlame.parent = root;
    jetFlame.billboardMode = Mesh.BILLBOARDMODE_ALL;
    jetFlame.material = this.fighterTrailMaterial;
    jetFlame.renderingGroupId = 3;
    jetFlame.isPickable = false;
    const jetCore = MeshBuilder.CreateSphere(`${root.name}-jet-core`, { diameter: 0.32, segments: 8 }, this.scene);
    jetCore.parent = root;
    jetCore.material = this.fighterCoreTrailMaterial;
    jetCore.renderingGroupId = 3;
    jetCore.isPickable = false;
    const hitFlash = MeshBuilder.CreateSphere(`${root.name}-hit-flash`, { diameter: 1.2, segments: 10 }, this.scene);
    hitFlash.parent = root;
    hitFlash.material = this.fighterHitMaterial;
    hitFlash.renderingGroupId = 3;
    hitFlash.isPickable = false;
    hitFlash.visibility = 0;
    const visual: FighterVisual = {
      id: enemy.id,
      root,
      sprite,
      fallback,
      material,
      texture,
      nozzle,
      trailSegments: [],
      trailLastPosition: null,
      jetFlame,
      jetCore,
      hitFlash,
      smokePuffs: [],
      previousHealth: enemy.health,
      hitElapsed: 0,
      smokeAccumulator: 0,
      trailActive: true,
      relativeDistance3D: 0,
      keepOutMetric: 1,
      keepOutCorrected: false,
      behindMothership: false,
      occluded: false,
      flightMode: enemy.flightMode,
    };
    this.fighterVisuals.set(enemy.id, visual);
    return visual;
  }

  private syncFighter(visual: FighterVisual, enemy: EnemyState, state: Readonly<CombatState>, dt: number): void {
    const combatCenter = fighterCombatCenter(state);
    const mothershipWorld = this.mothershipRoot.getAbsolutePosition();
    const relative = new Vector3(
      enemy.position.x - combatCenter.x,
      enemy.position.y - combatCenter.y,
      enemy.position.z - combatCenter.z,
    );
    visual.root.position.copyFrom(mothershipWorld.add(relative));
    visual.relativeDistance3D = relative.length();
    visual.keepOutMetric = fighterKeepOutMetric(enemy.position, combatCenter);
    visual.keepOutCorrected = enemy.keepOutCorrected;
    visual.flightMode = enemy.flightMode;
    visual.behindMothership = relative.z > 0;
    const silhouetteMetric = (relative.x / 17) ** 2 + (relative.y / 5.2) ** 2;
    visual.occluded = visual.behindMothership && silhouetteMetric <= 1;
    if (enemy.keepOutCorrected) {
      this.clearFighterTrail(visual);
      this.clearSmokePuffs(visual);
    }
    visual.sprite.rotation.z = -enemy.bank;
    visual.fallback.rotation.y = enemy.heading;
    visual.fallback.rotation.x = -enemy.pitch;
    const spriteReady = visual.texture.isReady();
    visual.sprite.isVisible = spriteReady;
    visual.fallback.isVisible = !spriteReady;
    setAtlasFrame(visual.texture, FIGHTER_ATLAS_COLUMNS, FIGHTER_ATLAS_ROWS, sideViewFrame(enemy.velocity.x, enemy.velocity.y));
    const speed = Math.hypot(enemy.velocity.x, enemy.velocity.y, enemy.velocity.z);
    const direction = speed > 0.001
      ? new Vector3(enemy.velocity.x, enemy.velocity.y, enemy.velocity.z).normalize()
      : new Vector3(Math.sin(enemy.heading), Math.sin(enemy.pitch), Math.cos(enemy.heading)).normalize();
    visual.nozzle.position.set(-direction.x * FIGHTER_NOZZLE_OFFSET, -direction.y * FIGHTER_NOZZLE_OFFSET - 0.14, -direction.z * FIGHTER_NOZZLE_OFFSET);
    visual.nozzle.rotation.set(-enemy.pitch, enemy.heading, enemy.bank * 0.18);
    const disabled = enemy.disabledUntil > state.elapsedSeconds;
    const trailVisible = FIGHTER_AUXILIARY_EXHAUST_ENABLED && !disabled && speed > 0.2;
    if (!trailVisible) {
      this.clearFighterTrail(visual);
      this.clearSmokePuffs(visual);
    }
    visual.trailActive = trailVisible;
    const speedRatio = Math.max(0, Math.min(1, speed / 16));
    visual.jetFlame.position.copyFrom(visual.nozzle.position);
    visual.jetFlame.scaling.set(0.9 + speedRatio * 0.65, 1, 1);
    visual.jetFlame.rotation.z = enemy.bank * 0.3;
    visual.jetFlame.visibility = 0;
    visual.jetCore.position.copyFrom(visual.nozzle.position);
    visual.jetCore.scaling.set(1.5 + speedRatio * 0.8, 0.7, 0.7);
    visual.jetCore.visibility = 0;
    if (trailVisible) {
      visual.nozzle.computeWorldMatrix(true);
      this.extendFighterTrail(visual, visual.nozzle.getAbsolutePosition());
      visual.smokeAccumulator += dt;
      while (visual.smokeAccumulator >= FIGHTER_SMOKE_INTERVAL) {
        visual.smokeAccumulator -= FIGHTER_SMOKE_INTERVAL;
        this.createSmokePuff(visual);
      }
    }
    visual.hitElapsed = Math.max(0, visual.hitElapsed - dt);
    const hitProgress = visual.hitElapsed / FIGHTER_HIT_FLASH_DURATION;
    visual.hitFlash.visibility = hitProgress > 0 ? Math.sin(hitProgress * Math.PI) * 0.92 : 0;
    visual.hitFlash.scaling.setAll(0.72 + (1 - hitProgress) * 0.42);
  }

  private disposeFighter(visual: FighterVisual): void {
    this.clearFighterTrail(visual);
    this.clearSmokePuffs(visual);
    visual.nozzle.dispose();
    visual.root.dispose(false, true);
    visual.texture.dispose();
    visual.material.dispose();
  }

  private updateFighterEffects(dt: number): void {
    for (const visual of this.fighterVisuals.values()) {
      for (let index = visual.trailSegments.length - 1; index >= 0; index -= 1) {
        const segment = visual.trailSegments[index];
        segment.age += dt;
        const progress = Math.min(1, segment.age / FIGHTER_TRAIL_LIFETIME);
        segment.mesh.visibility = Math.max(0, 0.72 * (1 - progress));
        segment.mesh.scaling.y = segment.baseWidth * (1 - progress * 0.72);
        if (progress >= 1) {
          segment.mesh.dispose();
          visual.trailSegments.splice(index, 1);
        }
      }
      for (let index = visual.smokePuffs.length - 1; index >= 0; index -= 1) {
        const puff = visual.smokePuffs[index];
        puff.age += dt;
        const progress = Math.min(1, puff.age / FIGHTER_SMOKE_LIFETIME);
        puff.mesh.visibility = Math.max(0, 0.38 * (1 - progress));
        puff.mesh.scaling.setAll(0.5 + progress * 0.72);
        if (progress >= 1) {
          puff.mesh.dispose();
          visual.smokePuffs.splice(index, 1);
        }
      }
    }
    for (let index = this.fighterExplosions.length - 1; index >= 0; index -= 1) {
      const effect = this.fighterExplosions[index];
      effect.elapsed += dt;
      const progress = Math.min(1, effect.elapsed / FIGHTER_EXPLOSION_DURATION);
      setAtlasFrame(effect.texture, 4, 4, FIGHTER_EXPLOSION_FRAMES[Math.min(FIGHTER_EXPLOSION_FRAMES.length - 1, Math.floor(progress * FIGHTER_EXPLOSION_FRAMES.length))]);
      effect.sprite.visibility = Math.max(0, 1 - progress);
      effect.sprite.scaling.setAll(effect.scale * (0.8 + progress * 2.8));
      effect.core.visibility = Math.max(0, 1 - progress);
      effect.core.scaling.setAll(effect.scale * (0.45 + progress * 1.8));
      effect.ring.visibility = Math.max(0, 0.9 - progress);
      effect.ring.scaling.setAll(effect.scale * (0.35 + progress * 2.2));
      if (progress >= 1) {
        this.disposeFighterExplosion(effect);
        this.fighterExplosions.splice(index, 1);
      }
    }
  }

  private extendFighterTrail(visual: FighterVisual, position: Vector3): void {
    const previous = visual.trailLastPosition;
    if (!previous) {
      visual.trailLastPosition = position.clone();
      return;
    }
    const distance = Vector3.Distance(previous, position);
    if (distance > FIGHTER_TRAIL_BREAK_DISTANCE) {
      this.clearFighterTrail(visual);
      visual.trailLastPosition = position.clone();
      return;
    }
    const dx = position.x - previous.x;
    const dy = position.y - previous.y;
    const visibleLength = Math.hypot(dx, dy);
    if (visibleLength < FIGHTER_TRAIL_SPAWN_DISTANCE) {
      if (distance >= FIGHTER_TRAIL_SPAWN_DISTANCE) visual.trailLastPosition = position.clone();
      return;
    }
    const segment = MeshBuilder.CreatePlane(`${visual.root.name}-trail-segment-${visual.trailSegments.length}`, { size: 1, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    segment.position.copyFrom(previous.add(position).scale(0.5));
    segment.scaling.set(visibleLength, FIGHTER_TRAIL_WIDTH, 1);
    segment.rotation.z = Math.atan2(dy, dx);
    segment.material = this.fighterTrailMaterial;
    segment.renderingGroupId = 3;
    segment.isPickable = false;
    segment.visibility = 0.72;
    visual.trailSegments.push({ mesh: segment, age: 0, baseWidth: FIGHTER_TRAIL_WIDTH });
    visual.trailLastPosition = position.clone();
    while (visual.trailSegments.length > FIGHTER_TRAIL_MAX_SEGMENTS) visual.trailSegments.shift()?.mesh.dispose();
  }

  private createSmokePuff(visual: FighterVisual): void {
    this.trimGlobalSmokeBudget();
    while (visual.smokePuffs.length >= FIGHTER_SMOKE_MAX_PER_FIGHTER) {
      visual.smokePuffs.shift()?.mesh.dispose();
    }
    const puff = MeshBuilder.CreatePlane(`${visual.root.name}-smoke-${visual.smokePuffs.length}`, { size: 1.2, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    puff.position = visual.nozzle.getAbsolutePosition().clone();
    puff.billboardMode = Mesh.BILLBOARDMODE_ALL;
    puff.material = this.fighterSmokeMaterial;
    puff.renderingGroupId = 3;
    puff.isPickable = false;
    puff.visibility = 0.38;
    visual.smokePuffs.push({ mesh: puff, age: 0 });
  }

  private trimGlobalSmokeBudget(): void {
    let total = 0;
    for (const visual of this.fighterVisuals.values()) total += visual.smokePuffs.length;
    while (total >= FIGHTER_SMOKE_MAX_TOTAL) {
      let oldestVisual: FighterVisual | null = null;
      let oldestIndex = -1;
      let oldestAge = -1;
      for (const candidate of this.fighterVisuals.values()) {
        const candidateIndex = candidate.smokePuffs.findIndex((puff) => puff.age > oldestAge);
        if (candidateIndex < 0) continue;
        const candidatePuff = candidate.smokePuffs[candidateIndex];
        if (candidatePuff.age > oldestAge) {
          oldestVisual = candidate;
          oldestIndex = candidateIndex;
          oldestAge = candidatePuff.age;
        }
      }
      if (!oldestVisual || oldestIndex < 0) return;
      oldestVisual.smokePuffs.splice(oldestIndex, 1)[0].mesh.dispose();
      total -= 1;
    }
  }

  private clearSmokePuffs(visual: FighterVisual): void {
    visual.smokePuffs.splice(0).forEach((puff) => puff.mesh.dispose());
    visual.smokeAccumulator = 0;
  }

  private clearFighterTrail(visual: FighterVisual): void {
    visual.trailSegments.splice(0).forEach((segment) => segment.mesh.dispose());
    visual.trailLastPosition = null;
  }

  private createFighterExplosion(position: Vector3): void {
    this.createExplosionEffect(position, 1);
  }

  private createExplosionEffect(position: Vector3, scale: number): void {
    const explosionTexture = this.fighterExplosionTexture.clone();
    const spriteMaterial = new StandardMaterial(`battle-fighter-explosion-material-${this.fighterExplosions.length}`, this.scene);
    spriteMaterial.diffuseColor = Color3.White();
    spriteMaterial.emissiveColor = Color3.White();
    spriteMaterial.disableLighting = true;
    spriteMaterial.backFaceCulling = false;
    spriteMaterial.useAlphaFromDiffuseTexture = true;
    spriteMaterial.transparencyMode = Engine.ALPHA_ADD;
    spriteMaterial.diffuseTexture = explosionTexture;
    spriteMaterial.emissiveTexture = explosionTexture;
    const sprite = MeshBuilder.CreatePlane('battle-ground-or-fighter-explosion', { size: 3.8 * scale }, this.scene);
    sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sprite.position = position.clone();
    sprite.material = spriteMaterial;
    const core = MeshBuilder.CreateSphere('battle-ground-or-fighter-explosion-core', { diameter: 0.9 * scale, segments: 10 }, this.scene);
    core.position = position.clone();
    core.material = this.fighterExplosionMaterial;
    const ring = MeshBuilder.CreateTorus('battle-ground-or-fighter-explosion-ring', { diameter: 1.8 * scale, thickness: 0.12 * scale, tessellation: 20 }, this.scene);
    ring.position = position.clone();
    ring.material = this.fighterExplosionMaterial;
    [sprite, core, ring].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.fighterExplosions.push({ sprite, core, ring, material: spriteMaterial, texture: explosionTexture, elapsed: 0, scale });
  }

  private disposeFighterExplosion(effect: FighterExplosion): void {
    effect.sprite.dispose();
    effect.core.dispose();
    effect.ring.dispose();
    effect.material.dispose();
    effect.texture.dispose();
  }

  private createGround(id: string, kind: GroundVisual['kind'], parent: TransformNode, maximumHealth: number, facilityKind?: FacilityKind): GroundVisual {
    const root = new TransformNode(`battle-ground-${id}`, this.scene);
    root.parent = parent;
    const isSam = kind === 'FACILITY' && facilityKind === 'SAM';
    const attackSpawn = isSam ? new TransformNode(`${root.name}-attack-spawn`, this.scene) : undefined;
    if (attackSpawn) {
      attackSpawn.parent = root;
      attackSpawn.position.set(GROUND_SAM_ATTACK_SPAWN_LOCAL.x, GROUND_SAM_ATTACK_SPAWN_LOCAL.y, GROUND_SAM_ATTACK_SPAWN_LOCAL.z);
    }
    const spriteKey = isSam ? null : kind === 'DEFENDER' ? 'DEFENDER' : facilitySpriteKey(facilityKind);
    const group: GroundUnitGroup = kind === 'DEFENDER' ? 'DEFENDER' : isSam ? 'SAM' : spriteKey ?? 'POWER';
    const spriteDimensions = spriteKey ? GROUND_SPRITE_DIMENSIONS[spriteKey] : null;
    const body = isSam
      ? MeshBuilder.CreatePlane(`${root.name}-sprite`, { width: 8, height: 8 }, this.scene)
      : MeshBuilder.CreatePlane(`${root.name}-sprite`, { size: 1 }, this.scene);
    body.parent = root;
    if (spriteDimensions) body.scaling.set(spriteDimensions.width, spriteDimensions.height, 1);
    body.position.set(0, isSam ? GROUND_SAM_BODY_LOCAL_Y : spriteDimensions ? spriteDimensions.height / 2 : kind === 'FACILITY' ? 1.4 : 0.9, isSam ? -1 : 0);
    body.renderingGroupId = 3;
    body.isPickable = false;
    if (isSam) body.material = this.samMaterial;
    else if (spriteKey) body.material = this.groundSpriteMaterial(spriteKey);
    const healthTrack = MeshBuilder.CreateBox(`${root.name}-health-track`, { width: 4.4, height: 0.22, depth: 0.08 }, this.scene);
    healthTrack.parent = root;
    healthTrack.position.set(0, isSam ? GROUND_SAM_HEALTH_BAR_LOCAL_Y : kind === 'FACILITY' ? 3.35 : 2.45, -0.2);
    healthTrack.material = this.healthTrackMaterial;
    healthTrack.renderingGroupId = 3;
    healthTrack.isPickable = false;
    const healthFill = MeshBuilder.CreateBox(`${root.name}-health-fill`, { width: 4.2, height: 0.12, depth: 0.1 }, this.scene);
    healthFill.parent = root;
    healthFill.position.set(-2.1, isSam ? GROUND_SAM_HEALTH_BAR_LOCAL_Y : kind === 'FACILITY' ? 3.35 : 2.45, -0.28);
    healthFill.material = this.healthFillMaterial;
    healthFill.renderingGroupId = 3;
    healthFill.isPickable = false;
    let labelAnchor: Mesh | undefined;
    let labelPanel: Rectangle | undefined;
    if (isSam) {
      labelAnchor = MeshBuilder.CreatePlane(`${root.name}-label-anchor`, { size: 0.01 }, this.scene);
      labelAnchor.position.set(0, GROUND_SAM_ROOT_Y + GROUND_SAM_BODY_LOCAL_Y + 4.8, 0.6);
      labelAnchor.isVisible = false;
      labelAnchor.isPickable = false;
      labelPanel = new Rectangle(`${root.name}-label`);
      labelPanel.width = '112px';
      labelPanel.height = '26px';
      labelPanel.cornerRadius = 4;
      labelPanel.thickness = 1;
      labelPanel.color = '#ffffff';
      labelPanel.background = '#000000';
      labelPanel.alpha = 0.9;
      const label = new TextBlock(`${root.name}-label-text`, '군용 차량');
      label.color = '#ffffff';
      label.fontFamily = 'Arial, sans-serif';
      label.fontSize = 14;
      label.fontWeight = '700';
      label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      label.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      labelPanel.addControl(label);
      this.groundLabelUi.addControl(labelPanel);
      labelPanel.linkWithMesh(labelAnchor);
      labelPanel.linkOffsetY = -48;
    }
    const hitFlash = MeshBuilder.CreateSphere(`${root.name}-hit-flash`, { diameter: isSam ? 5.2 : 3.4, segments: 12 }, this.scene);
    hitFlash.parent = root;
    hitFlash.position.y = isSam ? GROUND_SAM_BODY_LOCAL_Y : kind === 'FACILITY' ? 1.4 : 0.9;
    hitFlash.material = this.fighterHitMaterial;
    hitFlash.renderingGroupId = 3;
    hitFlash.isPickable = false;
    hitFlash.visibility = 0;
    const visual = { id, kind, group, root, body, bodyBaseScaleX: Math.abs(body.scaling.x), healthFill, healthTrack, maximumHealth, isSam, isDirectional: isSam || spriteKey === 'DEFENDER', spriteKey, attackSpawn, destroyed: false, labelAnchor, labelPanel, hitFlash, previousHealth: maximumHealth, hitElapsed: 0 };
    this.groundVisuals.set(id, visual);
    return visual;
  }

  private syncGround(visual: GroundVisual, x: number, mothershipX: number, health: number, destroyed: boolean, disabled: boolean): void {
    if (health < visual.previousHealth - 0.001 && !visual.destroyed) visual.hitElapsed = GROUND_HIT_FLASH_DURATION;
    if (destroyed && !visual.destroyed) {
      this.createExplosionEffect(visual.root.getAbsolutePosition().clone(), visual.isSam ? 1.15 : 0.9);
    }
    visual.previousHealth = health;
    const override = this.groundPositionOverrides.get(visual.group);
    this.applyGroundPosition(visual, x, override ?? (visual.isSam ? GROUND_SAM_ROOT_Y : GROUND_ENTITY_ROOT_Y));
    if (visual.isDirectional) {
      visual.body.scaling.x = facingScaleX(visual.bodyBaseScaleX, x, mothershipX);
    }
    visual.root.setEnabled(!destroyed);
    if (visual.labelAnchor && visual.labelPanel) {
      visual.labelAnchor.position.x = x;
      visual.labelPanel.isVisible = !destroyed;
    }
    visual.destroyed = destroyed;
    const ratio = Math.max(0, Math.min(1, health / Math.max(1, visual.maximumHealth)));
    visual.healthFill.scaling.x = ratio;
    visual.healthFill.position.x = -2.1 + ratio * 2.1;
    visual.healthTrack.visibility = destroyed ? 0 : 0.76;
    visual.healthFill.visibility = destroyed ? 0 : 0.92;
    visual.body.visibility = destroyed ? 0 : 0.92;
    visual.hitElapsed = Math.max(0, visual.hitElapsed - 1 / 60);
    visual.hitFlash.visibility = destroyed ? 0 : Math.max(0, Math.sin((visual.hitElapsed / GROUND_HIT_FLASH_DURATION) * Math.PI) * 0.88);
    if (visual.isSam) {
      visual.body.material = this.samMaterial;
      visual.body.visibility = destroyed ? 0 : disabled ? 0.5 : 0.92;
      return;
    }
    if (visual.spriteKey) {
      visual.body.material = this.groundSpriteMaterial(visual.spriteKey);
      visual.body.visibility = destroyed ? 0 : disabled ? 0.5 : 0.92;
      return;
    }
  }

  private applyGroundPosition(visual: GroundVisual, x: number, y: number): void {
    visual.root.position.set(x, y, 1.1);
    if (visual.labelAnchor) {
      visual.labelAnchor.position.x = x;
      visual.labelAnchor.position.y = y + GROUND_SAM_BODY_LOCAL_Y + 4.8;
    }
  }

  private material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.42);
    material.emissiveColor = color;
    material.disableLighting = true;
    material.backFaceCulling = false;
    return material;
  }

  private groundSpriteMaterial(key: GroundSpriteKey): StandardMaterial {
    const existing = this.groundSpriteMaterials.get(key);
    if (existing) return existing;
    const texture = new Texture(GROUND_SPRITE_URLS[key], this.scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial(`battle-ground-sprite-${key.toLowerCase()}`, this.scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    this.groundSpriteTextures.set(key, texture);
    this.groundSpriteMaterials.set(key, material);
    return material;
  }
}

function sideViewFrame(horizontalVelocity: number, verticalVelocity: number): number {
  const isMovingRight = horizontalVelocity >= 0;
  if (isMovingRight) return verticalVelocity > 1.2 ? 1 : 0;
  return verticalVelocity < -1.2 ? 3 : 2;
}

function facilitySpriteKey(kind: FacilityKind | undefined): GroundSpriteKey {
  if (kind === 'RADAR' || kind === 'RESEARCH') return 'RADAR';
  if (kind === 'AIRBASE') return 'AIRBASE';
  return 'POWER';
}

function facingScaleX(baseScaleX: number, unitX: number, referenceX: number): number {
  // The source sprites face right. Ground vehicles face toward the mothership.
  const direction = Math.sign(referenceX - unitX) || 1;
  return Math.abs(baseScaleX) * direction;
}

function setAtlasFrame(texture: Texture, columns: number, rows: number, frame: number): void {
  texture.uScale = 1 / columns;
  texture.vScale = 1 / rows;
  texture.uOffset = (frame % columns) / columns;
  texture.vOffset = Math.floor(frame / columns) / rows;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
