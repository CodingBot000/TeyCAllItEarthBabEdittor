import {
  Color3,
  Effect,
  Engine,
  GlowLayer,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
  type Scene,
} from '@babylonjs/core';

export type AbsorptionPhase = 'OFF' | 'IGNITING' | 'SUSTAINED' | 'FADING';

export interface BattleAbsorptionVfxSnapshot {
  phase: AbsorptionPhase;
  active: boolean;
  elapsedSeconds: number;
  outerLayerCount: number;
  shaftCount: number;
  sourceHalfWidth: number;
  groundHalfWidth: number;
  meshCount: number;
  virtualObjectCount: number;
  virtualObjectPoolCount: number;
  virtualObjectSizeMultiplier: number;
  virtualObjectTravelDuration: number;
  virtualObjects: Array<{ id: number; serial: number; progress: number; motionProgress: number; size: number; x: number; y: number; z: number }>;
}

interface BeamQuad {
  mesh: Mesh;
  positions: Float32Array;
}

interface BeamShaft {
  quad: BeamQuad;
  sourceOffset: number;
  groundOffset: number;
  sourceHalfWidth: number;
  groundHalfWidth: number;
  baseVisibility: number;
  phase: number;
  pulseSpeed: number;
}

interface VirtualAbsorptionObject {
  id: number;
  serial: number;
  root: TransformNode;
  meshes: Mesh[];
  texture: Texture;
  material: StandardMaterial;
  origin: Vector3;
  destination: Vector3;
  perpendicular: Vector3;
  rotationVelocity: Vector3;
  phase: number;
  elapsed: number;
  active: boolean;
}

const IGNITION_DURATION = 0.45;
const FADE_DURATION = 0.22;
// Keep the beam visibly funnel-shaped at every phase: the mothership emitter
// is compact while the ground footprint stays broad like the reference shot.
const SOURCE_HALF_WIDTH = 4.2;
const GROUND_HALF_WIDTH = 15;
const OUTER_LAYER_COUNT = 3;
const SHAFT_COUNT = 12;
const OUTER_DEPTH = 1.36;
const SHAFT_DEPTH = 0.88;
const CORE_DEPTH = 0.74;
const VIRTUAL_OBJECT_POOL_COUNT = 20;
const VIRTUAL_OBJECT_TRAVEL_DURATION = 0.8;
// The previous silhouette range was 0.9–2.1. Keep this multiplier explicit so
// the requested 1.5x enlargement remains easy to audit when the art changes.
const VIRTUAL_OBJECT_SIZE_MULTIPLIER = 1.5;
const VIRTUAL_OBJECT_MIN_SIZE = 0.9 * VIRTUAL_OBJECT_SIZE_MULTIPLIER;
const VIRTUAL_OBJECT_MAX_SIZE = 2.1 * VIRTUAL_OBJECT_SIZE_MULTIPLIER;
// Fill the 20-object pool across one travel window, keeping all 20 visible in
// the sustained beam instead of recycling only a small subset at once.
const VIRTUAL_OBJECT_SPAWN_INTERVAL = VIRTUAL_OBJECT_TRAVEL_DURATION / VIRTUAL_OBJECT_POOL_COUNT;
const VIRTUAL_OBJECT_SPRITE_URL = '/assets/runtime/sprites/absorption-virtual-human-silhouettes-5x1.webp';

Effect.ShadersStore.battleAbsorptionVolumeVertexShader = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;

void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

Effect.ShadersStore.battleAbsorptionVolumeFragmentShader = `
precision highp float;

varying vec2 vUV;
uniform float time;
uniform float baseAlpha;
uniform float edgeStart;
uniform float noiseScale;
uniform float noiseSpeed;
uniform vec3 colorInner;
uniform vec3 colorOuter;

float hash21(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 value) {
  vec2 cell = floor(value);
  vec2 fraction = fract(value);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}

void main(void) {
  float centeredX = abs(vUV.x * 2.0 - 1.0);
  float edge = 1.0 - smoothstep(edgeStart, 1.0, centeredX);
  float sourceFade = smoothstep(0.0, 0.075, vUV.y);
  float groundFade = 1.0 - smoothstep(0.91, 1.0, vUV.y);
  vec2 flowingUv = vec2(vUV.x * noiseScale, vUV.y * noiseScale * 1.85 - time * noiseSpeed);
  float coarseNoise = valueNoise(flowingUv);
  float fineNoise = valueNoise(flowingUv * 2.37 + vec2(3.1, -time * noiseSpeed * 0.41));
  float verticalBand = 0.9 + sin(vUV.y * 28.0 - time * 2.4) * 0.1;
  float density = mix(0.68, 1.14, coarseNoise * 0.72 + fineNoise * 0.28) * verticalBand;
  vec3 color = mix(colorInner, colorOuter, smoothstep(0.0, 1.0, centeredX));
  float alpha = edge * sourceFade * groundFade * density * baseAlpha;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

export class BattleAbsorptionVfx {
  private readonly root: TransformNode;
  private readonly outerMaterial: ShaderMaterial;
  private readonly shaftMaterial: ShaderMaterial;
  private readonly softGlowMaterial: StandardMaterial;
  private readonly brightGlowMaterial: StandardMaterial;
  private readonly glowLayer: GlowLayer;
  private readonly outerLayers: BeamQuad[];
  private readonly shafts: BeamShaft[];
  private readonly cores: BeamQuad[];
  private readonly sourceHalo: Mesh;
  private readonly sourceCore: Mesh;
  private readonly sourceRings: Mesh[];
  private readonly groundHalo: Mesh;
  private readonly groundCore: Mesh;
  private readonly groundRing: Mesh;
  private readonly meshes: Mesh[];
  private readonly virtualObjectSourceTexture: Texture;
  private readonly virtualObjects: VirtualAbsorptionObject[];
  private readonly source = new Vector3();
  private readonly target = new Vector3();
  private phase: AbsorptionPhase = 'OFF';
  private phaseElapsed = 0;
  private requestedActive = false;
  private disposed = false;
  private virtualObjectSpawnElapsed = VIRTUAL_OBJECT_SPAWN_INTERVAL;
  private virtualObjectSerial = 0;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleAbsorptionVfxRoot', scene);
    this.outerMaterial = createVolumeMaterial('battle-absorption-volume', scene, false, {
      baseAlpha: 0.58,
      edgeStart: 0.34,
      noiseScale: 3.4,
      noiseSpeed: 0.23,
      colorInner: new Color3(0.3, 1, 0.9),
      colorOuter: new Color3(0.04, 0.68, 0.62),
    });
    this.shaftMaterial = createVolumeMaterial('battle-absorption-shaft', scene, true, {
      baseAlpha: 0.28,
      edgeStart: 0.06,
      noiseScale: 5.6,
      noiseSpeed: 0.38,
      colorInner: new Color3(0.82, 1, 0.97),
      colorOuter: new Color3(0.16, 0.95, 0.82),
    });
    this.softGlowMaterial = createGlowMaterial('battle-absorption-soft-glow', scene, new Color3(0.15, 0.88, 0.78), 0.34, false);
    this.brightGlowMaterial = createGlowMaterial('battle-absorption-bright-glow', scene, new Color3(0.3, 1, 0.88), 0.76, true);
    this.virtualObjectSourceTexture = new Texture(VIRTUAL_OBJECT_SPRITE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    this.virtualObjectSourceTexture.hasAlpha = true;
    this.virtualObjectSourceTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.virtualObjectSourceTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

    this.outerLayers = Array.from({ length: OUTER_LAYER_COUNT }, (_, index) => {
      const quad = createBeamQuad(`battle-absorption-volume-${index}`, scene, this.outerMaterial, -30 - index);
      quad.mesh.parent = this.root;
      return quad;
    });
    this.shafts = Array.from({ length: SHAFT_COUNT }, (_, index) => {
      const central = index < 7;
      const sourceOffset = (seededUnit(index * 37 + 11) * 2 - 1) * SOURCE_HALF_WIDTH * (central ? 0.58 : 0.92);
      const groundOffset = sourceOffset * (0.5 + seededUnit(index * 41 + 17) * 0.34)
        + (seededUnit(index * 43 + 23) * 2 - 1) * GROUND_HALF_WIDTH * (central ? 0.18 : 0.34);
      const width = central
        ? 0.2 + seededUnit(index * 47 + 29) * 0.58
        : 0.1 + seededUnit(index * 53 + 31) * 0.26;
      const quad = createBeamQuad(`battle-absorption-shaft-${index}`, scene, this.shaftMaterial, -20 - index);
      quad.mesh.parent = this.root;
      return {
        quad,
        sourceOffset,
        groundOffset,
        sourceHalfWidth: width * (0.56 + seededUnit(index * 59 + 37) * 0.34),
        groundHalfWidth: width * 1.18,
        baseVisibility: central ? 0.08 + seededUnit(index * 61 + 41) * 0.11 : 0.035 + seededUnit(index * 67 + 43) * 0.065,
        phase: seededUnit(index * 71 + 47) * Math.PI * 2,
        pulseSpeed: 3.2 + seededUnit(index * 73 + 53) * 4.8,
      };
    });
    this.cores = [
      createBeamQuad('battle-absorption-core-wide', scene, this.shaftMaterial, -8),
      createBeamQuad('battle-absorption-core-bright', scene, this.shaftMaterial, -7),
    ];
    this.cores.forEach((quad) => { quad.mesh.parent = this.root; });

    this.sourceHalo = createDisc('battle-absorption-source-halo', scene, this.softGlowMaterial, -4);
    this.sourceCore = createDisc('battle-absorption-source-core', scene, this.brightGlowMaterial, -2);
    this.sourceRings = [
      createRing('battle-absorption-source-ring-outer', scene, this.brightGlowMaterial, -1, 0.08),
      createRing('battle-absorption-source-ring-inner', scene, this.brightGlowMaterial, 0, 0.055),
    ];
    this.groundHalo = createDisc('battle-absorption-ground-halo', scene, this.softGlowMaterial, 2);
    this.groundCore = createDisc('battle-absorption-ground-core', scene, this.brightGlowMaterial, 3);
    this.groundRing = createRing('battle-absorption-ground-ring', scene, this.brightGlowMaterial, 4, 0.07);
    [this.sourceHalo, this.sourceCore, ...this.sourceRings, this.groundHalo, this.groundCore, this.groundRing].forEach((mesh) => {
      mesh.parent = this.root;
    });

    this.meshes = [
      ...this.outerLayers.map((quad) => quad.mesh),
      ...this.shafts.map((shaft) => shaft.quad.mesh),
      ...this.cores.map((quad) => quad.mesh),
      this.sourceHalo,
      this.sourceCore,
      ...this.sourceRings,
      this.groundHalo,
      this.groundCore,
      this.groundRing,
    ];
    this.virtualObjects = Array.from({ length: VIRTUAL_OBJECT_POOL_COUNT }, (_, index) => createVirtualAbsorptionObject(scene, this.root, this.virtualObjectSourceTexture, index));
    this.glowLayer = new GlowLayer('AbsorptionGlowLayer', scene, { mainTextureRatio: 0.25 });
    this.glowLayer.blurKernelSize = 32;
    this.glowLayer.intensity = 0.42;
    this.glowLayer.setExcludedByDefault(true);
    [this.sourceCore, ...this.sourceRings, this.groundCore, this.groundRing].forEach((mesh) => this.glowLayer.addIncludedOnlyMesh(mesh));
    this.setEnabled(false);
  }

  begin(source: Vector3, target: Vector3): void {
    if (this.disposed) return;
    this.source.copyFrom(source);
    this.target.copyFrom(target);
    this.requestedActive = true;
    if (this.phase === 'IGNITING' || this.phase === 'SUSTAINED') return;
    this.phase = 'IGNITING';
    this.phaseElapsed = 0;
    this.virtualObjectSpawnElapsed = VIRTUAL_OBJECT_SPAWN_INTERVAL;
    this.setEnabled(true);
  }

  setTarget(source: Vector3, target: Vector3): void {
    if (this.disposed) return;
    this.source.copyFrom(source);
    this.target.copyFrom(target);
  }

  end(): void {
    if (this.disposed) return;
    this.requestedActive = false;
    if (this.phase === 'OFF' || this.phase === 'FADING') return;
    this.phase = 'FADING';
    this.phaseElapsed = 0;
  }

  isRequestedActive(): boolean {
    return this.requestedActive;
  }

  update(dt: number, elapsedSeconds: number, source: Vector3): void {
    if (this.disposed || this.phase === 'OFF') return;
    this.source.copyFrom(source);
    this.phaseElapsed += Math.max(0, dt);
    if (this.phase === 'IGNITING' && this.phaseElapsed >= IGNITION_DURATION) {
      this.phase = 'SUSTAINED';
      this.phaseElapsed = 0;
    } else if (this.phase === 'FADING' && this.phaseElapsed >= FADE_DURATION) {
      this.phase = 'OFF';
      this.phaseElapsed = 0;
      this.clearVirtualObjects();
      this.setEnabled(false);
      return;
    }

    const envelope = this.visibilityEnvelope();
    this.outerMaterial.setFloat('time', elapsedSeconds);
    this.shaftMaterial.setFloat('time', elapsedSeconds);
    this.updateGeometry(elapsedSeconds, envelope);
    this.updateVirtualObjects(dt, envelope);
  }

  getSnapshot(): BattleAbsorptionVfxSnapshot {
    return {
      phase: this.phase,
      active: this.phase !== 'OFF',
      elapsedSeconds: round(this.phaseElapsed),
      outerLayerCount: this.outerLayers.length,
      shaftCount: this.shafts.length,
      sourceHalfWidth: SOURCE_HALF_WIDTH,
      groundHalfWidth: GROUND_HALF_WIDTH,
      meshCount: this.meshes.length,
      virtualObjectCount: this.virtualObjects.filter((object) => object.active).length,
      virtualObjectPoolCount: this.virtualObjects.length,
      virtualObjectSizeMultiplier: VIRTUAL_OBJECT_SIZE_MULTIPLIER,
      virtualObjectTravelDuration: VIRTUAL_OBJECT_TRAVEL_DURATION,
      virtualObjects: this.virtualObjects.filter((object) => object.active).map((object) => {
        const progress = Math.min(1, object.elapsed / VIRTUAL_OBJECT_TRAVEL_DURATION);
        return {
          id: object.id,
          serial: object.serial,
          progress: round(progress),
          motionProgress: round(progress * progress * progress),
          size: round(object.root.scaling.x),
          x: round(object.root.position.x),
          y: round(object.root.position.y),
          z: round(object.root.position.z),
        };
      }),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearVirtualObjects();
    this.virtualObjects.forEach((object) => { object.material.dispose(); object.texture.dispose(); });
    this.virtualObjectSourceTexture.dispose();
    this.glowLayer.dispose();
    this.root.dispose(false, false);
    this.outerMaterial.dispose();
    this.shaftMaterial.dispose();
    this.softGlowMaterial.dispose();
    this.brightGlowMaterial.dispose();
  }

  private visibilityEnvelope(): number {
    if (this.phase === 'IGNITING') return easeOutCubic(Math.min(1, this.phaseElapsed / IGNITION_DURATION));
    if (this.phase === 'FADING') return 1 - Math.min(1, this.phaseElapsed / FADE_DURATION);
    return this.phase === 'SUSTAINED' ? 1 : 0;
  }

  private updateGeometry(elapsedSeconds: number, envelope: number): void {
    const deltaX = this.target.x - this.source.x;
    const deltaY = this.target.y - this.source.y;
    const length = Math.max(0.001, Math.hypot(deltaX, deltaY));
    const perpendicularX = -deltaY / length;
    const perpendicularY = deltaX / length;
    const breathing = 1 + Math.sin(elapsedSeconds * 2.1) * 0.025;
    // Ignition changes brightness and length, not the defining wide-bottom
    // silhouette. The fan shape must remain visible from the first frame.
    const ignitionWidth = this.phase === 'IGNITING' ? 0.9 + envelope * 0.1 : 1;

    const outerScales = [1, 0.88, 0.72];
    const outerVisibility = [0.56, 0.4, 0.28];
    this.outerLayers.forEach((quad, index) => {
      const scale = outerScales[index] * breathing * ignitionWidth;
      updateBeamQuad(
        quad,
        this.source,
        this.target,
        perpendicularX,
        perpendicularY,
        0,
        0,
        SOURCE_HALF_WIDTH * scale,
        GROUND_HALF_WIDTH * scale,
        this.target.z + OUTER_DEPTH + index * 0.06,
      );
      quad.mesh.visibility = envelope * outerVisibility[index];
    });

    this.shafts.forEach((shaft, index) => {
      const pulse = 0.7 + Math.sin(elapsedSeconds * shaft.pulseSpeed + shaft.phase) * 0.3;
      const upwardFlow = Math.sin(elapsedSeconds * 1.75 + shaft.phase) * 0.18;
      updateBeamQuad(
        shaft.quad,
        this.source,
        this.target,
        perpendicularX,
        perpendicularY,
        shaft.sourceOffset + upwardFlow,
        shaft.groundOffset - upwardFlow * 0.35,
        shaft.sourceHalfWidth,
        shaft.groundHalfWidth,
        this.target.z + SHAFT_DEPTH - index * 0.002,
      );
      shaft.quad.mesh.visibility = envelope * shaft.baseVisibility * pulse;
    });

    updateBeamQuad(this.cores[0], this.source, this.target, perpendicularX, perpendicularY, 0, 0, 0.82, 1.48, this.target.z + CORE_DEPTH);
    updateBeamQuad(this.cores[1], this.source, this.target, perpendicularX, perpendicularY, 0, 0, 0.34, 0.72, this.target.z + CORE_DEPTH - 0.04);
    this.cores[0].mesh.visibility = envelope * (0.18 + Math.sin(elapsedSeconds * 4.2) * 0.035);
    this.cores[1].mesh.visibility = envelope * (0.32 + Math.sin(elapsedSeconds * 5.7 + 0.8) * 0.045);

    this.updateContactMeshes(elapsedSeconds, envelope);
  }

  private updateContactMeshes(elapsedSeconds: number, envelope: number): void {
    const sourcePulse = 1 + Math.sin(elapsedSeconds * 5.2) * 0.04;
    const groundPulse = 1 + Math.sin(elapsedSeconds * Math.PI * 2.4) * 0.055;
    const sourceZ = this.source.z - 0.82;
    const groundZ = this.target.z - 0.48;

    this.sourceHalo.position.set(this.source.x, this.source.y, sourceZ);
    this.sourceHalo.scaling.set(SOURCE_HALF_WIDTH * 1.08 * sourcePulse, 0.62 * sourcePulse, 1);
    this.sourceHalo.visibility = envelope * 0.82;
    this.sourceCore.position.set(this.source.x, this.source.y, sourceZ - 0.02);
    this.sourceCore.scaling.set(2.25 * sourcePulse, 0.34 * sourcePulse, 1);
    this.sourceCore.visibility = envelope * 0.78;
    this.sourceRings[0].position.set(this.source.x, this.source.y, sourceZ - 0.04);
    this.sourceRings[0].scaling.set(SOURCE_HALF_WIDTH * sourcePulse, 0.54 * sourcePulse, 1);
    this.sourceRings[0].visibility = envelope * 0.64;
    this.sourceRings[1].position.set(this.source.x, this.source.y, sourceZ - 0.06);
    this.sourceRings[1].scaling.set(2.75 / SOURCE_HALF_WIDTH * sourcePulse, 0.34 / 0.54 * sourcePulse, 1);
    this.sourceRings[1].visibility = envelope * 0.58;

    this.groundHalo.position.set(this.target.x, this.target.y, groundZ);
    this.groundHalo.scaling.set(GROUND_HALF_WIDTH * 1.05 * groundPulse, 0.92 * groundPulse, 1);
    this.groundHalo.visibility = envelope * 0.72;
    this.groundCore.position.set(this.target.x, this.target.y, groundZ - 0.02);
    this.groundCore.scaling.set(3.1 * groundPulse, 0.44 * groundPulse, 1);
    this.groundCore.visibility = envelope * 0.34;
    this.groundRing.position.set(this.target.x, this.target.y, groundZ - 0.04);
    this.groundRing.scaling.set(GROUND_HALF_WIDTH * groundPulse, 0.78 * groundPulse, 1);
    this.groundRing.visibility = envelope * 0.26;
  }

  private setEnabled(enabled: boolean): void {
    this.meshes.forEach((mesh) => {
      mesh.setEnabled(enabled);
      if (!enabled) mesh.visibility = 0;
    });
    this.glowLayer.isEnabled = enabled;
    for (const object of this.virtualObjects) object.root.setEnabled(enabled && object.active);
  }

  private updateVirtualObjects(dt: number, envelope: number): void {
    if (this.requestedActive && this.phase !== 'FADING') {
      this.virtualObjectSpawnElapsed += Math.max(0, dt);
      while (this.virtualObjectSpawnElapsed >= VIRTUAL_OBJECT_SPAWN_INTERVAL) {
        this.virtualObjectSpawnElapsed -= VIRTUAL_OBJECT_SPAWN_INTERVAL;
        this.spawnVirtualObject();
      }
    }
    for (const object of this.virtualObjects) {
      if (!object.active) continue;
      object.elapsed += Math.max(0, dt);
      const progress = Math.min(1, object.elapsed / VIRTUAL_OBJECT_TRAVEL_DURATION);
      const easedProgress = progress * progress * progress;
      const position = Vector3.Lerp(object.origin, object.destination, easedProgress);
      const sway = Math.sin(object.elapsed * 8 + object.phase) * (1 - progress) * 0.22;
      position.addInPlace(object.perpendicular.scale(sway));
      object.root.position.copyFrom(position);
      object.root.rotation.x += object.rotationVelocity.x * Math.max(0, dt);
      object.root.rotation.y += object.rotationVelocity.y * Math.max(0, dt);
      object.root.rotation.z += object.rotationVelocity.z * Math.max(0, dt);
      const fade = Math.min(1, envelope * 1.35) * (progress < 0.82 ? 1 : (1 - progress) / 0.18);
      object.meshes.forEach((mesh) => { mesh.visibility = Math.max(0, fade * 0.82); });
      if (progress >= 1) {
        object.active = false;
        object.root.setEnabled(false);
      }
    }
  }

  private spawnVirtualObject(): void {
    const object = this.virtualObjects.find((candidate) => !candidate.active);
    if (!object) return;
    const delta = this.source.subtract(this.target);
    const length = Math.max(0.001, Math.hypot(delta.x, delta.y));
    const perpendicular = new Vector3(-delta.y / length, delta.x / length, 0);
    const serial = this.virtualObjectSerial++;
    object.serial = serial;
    const sourceOffset = (seededUnit(serial * 17 + 3) * 2 - 1) * SOURCE_HALF_WIDTH * 0.68;
    const targetOffset = (seededUnit(serial * 19 + 5) * 2 - 1) * GROUND_HALF_WIDTH * 0.72;
    object.origin.copyFrom(this.target).addInPlace(perpendicular.scale(targetOffset));
    object.destination.copyFrom(this.source).addInPlace(perpendicular.scale(sourceOffset));
    object.origin.z -= 0.14 + seededUnit(serial * 23 + 7) * 0.22;
    object.destination.z -= 0.14 + seededUnit(serial * 29 + 11) * 0.22;
    object.perpendicular.copyFrom(perpendicular);
    object.phase = seededUnit(serial * 31 + 13) * Math.PI * 2;
    object.rotationVelocity.set(
      randomSignedUnit(serial * 37 + 17) * 3.4,
      randomSignedUnit(serial * 41 + 19) * 3.4,
      randomSignedUnit(serial * 43 + 23) * 5.2,
    );
    const size = VIRTUAL_OBJECT_MIN_SIZE + seededUnit(serial * 47 + 29) * (VIRTUAL_OBJECT_MAX_SIZE - VIRTUAL_OBJECT_MIN_SIZE);
    object.root.scaling.setAll(size);
    object.elapsed = 0;
    object.active = true;
    object.root.setEnabled(true);
    object.meshes.forEach((mesh) => { mesh.visibility = 0.82; });
  }

  private clearVirtualObjects(): void {
    for (const object of this.virtualObjects) {
      object.active = false;
      object.root.setEnabled(false);
    }
  }
}

function createVirtualAbsorptionObject(scene: Scene, parent: TransformNode, sourceTexture: Texture, index: number): VirtualAbsorptionObject {
  const root = new TransformNode(`battle-absorption-virtual-object-${index}`, scene);
  root.parent = parent;
  const texture = sourceTexture.clone();
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.uScale = 1 / 5;
  texture.vScale = 1;
  texture.uOffset = index % 5 / 5;
  texture.vOffset = 0;
  const material = new StandardMaterial(`${root.name}-material`, scene);
  material.diffuseColor = Color3.White();
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Engine.ALPHA_COMBINE;
  material.disableDepthWrite = true;
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  const sprite = MeshBuilder.CreatePlane(`${root.name}-sprite`, { width: 0.58, height: 1, sideOrientation: Mesh.DOUBLESIDE }, scene);
  sprite.parent = root;
  sprite.material = material;
  sprite.renderingGroupId = 3;
  sprite.isPickable = false;
  root.setEnabled(false);
  return { id: index, serial: -1, root, meshes: [sprite], texture, material, origin: new Vector3(), destination: new Vector3(), perpendicular: new Vector3(), rotationVelocity: new Vector3(), phase: 0, elapsed: 0, active: false };
}

function randomSignedUnit(seed: number): number {
  return seededUnit(seed) * 2 - 1;
}

function createVolumeMaterial(
  name: string,
  scene: Scene,
  additive: boolean,
  settings: {
    baseAlpha: number;
    edgeStart: number;
    noiseScale: number;
    noiseSpeed: number;
    colorInner: Color3;
    colorOuter: Color3;
  },
): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, {
    vertex: 'battleAbsorptionVolume',
    fragment: 'battleAbsorptionVolume',
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'time', 'baseAlpha', 'edgeStart', 'noiseScale', 'noiseSpeed', 'colorInner', 'colorOuter'],
    needAlphaBlending: true,
  });
  material.setFloat('time', 0);
  material.setFloat('baseAlpha', settings.baseAlpha);
  material.setFloat('edgeStart', settings.edgeStart);
  material.setFloat('noiseScale', settings.noiseScale);
  material.setFloat('noiseSpeed', settings.noiseSpeed);
  material.setColor3('colorInner', settings.colorInner);
  material.setColor3('colorOuter', settings.colorOuter);
  material.alphaMode = additive ? Engine.ALPHA_ADD : Engine.ALPHA_COMBINE;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
}

function createGlowMaterial(name: string, scene: Scene, color: Color3, alpha: number, additive: boolean): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color.scale(0.15);
  material.emissiveColor = color;
  material.alpha = alpha;
  material.alphaMode = additive ? Engine.ALPHA_ADD : Engine.ALPHA_COMBINE;
  material.disableLighting = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  return material;
}

function createBeamQuad(name: string, scene: Scene, material: ShaderMaterial, alphaIndex: number): BeamQuad {
  const mesh = new Mesh(name, scene);
  const positions = new Float32Array([
    -1, 1, 0,
    1, 1, 0,
    1, -1, 0,
    -1, -1, 0,
  ]);
  const vertexData = new VertexData();
  vertexData.positions = Array.from(positions);
  vertexData.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  vertexData.indices = [0, 1, 2, 0, 2, 3];
  vertexData.applyToMesh(mesh, true);
  mesh.material = material;
  mesh.renderingGroupId = 3;
  mesh.alphaIndex = alphaIndex;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return { mesh, positions };
}

function updateBeamQuad(
  quad: BeamQuad,
  source: Vector3,
  target: Vector3,
  perpendicularX: number,
  perpendicularY: number,
  sourceOffset: number,
  groundOffset: number,
  sourceHalfWidth: number,
  groundHalfWidth: number,
  z: number,
): void {
  const sourceCenterX = source.x + perpendicularX * sourceOffset;
  const sourceCenterY = source.y + perpendicularY * sourceOffset;
  const groundCenterX = target.x + perpendicularX * groundOffset;
  const groundCenterY = target.y + perpendicularY * groundOffset;
  setPoint(quad.positions, 0, sourceCenterX + perpendicularX * sourceHalfWidth, sourceCenterY + perpendicularY * sourceHalfWidth, z);
  setPoint(quad.positions, 1, sourceCenterX - perpendicularX * sourceHalfWidth, sourceCenterY - perpendicularY * sourceHalfWidth, z);
  setPoint(quad.positions, 2, groundCenterX - perpendicularX * groundHalfWidth, groundCenterY - perpendicularY * groundHalfWidth, z);
  setPoint(quad.positions, 3, groundCenterX + perpendicularX * groundHalfWidth, groundCenterY + perpendicularY * groundHalfWidth, z);
  quad.mesh.updateVerticesData(VertexBuffer.PositionKind, quad.positions, true, false);
}

function setPoint(positions: Float32Array, index: number, x: number, y: number, z: number): void {
  const offset = index * 3;
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
}

function createDisc(name: string, scene: Scene, material: StandardMaterial, alphaIndex: number): Mesh {
  const mesh = MeshBuilder.CreateDisc(name, { radius: 1, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE }, scene);
  mesh.material = material;
  mesh.renderingGroupId = 3;
  mesh.alphaIndex = alphaIndex;
  mesh.isPickable = false;
  return mesh;
}

function createRing(name: string, scene: Scene, material: StandardMaterial, alphaIndex: number, thickness: number): Mesh {
  const mesh = MeshBuilder.CreateTorus(name, { diameter: 2, thickness, tessellation: 48 }, scene);
  mesh.rotation.x = Math.PI / 2;
  mesh.material = material;
  mesh.renderingGroupId = 3;
  mesh.alphaIndex = alphaIndex;
  mesh.isPickable = false;
  return mesh;
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
