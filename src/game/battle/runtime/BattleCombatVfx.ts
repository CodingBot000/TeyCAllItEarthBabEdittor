import {
  Color3,
  Engine,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Texture,
  TrailMesh,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import type { CombatState } from '../../domain/types';
import { GROUND_ATTACK_TARGET_Y } from './battleVisualCoordinates';

type HeavyAbility = 'emp' | 'plasma';
type DamageKind = 'SHIELD' | 'HULL';

interface DebrisPiece {
  mesh: Mesh;
  velocity: Vector3;
  rotationVelocity: Vector3;
}

interface DamageEffect {
  kind: DamageKind;
  elapsed: number;
  duration: number;
  normal: Vector3;
  localImpact: Vector3;
  bubble?: Mesh;
  core: Mesh;
  ring: Mesh;
  secondRing: Mesh;
  smoke?: Mesh;
  smokeSprite?: Mesh;
  sprite: Mesh;
  debris: DebrisPiece[];
}

interface AbilityEffect {
  kind: HeavyAbility;
  root: TransformNode;
  elapsed: number;
  duration: number;
  target: Vector3;
  tracer: Mesh;
  impact: Mesh;
  ring: Mesh;
  secondRing: Mesh;
  explosion: Mesh;
  smoke: Mesh;
  fallbackTracer: Mesh;
  fallbackImpact: Mesh;
  fallbackRing: Mesh;
  fallbackSecondRing: Mesh;
  tracerFrames: number[];
  impactFrames: number[];
  ringFrames: number[];
  secondRingFrames: number[];
}

interface AbsorptionVisual {
  beam: Mesh;
  core: Mesh;
  funnel: Mesh;
  ring: Mesh;
  target: Vector3;
}

interface AirDefenseVisual {
  beam: Mesh;
  core: Mesh;
  impact: Mesh;
  elapsed: number;
  duration: number;
  origin: Vector3;
  target: Vector3;
}

interface GroundSwarmVisual {
  mesh: Mesh;
  trail: TrailMesh;
}

interface GroundSwarmImpactVisual {
  flash: Mesh;
  ring: Mesh;
  elapsed: number;
  duration: number;
}

const SHIELD_DURATION = 1.05;
const HULL_DURATION = 1.8;
const MAX_DAMAGE_EFFECTS = 6;
const MAX_ABILITY_EFFECTS = 8;
const MAX_AIR_DEFENSE_EFFECTS = 3;
const MAX_GROUND_SWARM_IMPACTS = 12;
const ABILITY_DURATION = 1.8;
const BEAM_RADIUS = 6.5;
const BEAM_RANGE = 22;

export class BattleCombatVfx {
  private readonly shieldImpactTexture: Texture;
  private readonly vfxTexture: Texture;
  private readonly explosionTexture: Texture;
  private readonly smokeTexture: Texture;
  private readonly damageEffects: DamageEffect[] = [];
  private readonly abilityEffects: AbilityEffect[] = [];
  private readonly airDefenseEffects: AirDefenseVisual[] = [];
  private readonly consumedHitIds = new Set<string>();
  private consumedAirDefenseId: string | null = null;
  private readonly damageId = { value: 0 };
  private readonly abilityId = { value: 0 };
  private readonly shieldBubbleMaterial: StandardMaterial;
  private readonly shieldRingMaterial: StandardMaterial;
  private readonly shieldCoreMaterial: StandardMaterial;
  private readonly hullFlashMaterial: StandardMaterial;
  private readonly hullSmokeMaterial: StandardMaterial;
  private readonly hullDebrisMaterial: StandardMaterial;
  private readonly empMaterial: StandardMaterial;
  private readonly plasmaMaterial: StandardMaterial;
  private readonly beamMaterial: StandardMaterial;
  private readonly beamCoreMaterial: StandardMaterial;
  private readonly beamFunnelMaterial: StandardMaterial;
  private readonly beamRingMaterial: StandardMaterial;
  private readonly samProjectileMaterial: StandardMaterial;
  private readonly fighterProjectileMaterial: StandardMaterial;
  private readonly airDefenseMaterial: StandardMaterial;
  private readonly airDefenseCoreMaterial: StandardMaterial;
  private readonly groundSwarmMaterial: StandardMaterial;
  private readonly groundSwarmCoreMaterial: StandardMaterial;
  private readonly projectileMeshes = new Map<string, Mesh>();
  private readonly groundSwarmVisuals = new Map<string, GroundSwarmVisual>();
  private readonly consumedGroundSwarmImpactIds = new Set<string>();
  private readonly groundSwarmImpactEffects: GroundSwarmImpactVisual[] = [];
  private absorption: AbsorptionVisual | null = null;
  private disposed = false;

  constructor(
    private readonly scene: import('@babylonjs/core').Scene,
    private readonly mothershipRoot: TransformNode,
  ) {
    this.shieldImpactTexture = new Texture('/assets/runtime/vfx/shield-impact.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.vfxTexture = new Texture('/assets/runtime/vfx/vfx-atlas.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.explosionTexture = new Texture('/assets/runtime/vfx/mothership-explosion-5x5.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.smokeTexture = new Texture('/assets/runtime/vfx/mothership-smoke-8x8.webp', scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    [this.shieldImpactTexture, this.vfxTexture, this.explosionTexture, this.smokeTexture].forEach((texture) => { texture.hasAlpha = true; });

    this.shieldBubbleMaterial = this.material('battle-shield-impact-shell', new Color3(0.08, 0.52, 0.75), new Color3(0.08, 0.9, 1));
    this.shieldBubbleMaterial.alpha = 0.18;
    this.shieldBubbleMaterial.wireframe = true;
    this.shieldRingMaterial = this.material('battle-shield-impact-ring', new Color3(0.3, 0.9, 1), new Color3(0.18, 1, 1));
    this.shieldRingMaterial.alpha = 0.92;
    this.shieldCoreMaterial = this.material('battle-shield-impact-core', new Color3(0.8, 1, 1), new Color3(0.35, 1, 1));
    this.shieldCoreMaterial.alpha = 0.88;
    this.hullFlashMaterial = this.material('battle-hull-impact-flash', new Color3(1, 0.46, 0.08), new Color3(1, 0.15, 0.01));
    this.hullFlashMaterial.alpha = 0.96;
    this.hullSmokeMaterial = this.material('battle-hull-impact-smoke', new Color3(0.16, 0.055, 0.035), new Color3(0.32, 0.045, 0.01));
    this.hullSmokeMaterial.alpha = 0.72;
    this.hullDebrisMaterial = this.material('battle-hull-impact-debris', new Color3(0.52, 0.17, 0.055), new Color3(0.9, 0.18, 0.015));
    this.empMaterial = this.material('battle-emp', new Color3(0.22, 0.78, 1), new Color3(0.08, 0.85, 1));
    this.plasmaMaterial = this.material('battle-plasma', new Color3(1, 0.38, 0.08), new Color3(1, 0.12, 0.01));
    this.beamMaterial = this.material('battle-abduction-beam', new Color3(0.2, 0.85, 0.76), new Color3(0.15, 0.95, 0.8));
    this.beamMaterial.alpha = 0.34;
    this.beamCoreMaterial = this.material('battle-abduction-beam-core', new Color3(0.72, 1, 0.94), new Color3(0.35, 1, 0.92));
    this.beamCoreMaterial.alpha = 0.86;
    this.beamFunnelMaterial = this.material('battle-abduction-beam-funnel', new Color3(0.12, 0.76, 0.66), new Color3(0.08, 0.72, 0.58));
    this.beamFunnelMaterial.alpha = 0.2;
    this.beamFunnelMaterial.alphaMode = Engine.ALPHA_ADD;
    this.beamFunnelMaterial.disableDepthWrite = true;
    this.beamRingMaterial = this.material('battle-abduction-beam-target', new Color3(0.4, 1, 0.85), new Color3(0.18, 1, 0.82));
    this.samProjectileMaterial = this.material('battle-sam-projectile', new Color3(1, 0.28, 0.06), new Color3(1, 0.08, 0.01));
    this.fighterProjectileMaterial = this.material('battle-fighter-projectile', new Color3(0.22, 0.78, 1), new Color3(0.08, 0.72, 1));
    this.airDefenseMaterial = this.material('battle-air-defense-laser', new Color3(1, 0.24, 0.08), new Color3(1, 0.08, 0.01));
    this.airDefenseMaterial.alpha = 0.42;
    this.airDefenseMaterial.alphaMode = Engine.ALPHA_ADD;
    this.airDefenseCoreMaterial = this.material('battle-air-defense-laser-core', new Color3(1, 0.92, 0.64), new Color3(1, 0.4, 0.04));
    this.groundSwarmMaterial = this.material('battle-ground-swarm', new Color3(0.92, 0.72, 0.24), new Color3(1, 0.36, 0.03));
    this.groundSwarmCoreMaterial = this.material('battle-ground-swarm-core', new Color3(1, 0.96, 0.68), new Color3(1, 0.72, 0.08));

  }

  triggerMothershipHit(kind: DamageKind, normal = new Vector3(0.72, -0.18, -1)): void {
    if (this.disposed) return;
    while (this.damageEffects.length >= MAX_DAMAGE_EFFECTS) this.disposeDamageEffect(this.damageEffects.shift()!);
    const direction = normal.normalize();
    const localImpact = new Vector3(direction.x * 11.7, direction.y * 3.4, direction.z * 11.7);
    this.damageEffects.push(kind === 'SHIELD'
      ? this.createShieldEffect(direction, localImpact)
      : this.createHullEffect(`hit-${this.damageId.value++}`, direction, localImpact));
  }

  triggerAbility(kind: HeavyAbility, target: Vector3): void {
    if (this.disposed) return;
    while (this.abilityEffects.length >= MAX_ABILITY_EFFECTS) this.abilityEffects.shift()?.root.dispose();
    const root = new TransformNode(`battle-${kind}-${this.abilityId.value++}`, this.scene);
    const ship = this.shipPosition();
    const start = ship.add(new Vector3(0, -0.7, -0.5));
    const targetPoint = target.clone();
    const sourceMaterial = kind === 'plasma' ? this.plasmaMaterial : this.empMaterial;
    const tracerFrames = kind === 'plasma' ? [5, 6, 11] : [12, 5, 3];
    const impactFrames = kind === 'plasma' ? [1, 8, 10] : [2, 9, 11];
    const ringFrames = kind === 'plasma' ? [3, 10, 12] : [3, 7, 12];
    const secondRingFrames = kind === 'plasma' ? [8, 1, 10] : [9, 2, 11];
    const tracer = this.flipbook(`${root.name}-tracer`, this.vfxTexture, 4, 4, tracerFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    tracer.parent = root;
    this.alignSpriteTracer(tracer, start, targetPoint);
    const impact = this.flipbook(`${root.name}-impact`, this.vfxTexture, 4, 4, impactFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    impact.parent = root;
    impact.position = targetPoint.clone();
    impact.scaling.setAll(kind === 'plasma' ? 4.6 : 4);
    const ring = this.flipbook(`${root.name}-ring`, this.vfxTexture, 4, 4, ringFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    ring.parent = root;
    ring.position = targetPoint.clone();
    ring.scaling.setAll(kind === 'plasma' ? 5.6 : 9.2);
    const secondRing = this.flipbook(`${root.name}-ring-secondary`, this.vfxTexture, 4, 4, secondRingFrames[0], Color3.White(), 'ADDITIVE');
    secondRing.parent = root;
    secondRing.position = targetPoint.clone();
    secondRing.scaling.setAll(kind === 'plasma' ? 3.8 : 6.2);
    const explosion = this.flipbook(`${root.name}-explosion`, this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA');
    explosion.parent = root;
    explosion.position = targetPoint.add(new Vector3(0, 0.48, 0));
    explosion.scaling.setAll(kind === 'plasma' ? 3.4 : 3);
    const smoke = this.flipbook(`${root.name}-smoke`, this.smokeTexture, 8, 8, 0, new Color3(0.52, 0.54, 0.56), 'ALPHA');
    smoke.parent = root;
    smoke.position = targetPoint.add(new Vector3(0, 0.68, 0));
    smoke.scaling.setAll(1.4);
    const fallbackTracer = MeshBuilder.CreateCylinder(`${root.name}-fallback-tracer`, { diameter: kind === 'plasma' ? 0.9 : 0.6, height: 1, tessellation: 12 }, this.scene);
    fallbackTracer.parent = root;
    fallbackTracer.material = sourceMaterial;
    alignCylinder(fallbackTracer, start, targetPoint);
    const fallbackImpact = MeshBuilder.CreateSphere(`${root.name}-fallback-impact`, { diameter: kind === 'plasma' ? 2.1 : 1.6, segments: 16 }, this.scene);
    fallbackImpact.parent = root;
    fallbackImpact.position = targetPoint.clone();
    fallbackImpact.material = sourceMaterial;
    const fallbackRing = MeshBuilder.CreateTorus(`${root.name}-fallback-ring`, { diameter: kind === 'plasma' ? 4.2 : 8.5, thickness: 0.28, tessellation: 36 }, this.scene);
    fallbackRing.parent = root;
    fallbackRing.position = targetPoint.clone();
    fallbackRing.material = sourceMaterial;
    const fallbackSecondRing = MeshBuilder.CreateTorus(`${root.name}-fallback-ring-2`, { diameter: kind === 'plasma' ? 2.3 : 5.2, thickness: 0.16, tessellation: 32 }, this.scene);
    fallbackSecondRing.parent = root;
    fallbackSecondRing.position = targetPoint.clone();
    fallbackSecondRing.material = sourceMaterial;
    [tracer, impact, ring, secondRing, explosion, smoke].forEach((mesh) => { mesh.renderingGroupId = 3; });
    [fallbackTracer, fallbackImpact, fallbackRing, fallbackSecondRing].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.abilityEffects.push({ kind, root, elapsed: 0, duration: kind === 'plasma' ? 1.7 : ABILITY_DURATION, target: targetPoint, tracer, impact, ring, secondRing, explosion, smoke, fallbackTracer, fallbackImpact, fallbackRing, fallbackSecondRing, tracerFrames, impactFrames, ringFrames, secondRingFrames });
  }

  syncCombatState(state: Readonly<CombatState>): void {
    if (this.disposed) return;
    for (const hit of state.mothershipHits) {
      if (this.consumedHitIds.has(hit.id)) continue;
      this.consumedHitIds.add(hit.id);
      this.triggerMothershipHit(hit.kind, new Vector3(hit.direction.x, hit.direction.y, hit.direction.z));
    }
    const retainedHits = new Set(state.mothershipHits.map((hit) => hit.id));
    for (const id of this.consumedHitIds) if (!retainedHits.has(id)) this.consumedHitIds.delete(id);
    this.syncProjectiles(state);
    this.syncGroundSwarm(state);
    if (state.lastAirDefenseShot && state.lastAirDefenseShot.id !== this.consumedAirDefenseId) {
      this.consumedAirDefenseId = state.lastAirDefenseShot.id;
      this.triggerAirDefenseShot(state.lastAirDefenseShot.origin, state.lastAirDefenseShot.target, state.lastAirDefenseShot.targetAltitude);
    }
    const target = state.absorbableTargets.find((item) => item.id === state.activeBeamTargetId);
    this.setAbsorption(Boolean(state.activeAbility === 'beam' && target), target ? new Vector3(target.center.x, -4.2, target.center.z) : undefined);
  }

  toggleAbsorption(target = new Vector3(0, -4.2, 0)): boolean {
    const next = !this.absorption;
    this.setAbsorption(next, target);
    return next;
  }

  setAbsorption(active: boolean, target = new Vector3(0, -4.2, 0)): void {
    if (!active) {
      if (!this.absorption) return;
      this.absorption.beam.dispose();
      this.absorption.core.dispose();
      this.absorption.funnel.dispose();
      this.absorption.ring.dispose();
      this.absorption = null;
      return;
    }
    if (this.absorption) {
      this.absorption.target.copyFrom(target);
      return;
    }
    const beam = MeshBuilder.CreateCylinder('battle-abduction-beam', { diameter: 0.56, height: 1, tessellation: 24 }, this.scene);
    beam.material = this.beamMaterial;
    const core = MeshBuilder.CreateCylinder('battle-abduction-beam-core', { diameter: 0.17, height: 1, tessellation: 18 }, this.scene);
    core.material = this.beamCoreMaterial;
    const funnel = MeshBuilder.CreateCylinder('battle-abduction-beam-funnel', { diameterTop: BEAM_RADIUS * 2, diameterBottom: 0.56, height: 1, tessellation: 48 }, this.scene);
    funnel.material = this.beamFunnelMaterial;
    const ring = MeshBuilder.CreateTorus('battle-abduction-beam-target', { diameter: BEAM_RADIUS * 2.05, thickness: 0.24, tessellation: 40 }, this.scene);
    ring.material = this.beamRingMaterial;
    [beam, core, funnel, ring].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.absorption = { beam, core, funnel, ring, target: target.clone() };
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
    this.updateDamageEffects(dt);
    this.updateAbilityEffects(dt);
    this.updateAirDefenseEffects(dt);
    this.updateGroundSwarmImpacts(dt);
    this.updateAbsorption(elapsed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.damageEffects.splice(0).forEach((effect) => this.disposeDamageEffect(effect));
    this.abilityEffects.splice(0).forEach((effect) => effect.root.dispose());
    this.projectileMeshes.forEach((mesh) => mesh.dispose());
    this.projectileMeshes.clear();
    this.groundSwarmVisuals.forEach((visual) => {
      visual.trail.stop();
      visual.trail.dispose();
      visual.mesh.dispose();
    });
    this.groundSwarmVisuals.clear();
    this.groundSwarmImpactEffects.splice(0).forEach((effect) => { effect.flash.dispose(); effect.ring.dispose(); });
    this.consumedGroundSwarmImpactIds.clear();
    this.consumedHitIds.clear();
    this.consumedAirDefenseId = null;
    this.airDefenseEffects.splice(0).forEach((effect) => {
      effect.beam.dispose();
      effect.core.dispose();
      effect.impact.dispose();
    });
    if (this.absorption) {
      this.absorption.beam.dispose();
      this.absorption.core.dispose();
      this.absorption.funnel.dispose();
      this.absorption.ring.dispose();
    }
    [this.shieldBubbleMaterial, this.shieldRingMaterial, this.shieldCoreMaterial, this.hullFlashMaterial, this.hullSmokeMaterial, this.hullDebrisMaterial, this.empMaterial, this.plasmaMaterial, this.beamMaterial, this.beamCoreMaterial, this.beamFunnelMaterial, this.beamRingMaterial, this.samProjectileMaterial, this.fighterProjectileMaterial, this.airDefenseMaterial, this.airDefenseCoreMaterial, this.groundSwarmMaterial, this.groundSwarmCoreMaterial].forEach((material) => material.dispose());
    [this.shieldImpactTexture, this.vfxTexture, this.explosionTexture, this.smokeTexture].forEach((texture) => texture.dispose());
  }

  private createShieldEffect(normal: Vector3, localImpact: Vector3): DamageEffect {
    const center = this.shipPosition();
    const impact = center.add(localImpact);
    const bubble = MeshBuilder.CreateSphere('battle-shield-impact-shell', { diameter: 2, segments: 20 }, this.scene);
    bubble.position = center;
    bubble.scaling = new Vector3(12.15, 3.75, 12.15);
    bubble.material = this.shieldBubbleMaterial;
    const core = MeshBuilder.CreateSphere('battle-shield-impact-core', { diameter: 1.25, segments: 12 }, this.scene);
    core.position = impact;
    core.material = this.shieldCoreMaterial;
    const ring = this.impactRing('battle-shield-impact-ring', impact, normal, 2.3, 0.16, this.shieldRingMaterial);
    const secondRing = this.impactRing('battle-shield-impact-ring-secondary', impact.add(normal.scale(0.06)), normal, 1.45, 0.1, this.shieldCoreMaterial);
    const sprite = this.flipbook('battle-shield-impact-sprite', this.shieldImpactTexture, 1, 1, 0, new Color3(0.18, 0.88, 1), 'ADDITIVE');
    sprite.position = impact.add(normal.scale(0.16));
    sprite.scaling.setAll(2.2);
    this.setRenderingGroup([bubble, core, ring, secondRing, sprite]);
    return { kind: 'SHIELD', elapsed: 0, duration: SHIELD_DURATION, normal, localImpact, bubble, core, ring, secondRing, sprite, debris: [] };
  }

  private createHullEffect(id: string, normal: Vector3, localImpact: Vector3): DamageEffect {
    const impact = this.shipPosition().add(localImpact.scale(1.04));
    const core = MeshBuilder.CreateSphere('battle-hull-impact-explosion', { diameter: 1.5, segments: 14 }, this.scene);
    core.position = impact;
    core.material = this.hullFlashMaterial;
    const smoke = MeshBuilder.CreateSphere('battle-hull-impact-smoke', { diameter: 1.8, segments: 10 }, this.scene);
    smoke.position = impact.add(normal.scale(0.3));
    smoke.material = this.hullSmokeMaterial;
    const ring = this.impactRing('battle-hull-impact-ring', impact, normal, 2.1, 0.22, this.hullFlashMaterial);
    const secondRing = this.impactRing('battle-hull-impact-ring-secondary', impact.add(normal.scale(0.12)), normal, 1.2, 0.12, this.hullDebrisMaterial);
    const sprite = this.flipbook('battle-hull-impact-flipbook', this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA');
    sprite.position = impact.add(normal.scale(0.65));
    sprite.scaling.setAll(3.2);
    const smokeSprite = this.flipbook('battle-hull-impact-smoke-flipbook', this.smokeTexture, 8, 8, 0, new Color3(0.52, 0.54, 0.56), 'ALPHA');
    smokeSprite.position = impact.add(normal.scale(0.9)).add(Vector3.Up().scale(0.25));
    smokeSprite.scaling.setAll(1.1);
    const debris = this.createDebris(id, impact, normal);
    this.setRenderingGroup([core, smoke, ring, secondRing, sprite, smokeSprite, ...debris.map((piece) => piece.mesh)]);
    return { kind: 'HULL', elapsed: 0, duration: HULL_DURATION, normal, localImpact, core, ring, secondRing, smoke, smokeSprite, sprite, debris };
  }

  private createDebris(id: string, impact: Vector3, normal: Vector3): DebrisPiece[] {
    const seed = hashString(id);
    const tangent = Vector3.Cross(Vector3.Up(), normal).normalize();
    const bitangent = Vector3.Cross(normal, tangent).normalize();
    return Array.from({ length: 10 }, (_, index) => {
      const a = seededUnit(seed + index * 17);
      const b = seededUnit(seed + index * 31 + 7);
      const c = seededUnit(seed + index * 47 + 13);
      const size = 0.28 + a * 0.4;
      const mesh = MeshBuilder.CreateBox(`battle-hull-debris-${index}`, { width: size * 1.7, height: size * 0.65, depth: size }, this.scene);
      mesh.position = impact.add(tangent.scale((a - 0.5) * 1.6)).add(bitangent.scale((b - 0.5) * 1.6)).add(normal.scale(c * 0.45));
      mesh.rotation = new Vector3(a * Math.PI, b * Math.PI, c * Math.PI);
      mesh.material = this.hullDebrisMaterial;
      return {
        mesh,
        velocity: normal.scale(3.8 + c * 5.2).add(tangent.scale((a - 0.5) * 11)).add(bitangent.scale((b - 0.35) * 8)).add(Vector3.Up().scale(2.2 + b * 5.6)),
        rotationVelocity: new Vector3((b - 0.5) * 9, (c - 0.5) * 11, (a - 0.5) * 10),
      };
    });
  }

  private updateDamageEffects(dt: number): void {
    for (const effect of this.damageEffects) {
      effect.elapsed += dt;
      const progress = Math.min(1, effect.elapsed / effect.duration);
      const pulse = Math.sin(progress * Math.PI);
      const impact = this.shipPosition().add(effect.localImpact.scale(effect.kind === 'HULL' ? 1.04 : 1));
      if (effect.kind === 'SHIELD') {
        effect.bubble!.position = this.shipPosition();
        effect.bubble!.scaling = new Vector3(12.15 + pulse * 0.45, 3.75 + pulse * 0.2, 12.15 + pulse * 0.45);
        effect.bubble!.visibility = pulse * 0.9;
        effect.core.position = impact;
        effect.core.scaling.setAll(0.45 + pulse * 1.4);
        effect.core.visibility = 1 - progress;
        effect.ring.position = impact;
        effect.secondRing.position = impact.add(effect.normal.scale(0.06));
        effect.ring.scaling.setAll(0.55 + progress * 3.3);
        effect.secondRing.scaling.setAll(0.45 + progress * 2.4);
        effect.ring.visibility = Math.max(0, 1 - progress);
        effect.secondRing.visibility = Math.max(0, 1 - progress * 1.15);
        effect.sprite.position = impact.add(effect.normal.scale(0.16));
        effect.sprite.scaling.setAll(1.5 + progress * 4.2);
        effect.sprite.visibility = pulse * (1 - progress * 0.32);
      } else {
        setFrame(effect.sprite, 5, 5, effect.elapsed, 20);
        setFrame(effect.smokeSprite!, 8, 8, Math.max(0, effect.elapsed - 0.12), 42);
        effect.core.position = impact;
        effect.core.scaling.setAll(0.7 + Math.sin(Math.min(1, progress * 2) * Math.PI / 2) * 3.1);
        effect.core.visibility = Math.max(0, 1 - progress * 1.55);
        effect.smoke!.position.y += dt * 1.2;
        effect.smoke!.scaling.setAll(0.8 + progress * 2.5);
        effect.smoke!.visibility = Math.max(0, 0.9 - progress * 0.82);
        effect.smokeSprite!.position = impact.add(effect.normal.scale(0.9)).add(Vector3.Up().scale(0.25 + progress * 1.35));
        effect.smokeSprite!.scaling.setAll(1.1 + progress * 2.7);
        effect.smokeSprite!.visibility = Math.max(0, 0.82 - progress * 0.72);
        effect.ring.position = impact;
        effect.secondRing.position = impact.add(effect.normal.scale(0.12));
        effect.ring.scaling.setAll(0.65 + progress * 4.8);
        effect.secondRing.scaling.setAll(0.5 + progress * 3.1);
        effect.ring.visibility = Math.max(0, 1 - progress * 1.35);
        effect.secondRing.visibility = Math.max(0, 1 - progress * 1.55);
        for (const piece of effect.debris) {
          piece.velocity.y -= 12 * dt;
          piece.mesh.position.addInPlace(piece.velocity.scale(dt));
          piece.mesh.rotation.x += piece.rotationVelocity.x * dt;
          piece.mesh.rotation.y += piece.rotationVelocity.y * dt;
          piece.mesh.rotation.z += piece.rotationVelocity.z * dt;
          piece.mesh.visibility = progress < 0.28 ? 1 : Math.max(0, 1 - (progress - 0.28) / 0.72);
        }
      }
    }
    for (let index = this.damageEffects.length - 1; index >= 0; index -= 1) {
      if (this.damageEffects[index].elapsed < this.damageEffects[index].duration) continue;
      this.disposeDamageEffect(this.damageEffects[index]);
      this.damageEffects.splice(index, 1);
    }
  }

  private updateAbilityEffects(dt: number): void {
    for (const effect of this.abilityEffects) {
      effect.elapsed += dt;
      const progress = Math.min(1, effect.elapsed / effect.duration);
      const materialReady = this.vfxTexture.isReady();
      [effect.tracer, effect.impact, effect.ring, effect.secondRing, effect.explosion, effect.smoke].forEach((mesh) => { mesh.isVisible = materialReady; });
      [effect.fallbackTracer, effect.fallbackImpact, effect.fallbackRing, effect.fallbackSecondRing].forEach((mesh) => { mesh.isVisible = !materialReady; });
      setAtlasFrame(effect.tracer, 4, 4, frameForProgress(effect.tracerFrames, progress));
      setAtlasFrame(effect.impact, 4, 4, frameForProgress(effect.impactFrames, progress));
      setAtlasFrame(effect.ring, 4, 4, frameForProgress(effect.ringFrames, progress));
      setAtlasFrame(effect.secondRing, 4, 4, frameForProgress(effect.secondRingFrames, progress));
      setFrame(effect.explosion, 5, 5, effect.elapsed, 30);
      setFrame(effect.smoke, 8, 8, Math.max(0, effect.elapsed - 0.16), 42);
      const flash = Math.max(0, 1 - progress * 1.25);
      effect.tracer.visibility = Math.max(0, 1 - progress * 1.8);
      effect.fallbackTracer.visibility = effect.tracer.visibility;
      effect.impact.scaling.setAll(0.55 + flash * 1.35);
      effect.fallbackImpact.scaling.setAll(0.55 + flash * 1.35);
      effect.ring.scaling.setAll(0.45 + progress * 2.5);
      effect.secondRing.scaling.setAll(0.35 + progress * 1.8);
      effect.ring.visibility = Math.max(0, 1 - progress * 1.2);
      effect.secondRing.visibility = Math.max(0, 1 - progress * 1.4);
      effect.explosion.scaling.setAll(0.72 + Math.sin(Math.min(1, effect.elapsed / 0.55) * Math.PI / 2) * 2.8);
      effect.explosion.visibility = Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28);
      effect.smoke.position.y = 0.68 + Math.min(1, Math.max(0, effect.elapsed - 0.16) / 1.6) * 1.45;
      effect.smoke.scaling.setAll(0.75 + Math.min(1, effect.elapsed / 1.6) * 2.1);
      effect.smoke.visibility = Math.max(0, 0.72 - Math.min(1, effect.elapsed / 1.6) * 0.66);
    }
    for (let index = this.abilityEffects.length - 1; index >= 0; index -= 1) {
      if (this.abilityEffects[index].elapsed < this.abilityEffects[index].duration) continue;
      this.abilityEffects[index].root.dispose();
      this.abilityEffects.splice(index, 1);
    }
  }

  private triggerAirDefenseShot(origin: { x: number; z: number }, target: { x: number; z: number }, targetAltitude: number): void {
    while (this.airDefenseEffects.length >= MAX_AIR_DEFENSE_EFFECTS) {
      const expired = this.airDefenseEffects.shift()!;
      expired.beam.dispose();
      expired.core.dispose();
      expired.impact.dispose();
    }
    const start = new Vector3(origin.x, this.shipPosition().y + 1.4, origin.z * 0.12);
    const end = new Vector3(target.x, 8 + (targetAltitude - 33) * 0.22, target.z * 0.12);
    const beam = MeshBuilder.CreateCylinder('battle-air-defense-laser', { diameter: 0.72, height: 1, tessellation: 12 }, this.scene);
    beam.material = this.airDefenseMaterial;
    const core = MeshBuilder.CreateCylinder('battle-air-defense-laser-core', { diameter: 0.2, height: 1, tessellation: 10 }, this.scene);
    core.material = this.airDefenseCoreMaterial;
    const impact = MeshBuilder.CreateSphere('battle-air-defense-laser-impact', { diameter: 1.3, segments: 12 }, this.scene);
    impact.material = this.airDefenseCoreMaterial;
    alignCylinder(beam, start, end);
    alignCylinder(core, start, end);
    impact.position = end;
    [beam, core, impact].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.airDefenseEffects.push({ beam, core, impact, elapsed: 0, duration: 0.24, origin: start, target: end });
  }

  private updateAirDefenseEffects(dt: number): void {
    for (const effect of this.airDefenseEffects) {
      effect.elapsed += dt;
      const progress = Math.min(1, effect.elapsed / effect.duration);
      const fade = Math.max(0, 1 - progress);
      effect.beam.visibility = fade * 0.84;
      effect.core.visibility = fade;
      effect.impact.visibility = fade;
      effect.impact.scaling.setAll(0.6 + (1 - fade) * 1.4);
    }
    for (let index = this.airDefenseEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.airDefenseEffects[index];
      if (effect.elapsed < effect.duration) continue;
      effect.beam.dispose();
      effect.core.dispose();
      effect.impact.dispose();
      this.airDefenseEffects.splice(index, 1);
    }
  }

  private updateAbsorption(elapsed: number): void {
    const absorption = this.absorption;
    const ship = this.shipPosition();
    if (!absorption) return;
    const target = absorption.target;
    const beamStart = ship.add(new Vector3(0, -0.5, 0));
    alignCylinder(absorption.beam, beamStart, target);
    alignCylinder(absorption.core, beamStart, target);
    const progress = Math.min(1, Math.max(0, (elapsed % 0.85) / 0.85));
    const funnelEnd = beamStart.add(target.subtract(beamStart).scale(Math.max(0.02, progress)));
    alignCylinder(absorption.funnel, beamStart, funnelEnd);
    absorption.funnel.scaling.x = progress;
    absorption.funnel.scaling.z = progress;
    absorption.funnel.visibility = progress;
    absorption.ring.position = target;
    absorption.ring.scaling.setAll(0.92 + Math.sin(elapsed * 7) * 0.08);
  }

  private syncGroundSwarm(state: Readonly<CombatState>): void {
    const activeIds = new Set<string>();
    for (const projectile of state.groundSwarmProjectiles) {
      activeIds.add(projectile.id);
      let visual = this.groundSwarmVisuals.get(projectile.id);
      if (!visual) {
        const mesh = MeshBuilder.CreateSphere(`battle-${projectile.id}`, { diameter: 0.58, segments: 10 }, this.scene);
        mesh.material = this.groundSwarmCoreMaterial;
        mesh.renderingGroupId = 3;
        mesh.isPickable = false;
        const trail = new TrailMesh(`battle-${projectile.id}-trail`, mesh, this.scene, 0.12, 22, true);
        trail.material = this.groundSwarmMaterial;
        trail.renderingGroupId = 3;
        trail.isPickable = false;
        trail.start();
        visual = { mesh, trail };
        this.groundSwarmVisuals.set(projectile.id, visual);
      }
      const progress = Math.max(0, Math.min(1, projectile.progress));
      const eased = progress * progress * (3 - 2 * progress);
      const direction = projectile.targetX >= projectile.startX ? 1 : -1;
      const weave = Math.sin(progress * Math.PI * 4 + projectile.weavePhase) * (1 - progress) * 1.1;
      visual.mesh.position.set(
        projectile.startX + (projectile.targetX - projectile.startX) * eased + weave * direction,
        12.8 + (GROUND_ATTACK_TARGET_Y - 12.8) * progress + Math.sin(progress * Math.PI) * projectile.arcHeight,
        1.2 + Math.sin(progress * Math.PI * 3 + projectile.weavePhase) * (1 - progress) * 1.35,
      );
      visual.mesh.scaling.setAll(0.72 + Math.sin(progress * Math.PI) * 0.36);
      visual.mesh.visibility = projectile.progress >= 0 ? 1 : 0;
      visual.trail.visibility = visual.mesh.visibility * 0.7;
    }
    for (const [id, visual] of this.groundSwarmVisuals) {
      if (activeIds.has(id)) continue;
      visual.trail.stop();
      visual.trail.dispose();
      visual.mesh.dispose();
      this.groundSwarmVisuals.delete(id);
    }

    for (const impact of state.groundSwarmImpacts) {
      if (this.consumedGroundSwarmImpactIds.has(impact.id)) continue;
      this.consumedGroundSwarmImpactIds.add(impact.id);
      this.triggerGroundSwarmImpact(impact.x);
    }
    const retainedImpactIds = new Set(state.groundSwarmImpacts.map((impact) => impact.id));
    for (const id of this.consumedGroundSwarmImpactIds) if (!retainedImpactIds.has(id)) this.consumedGroundSwarmImpactIds.delete(id);
  }

  private triggerGroundSwarmImpact(x: number): void {
    while (this.groundSwarmImpactEffects.length >= MAX_GROUND_SWARM_IMPACTS) {
      const expired = this.groundSwarmImpactEffects.shift()!;
      expired.flash.dispose();
      expired.ring.dispose();
    }
    const position = new Vector3(x, GROUND_ATTACK_TARGET_Y, 1.1);
    const flash = MeshBuilder.CreateSphere('battle-ground-swarm-impact', { diameter: 1.5, segments: 12 }, this.scene);
    flash.position = position;
    flash.material = this.groundSwarmCoreMaterial;
    const ring = MeshBuilder.CreateDisc('battle-ground-swarm-impact-ring', { radius: 1.3, tessellation: 28, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    ring.position = position.add(new Vector3(0, 0, 0.03));
    ring.material = this.groundSwarmMaterial;
    [flash, ring].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.groundSwarmImpactEffects.push({ flash, ring, elapsed: 0, duration: 0.58 });
  }

  private updateGroundSwarmImpacts(dt: number): void {
    for (const effect of this.groundSwarmImpactEffects) {
      effect.elapsed += dt;
      const progress = Math.min(1, effect.elapsed / effect.duration);
      const fade = Math.max(0, 1 - progress);
      effect.flash.scaling.setAll(0.5 + progress * 2.1);
      effect.flash.visibility = fade;
      effect.ring.scaling.setAll(0.55 + progress * 2.8);
      effect.ring.visibility = fade * 0.82;
    }
    for (let index = this.groundSwarmImpactEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.groundSwarmImpactEffects[index];
      if (effect.elapsed < effect.duration) continue;
      effect.flash.dispose();
      effect.ring.dispose();
      this.groundSwarmImpactEffects.splice(index, 1);
    }
  }

  private syncProjectiles(state: Readonly<CombatState>): void {
    const activeIds = new Set<string>();
    for (const missile of state.missiles) {
      activeIds.add(missile.id);
      let mesh = this.projectileMeshes.get(missile.id);
      if (!mesh) {
        mesh = MeshBuilder.CreateSphere(`battle-projectile-${missile.id}`, { diameter: missile.source === 'sam' ? 0.72 : 0.42, segments: 8 }, this.scene);
        mesh.material = missile.source === 'sam' ? this.samProjectileMaterial : this.fighterProjectileMaterial;
        mesh.renderingGroupId = 3;
        mesh.isPickable = false;
        this.projectileMeshes.set(missile.id, mesh);
      }
      mesh.position.set(missile.position.x, 8 + (missile.y - 33) * 0.22, missile.position.z * 0.12);
      mesh.visibility = Math.max(0, 1 - Math.max(0, missile.age - 6) / 2);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (activeIds.has(id)) continue;
      mesh.dispose();
      this.projectileMeshes.delete(id);
    }
  }

  private shipPosition(): Vector3 {
    return this.mothershipRoot.getAbsolutePosition().clone();
  }

  private material(name: string, diffuse: Color3, emissive: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = diffuse;
    material.emissiveColor = emissive;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    return material;
  }

  private flipbook(name: string, texture: Texture, columns: number, rows: number, frame: number, tint: Color3, blend: 'ALPHA' | 'ADDITIVE'): Mesh {
    const mesh = MeshBuilder.CreatePlane(name, { size: 1 }, this.scene);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    const material = new StandardMaterial(`${name}-material`, this.scene);
    const region = texture.clone();
    setAtlasFrame(region, columns, rows, frame);
    material.diffuseColor = tint;
    material.emissiveColor = tint.scale(blend === 'ADDITIVE' ? 0.95 : 0.42);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.alphaMode = blend === 'ADDITIVE' ? Engine.ALPHA_ADD : Engine.ALPHA_COMBINE;
    material.disableDepthWrite = true;
    material.diffuseTexture = region;
    material.emissiveTexture = region;
    mesh.material = material;
    return mesh;
  }

  private impactRing(name: string, position: Vector3, normal: Vector3, diameter: number, thickness: number, material: StandardMaterial): Mesh {
    const ring = MeshBuilder.CreateTorus(name, { diameter, thickness, tessellation: 36 }, this.scene);
    ring.position = position;
    ring.rotationQuaternion = rotationFromUp(normal);
    ring.material = material;
    ring.isPickable = false;
    return ring;
  }

  private setRenderingGroup(meshes: Mesh[]): void {
    meshes.forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
  }

  private alignSpriteTracer(mesh: Mesh, start: Vector3, end: Vector3): void {
    mesh.position = start.add(end).scale(0.5);
    mesh.scaling.x = 0.9;
    mesh.scaling.y = end.subtract(start).length();
  }

  private disposeDamageEffect(effect: DamageEffect): void {
    effect.bubble?.dispose();
    effect.core.dispose();
    effect.ring.dispose();
    effect.secondRing.dispose();
    effect.smoke?.dispose();
    effect.smokeSprite?.dispose(false, true);
    effect.sprite.dispose(false, true);
    effect.debris.forEach((piece) => piece.mesh.dispose());
  }
}

function setFrame(mesh: Mesh, columns: number, rows: number, elapsed: number, frameRate: number): void {
  const target = mesh.material instanceof StandardMaterial ? mesh.material.diffuseTexture : null;
  if (!(target instanceof Texture)) return;
  const frame = Math.max(0, Math.min(columns * rows - 1, Math.floor(Math.max(0, elapsed) * frameRate)));
  setAtlasFrame(target, columns, rows, frame);
}

function setAtlasFrame(mesh: Mesh | Texture, columns: number, rows: number, frame: number): void {
  const target = mesh instanceof Texture ? mesh : mesh.material instanceof StandardMaterial ? mesh.material.diffuseTexture : null;
  if (!(target instanceof Texture)) return;
  target.uScale = 1 / columns;
  target.vScale = 1 / rows;
  const safeFrame = Math.max(0, Math.min(columns * rows - 1, Math.floor(frame)));
  target.uOffset = (safeFrame % columns) / columns;
  target.vOffset = Math.floor(safeFrame / columns) / rows;
}

function frameForProgress(frames: number[], progress: number): number {
  const index = Math.min(frames.length - 1, Math.floor(Math.max(0, progress) * frames.length));
  return frames[Math.max(0, index)] ?? 0;
}

function alignCylinder(mesh: Mesh, start: Vector3, end: Vector3): void {
  const direction = end.subtract(start);
  mesh.position = start.add(end).scale(0.5);
  mesh.scaling.y = direction.length();
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), new Quaternion());
}

function rotationFromUp(normal: Vector3): Quaternion {
  const dot = Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), normal)));
  const axis = Vector3.Cross(Vector3.Up(), normal);
  if (axis.lengthSquared() < 0.0001) return dot >= 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  return Quaternion.RotationAxis(axis.normalize(), Math.acos(dot));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
