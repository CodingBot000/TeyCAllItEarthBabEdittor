import {
  Color3,
  Engine,
  Effect,
  Matrix,
  Mesh,
  MeshBuilder,
  PostProcess,
  Quaternion,
  StandardMaterial,
  Texture,
  TrailMesh,
  TransformNode,
  Vector2,
  Vector3,
} from '@babylonjs/core';
import { BALANCE } from '../../domain/balance';
import type { CombatState } from '../../domain/types';
import { GROUND_ABSORPTION_TARGET_Y, GROUND_ATTACK_TARGET_Y } from './battleVisualCoordinates';

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
  shieldPatch?: Mesh;
  core: Mesh;
  ring: Mesh;
  secondRing: Mesh;
  smoke?: Mesh;
  smokeSprite?: Mesh;
  explosionSprite?: Mesh;
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

interface PlasmaArcVisual {
  glowSegments: Mesh[];
  coreSegments: Mesh[];
  direction: Vector3;
  phase: number;
  amplitude: number;
}

interface PlasmaEffect {
  root: TransformNode;
  elapsed: number;
  duration: number;
  start: Vector3;
  center: Vector3;
  orb: Mesh;
  orbCore: Mesh;
  orbHalo: Mesh;
  pulseRing: Mesh;
  shockRing: Mesh;
  arcs: PlasmaArcVisual[];
}

interface AbsorptionVisual {
  beam: Mesh;
  core: Mesh;
  funnel: Mesh;
  ring: Mesh;
  rods: AbsorptionRod[];
  target: Vector3;
}

interface AbsorptionRod {
  body: Mesh;
  core: Mesh;
  angle: number;
  radius: number;
  phase: number;
}

interface AirDefenseVisual {
  beam: Mesh;
  core: Mesh;
  impact: Mesh;
  explosion?: Mesh;
  elapsed: number;
  duration: number;
  explosionDuration?: number;
  origin: Vector3;
  target: Vector3;
}

interface GroundSwarmVisual {
  members: GroundSwarmMember[];
  trail: TrailMesh;
}

interface GroundSwarmMember {
  mesh: Mesh;
  phase: number;
  angularSpeed: number;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  baseScale: number;
}

interface GroundSwarmImpactVisual {
  flash: Mesh;
  ring: Mesh;
  elapsed: number;
  duration: number;
}

interface SearchBeamVisual {
  beam: Mesh;
  groundRing: Mesh;
  source: Mesh;
  targetOffsetX: number;
  targetOffsetZ: number;
  motionRadius: number;
  motionSpeed: number;
  motionPhase: number;
  holdDuration: number;
  elapsed: number;
}

interface MissileTrailParticle {
  mesh: Mesh;
  age: number;
  lifetime: number;
  baseScale: number;
  drift: Vector3;
}

interface MissileJetVisual {
  glow: Mesh;
  core: Mesh;
}

type ProjectileVisualOriginResolver = (source: 'sam' | 'fighter', sourceId: string) => Vector3 | null;

const SHIELD_DURATION = 1.05;
const SHOW_SHIELD_BUBBLE = true;
const HULL_DURATION = 1.8;
const HULL_SHAKE_DURATION = 0.32;
const HULL_SHAKE_OFFSET = 0.11;
const HULL_SHAKE_ROTATION = 0.0225;
const MAX_DAMAGE_EFFECTS = 6;
const MAX_ABILITY_EFFECTS = 8;
const MAX_AIR_DEFENSE_EFFECTS = 3;
const MAX_GROUND_SWARM_IMPACTS = 12;
const ABILITY_DURATION = 1.8;
const BEAM_RADIUS = 6.5;
const BEAM_RANGE = 22;
const ABSORPTION_ROD_COUNT = 28;
const ABSORPTION_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SAM_MISSILE_SPRITE_URL = '/assets/runtime/sprites/sam-missile-white-jet-web.png';
const SAM_MISSILE_SPRITE_SCALE = 1.95;
const SAM_MISSILE_TRAIL_MAX_PARTICLES = 9;
const SAM_MISSILE_TRAIL_SPAWN_DISTANCE = 0.16;
const SAM_MISSILE_TRAIL_LIFETIME = 0.95;
const SEARCH_BEAM_SOURCE_DIAMETER = 1.2;
const SEARCH_BEAM_GROUND_DIAMETER = 4.16;
const SEARCH_MOTION_PATTERN_COUNT = 50;
const GROUND_SWARM_MIN_VISUAL_MEMBERS = 7;
const GROUND_SWARM_MAX_VISUAL_MEMBERS = 11;
const GROUND_SWARM_ORBIT_HORIZONTAL_MIN_RADIUS = 0.55;
const GROUND_SWARM_ORBIT_HORIZONTAL_MAX_RADIUS = 1.2;
const GROUND_SWARM_ORBIT_VERTICAL_MIN_RADIUS = 0.1;
const GROUND_SWARM_ORBIT_VERTICAL_MAX_RADIUS = 0.3;
const GROUND_SWARM_ORBIT_DEPTH_MIN_RADIUS = 0.22;
const GROUND_SWARM_ORBIT_DEPTH_MAX_RADIUS = 0.62;
const PLASMA_EFFECT_DURATION = 1.85;
// The orb travels for the full effect lifetime. Tune this value to change
// the vertical descent speed while keeping the impact height unchanged.
const PLASMA_DROP_DURATION = PLASMA_EFFECT_DURATION;
const PLASMA_ARC_START_SECONDS = 0.04;
const PLASMA_ARC_RAMP_SECONDS = 0.16;
const PLASMA_ARC_COUNT = 22;
const PLASMA_ARC_SEGMENTS = 7;
const PLASMA_ORB_SCALE = 2;
const EMP_DISTORTION_DURATION = 1.05;
const scaleMothershipEffect = (value: number): number => value * BALANCE.mothership.visualScale;

Effect.ShadersStore.battleOverdriveDistortionFragmentShader = `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screenSize;
uniform vec2 distortionCenter;
uniform float distortionRadius;
uniform float distortionInnerRadius;
uniform float distortionStrength;
uniform float intensity;
uniform float time;
uniform vec2 empCenter;
uniform float empIntensity;
uniform float empTime;

void main(void) {
  vec2 centered = vUV - distortionCenter;
  float aspect = screenSize.x / max(screenSize.y, 1.0);
  vec2 corrected = vec2(centered.x * aspect, centered.y);
  float distanceFromCenter = length(corrected);
  vec2 direction = corrected / max(distanceFromCenter, 0.0001);
  float outerFade = 1.0 - smoothstep(distortionRadius - 0.055, distortionRadius, distanceFromCenter);
  float innerFade = smoothstep(distortionInnerRadius, distortionInnerRadius + 0.08, distanceFromCenter);
  float ring = outerFade * innerFade;
  float ripple = 0.5 + 0.5 * sin(time * 7.5 - distanceFromCenter * 58.0);
  float animatedStrength = distortionStrength * intensity * ring * (0.82 + ripple * 0.18);
  vec2 uvOffset = vec2(direction.x / aspect, direction.y) * animatedStrength;
  vec2 empCentered = vUV - empCenter;
  vec2 empCorrected = vec2(empCentered.x * aspect, empCentered.y);
  float empDistance = length(empCorrected);
  vec2 empDirection = empCorrected / max(empDistance, 0.0001);
  float empWaveRadius = min(1.0, empTime * 0.9);
  float empFront = exp(-pow((empDistance - empWaveRadius) * 31.0, 2.0));
  float empBody = exp(-pow(empDistance * 2.2, 2.0)) * max(0.0, 1.0 - empTime * 0.7);
  float empRipple = sin(empDistance * 74.0 - empTime * 52.0);
  float empStrength = empIntensity * (empFront * (0.025 + 0.009 * empRipple) + empBody * 0.007);
  vec2 empOffset = vec2(empDirection.x / aspect, empDirection.y) * empStrength;
  vec2 warpedUv = clamp(vUV - uvOffset - empOffset, 0.001, 0.999);
  vec2 fringe = vec2(direction.x / aspect, direction.y) * animatedStrength * 0.38
    + vec2(empDirection.x / aspect, empDirection.y) * empStrength * 0.42;

  vec3 original = texture2D(textureSampler, vUV).rgb;
  vec3 warped = vec3(
    texture2D(textureSampler, clamp(warpedUv + fringe, 0.001, 0.999)).r,
    texture2D(textureSampler, warpedUv).g,
    texture2D(textureSampler, clamp(warpedUv - fringe, 0.001, 0.999)).b
  );
  vec3 lensTint = vec3(0.22, 0.72, 1.0) * ring * intensity * (0.045 + ripple * 0.035);
  vec3 empTint = vec3(0.32, 0.82, 1.0) * empIntensity * (empFront * 0.12 + empBody * 0.035);
  float distortionMix = clamp(ring * intensity + empFront * empIntensity * 0.92 + empBody * empIntensity * 0.2, 0.0, 1.0);
  gl_FragColor = vec4(mix(original, warped, distortionMix), 1.0) + vec4(lensTint + empTint, 0.0);
}
`;

export class BattleCombatVfx {
  private readonly shieldImpactTexture: Texture;
  private readonly vfxTexture: Texture;
  private readonly explosionTexture: Texture;
  private readonly smokeTexture: Texture;
  private readonly damageEffects: DamageEffect[] = [];
  private readonly abilityEffects: AbilityEffect[] = [];
  private readonly plasmaEffects: PlasmaEffect[] = [];
  private readonly airDefenseEffects: AirDefenseVisual[] = [];
  private readonly consumedHitIds = new Set<string>();
  private consumedAirDefenseId: string | null = null;
  private consumedPointDefenseId: string | null = null;
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
  private readonly plasmaArcGlowMaterial: StandardMaterial;
  private readonly plasmaArcCoreMaterial: StandardMaterial;
  private readonly plasmaOrbCoreMaterial: StandardMaterial;
  private readonly beamMaterial: StandardMaterial;
  private readonly beamCoreMaterial: StandardMaterial;
  private readonly beamFunnelMaterial: StandardMaterial;
  private readonly beamRingMaterial: StandardMaterial;
  private readonly samProjectileTexture: Texture;
  private readonly samProjectileSpriteMaterial: StandardMaterial;
  private readonly samMissileTrailMaterial: StandardMaterial;
  private readonly samMissileJetGlowMaterial: StandardMaterial;
  private readonly samMissileJetCoreMaterial: StandardMaterial;
  private readonly collisionHullOverlay: Mesh;
  private readonly collisionShieldOverlay: Mesh;
  private readonly collisionHullOverlayMaterial: StandardMaterial;
  private readonly collisionShieldOverlayMaterial: StandardMaterial;
  private readonly overdriveDistortion: PostProcess;
  private collisionHullOverlayScale = 1;
  private collisionShieldOverlayScale = 1;
  private readonly fighterProjectileMaterial: StandardMaterial;
  private readonly airDefenseMaterial: StandardMaterial;
  private readonly airDefenseCoreMaterial: StandardMaterial;
  private readonly pointDefenseMaterial: StandardMaterial;
  private readonly pointDefenseCoreMaterial: StandardMaterial;
  private readonly searchBeamMaterial: StandardMaterial;
  private readonly searchGroundRingMaterial: StandardMaterial;
  private readonly groundSwarmMaterial: StandardMaterial;
  private readonly groundSwarmCoreMaterial: StandardMaterial;
  private readonly projectileMeshes = new Map<string, Mesh>();
  private readonly projectileVisualPositions = new Map<string, Vector3>();
  private readonly projectileLaunchPositions = new Map<string, Vector3>();
  private readonly missileTrailParticles = new Map<string, MissileTrailParticle[]>();
  private readonly missileTrailLastPositions = new Map<string, Vector3>();
  private readonly missileJetVisuals = new Map<string, MissileJetVisual>();
  private readonly groundSwarmVisuals = new Map<string, GroundSwarmVisual>();
  private readonly consumedGroundSwarmImpactIds = new Set<string>();
  private readonly groundSwarmImpactEffects: GroundSwarmImpactVisual[] = [];
  private readonly searchSourceMeshes: Mesh[];
  private readonly mothershipVisualRoot: TransformNode | null;
  private readonly mothershipVisualBasePosition: Vector3 | null;
  private readonly mothershipVisualBaseRotation: Vector3 | null;
  private readonly searchBeamVisuals: SearchBeamVisual[] = [];
  private readonly searchMotionPatterns = Array.from({ length: SEARCH_MOTION_PATTERN_COUNT }, () => ({
    radius: 1.4 + Math.random() * 3.6,
    speed: 0.34 + Math.random() * 0.5,
  }));
  private searchNextBurstIn = 1.2;
  private searchMotionPatternIndex = 0;
  private absorption: AbsorptionVisual | null = null;
  private hullShakeElapsed = HULL_SHAKE_DURATION;
  private hullShakePhase = 0;
  private overdriveDistortionIntensity = 0;
  private overdriveDistortionTime = 0;
  private empDistortionIntensity = 0;
  private empDistortionTime = EMP_DISTORTION_DURATION;
  private disposed = false;

  constructor(
    private readonly scene: import('@babylonjs/core').Scene,
    private readonly mothershipRoot: TransformNode,
    private readonly projectileVisualOriginResolver?: ProjectileVisualOriginResolver,
    mothershipVisualRoot?: TransformNode,
    private readonly camera?: import('@babylonjs/core').Camera,
  ) {
    this.mothershipVisualRoot = mothershipVisualRoot ?? null;
    this.mothershipVisualBasePosition = mothershipVisualRoot?.position.clone() ?? null;
    this.mothershipVisualBaseRotation = mothershipVisualRoot?.rotation.clone() ?? null;
    this.searchSourceMeshes = mothershipVisualRoot?.getChildMeshes(false).filter((mesh): mesh is Mesh => (
      mesh instanceof Mesh
      && (mesh.name === 'mothership-reactor-glow' || mesh.name.startsWith('mothership-underside-emitter-'))
    )).sort((left, right) => left.name.localeCompare(right.name)) ?? [];
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
    this.plasmaArcGlowMaterial = this.material('battle-plasma-arc-glow', new Color3(0.42, 0.08, 0.86), new Color3(0.72, 0.08, 1));
    this.plasmaArcGlowMaterial.alpha = 0.34;
    this.plasmaArcGlowMaterial.alphaMode = Engine.ALPHA_ADD;
    this.plasmaArcGlowMaterial.disableDepthWrite = true;
    this.plasmaArcCoreMaterial = this.material('battle-plasma-arc-core', new Color3(0.82, 0.7, 1), new Color3(0.95, 0.88, 1));
    this.plasmaArcCoreMaterial.alpha = 0.92;
    this.plasmaArcCoreMaterial.alphaMode = Engine.ALPHA_ADD;
    this.plasmaArcCoreMaterial.disableDepthWrite = true;
    this.plasmaOrbCoreMaterial = this.material('battle-plasma-orb-core', new Color3(0.32, 0.06, 0.62), new Color3(0.7, 0.08, 1));
    this.plasmaOrbCoreMaterial.alpha = 0.82;
    this.plasmaOrbCoreMaterial.alphaMode = Engine.ALPHA_COMBINE;
    this.plasmaOrbCoreMaterial.disableDepthWrite = true;
    this.beamMaterial = this.material('battle-abduction-beam', new Color3(0.2, 0.85, 0.76), new Color3(0.15, 0.95, 0.8));
    this.beamMaterial.alpha = 0.34;
    this.beamCoreMaterial = this.material('battle-abduction-beam-core', new Color3(0.72, 1, 0.94), new Color3(0.35, 1, 0.92));
    this.beamCoreMaterial.alpha = 0.86;
    this.beamFunnelMaterial = this.material('battle-abduction-beam-funnel', new Color3(0.12, 0.76, 0.66), new Color3(0.08, 0.72, 0.58));
    this.beamFunnelMaterial.alpha = 0.2;
    this.beamFunnelMaterial.alphaMode = Engine.ALPHA_ADD;
    this.beamFunnelMaterial.disableDepthWrite = true;
    this.beamRingMaterial = this.material('battle-abduction-beam-target', new Color3(0.4, 1, 0.85), new Color3(0.18, 1, 0.82));
    this.samProjectileTexture = new Texture(SAM_MISSILE_SPRITE_URL, scene, true, true, Texture.NEAREST_SAMPLINGMODE);
    this.samProjectileTexture.hasAlpha = true;
    this.samProjectileTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.samProjectileTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.samProjectileSpriteMaterial = new StandardMaterial('battle-sam-projectile-sprite', scene);
    this.samProjectileSpriteMaterial.diffuseColor = Color3.White();
    this.samProjectileSpriteMaterial.emissiveColor = Color3.White();
    this.samProjectileSpriteMaterial.disableLighting = true;
    this.samProjectileSpriteMaterial.backFaceCulling = false;
    this.samProjectileSpriteMaterial.useAlphaFromDiffuseTexture = true;
    this.samProjectileSpriteMaterial.transparencyMode = Engine.ALPHA_COMBINE;
    this.samProjectileSpriteMaterial.diffuseTexture = this.samProjectileTexture;
    this.samProjectileSpriteMaterial.emissiveTexture = this.samProjectileTexture;
    this.samMissileTrailMaterial = this.material('battle-sam-missile-trail', new Color3(0.78, 0.82, 0.88), new Color3(0.38, 0.42, 0.48));
    this.samMissileTrailMaterial.alpha = 0.52;
    this.samMissileTrailMaterial.alphaMode = Engine.ALPHA_COMBINE;
    this.samMissileTrailMaterial.disableDepthWrite = true;
    this.samMissileJetGlowMaterial = this.material('battle-sam-missile-jet-glow', new Color3(1, 0.04, 0.01), new Color3(1, 0.12, 0.02));
    this.samMissileJetGlowMaterial.alpha = 0.46;
    this.samMissileJetGlowMaterial.alphaMode = Engine.ALPHA_ADD;
    this.samMissileJetGlowMaterial.disableDepthWrite = true;
    this.samMissileJetCoreMaterial = this.material('battle-sam-missile-jet-core', new Color3(1, 0.32, 0.04), new Color3(1, 0.55, 0.08));
    this.samMissileJetCoreMaterial.alpha = 0.78;
    this.samMissileJetCoreMaterial.alphaMode = Engine.ALPHA_ADD;
    this.samMissileJetCoreMaterial.disableDepthWrite = true;
    this.collisionHullOverlayMaterial = this.material('battle-debug-hull-hitbox', new Color3(1, 0.12, 0.08), new Color3(1, 0.04, 0.01));
    this.collisionHullOverlayMaterial.alpha = 0.3;
    this.collisionHullOverlayMaterial.wireframe = true;
    this.collisionHullOverlayMaterial.alphaMode = Engine.ALPHA_ADD;
    this.collisionHullOverlayMaterial.disableDepthWrite = true;
    this.collisionShieldOverlayMaterial = this.material('battle-debug-shield-hitbox', new Color3(0.12, 0.85, 1), new Color3(0.08, 0.65, 1));
    this.collisionShieldOverlayMaterial.alpha = 0.28;
    this.collisionShieldOverlayMaterial.wireframe = true;
    this.collisionShieldOverlayMaterial.alphaMode = Engine.ALPHA_ADD;
    this.collisionShieldOverlayMaterial.disableDepthWrite = true;
    this.collisionHullOverlay = this.createCollisionOverlay('battle-debug-mothership-hull-hitbox', this.collisionHullOverlayMaterial);
    this.collisionShieldOverlay = this.createCollisionOverlay('battle-debug-mothership-shield-hitbox', this.collisionShieldOverlayMaterial);
    this.fighterProjectileMaterial = this.material('battle-fighter-projectile', new Color3(0.22, 0.78, 1), new Color3(0.08, 0.72, 1));
    this.airDefenseMaterial = this.material('battle-air-defense-laser', new Color3(1, 0.24, 0.08), new Color3(1, 0.08, 0.01));
    this.airDefenseMaterial.alpha = 0.42;
    this.airDefenseMaterial.alphaMode = Engine.ALPHA_ADD;
    this.airDefenseCoreMaterial = this.material('battle-air-defense-laser-core', new Color3(1, 0.92, 0.64), new Color3(1, 0.4, 0.04));
    this.pointDefenseMaterial = this.material('battle-point-defense-laser', new Color3(1, 0.72, 0.08), new Color3(1, 0.3, 0.01));
    this.pointDefenseMaterial.alpha = 0.46;
    this.pointDefenseMaterial.alphaMode = Engine.ALPHA_ADD;
    this.pointDefenseCoreMaterial = this.material('battle-point-defense-laser-core', new Color3(1, 0.98, 0.58), new Color3(1, 0.62, 0.04));
    this.searchBeamMaterial = this.material('battle-search-beam', new Color3(0.22, 0.78, 1), new Color3(0.12, 0.9, 1));
    this.searchBeamMaterial.alpha = 0.16;
    this.searchBeamMaterial.alphaMode = Engine.ALPHA_ADD;
    this.searchGroundRingMaterial = this.material('battle-search-ground-ring', new Color3(0.38, 1, 0.86), new Color3(0.16, 1, 0.82));
    this.searchGroundRingMaterial.alpha = 0.34;
    this.searchGroundRingMaterial.alphaMode = Engine.ALPHA_ADD;
    this.groundSwarmMaterial = this.material('battle-ground-swarm', new Color3(0.92, 0.72, 0.24), new Color3(1, 0.36, 0.03));
    this.groundSwarmCoreMaterial = this.material('battle-ground-swarm-core', new Color3(1, 0.96, 0.68), new Color3(1, 0.72, 0.08));

    this.overdriveDistortion = new PostProcess('battle-overdrive-distortion', 'battleOverdriveDistortion', {
      camera: this.camera ?? this.scene.activeCamera,
      samplingMode: Texture.BILINEAR_SAMPLINGMODE,
      uniforms: ['screenSize', 'distortionCenter', 'distortionRadius', 'distortionInnerRadius', 'distortionStrength', 'intensity', 'time', 'empCenter', 'empIntensity', 'empTime'],
    });
    // This post-process is attached for the whole battle, including frames
    // where both effects have zero intensity. Clear its output every frame so
    // moving sprites cannot accumulate in the previous color buffer.
    this.overdriveDistortion.autoClear = true;
    this.overdriveDistortion.onApply = (effect) => {
      const engine = this.scene.getEngine();
      const width = Math.max(1, this.overdriveDistortion.width || engine.getRenderWidth());
      const height = Math.max(1, this.overdriveDistortion.height || engine.getRenderHeight());
      const activeCamera = this.camera ?? this.scene.activeCamera;
      const projected = activeCamera
        ? Vector3.Project(this.shipPosition(), Matrix.Identity(), activeCamera.getTransformationMatrix(), activeCamera.viewport.toGlobal(width, height))
        : new Vector3(width * 0.5, height * 0.5, 0);
      effect.setVector2('screenSize', new Vector2(width, height));
      effect.setVector2('distortionCenter', new Vector2(projected.x / width, 1 - projected.y / height));
      effect.setFloat('distortionRadius', 0.34);
      effect.setFloat('distortionInnerRadius', 0.105);
      effect.setFloat('distortionStrength', 0.028);
      effect.setFloat('intensity', this.overdriveDistortionIntensity);
      effect.setFloat('time', this.overdriveDistortionTime);
      effect.setVector2('empCenter', new Vector2(projected.x / width, 1 - projected.y / height));
      effect.setFloat('empIntensity', this.empDistortionIntensity);
      effect.setFloat('empTime', this.empDistortionTime);
    };

  }

  triggerMothershipHit(kind: DamageKind, normal = new Vector3(0.72, -0.18, -1), source: 'sam' | 'fighter' = 'fighter'): void {
    if (this.disposed) return;
    while (this.damageEffects.length >= MAX_DAMAGE_EFFECTS) this.disposeDamageEffect(this.damageEffects.shift()!);
    const direction = normal.normalize();
    const horizontalImpactRadius = kind === 'SHIELD' ? BALANCE.mothership.shieldHitRadius : BALANCE.mothership.hullHitRadius;
    const verticalImpactRadius = kind === 'SHIELD' ? BALANCE.mothership.shieldHitHalfHeight : BALANCE.mothership.hullHitHalfHeight;
    const localImpact = new Vector3(direction.x * horizontalImpactRadius, direction.y * verticalImpactRadius, direction.z * horizontalImpactRadius);
    if (kind === 'HULL') this.startHullShake();
    this.damageEffects.push(kind === 'SHIELD'
      ? this.createShieldEffect(direction, localImpact, source === 'sam')
      : this.createHullEffect(`hit-${this.damageId.value++}`, direction, localImpact));
  }

  triggerAbility(kind: HeavyAbility, target: Vector3): void {
    if (this.disposed) return;
    if (kind === 'plasma') {
      this.triggerPlasmaEffect();
      return;
    }
    this.triggerEmpDistortion();
    while (this.abilityEffects.length >= MAX_ABILITY_EFFECTS) this.abilityEffects.shift()?.root.dispose();
    const root = new TransformNode(`battle-${kind}-${this.abilityId.value++}`, this.scene);
    const ship = this.shipPosition();
    const start = ship.add(new Vector3(0, -scaleMothershipEffect(0.7), -scaleMothershipEffect(0.5)));
    const targetPoint = target.clone();
    const sourceMaterial = this.empMaterial;
    const tracerFrames = [12, 5, 3];
    const impactFrames = [2, 9, 11];
    const ringFrames = [3, 7, 12];
    const secondRingFrames = [9, 2, 11];
    const tracer = this.flipbook(`${root.name}-tracer`, this.vfxTexture, 4, 4, tracerFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    tracer.parent = root;
    this.alignSpriteTracer(tracer, start, targetPoint);
    const impact = this.flipbook(`${root.name}-impact`, this.vfxTexture, 4, 4, impactFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    impact.parent = root;
    impact.position = targetPoint.clone();
    impact.scaling.setAll(4);
    const ring = this.flipbook(`${root.name}-ring`, this.vfxTexture, 4, 4, ringFrames[0], sourceMaterial.diffuseColor, 'ADDITIVE');
    ring.parent = root;
    ring.position = targetPoint.clone();
    ring.scaling.setAll(9.2);
    const secondRing = this.flipbook(`${root.name}-ring-secondary`, this.vfxTexture, 4, 4, secondRingFrames[0], Color3.White(), 'ADDITIVE');
    secondRing.parent = root;
    secondRing.position = targetPoint.clone();
    secondRing.scaling.setAll(6.2);
    const explosion = this.flipbook(`${root.name}-explosion`, this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA');
    explosion.parent = root;
    explosion.position = targetPoint.add(new Vector3(0, 0.48, 0));
    explosion.scaling.setAll(3);
    const smoke = this.flipbook(`${root.name}-smoke`, this.smokeTexture, 8, 8, 0, new Color3(0.52, 0.54, 0.56), 'ALPHA');
    smoke.parent = root;
    smoke.position = targetPoint.add(new Vector3(0, 0.68, 0));
    smoke.scaling.setAll(1.4);
    const fallbackTracer = MeshBuilder.CreateCylinder(`${root.name}-fallback-tracer`, { diameter: scaleMothershipEffect(0.6), height: 1, tessellation: 12 }, this.scene);
    fallbackTracer.parent = root;
    fallbackTracer.material = sourceMaterial;
    alignCylinder(fallbackTracer, start, targetPoint);
    const fallbackImpact = MeshBuilder.CreateSphere(`${root.name}-fallback-impact`, { diameter: 1.6, segments: 16 }, this.scene);
    fallbackImpact.parent = root;
    fallbackImpact.position = targetPoint.clone();
    fallbackImpact.material = sourceMaterial;
    const fallbackRing = MeshBuilder.CreateTorus(`${root.name}-fallback-ring`, { diameter: 8.5, thickness: 0.28, tessellation: 36 }, this.scene);
    fallbackRing.parent = root;
    fallbackRing.position = targetPoint.clone();
    fallbackRing.material = sourceMaterial;
    const fallbackSecondRing = MeshBuilder.CreateTorus(`${root.name}-fallback-ring-2`, { diameter: 5.2, thickness: 0.16, tessellation: 32 }, this.scene);
    fallbackSecondRing.parent = root;
    fallbackSecondRing.position = targetPoint.clone();
    fallbackSecondRing.material = sourceMaterial;
    [tracer, impact, ring, secondRing, explosion, smoke].forEach((mesh) => { mesh.renderingGroupId = 3; });
    [fallbackTracer, fallbackImpact, fallbackRing, fallbackSecondRing].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.abilityEffects.push({ kind, root, elapsed: 0, duration: ABILITY_DURATION, target: targetPoint, tracer, impact, ring, secondRing, explosion, smoke, fallbackTracer, fallbackImpact, fallbackRing, fallbackSecondRing, tracerFrames, impactFrames, ringFrames, secondRingFrames });
  }

  private triggerPlasmaEffect(): void {
    while (this.plasmaEffects.length >= 2) this.disposePlasmaEffect(this.plasmaEffects.shift()!);
    const root = new TransformNode(`battle-plasma-drop-${this.abilityId.value++}`, this.scene);
    const ship = this.shipPosition();
    const start = ship.add(new Vector3(0, -scaleMothershipEffect(1.25), -0.65));
    const center = new Vector3(
      ship.x,
      (ship.y + GROUND_ATTACK_TARGET_Y) * 0.5,
      ship.z - 0.7,
    );
    const orb = this.flipbook(`${root.name}-orb`, this.vfxTexture, 4, 4, 9, new Color3(0.66, 0.3, 1), 'ALPHA');
    orb.parent = root;
    orb.scaling.setAll(3.8);
    const orbCore = MeshBuilder.CreateSphere(`${root.name}-orb-core`, { diameter: 1.45, segments: 20 }, this.scene);
    orbCore.parent = root;
    orbCore.material = this.plasmaOrbCoreMaterial;
    orbCore.position.z = -0.55;
    const orbHalo = this.flipbook(`${root.name}-orb-halo`, this.vfxTexture, 4, 4, 11, new Color3(0.72, 0.18, 1), 'ADDITIVE');
    orbHalo.parent = root;
    orbHalo.scaling.setAll(4.9);
    const pulseRing = this.flipbook(`${root.name}-pulse-ring`, this.vfxTexture, 4, 4, 10, new Color3(0.42, 0.88, 1), 'ADDITIVE');
    pulseRing.parent = root;
    pulseRing.scaling.setAll(4.8);
    const shockRing = this.flipbook(`${root.name}-shock-ring`, this.vfxTexture, 4, 4, 3, new Color3(0.48, 0.92, 1), 'ADDITIVE');
    shockRing.parent = root;
    shockRing.scaling.setAll(1.4);
    const arcs = this.createPlasmaArcs(root, center);
    [orb, orbCore, orbHalo, pulseRing, shockRing, ...arcs.flatMap((arc) => [...arc.glowSegments, ...arc.coreSegments])].forEach((mesh) => {
      mesh.renderingGroupId = 3;
      mesh.isPickable = false;
    });
    this.plasmaEffects.push({ root, elapsed: 0, duration: PLASMA_EFFECT_DURATION, start, center, orb, orbCore, orbHalo, pulseRing, shockRing, arcs });
  }

  private triggerEmpDistortion(): void {
    this.empDistortionTime = 0;
    this.empDistortionIntensity = 1;
  }

  private createPlasmaArcs(root: TransformNode, center: Vector3): PlasmaArcVisual[] {
    const { halfWidth, halfHeight } = this.plasmaScreenRadii(center);
    return Array.from({ length: PLASMA_ARC_COUNT }, (_, index) => {
      const angle = index / PLASMA_ARC_COUNT * Math.PI * 2 + (seededUnit(index * 13 + 17) - 0.5) * 0.22;
      const reach = 0.88 + seededUnit(index * 29 + 11) * 0.2;
      const direction = new Vector3(
        Math.cos(angle) * halfWidth * reach,
        Math.sin(angle) * halfHeight * reach,
        -0.55 - seededUnit(index * 37 + 5) * 0.45,
      );
      const glowSegments = Array.from({ length: PLASMA_ARC_SEGMENTS }, (_, segment) => {
        const mesh = MeshBuilder.CreateCylinder(`${root.name}-arc-glow-${index}-${segment}`, { diameter: 0.42, height: 1, tessellation: 6 }, this.scene);
        mesh.material = this.plasmaArcGlowMaterial;
        return mesh;
      });
      const coreSegments = Array.from({ length: PLASMA_ARC_SEGMENTS }, (_, segment) => {
        const mesh = MeshBuilder.CreateCylinder(`${root.name}-arc-core-${index}-${segment}`, { diameter: 0.13, height: 1, tessellation: 6 }, this.scene);
        mesh.material = this.plasmaArcCoreMaterial;
        return mesh;
      });
      [...glowSegments, ...coreSegments].forEach((mesh) => { mesh.parent = root; });
      return {
        glowSegments,
        coreSegments,
        direction,
        phase: seededUnit(index * 43 + 23) * Math.PI * 2,
        amplitude: 0.9 + seededUnit(index * 47 + 31) * 1.7,
      };
    });
  }

  private plasmaScreenRadii(center: Vector3): { halfWidth: number; halfHeight: number } {
    const engine = this.scene.getEngine();
    const camera = this.camera ?? this.scene.activeCamera;
    if (!camera) return { halfWidth: 52, halfHeight: 29 };
    const distance = Math.max(1, Math.abs(camera.position.z - center.z));
    const visibleHeight = 2 * distance * Math.tan(camera.fov / 2);
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    return { halfWidth: visibleHeight * aspect * 0.56, halfHeight: visibleHeight * 0.54 };
  }

  syncCombatState(state: Readonly<CombatState>): void {
    if (this.disposed) return;
    const overdriveRemaining = Math.max(0, state.mothership.overdriveSeconds);
    const overdriveElapsed = BALANCE.overdrive.duration - overdriveRemaining;
    const fadeIn = Math.min(1, overdriveElapsed / 0.22);
    const fadeOut = Math.min(1, overdriveRemaining / 0.35);
    this.overdriveDistortionIntensity = fadeIn * fadeOut;
    for (const hit of state.mothershipHits) {
      if (this.consumedHitIds.has(hit.id)) continue;
      this.consumedHitIds.add(hit.id);
      this.triggerMothershipHit(hit.kind, new Vector3(hit.direction.x, hit.direction.y, hit.direction.z), hit.source);
    }
    const retainedHits = new Set(state.mothershipHits.map((hit) => hit.id));
    for (const id of this.consumedHitIds) if (!retainedHits.has(id)) this.consumedHitIds.delete(id);
    this.syncProjectiles(state);
    this.syncCollisionOverlay(state);
    this.syncGroundSwarm(state);
    if (state.lastAirDefenseShot && state.lastAirDefenseShot.id !== this.consumedAirDefenseId) {
      this.consumedAirDefenseId = state.lastAirDefenseShot.id;
      this.triggerAirDefenseShot(
        state.lastAirDefenseShot.origin,
        state.lastAirDefenseShot.target,
        state.lastAirDefenseShot.targetAltitude,
        this.projectileVisualOriginResolver?.('fighter', state.lastAirDefenseShot.targetId) ?? undefined,
      );
    }
    if (state.lastPointDefenseShot && state.lastPointDefenseShot.id !== this.consumedPointDefenseId) {
      this.consumedPointDefenseId = state.lastPointDefenseShot.id;
      this.triggerPointDefenseShot(
        state.lastPointDefenseShot.origin,
        state.lastPointDefenseShot.target,
        state.lastPointDefenseShot.targetAltitude,
        this.projectileVisualPositions.get(state.lastPointDefenseShot.targetId),
      );
    }
    const target = state.absorbableTargets.find((item) => item.id === state.activeBeamTargetId);
    this.setAbsorption(Boolean(state.activeAbility === 'beam' && target), target ? new Vector3(target.center.x, GROUND_ABSORPTION_TARGET_Y, target.center.z) : undefined);
  }

  toggleAbsorption(target = new Vector3(0, GROUND_ABSORPTION_TARGET_Y, 0)): boolean {
    const next = !this.absorption;
    this.setAbsorption(next, target);
    return next;
  }

  setAbsorption(active: boolean, target = new Vector3(0, GROUND_ABSORPTION_TARGET_Y, 0)): void {
    if (!active) {
      if (!this.absorption) return;
      this.absorption.beam.dispose();
      this.absorption.core.dispose();
      this.absorption.funnel.dispose();
      this.absorption.ring.dispose();
      this.absorption.rods.forEach((rod) => { rod.body.dispose(); rod.core.dispose(); });
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
    const rods = Array.from({ length: ABSORPTION_ROD_COUNT }, (_, index) => {
      const inner = index < ABSORPTION_ROD_COUNT * 0.48;
      const radius = inner
        ? seededUnit(index + 31) * 2.25
        : 2.35 + seededUnit(index + 67) * (BEAM_RADIUS - 2.35);
      const angle = index * ABSORPTION_GOLDEN_ANGLE + seededUnit(index + 101) * 0.42;
      const diameter = inner
        ? 0.18 + seededUnit(index + 131) * 0.4
        : 0.1 + seededUnit(index + 151) * 0.18;
      const body = MeshBuilder.CreateCylinder(`battle-abduction-rod-${index}`, { diameter, height: 1, tessellation: 8 }, this.scene);
      const rodCore = MeshBuilder.CreateCylinder(`battle-abduction-rod-core-${index}`, { diameter: diameter * 0.28, height: 1, tessellation: 6 }, this.scene);
      body.material = this.beamMaterial;
      rodCore.material = this.beamCoreMaterial;
      return { body, core: rodCore, angle, radius, phase: seededUnit(index + 181) * Math.PI * 2 };
    });
    [beam, core, funnel, ring, ...rods.flatMap((rod) => [rod.body, rod.core])].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.absorption = { beam, core, funnel, ring, rods, target: target.clone() };
  }

  private createCollisionOverlay(name: string, material: StandardMaterial): Mesh {
    const overlay = MeshBuilder.CreateSphere(name, { diameter: 2, segments: 24 }, this.scene);
    overlay.material = material;
    overlay.renderingGroupId = 3;
    overlay.isPickable = false;
    overlay.setEnabled(false);
    return overlay;
  }

  private syncCollisionOverlay(state: Readonly<CombatState>): void {
    const center = this.shipPosition();
    const projectileRadius = BALANCE.defense.samProjectileRadius;
    this.collisionHullOverlay.position.copyFrom(center);
    this.collisionHullOverlay.scaling.set(
      BALANCE.mothership.hullHitRadius + projectileRadius,
      BALANCE.mothership.hullHitHalfHeight + projectileRadius,
      BALANCE.mothership.hullHitRadius + projectileRadius,
    );
    this.collisionHullOverlay.scaling.scaleInPlace(this.collisionHullOverlayScale);
    this.collisionHullOverlay.visibility = state.mothership.shield > 0 ? 0.18 : 0.62;
    this.collisionShieldOverlay.position.copyFrom(center);
    this.collisionShieldOverlay.scaling.set(
      BALANCE.mothership.shieldHitRadius + projectileRadius,
      BALANCE.mothership.shieldHitHalfHeight + projectileRadius,
      BALANCE.mothership.shieldHitRadius + projectileRadius,
    );
    this.collisionShieldOverlay.scaling.scaleInPlace(this.collisionShieldOverlayScale);
    this.collisionShieldOverlay.visibility = state.mothership.shield > 0 ? 0.7 : 0.08;
  }

  setCollisionOverlayScale(kind: 'hull' | 'shield', scale: number): void {
    const value = Math.max(0.25, Math.min(3, scale));
    if (kind === 'hull') this.collisionHullOverlayScale = value;
    else this.collisionShieldOverlayScale = value;
  }

  setCollisionOverlayVisible(visible: boolean): void {
    this.collisionHullOverlay.setEnabled(visible);
    this.collisionShieldOverlay.setEnabled(visible);
  }

  getPostProcessAutoClear(): boolean {
    return this.overdriveDistortion.autoClear;
  }

  resetCollisionOverlayScale(): void {
    this.collisionHullOverlayScale = 1;
    this.collisionShieldOverlayScale = 1;
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
    this.overdriveDistortionTime += Math.max(0, dt);
    this.empDistortionTime += Math.max(0, dt);
    if (this.empDistortionTime >= EMP_DISTORTION_DURATION) this.empDistortionIntensity = 0;
    this.updateHullShake(dt);
    this.updateDamageEffects(dt);
    this.updateAbilityEffects(dt);
    this.updatePlasmaEffects(dt);
    this.updateAirDefenseEffects(dt);
    this.updateMissileTrails(dt);
    this.updateGroundSwarmImpacts(dt);
    this.updateSearchBeams(dt);
    this.updateAbsorption(elapsed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.damageEffects.splice(0).forEach((effect) => this.disposeDamageEffect(effect));
    this.abilityEffects.splice(0).forEach((effect) => effect.root.dispose());
    this.plasmaEffects.splice(0).forEach((effect) => this.disposePlasmaEffect(effect));
    this.projectileMeshes.forEach((mesh) => mesh.dispose());
    this.projectileMeshes.clear();
    this.projectileVisualPositions.clear();
    this.projectileLaunchPositions.clear();
    this.missileTrailParticles.forEach((particles) => particles.forEach((particle) => particle.mesh.dispose()));
    this.missileTrailParticles.clear();
    this.missileTrailLastPositions.clear();
    this.missileJetVisuals.forEach((visual) => { visual.glow.dispose(); visual.core.dispose(); });
    this.missileJetVisuals.clear();
    this.groundSwarmVisuals.forEach((visual) => {
      visual.trail.stop();
      visual.trail.dispose();
      visual.members.forEach((member) => member.mesh.dispose());
    });
    this.groundSwarmVisuals.clear();
    this.groundSwarmImpactEffects.splice(0).forEach((effect) => { effect.flash.dispose(); effect.ring.dispose(); });
    this.searchBeamVisuals.splice(0).forEach((effect) => this.disposeSearchBeam(effect));
    this.consumedGroundSwarmImpactIds.clear();
    this.consumedHitIds.clear();
    this.consumedAirDefenseId = null;
    this.consumedPointDefenseId = null;
    this.airDefenseEffects.splice(0).forEach((effect) => {
      effect.beam.dispose();
      effect.core.dispose();
      effect.impact.dispose();
      effect.explosion?.dispose(false, true);
    });
    if (this.absorption) {
      this.absorption.beam.dispose();
      this.absorption.core.dispose();
      this.absorption.funnel.dispose();
      this.absorption.ring.dispose();
      this.absorption.rods.forEach((rod) => { rod.body.dispose(); rod.core.dispose(); });
    }
    this.overdriveDistortion.dispose();
    [this.shieldBubbleMaterial, this.shieldRingMaterial, this.shieldCoreMaterial, this.hullFlashMaterial, this.hullSmokeMaterial, this.hullDebrisMaterial, this.empMaterial, this.plasmaMaterial, this.plasmaArcGlowMaterial, this.plasmaArcCoreMaterial, this.plasmaOrbCoreMaterial, this.beamMaterial, this.beamCoreMaterial, this.beamFunnelMaterial, this.beamRingMaterial, this.samProjectileSpriteMaterial, this.samMissileTrailMaterial, this.samMissileJetGlowMaterial, this.samMissileJetCoreMaterial, this.collisionHullOverlayMaterial, this.collisionShieldOverlayMaterial, this.fighterProjectileMaterial, this.airDefenseMaterial, this.airDefenseCoreMaterial, this.pointDefenseMaterial, this.pointDefenseCoreMaterial, this.searchBeamMaterial, this.searchGroundRingMaterial, this.groundSwarmMaterial, this.groundSwarmCoreMaterial].forEach((material) => material.dispose());
    this.samProjectileTexture.dispose();
    this.collisionHullOverlay.dispose();
    this.collisionShieldOverlay.dispose();
    [this.shieldImpactTexture, this.vfxTexture, this.explosionTexture, this.smokeTexture].forEach((texture) => texture.dispose());
  }

  private createShieldEffect(normal: Vector3, localImpact: Vector3, includeExplosion: boolean): DamageEffect {
    const center = this.shipPosition();
    const impact = center.add(localImpact);
    const bubble = MeshBuilder.CreateSphere('battle-shield-impact-shell', { diameter: 2, segments: 20 }, this.scene);
    bubble.position = center;
    bubble.scaling = new Vector3(BALANCE.mothership.shieldVisualRadius, BALANCE.mothership.shieldVisualHalfHeight, BALANCE.mothership.shieldVisualRadius);
    bubble.material = this.shieldBubbleMaterial;
    bubble.visibility = SHOW_SHIELD_BUBBLE ? 1 : 0;
    const core = MeshBuilder.CreateSphere('battle-shield-impact-core', { diameter: scaleMothershipEffect(1.25), segments: 12 }, this.scene);
    core.position = impact;
    core.material = this.shieldCoreMaterial;
    const ring = this.impactRing('battle-shield-impact-ring', impact, normal, scaleMothershipEffect(2.3), scaleMothershipEffect(0.16), this.shieldRingMaterial);
    const secondRing = this.impactRing('battle-shield-impact-ring-secondary', impact.add(normal.scale(scaleMothershipEffect(0.06))), normal, scaleMothershipEffect(1.45), scaleMothershipEffect(0.1), this.shieldCoreMaterial);
    const sprite = this.flipbook('battle-shield-impact-sprite', this.shieldImpactTexture, 1, 1, 0, new Color3(0.18, 0.88, 1), 'ADDITIVE');
    sprite.position = impact.add(normal.scale(scaleMothershipEffect(0.16)));
    sprite.scaling.setAll(scaleMothershipEffect(2.2));
    const explosionSprite = includeExplosion ? this.flipbook('battle-sam-shield-impact-explosion', this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA') : undefined;
    if (explosionSprite) {
      explosionSprite.position = impact.add(normal.scale(scaleMothershipEffect(0.65)));
      explosionSprite.scaling.setAll(scaleMothershipEffect(3.2));
    }
    this.setRenderingGroup([bubble, core, ring, secondRing, sprite, ...(explosionSprite ? [explosionSprite] : [])]);
    return { kind: 'SHIELD', elapsed: 0, duration: SHIELD_DURATION, normal, localImpact, bubble, core, ring, secondRing, sprite, explosionSprite, debris: [] };
  }

  private startHullShake(): void {
    this.hullShakeElapsed = 0;
    this.hullShakePhase = (this.hullShakePhase + Math.PI * 0.73) % (Math.PI * 2);
  }

  private updateHullShake(dt: number): void {
    const root = this.mothershipVisualRoot;
    const basePosition = this.mothershipVisualBasePosition;
    const baseRotation = this.mothershipVisualBaseRotation;
    if (!root || !basePosition || !baseRotation) return;

    if (this.hullShakeElapsed >= HULL_SHAKE_DURATION) {
      root.position.copyFrom(basePosition);
      root.rotation.copyFrom(baseRotation);
      return;
    }

    this.hullShakeElapsed = Math.min(HULL_SHAKE_DURATION, this.hullShakeElapsed + Math.max(0, dt));
    const progress = this.hullShakeElapsed / HULL_SHAKE_DURATION;
    const envelope = Math.sin(progress * Math.PI);
    const oscillation = Math.sin(progress * Math.PI * 5 + this.hullShakePhase);
    const secondaryOscillation = Math.cos(progress * Math.PI * 4.2 + this.hullShakePhase * 0.7);
    const offset = HULL_SHAKE_OFFSET * envelope;
    root.position.set(
      basePosition.x + oscillation * offset,
      basePosition.y + secondaryOscillation * offset * 0.34,
      basePosition.z + oscillation * offset * 0.16,
    );
    root.rotation.set(
      baseRotation.x + secondaryOscillation * HULL_SHAKE_ROTATION * envelope * 0.5,
      baseRotation.y + oscillation * HULL_SHAKE_ROTATION * envelope * 0.35,
      baseRotation.z + oscillation * HULL_SHAKE_ROTATION * envelope,
    );
  }

  private createHullEffect(id: string, normal: Vector3, localImpact: Vector3): DamageEffect {
    const impact = this.shipPosition().add(localImpact.scale(1.04));
    const core = MeshBuilder.CreateSphere('battle-hull-impact-explosion', { diameter: scaleMothershipEffect(1.5), segments: 14 }, this.scene);
    core.position = impact;
    core.material = this.hullFlashMaterial;
    const smoke = MeshBuilder.CreateSphere('battle-hull-impact-smoke', { diameter: scaleMothershipEffect(1.8), segments: 10 }, this.scene);
    smoke.position = impact.add(normal.scale(scaleMothershipEffect(0.3)));
    smoke.material = this.hullSmokeMaterial;
    const ring = this.impactRing('battle-hull-impact-ring', impact, normal, scaleMothershipEffect(2.1), scaleMothershipEffect(0.22), this.hullFlashMaterial);
    const secondRing = this.impactRing('battle-hull-impact-ring-secondary', impact.add(normal.scale(scaleMothershipEffect(0.12))), normal, scaleMothershipEffect(1.2), scaleMothershipEffect(0.12), this.hullDebrisMaterial);
    const sprite = this.flipbook('battle-hull-impact-flipbook', this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA');
    sprite.position = impact.add(normal.scale(scaleMothershipEffect(0.65)));
    sprite.scaling.setAll(scaleMothershipEffect(3.2));
    const smokeSprite = this.flipbook('battle-hull-impact-smoke-flipbook', this.smokeTexture, 8, 8, 0, new Color3(0.52, 0.54, 0.56), 'ALPHA');
    smokeSprite.position = impact.add(normal.scale(scaleMothershipEffect(0.9))).add(Vector3.Up().scale(scaleMothershipEffect(0.25)));
    smokeSprite.scaling.setAll(scaleMothershipEffect(1.1));
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
      const size = scaleMothershipEffect(0.28 + a * 0.4);
      const mesh = MeshBuilder.CreateBox(`battle-hull-debris-${index}`, { width: size * 1.7, height: size * 0.65, depth: size }, this.scene);
      mesh.position = impact.add(tangent.scale(scaleMothershipEffect((a - 0.5) * 1.6))).add(bitangent.scale(scaleMothershipEffect((b - 0.5) * 1.6))).add(normal.scale(scaleMothershipEffect(c * 0.45)));
      mesh.rotation = new Vector3(a * Math.PI, b * Math.PI, c * Math.PI);
      mesh.material = this.hullDebrisMaterial;
      return {
        mesh,
        velocity: normal.scale(scaleMothershipEffect(3.8 + c * 5.2)).add(tangent.scale(scaleMothershipEffect((a - 0.5) * 11))).add(bitangent.scale(scaleMothershipEffect((b - 0.35) * 8))).add(Vector3.Up().scale(scaleMothershipEffect(2.2 + b * 5.6))),
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
        effect.bubble!.scaling = new Vector3(BALANCE.mothership.shieldVisualRadius + pulse * scaleMothershipEffect(0.45), BALANCE.mothership.shieldVisualHalfHeight + pulse * scaleMothershipEffect(0.2), BALANCE.mothership.shieldVisualRadius + pulse * scaleMothershipEffect(0.45));
        effect.bubble!.visibility = SHOW_SHIELD_BUBBLE ? pulse * 0.9 : 0;
        effect.core.position = impact;
        effect.core.scaling.setAll(scaleMothershipEffect(0.45 + pulse * 1.4));
        effect.core.visibility = 1 - progress;
        effect.ring.position = impact;
        effect.secondRing.position = impact.add(effect.normal.scale(scaleMothershipEffect(0.06)));
        effect.ring.scaling.setAll(scaleMothershipEffect(0.55 + progress * 3.3));
        effect.secondRing.scaling.setAll(scaleMothershipEffect(0.45 + progress * 2.4));
        effect.ring.visibility = Math.max(0, 1 - progress);
        effect.secondRing.visibility = Math.max(0, 1 - progress * 1.15);
        effect.sprite.position = impact.add(effect.normal.scale(scaleMothershipEffect(0.16)));
        effect.sprite.scaling.setAll(scaleMothershipEffect(1.5 + progress * 4.2));
        effect.sprite.visibility = pulse * (1 - progress * 0.32);
        if (effect.explosionSprite) {
          setFrame(effect.explosionSprite, 5, 5, effect.elapsed, 30);
          effect.explosionSprite.position = impact.add(effect.normal.scale(scaleMothershipEffect(0.65)));
          effect.explosionSprite.scaling.setAll(scaleMothershipEffect(0.72 + Math.sin(Math.min(1, effect.elapsed / 0.55) * Math.PI / 2) * 2.8));
          effect.explosionSprite.visibility = Math.max(0, 1 - Math.max(0, progress - 0.72) / 0.28);
        }
      } else {
        setFrame(effect.sprite, 5, 5, effect.elapsed, 20);
        setFrame(effect.smokeSprite!, 8, 8, Math.max(0, effect.elapsed - 0.12), 42);
        effect.core.position = impact;
        effect.core.scaling.setAll(scaleMothershipEffect(0.7 + Math.sin(Math.min(1, progress * 2) * Math.PI / 2) * 3.1));
        effect.core.visibility = Math.max(0, 1 - progress * 1.55);
        effect.smoke!.position.y += dt * scaleMothershipEffect(1.2);
        effect.smoke!.scaling.setAll(scaleMothershipEffect(0.8 + progress * 2.5));
        effect.smoke!.visibility = Math.max(0, 0.9 - progress * 0.82);
        effect.smokeSprite!.position = impact.add(effect.normal.scale(scaleMothershipEffect(0.9))).add(Vector3.Up().scale(scaleMothershipEffect(0.25 + progress * 1.35)));
        effect.smokeSprite!.scaling.setAll(scaleMothershipEffect(1.1 + progress * 2.7));
        effect.smokeSprite!.visibility = Math.max(0, 0.82 - progress * 0.72);
        effect.ring.position = impact;
        effect.secondRing.position = impact.add(effect.normal.scale(scaleMothershipEffect(0.12)));
        effect.ring.scaling.setAll(scaleMothershipEffect(0.65 + progress * 4.8));
        effect.secondRing.scaling.setAll(scaleMothershipEffect(0.5 + progress * 3.1));
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

  private triggerAirDefenseShot(origin: { x: number; z: number }, target: { x: number; z: number }, targetAltitude: number, visualTarget?: Vector3): void {
    this.triggerDefenseLaserShot('battle-air-defense-laser', origin, target, targetAltitude, this.airDefenseMaterial, this.airDefenseCoreMaterial, false, visualTarget);
  }

  private triggerPointDefenseShot(origin: { x: number; z: number }, target: { x: number; z: number }, targetAltitude: number, visualTarget?: Vector3): void {
    this.triggerDefenseLaserShot('battle-point-defense-laser', origin, target, targetAltitude, this.pointDefenseMaterial, this.pointDefenseCoreMaterial, true, visualTarget);
  }

  private triggerDefenseLaserShot(
    name: string,
    origin: { x: number; z: number },
    target: { x: number; z: number },
    targetAltitude: number,
    beamMaterial: StandardMaterial,
    coreMaterial: StandardMaterial,
    withExplosion = false,
    visualTarget?: Vector3,
  ): void {
    while (this.airDefenseEffects.length >= MAX_AIR_DEFENSE_EFFECTS) {
      const expired = this.airDefenseEffects.shift()!;
      expired.beam.dispose();
      expired.core.dispose();
      expired.impact.dispose();
      expired.explosion?.dispose(false, true);
    }
    const shipPosition = this.shipPosition();
    const start = shipPosition.add(new Vector3(0, scaleMothershipEffect(1.4), 0));
    const end = visualTarget?.clone() ?? shipPosition.add(new Vector3(
      target.x - origin.x,
      targetAltitude - BALANCE.mothership.baseAltitude,
      target.z - origin.z,
    ));
    const beam = MeshBuilder.CreateCylinder(name, { diameter: 0.72, height: 1, tessellation: 12 }, this.scene);
    beam.material = beamMaterial;
    const core = MeshBuilder.CreateCylinder(`${name}-core`, { diameter: 0.2, height: 1, tessellation: 10 }, this.scene);
    core.material = coreMaterial;
    const impact = MeshBuilder.CreateSphere(`${name}-impact`, { diameter: 1.3, segments: 12 }, this.scene);
    impact.material = coreMaterial;
    const explosion = withExplosion ? this.flipbook(`${name}-explosion`, this.explosionTexture, 5, 5, 0, Color3.White(), 'ALPHA') : undefined;
    if (explosion) {
      explosion.position = end.clone();
      explosion.scaling.setAll(2.6);
    }
    alignCylinder(beam, start, end);
    alignCylinder(core, start, end);
    impact.position = end;
    [beam, core, impact, ...(explosion ? [explosion] : [])].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
    this.airDefenseEffects.push({ beam, core, impact, explosion, elapsed: 0, duration: withExplosion ? 0.42 : 0.24, explosionDuration: withExplosion ? 0.72 : undefined, origin: start, target: end });
  }

  private updatePlasmaEffects(dt: number): void {
    const materialReady = this.vfxTexture.isReady();
    for (const effect of this.plasmaEffects) {
      effect.elapsed += dt;
      const dropProgress = Math.min(1, effect.elapsed / PLASMA_DROP_DURATION);
      const dropEased = dropProgress;
      const orbPosition = Vector3.Lerp(effect.start, effect.center, dropEased);
      const primaryBounce = 0.5 + 0.5 * Math.sin(effect.elapsed * 8.4 - Math.PI / 2);
      const secondaryBounce = 0.5 + 0.5 * Math.sin(effect.elapsed * 16.8 + Math.PI / 5);
      const bounce = 0.78 + primaryBounce * 0.34 + secondaryBounce * 0.08;
      const burstProgress = Math.min(1, Math.max(0, (effect.elapsed - PLASMA_ARC_START_SECONDS) / PLASMA_ARC_RAMP_SECONDS));
      const fadeOut = Math.max(0, 1 - Math.max(0, effect.elapsed - (effect.duration - 0.12)) / 0.12);
      const arcVisibility = burstProgress * fadeOut;

      effect.orb.position.copyFrom(orbPosition);
      effect.orb.scaling.setAll(PLASMA_ORB_SCALE * (3.45 + bounce * 0.55));
      effect.orb.isVisible = materialReady && effect.elapsed < effect.duration;
      effect.orb.visibility = Math.min(1, 0.62 + burstProgress * 0.38) * fadeOut;

      effect.orbCore.position.copyFrom(orbPosition);
      effect.orbCore.position.z -= 0.55;
      effect.orbCore.scaling.setAll(PLASMA_ORB_SCALE * (0.84 + bounce * 0.12));
      effect.orbCore.visibility = Math.min(1, 0.5 + burstProgress * 0.5) * fadeOut;

      effect.orbHalo.position.copyFrom(orbPosition);
      effect.orbHalo.scaling.setAll(PLASMA_ORB_SCALE * (4.2 + bounce * 0.8));
      effect.orbHalo.isVisible = materialReady && effect.elapsed < effect.duration;
      effect.orbHalo.visibility = arcVisibility * 0.85;

      effect.pulseRing.position.copyFrom(orbPosition);
      effect.pulseRing.scaling.setAll(3.4 + bounce * 0.4);
      effect.pulseRing.isVisible = materialReady && effect.elapsed > PLASMA_ARC_START_SECONDS;
      effect.pulseRing.visibility = arcVisibility * 0.58;

      effect.shockRing.position.copyFrom(orbPosition);
      effect.shockRing.scaling.setAll(1.2 + bounce * 0.6);
      effect.shockRing.isVisible = materialReady && effect.elapsed > PLASMA_ARC_START_SECONDS;
      effect.shockRing.visibility = arcVisibility * 0.5;

      const activeCenter = orbPosition;
      effect.arcs.forEach((arc, arcIndex) => {
        arc.glowSegments.forEach((glow, segmentIndex) => {
          const startT = segmentIndex / PLASMA_ARC_SEGMENTS;
          const endT = (segmentIndex + 1) / PLASMA_ARC_SEGMENTS;
          const start = this.plasmaArcPoint(activeCenter, arc, startT, effect.elapsed, arcIndex, segmentIndex);
          const end = this.plasmaArcPoint(activeCenter, arc, endT, effect.elapsed, arcIndex, segmentIndex + 1);
          alignCylinder(glow, start, end);
          alignCylinder(arc.coreSegments[segmentIndex], start, end);
          const flicker = 0.68 + Math.abs(Math.sin(effect.elapsed * 34 + arc.phase + segmentIndex * 1.7)) * 0.32;
          glow.visibility = arcVisibility * flicker * 0.9;
          arc.coreSegments[segmentIndex].visibility = arcVisibility * flicker;
        });
      });
    }
    for (let index = this.plasmaEffects.length - 1; index >= 0; index -= 1) {
      if (this.plasmaEffects[index].elapsed < this.plasmaEffects[index].duration) continue;
      this.disposePlasmaEffect(this.plasmaEffects[index]);
      this.plasmaEffects.splice(index, 1);
    }
  }

  private plasmaArcPoint(center: Vector3, arc: PlasmaArcVisual, progress: number, elapsed: number, arcIndex: number, segmentIndex: number): Vector3 {
    if (progress <= 0) return center.clone();
    const base = center.add(arc.direction.scale(progress));
    const jitterEnvelope = Math.sin(progress * Math.PI) * arc.amplitude * (0.62 + progress * 0.38);
    const xJitter = Math.sin(elapsed * 22 + arc.phase + segmentIndex * 2.3 + arcIndex * 0.17) * jitterEnvelope;
    const yJitter = Math.cos(elapsed * 27 + arc.phase * 0.73 + segmentIndex * 1.9) * jitterEnvelope;
    return base.add(new Vector3(xJitter, yJitter, 0));
  }

  private disposePlasmaEffect(effect: PlasmaEffect): void {
    effect.root.dispose(false, true);
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
      if (effect.explosion) {
        const explosionProgress = Math.min(1, effect.elapsed / (effect.explosionDuration ?? effect.duration));
        setFrame(effect.explosion, 5, 5, effect.elapsed, 30);
        effect.explosion.visibility = Math.max(0, 1 - explosionProgress);
        effect.explosion.scaling.setAll(0.72 + Math.sin(Math.min(1, effect.elapsed / 0.55) * Math.PI / 2) * 2.8);
      }
    }
    for (let index = this.airDefenseEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.airDefenseEffects[index];
      if (effect.elapsed < Math.max(effect.duration, effect.explosionDuration ?? 0)) continue;
      effect.beam.dispose();
      effect.core.dispose();
      effect.impact.dispose();
      effect.explosion?.dispose(false, true);
      this.airDefenseEffects.splice(index, 1);
    }
  }

  private updateSearchBeams(dt: number): void {
    if (this.searchSourceMeshes.length === 0) return;
    if (this.searchBeamVisuals.length === 0) {
      this.searchNextBurstIn -= dt;
      if (this.searchNextBurstIn <= 0) this.startSearchBurst();
    }
    for (let index = this.searchBeamVisuals.length - 1; index >= 0; index -= 1) {
      const effect = this.searchBeamVisuals[index];
      effect.elapsed += dt;
      const fadeIn = Math.min(1, effect.elapsed);
      const fadeOut = Math.min(1, Math.max(0, 2 + effect.holdDuration - effect.elapsed));
      const opacity = Math.min(fadeIn, fadeOut);
      const source = effect.source.getAbsolutePosition();
      const movementPhase = effect.motionPhase + effect.elapsed * effect.motionSpeed;
      const target = new Vector3(
        this.shipPosition().x + effect.targetOffsetX + Math.cos(movementPhase) * effect.motionRadius,
        GROUND_ABSORPTION_TARGET_Y,
        effect.targetOffsetZ + Math.sin(movementPhase * 0.83) * effect.motionRadius * 0.35,
      );
      alignCylinder(effect.beam, source, target);
      effect.groundRing.position.copyFrom(target);
      effect.beam.visibility = opacity;
      effect.groundRing.visibility = opacity;
      if (effect.elapsed < 2 + effect.holdDuration) continue;
      this.disposeSearchBeam(effect);
      this.searchBeamVisuals.splice(index, 1);
    }
    if (this.searchBeamVisuals.length === 0 && this.searchNextBurstIn <= 0) {
      this.searchNextBurstIn = 1.5 + Math.random() * 2.5;
    }
  }

  private startSearchBurst(): void {
    const sources = this.searchSourceMeshes.slice();
    for (let index = sources.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [sources[index], sources[swapIndex]] = [sources[swapIndex], sources[index]];
    }
    const count = Math.min(sources.length, 1 + Math.floor(Math.random() * 4));
    const shipX = this.shipPosition().x;
    for (const source of sources.slice(0, count)) {
      const sourcePosition = source.getAbsolutePosition();
      const motionPattern = this.searchMotionPatterns[this.searchMotionPatternIndex];
      this.searchMotionPatternIndex = (this.searchMotionPatternIndex + 1) % this.searchMotionPatterns.length;
      const beam = MeshBuilder.CreateCylinder('battle-search-beam', { diameterTop: SEARCH_BEAM_GROUND_DIAMETER, diameterBottom: SEARCH_BEAM_SOURCE_DIAMETER, height: 1, tessellation: 32 }, this.scene);
      const groundRing = MeshBuilder.CreateTorus('battle-search-ground-ring', { diameter: SEARCH_BEAM_GROUND_DIAMETER, thickness: 0.12, tessellation: 40 }, this.scene);
      beam.material = this.searchBeamMaterial;
      groundRing.material = this.searchGroundRingMaterial;
      [beam, groundRing].forEach((mesh) => { mesh.renderingGroupId = 3; mesh.isPickable = false; });
      this.searchBeamVisuals.push({
        beam,
        groundRing,
        source,
        targetOffsetX: sourcePosition.x - shipX + (Math.random() - 0.5) * 8,
        targetOffsetZ: sourcePosition.z,
        motionRadius: motionPattern.radius,
        motionSpeed: motionPattern.speed,
        motionPhase: Math.random() * Math.PI * 2,
        holdDuration: 2 + Math.random() * 2,
        elapsed: 0,
      });
    }
  }

  private disposeSearchBeam(effect: SearchBeamVisual): void {
    effect.beam.dispose();
    effect.groundRing.dispose();
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
    for (const rod of absorption.rods) {
      const direction = new Vector3(Math.cos(rod.angle), 0, Math.sin(rod.angle));
      const rodStart = beamStart.add(direction.scale(0.12 + rod.radius * 0.015));
      const rodEnd = target.add(direction.scale(rod.radius));
      alignCylinder(rod.body, rodStart, rodEnd);
      alignCylinder(rod.core, rodStart, rodEnd);
      const pulse = 0.88 + Math.sin(elapsed * 9 + rod.phase) * 0.12;
      const centralDensity = 1 - Math.min(1, rod.radius / BEAM_RADIUS);
      rod.body.visibility = (0.22 + centralDensity * 0.64) * pulse;
      rod.core.visibility = (0.18 + centralDensity * 0.64) * pulse;
    }
  }

  private syncGroundSwarm(state: Readonly<CombatState>): void {
    const activeIds = new Set<string>();
    for (const projectile of state.groundSwarmProjectiles) {
      activeIds.add(projectile.id);
      let visual = this.groundSwarmVisuals.get(projectile.id);
      if (!visual) {
        const seed = hashString(projectile.id);
        const memberCount = GROUND_SWARM_MIN_VISUAL_MEMBERS
          + Math.floor(seededUnit(seed) * (GROUND_SWARM_MAX_VISUAL_MEMBERS - GROUND_SWARM_MIN_VISUAL_MEMBERS + 1));
        const members = Array.from({ length: memberCount }, (_, index) => {
          const memberSeed = seed + index * 37;
          const mesh = MeshBuilder.CreateSphere(`battle-${projectile.id}-member-${index}`, { diameter: 0.34, segments: 8 }, this.scene);
          mesh.material = this.groundSwarmCoreMaterial;
          mesh.renderingGroupId = 3;
          mesh.isPickable = false;
          return {
            mesh,
            phase: seededUnit(memberSeed + 11) * Math.PI * 2,
            angularSpeed: 3.6 + seededUnit(memberSeed + 17) * 2.3,
            radiusX: GROUND_SWARM_ORBIT_HORIZONTAL_MIN_RADIUS + seededUnit(memberSeed + 23) * (GROUND_SWARM_ORBIT_HORIZONTAL_MAX_RADIUS - GROUND_SWARM_ORBIT_HORIZONTAL_MIN_RADIUS),
            radiusY: GROUND_SWARM_ORBIT_VERTICAL_MIN_RADIUS + seededUnit(memberSeed + 29) * (GROUND_SWARM_ORBIT_VERTICAL_MAX_RADIUS - GROUND_SWARM_ORBIT_VERTICAL_MIN_RADIUS),
            radiusZ: GROUND_SWARM_ORBIT_DEPTH_MIN_RADIUS + seededUnit(memberSeed + 31) * (GROUND_SWARM_ORBIT_DEPTH_MAX_RADIUS - GROUND_SWARM_ORBIT_DEPTH_MIN_RADIUS),
            baseScale: 0.78 + seededUnit(memberSeed + 41) * 0.34,
          } satisfies GroundSwarmMember;
        });
        const trail = new TrailMesh(`battle-${projectile.id}-trail`, members[0].mesh, this.scene, 0.12, 22, true);
        trail.material = this.groundSwarmMaterial;
        trail.renderingGroupId = 3;
        trail.isPickable = false;
        trail.start();
        visual = { members, trail };
        this.groundSwarmVisuals.set(projectile.id, visual);
      }
      const progress = Math.max(0, Math.min(1, projectile.progress));
      const eased = progress * progress * (3 - 2 * progress);
      const direction = projectile.targetX >= projectile.startX ? 1 : -1;
      const weave = Math.sin(progress * Math.PI * 4 + projectile.weavePhase) * (1 - progress) * 1.1;
      const center = new Vector3(
        projectile.startX + (projectile.targetX - projectile.startX) * eased + weave * direction,
        12.8 + (GROUND_ATTACK_TARGET_Y - 12.8) * progress + Math.sin(progress * Math.PI) * projectile.arcHeight,
        1.2 + Math.sin(progress * Math.PI * 3 + projectile.weavePhase) * (1 - progress) * 1.35,
      );
      const visible = projectile.progress >= 0 ? 1 : 0;
      for (const member of visual.members) {
        const spiralAngle = state.elapsedSeconds * member.angularSpeed + member.phase + progress * Math.PI * 4.2;
        const spiralRadius = 0.78 + progress * 0.22;
        member.mesh.position.copyFrom(center);
        member.mesh.position.x += Math.cos(spiralAngle) * member.radiusX * spiralRadius;
        member.mesh.position.y += Math.sin(spiralAngle) * member.radiusY * spiralRadius;
        member.mesh.position.z += Math.sin(spiralAngle * 0.96 + member.phase) * member.radiusZ * spiralRadius;
        member.mesh.scaling.setAll(member.baseScale * (0.9 + Math.sin(spiralAngle * 1.8) * 0.1));
        member.mesh.visibility = visible;
      }
      visual.trail.visibility = visible * 0.7;
    }
    for (const [id, visual] of this.groundSwarmVisuals) {
      if (activeIds.has(id)) continue;
      visual.trail.stop();
      visual.trail.dispose();
      visual.members.forEach((member) => member.mesh.dispose());
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
        mesh = MeshBuilder.CreatePlane(`battle-projectile-${missile.id}`, { size: 1.05 * SAM_MISSILE_SPRITE_SCALE, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
        mesh.material = this.samProjectileSpriteMaterial;
        // The side-view plane already faces the camera. Keep it fixed so the
        // homing Z rotation below controls the missile nose direction.
        mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
        mesh.renderingGroupId = 3;
        mesh.isPickable = false;
        this.projectileMeshes.set(missile.id, mesh);
        this.createMissileJetVisual(missile.id);
      }
      // The root is only the visual path endpoint. Gameplay collision removes
      // the projectile at the shield or hull surface before it reaches here.
      const targetPosition = this.shipPosition();
      if (!this.projectileLaunchPositions.has(missile.id)) {
        this.projectileLaunchPositions.set(missile.id, this.projectileVisualOriginResolver?.(missile.source, missile.sourceId) ?? new Vector3(
          targetPosition.x + missile.launchPosition.x - missile.target.x,
          targetPosition.y + (missile.launchY - missile.targetY) * 0.22,
          targetPosition.z + (missile.launchPosition.z - missile.target.z) * 0.12,
        ));
      }
      const launchPosition = this.projectileLaunchPositions.get(missile.id);
      if (launchPosition) {
        const launchDistance = Math.max(0.001, Math.hypot(
          missile.launchPosition.x - missile.target.x,
          missile.launchY - missile.targetY,
          missile.launchPosition.z - missile.target.z,
        ));
        const remainingDistance = Math.hypot(
          missile.position.x - missile.target.x,
          missile.y - missile.targetY,
          missile.position.z - missile.target.z,
        );
        const progress = Math.max(0, Math.min(1, 1 - remainingDistance / launchDistance));
        mesh.position.copyFrom(launchPosition.add(targetPosition.subtract(launchPosition).scale(progress)));
        // SAM and fighter missiles share the same visible homing path, sprite,
        // jet, and smoke treatment. Their gameplay speed/damage remain distinct.
        const visualDirection = targetPosition.subtract(mesh.position);
        if (visualDirection.lengthSquared() > 0.0001) {
          const visualAngle = Math.atan2(visualDirection.y, visualDirection.x);
          mesh.rotation.set(0, 0, visualAngle);
          this.spawnMissileTrail(missile.id, mesh.position, visualDirection);
          const jet = this.missileJetVisuals.get(missile.id);
          if (jet) {
            const direction = visualDirection.normalize();
            const jetPosition = mesh.position.subtract(direction.scale(0.78));
            jetPosition.z -= 0.06;
            const jetAngle = Math.atan2(direction.y, direction.x) - Math.PI / 2;
            const pulse = 0.92 + Math.sin(missile.age * 42) * 0.08;
            jet.glow.position.copyFrom(jetPosition);
            jet.glow.rotation.z = jetAngle;
            jet.glow.scaling.set(0.42 * pulse, 0.68 * pulse, 1);
            jet.glow.visibility = mesh.visibility;
            jet.core.position.copyFrom(jetPosition);
            jet.core.rotation.z = jetAngle;
            jet.core.scaling.set(0.2 * pulse, 0.38 * pulse, 1);
            jet.core.visibility = mesh.visibility;
          }
        }
      } else {
        mesh.position.set(
          targetPosition.x + missile.position.x - missile.target.x,
          targetPosition.y + (missile.y - missile.targetY) * 0.22,
          targetPosition.z + (missile.position.z - missile.target.z) * 0.12,
        );
      }
      this.projectileVisualPositions.set(missile.id, mesh.position.clone());
      mesh.visibility = Math.max(0, 1 - Math.max(0, missile.age - 6) / 2);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (activeIds.has(id)) continue;
      mesh.dispose();
      this.projectileMeshes.delete(id);
      this.projectileVisualPositions.delete(id);
      this.projectileLaunchPositions.delete(id);
      this.disposeMissileTrail(id);
      this.disposeMissileJetVisual(id);
    }
  }

  private createMissileJetVisual(id: string): void {
    const glow = MeshBuilder.CreateDisc(`battle-${id}-jet-glow`, { radius: 1, tessellation: 16, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    glow.material = this.samMissileJetGlowMaterial;
    glow.renderingGroupId = 3;
    glow.isPickable = false;
    const core = MeshBuilder.CreateDisc(`battle-${id}-jet-core`, { radius: 1, tessellation: 16, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    core.material = this.samMissileJetCoreMaterial;
    core.renderingGroupId = 3;
    core.isPickable = false;
    this.missileJetVisuals.set(id, { glow, core });
  }

  private disposeMissileJetVisual(id: string): void {
    const visual = this.missileJetVisuals.get(id);
    visual?.glow.dispose();
    visual?.core.dispose();
    this.missileJetVisuals.delete(id);
  }

  private spawnMissileTrail(id: string, position: Vector3, direction: Vector3): void {
    const lastPosition = this.missileTrailLastPositions.get(id);
    if (lastPosition && Vector3.DistanceSquared(lastPosition, position) < SAM_MISSILE_TRAIL_SPAWN_DISTANCE ** 2) return;
    const particles = this.missileTrailParticles.get(id) ?? [];
    const normalizedDirection = direction.normalize();
    const tailPosition = position.subtract(normalizedDirection.scale(0.62));
    const particle = MeshBuilder.CreateDisc(`battle-${id}-smoke-${particles.length}`, { radius: 1, tessellation: 12, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    particle.material = this.samMissileTrailMaterial;
    particle.billboardMode = Mesh.BILLBOARDMODE_ALL;
    particle.position = tailPosition;
    particle.position.z -= 0.03;
    particle.scaling.setAll(0.14 + (particles.length % 3) * 0.028);
    particle.renderingGroupId = 3;
    particle.isPickable = false;
    particles.push({
      mesh: particle,
      age: 0,
      lifetime: SAM_MISSILE_TRAIL_LIFETIME + (particles.length % 3) * 0.08,
      baseScale: 0.14 + (particles.length % 3) * 0.028,
      drift: new Vector3(-normalizedDirection.y, normalizedDirection.x, 0).scale((particles.length % 3 - 1) * 0.14),
    });
    while (particles.length > SAM_MISSILE_TRAIL_MAX_PARTICLES) particles.shift()?.mesh.dispose();
    this.missileTrailParticles.set(id, particles);
    this.missileTrailLastPositions.set(id, position.clone());
  }

  private updateMissileTrails(dt: number): void {
    for (const [id, particles] of this.missileTrailParticles) {
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        particle.age += dt;
        const progress = Math.min(1, particle.age / particle.lifetime);
        particle.mesh.position.addInPlace(particle.drift.scale(dt));
        particle.mesh.scaling.setAll(particle.baseScale * (1 + progress * 1.2));
        particle.mesh.visibility = (1 - progress) * 0.9;
        if (progress >= 1) {
          particle.mesh.dispose();
          particles.splice(index, 1);
        }
      }
      if (particles.length === 0) this.missileTrailParticles.delete(id);
    }
  }

  private disposeMissileTrail(id: string): void {
    this.missileTrailParticles.get(id)?.forEach((particle) => particle.mesh.dispose());
    this.missileTrailParticles.delete(id);
    this.missileTrailLastPositions.delete(id);
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
    mesh.scaling.x = scaleMothershipEffect(0.9);
    mesh.scaling.y = end.subtract(start).length();
  }

  private disposeDamageEffect(effect: DamageEffect): void {
    effect.bubble?.dispose();
    effect.shieldPatch?.dispose();
    effect.core.dispose();
    effect.ring.dispose();
    effect.secondRing.dispose();
    effect.smoke?.dispose();
    effect.smokeSprite?.dispose(false, true);
    effect.explosionSprite?.dispose(false, true);
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
