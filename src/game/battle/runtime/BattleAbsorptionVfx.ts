import {
  Color3,
  Effect,
  Engine,
  GlowLayer,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
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

const IGNITION_DURATION = 0.45;
const FADE_DURATION = 0.22;
const SOURCE_HALF_WIDTH = 4.2;
const GROUND_HALF_WIDTH = 6.5;
const OUTER_LAYER_COUNT = 3;
const SHAFT_COUNT = 12;
const OUTER_DEPTH = 1.36;
const SHAFT_DEPTH = 0.88;
const CORE_DEPTH = 0.74;

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
  private readonly source = new Vector3();
  private readonly target = new Vector3();
  private phase: AbsorptionPhase = 'OFF';
  private phaseElapsed = 0;
  private requestedActive = false;
  private disposed = false;

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
      this.setEnabled(false);
      return;
    }

    const envelope = this.visibilityEnvelope();
    this.outerMaterial.setFloat('time', elapsedSeconds);
    this.shaftMaterial.setFloat('time', elapsedSeconds);
    this.updateGeometry(elapsedSeconds, envelope);
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
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
    const ignitionWidth = this.phase === 'IGNITING' ? 0.68 + envelope * 0.32 : 1;

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
  }
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
