import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode, type Scene } from '@babylonjs/core';
import type { CombatState, EnemyState, FacilityKind } from '../../domain/types';
import { GROUND_ENTITY_ROOT_Y, GROUND_SAM_BODY_HEIGHT, GROUND_SAM_BODY_LOCAL_Y, GROUND_SAM_HEALTH_BAR_LOCAL_Y } from './battleVisualCoordinates';

const FIGHTER_SPRITE_URL = '/assets/runtime/sprites/fighter-8way.webp';
const GROUND_SAM_SPRITE_URL = '/assets/runtime/sprites/ground-sam-mobile-side-elevated.png';
const FIGHTER_ATLAS_COLUMNS = 4;
const FIGHTER_ATLAS_ROWS = 2;

interface FighterVisual {
  id: string;
  root: TransformNode;
  sprite: Mesh;
  fallback: Mesh;
  material: StandardMaterial;
  texture: Texture;
}

interface GroundVisual {
  id: string;
  kind: 'DEFENDER' | 'FACILITY';
  root: TransformNode;
  body: Mesh;
  healthFill: Mesh;
  healthTrack: Mesh;
  maximumHealth: number;
  isSam: boolean;
  destroyed: boolean;
}

export interface BattleEntityVisualSnapshot {
  fighters: Array<{ id: string; x: number; y: number; z: number }>;
  ground: Array<{ id: string; kind: 'DEFENDER' | 'FACILITY'; x: number; y: number; z: number; destroyed: boolean }>;
}

export class BattleEntityVisuals {
  private readonly fighterVisuals = new Map<string, FighterVisual>();
  private readonly groundVisuals = new Map<string, GroundVisual>();
  private readonly root: TransformNode;
  private readonly fighterVisualRoot: TransformNode;
  private readonly groundVisualRoot: TransformNode;
  private readonly fighterFallbackMaterial: StandardMaterial;
  private readonly defenderMaterial: StandardMaterial;
  private readonly facilityMaterial: StandardMaterial;
  private readonly disabledMaterial: StandardMaterial;
  private readonly destroyedMaterial: StandardMaterial;
  private readonly healthTrackMaterial: StandardMaterial;
  private readonly healthFillMaterial: StandardMaterial;
  private readonly samTexture: Texture;
  private readonly samMaterial: StandardMaterial;

  constructor(private readonly scene: Scene, fighterRoot: TransformNode, groundRoot: TransformNode) {
    this.root = new TransformNode('BattleEntityVisualsRoot', scene);
    this.fighterVisualRoot = new TransformNode('BattleEnemyVisualsRoot', scene);
    this.fighterVisualRoot.parent = fighterRoot;
    this.groundVisualRoot = new TransformNode('BattleGroundEntityVisualsRoot', scene);
    this.groundVisualRoot.parent = groundRoot;
    this.fighterFallbackMaterial = this.material('battle-entity-fighter-fallback', new Color3(0.98, 0.34, 0.16));
    this.defenderMaterial = this.material('battle-entity-defender', new Color3(0.98, 0.58, 0.18));
    this.facilityMaterial = this.material('battle-entity-facility', new Color3(0.42, 0.72, 0.92));
    this.disabledMaterial = this.material('battle-entity-disabled', new Color3(0.45, 0.47, 0.5));
    this.destroyedMaterial = this.material('battle-entity-destroyed', new Color3(0.22, 0.09, 0.06));
    this.healthTrackMaterial = this.material('battle-entity-health-track', new Color3(0.14, 0.16, 0.18));
    this.healthFillMaterial = this.material('battle-entity-health-fill', new Color3(0.36, 1, 0.64));
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

  sync(state: Readonly<CombatState>): void {
    const activeFighterIds = new Set<string>();
    for (const enemy of state.enemies) {
      if (enemy.health <= 0) continue;
      activeFighterIds.add(enemy.id);
      const visual = this.fighterVisuals.get(enemy.id) ?? this.createFighter(enemy, this.fighterVisualRoot);
      this.syncFighter(visual, enemy);
    }
    for (const [id, visual] of this.fighterVisuals) {
      if (activeFighterIds.has(id)) continue;
      this.disposeFighter(visual);
      this.fighterVisuals.delete(id);
    }

    const activeGroundIds = new Set<string>();
    for (const defender of state.groundDefenders) {
      const id = `defender:${defender.id}`;
      activeGroundIds.add(id);
      const visual = this.groundVisuals.get(id) ?? this.createGround(id, 'DEFENDER', this.groundVisualRoot, Math.max(1, defender.health));
      this.syncGround(visual, defender.position.x, defender.health, defender.health <= 0, defender.disabledUntil > state.elapsedSeconds);
    }
    for (const facility of state.facilities) {
      const id = `facility:${facility.id}`;
      activeGroundIds.add(id);
      const visual = this.groundVisuals.get(id) ?? this.createGround(id, 'FACILITY', this.groundVisualRoot, facility.maxHealth, facility.kind);
      this.syncGround(visual, facility.position.x, facility.health, facility.destroyed, facility.disabledUntil > state.elapsedSeconds, facility.kind);
    }
    for (const [id, visual] of this.groundVisuals) {
      if (activeGroundIds.has(id)) continue;
      visual.root.dispose(false, true);
      this.groundVisuals.delete(id);
    }
  }

  getSnapshot(): BattleEntityVisualSnapshot {
    return {
      fighters: [...this.fighterVisuals.values()].map((visual) => ({ id: visual.id, x: round(visual.root.position.x), y: round(visual.root.position.y), z: round(visual.root.position.z) })).sort((a, b) => a.id.localeCompare(b.id)),
      ground: [...this.groundVisuals.values()].map((visual) => ({
        id: visual.id.replace(/^(defender|facility):/, ''),
        kind: visual.kind,
        x: round(visual.root.position.x),
        y: round(visual.root.position.y),
        z: round(visual.root.position.z),
        destroyed: visual.destroyed,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  dispose(): void {
    this.fighterVisuals.forEach((visual) => this.disposeFighter(visual));
    this.fighterVisuals.clear();
    this.groundVisuals.forEach((visual) => visual.root.dispose(false, true));
    this.groundVisuals.clear();
    [this.fighterFallbackMaterial, this.defenderMaterial, this.facilityMaterial, this.disabledMaterial, this.destroyedMaterial, this.healthTrackMaterial, this.healthFillMaterial, this.samMaterial].forEach((material) => material.dispose());
    this.samTexture.dispose();
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
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    sprite.material = material;
    const fallback = MeshBuilder.CreatePolyhedron(`${root.name}-fallback`, { type: 1, size: 1.7 }, this.scene);
    fallback.parent = root;
    fallback.material = this.fighterFallbackMaterial;
    fallback.isPickable = false;
    fallback.renderingGroupId = 3;
    const visual = { id: enemy.id, root, sprite, fallback, material, texture };
    this.fighterVisuals.set(enemy.id, visual);
    return visual;
  }

  private syncFighter(visual: FighterVisual, enemy: EnemyState): void {
    visual.root.position.set(enemy.position.x, enemyAltitudeToY(enemy.altitude), enemy.position.z * 0.12);
    visual.sprite.rotation.z = -enemy.bank;
    visual.fallback.rotation.y = enemy.heading;
    setAtlasFrame(visual.texture, FIGHTER_ATLAS_COLUMNS, FIGHTER_ATLAS_ROWS, headingFrame(enemy.heading));
    const spriteReady = visual.texture.isReady();
    visual.sprite.isVisible = spriteReady;
    visual.fallback.isVisible = !spriteReady;
  }

  private disposeFighter(visual: FighterVisual): void {
    visual.root.dispose(false, true);
    visual.texture.dispose();
    visual.material.dispose();
  }

  private createGround(id: string, kind: GroundVisual['kind'], parent: TransformNode, maximumHealth: number, facilityKind?: FacilityKind): GroundVisual {
    const root = new TransformNode(`battle-ground-${id}`, this.scene);
    root.parent = parent;
    const isSam = kind === 'FACILITY' && facilityKind === 'SAM';
    const body = isSam
      ? MeshBuilder.CreatePlane(`${root.name}-sprite`, { width: 8, height: 8 }, this.scene)
      : MeshBuilder.CreateBox(`${root.name}-body`, { width: kind === 'FACILITY' ? 6.8 : 4.8, height: kind === 'FACILITY' ? 2.8 : 1.8, depth: 1.4 }, this.scene);
    body.parent = root;
    body.position.set(0, isSam ? GROUND_SAM_BODY_LOCAL_Y : kind === 'FACILITY' ? 1.4 : 0.9, isSam ? -1 : 0);
    body.renderingGroupId = 3;
    body.isPickable = false;
    if (isSam) body.material = this.samMaterial;
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
    const visual = { id, kind, root, body, healthFill, healthTrack, maximumHealth, isSam, destroyed: false };
    this.groundVisuals.set(id, visual);
    return visual;
  }

  private syncGround(visual: GroundVisual, x: number, health: number, destroyed: boolean, disabled: boolean, facilityKind?: FacilityKind): void {
    visual.root.position.set(x, GROUND_ENTITY_ROOT_Y, 1.1);
    visual.destroyed = destroyed;
    const ratio = Math.max(0, Math.min(1, health / Math.max(1, visual.maximumHealth)));
    visual.healthFill.scaling.x = ratio;
    visual.healthFill.position.x = -2.1 + ratio * 2.1;
    visual.healthTrack.visibility = destroyed ? 0.18 : 0.76;
    visual.healthFill.visibility = destroyed ? 0 : 0.92;
    visual.body.visibility = destroyed ? 0.18 : 0.92;
    if (visual.isSam) {
      visual.body.material = this.samMaterial;
      visual.body.visibility = destroyed ? 0.18 : disabled ? 0.5 : 0.92;
      return;
    }
    visual.body.material = destroyed
      ? this.destroyedMaterial
      : disabled
        ? this.disabledMaterial
        : visual.kind === 'FACILITY' && facilityKind === 'SAM'
          ? this.defenderMaterial
          : visual.kind === 'FACILITY'
            ? this.facilityMaterial
            : this.defenderMaterial;
  }

  private material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.42);
    material.emissiveColor = color;
    material.disableLighting = true;
    material.backFaceCulling = false;
    return material;
  }
}

function enemyAltitudeToY(altitude: number): number {
  return 8 + (altitude - 33) * 0.22;
}

function headingFrame(heading: number): number {
  const turns = ((heading / (Math.PI * 2)) % 1 + 1) % 1;
  return Math.round(turns * 8) % 8;
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
