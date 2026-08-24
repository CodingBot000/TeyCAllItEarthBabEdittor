import {
  Color3,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scalar,
  Scene,
  StandardMaterial,
  TrailMesh,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
} from '@babylonjs/core';
import { loadScene } from 'babylonjs-editor-tools';
import { scriptsMap } from '../../../scripts';
import { activateAbility, applyMothershipProjectileDamage, commandExtraction, stopBeam, tickCombat } from '../../domain/combatRules';
import type { CombatState, Vec2 } from '../../domain/types';
import type { BattleMapDefinition } from '../contracts/BattleMapDefinition';
import { mapBackgroundUrl, sharedMaterialUrl } from '../maps/battleMapCatalog';
import { BattleCombatVfx } from './BattleCombatVfx';

const WORLD_WIDTH = 360;
const BACKGROUND_TILE_WIDTH = 120;
const BACKGROUND_REPEAT = WORLD_WIDTH / BACKGROUND_TILE_WIDTH;
const CLOUD_DRIFT_SPEED = 0.0015;
const CAMERA_Y = 5;
const CAMERA_Z = -92;
const MOTHERSHIP_Y = 16.5;
const FIGHTER_SPRITE_URL = '/assets/runtime/sprites/fighter-8way.webp';
const FIGHTER_ATLAS_COLUMNS = 4;
const FIGHTER_ATLAS_ROWS = 2;
const FIGHTER_SPRITE_SIZE = 5.4;
const FIGHTER_TRAIL_LENGTH = 72;
const FIGHTER_TRAIL_SEGMENTS = 24;
const FIGHTER_TRAIL_DIAMETER = 0.16;
const FIGHTER_TRAIL_CORE_LENGTH = 26;
const FIGHTER_TRAIL_CORE_SEGMENTS = 10;
const FIGHTER_TRAIL_CORE_DIAMETER = 0.065;
const FIGHTER_TRAIL_NOZZLE_OFFSET = 1.35;
const FIGHTER_SMOKE_LIFETIME = 1;
const FIGHTER_SMOKE_INTERVAL = 0.08;
const CINEMATIC_EVASION_DURATION = 1.25;
const CINEMATIC_CRASH_DURATION = 2.4;

export interface BattleRuntime {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  mothershipGameplayRoot: TransformNode;
  triggerAbility(ability: 'emp' | 'plasma'): void;
  toggleAbsorption(): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export interface BattleRuntimeOptions {
  combatState?: CombatState;
  onCombatComplete?: (state: CombatState) => void;
}

interface BackgroundLayer {
  name: string;
  key: keyof BattleMapDefinition['backgrounds'];
  z: number;
  y: number;
  parallax: number;
  renderingGroupId: number;
}

interface FighterSmokePuff {
  mesh: Mesh;
  age: number;
}

interface FighterTrailVisual {
  generator: TransformNode;
  mesh: TrailMesh;
  coreMesh: TrailMesh;
  smokeMaterial: StandardMaterial;
  smokePuffs: FighterSmokePuff[];
  smokeAccumulator: number;
  nextSmokeId: number;
}

interface FighterVisual {
  mesh: Mesh;
  fallback: AbstractMesh;
  trail: FighterTrailVisual;
  baseX: number;
  baseY: number;
  baseZ: number;
  heading: number;
  phase: number;
}

interface MothershipCinematic {
  kind: 'EVASION' | 'CRASH';
  elapsed: number;
  duration: number;
  origin: Vector3;
  direction: number;
}

const BACKGROUND_LAYERS: BackgroundLayer[] = [
  { name: 'SkyRoot', key: 'sky', z: 30, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CloudRoot', key: 'clouds', z: 27, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CityFarRoot', key: 'far', z: 22, y: 9, parallax: 0.15, renderingGroupId: 0 },
  { name: 'CityMiddleRoot', key: 'middle', z: 16, y: -6, parallax: 0.35, renderingGroupId: 1 },
  { name: 'CityNearRoot', key: 'near', z: 10, y: -20, parallax: 0.6, renderingGroupId: 2 },
  { name: 'GroundRoot', key: 'ground', z: 4, y: -12, parallax: 1, renderingGroupId: 2 },
  { name: 'ForegroundRoot', key: 'foregroundAtmosphere', z: -5, y: 1, parallax: 0.8, renderingGroupId: 3 },
];

export async function createBattleRuntime(canvas: HTMLCanvasElement, map: BattleMapDefinition, options: BattleRuntimeOptions = {}): Promise<BattleRuntime> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });
  const scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.12, 0.17, 1);
  scene.autoClear = true;

  let editorSceneLoaded = false;
  const useEditorScene = !new URLSearchParams(window.location.search).has('battle-fallback');
  if (useEditorScene) {
    try {
      await withTimeout(loadScene('/scene/', 'battlescene.babylon', scene, scriptsMap, { texturesQuality: 'high' }), 15000, 'Editor scene load timed out');
      if (!scene.getMeshByName('SkyRootPlane')) throw new Error('Editor scene is missing the SkyRootPlane contract node.');
      editorSceneLoaded = true;
    } catch (error) {
      console.warn('Battle Editor scene could not be loaded; using the TypeScript greybox fallback.', error);
    }
  }

  const cameraRig = getOrCreateNode(scene, 'CameraRig');
  let camera = scene.getCameraByName('BattleCamera') as UniversalCamera | null;
  if (!camera) camera = new UniversalCamera('BattleCamera', new Vector3(0, CAMERA_Y, CAMERA_Z), scene);
  if (!camera.parent) camera.parent = cameraRig;
  camera.fov = map.camera.fovDegrees * Math.PI / 180;
  camera.minZ = 0.1;
  camera.maxZ = 1000;
  camera.setTarget(new Vector3(0, CAMERA_Y, 0));
  camera.inputs.clear();
  scene.activeCamera = camera;

  const light = scene.getLightByName('BattleSkyLight') as HemisphericLight | null;
  if (!light) {
    const fallbackLight = new HemisphericLight('BattleSkyLight', new Vector3(0, 1, -1), scene);
    fallbackLight.intensity = 0.9;
    fallbackLight.diffuse = new Color3(0.82, 0.94, 1);
    fallbackLight.groundColor = new Color3(0.1, 0.16, 0.19);
  }

  const backgroundPlanes = editorSceneLoaded
    ? BACKGROUND_LAYERS.map((layer) => ({ layer, root: getOrCreateNode(scene, layer.name), plane: scene.getMeshByName(`${layer.name}Plane`) }))
    : createFallbackBackground(scene, map);
  if (editorSceneLoaded) applyEditorBackgroundMaterials(backgroundPlanes, map, scene);
  const mothershipGameplayRoot = getOrCreateNode(scene, 'MothershipGameplayRoot');
  const fighterPoolRoot = getOrCreateNode(scene, 'FighterPoolRoot');
  const dronePoolRoot = getOrCreateNode(scene, 'DronePoolRoot');
  const groundBattleRoot = getOrCreateNode(scene, 'GroundBattleRoot');
  if (!editorSceneLoaded) createFallbackMothershipAndUnits(scene, map, mothershipGameplayRoot, fighterPoolRoot, dronePoolRoot, groundBattleRoot);
  const fighterVisuals = createFighterVisuals(scene, fighterPoolRoot);
  const combatVfx = new BattleCombatVfx(scene, mothershipGameplayRoot);
  setGameplayRenderingGroup(mothershipGameplayRoot, fighterPoolRoot, dronePoolRoot, groundBattleRoot);
  for (const fighter of fighterVisuals) {
    fighter.trail.mesh.renderingGroupId = 3;
    fighter.trail.coreMesh.renderingGroupId = 3;
  }

  let paused = false;
  let elapsed = 0;
  let cinematic: MothershipCinematic | null = null;
  let completedCombat = false;
  let cloudTextureOffset = 0;
  let cameraX = mothershipGameplayRoot.position.x;
  camera.position.x = cameraX;
  camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
  const pressedKeys = new Set<string>();
  const combatState = options.combatState;
  const combatTarget = (): Vec2 => ({ x: mothershipGameplayRoot.position.x, z: 0 });
  const triggerCombatAbility = (ability: 'emp' | 'plasma') => {
    if (!combatState || combatState.result !== 'ACTIVE') return;
    const target = combatTarget();
    const result = activateAbility(combatState, ability, target);
    if (result.ok) combatVfx.triggerAbility(ability, new Vector3(target.x, -4.2, target.z));
  };
  const triggerCombatHit = (kind: 'SHIELD' | 'HULL') => {
    if (!combatState || combatState.result !== 'ACTIVE') {
      combatVfx.triggerMothershipHit(kind);
      return;
    }
    if (kind === 'SHIELD') combatState.mothership.shield = Math.max(120, combatState.mothership.shield);
    else combatState.mothership.shield = 0;
    applyMothershipProjectileDamage(combatState, kind === 'SHIELD' ? 72 : combatState.mothership.hull + 100, 'fighter', { x: 0.72, y: -0.18, z: -1 }, `debug-${kind.toLowerCase()}-hit-${combatState.nextEntityId++}`);
  };
  const triggerBeam = () => {
    if (!combatState || combatState.result !== 'ACTIVE') {
      combatVfx.toggleAbsorption(new Vector3(mothershipGameplayRoot.position.x, -4.2, 0));
      return;
    }
    if (combatState.activeAbility === 'beam') {
      stopBeam(combatState, 'MANUAL');
      return;
    }
    const target = combatState.absorbableTargets.find((item) => item.kind === 'ORGANIC' && item.remainingAmount > 0) ?? combatState.absorbableTargets.find((item) => item.remainingAmount > 0);
    if (target) activateAbility(combatState, 'beam', target.center);
  };
  const startCinematic = (kind: MothershipCinematic['kind']) => {
    if (cinematic || kind === 'CRASH' && completedCombat) return;
    cinematic = { kind, elapsed: 0, duration: kind === 'CRASH' ? CINEMATIC_CRASH_DURATION : CINEMATIC_EVASION_DURATION, origin: mothershipGameplayRoot.position.clone(), direction: pressedKeys.has('arrowleft') || pressedKeys.has('a') ? -1 : 1 };
    if (kind === 'CRASH' && combatState && combatState.result === 'ACTIVE') {
      combatState.mothership.shield = 0;
      applyMothershipProjectileDamage(combatState, combatState.mothership.hull + 100, 'sam', { x: -0.6, y: -0.4, z: -1 }, `crash-hit-${combatState.nextEntityId++}`);
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'd') {
      event.preventDefault();
      pressedKeys.add(event.key.toLowerCase());
    }
    if (event.key === '1') {
      event.preventDefault();
      triggerCombatHit('SHIELD');
    }
    if (event.key === '2') {
      event.preventDefault();
      triggerCombatHit('HULL');
    }
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      triggerCombatAbility('emp');
    }
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      triggerCombatAbility('plasma');
    }
    if (event.key.toLowerCase() === 'b') {
      event.preventDefault();
      triggerBeam();
    }
    if (event.key.toLowerCase() === 'q') { event.preventDefault(); startCinematic('EVASION'); }
    if (event.key.toLowerCase() === 'c') { event.preventDefault(); startCinematic('CRASH'); }
    if (event.key.toLowerCase() === 'x' && combatState) { event.preventDefault(); commandExtraction(combatState); }
    if (event.key === 'Escape') paused = !paused;
  };
  const keyUp = (event: KeyboardEvent) => pressedKeys.delete(event.key.toLowerCase());
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);

  const update = () => {
    if (paused) return;
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1000, 0.05);
    elapsed += deltaSeconds;
    if (cinematic) {
      updateMothershipCinematic(mothershipGameplayRoot, cinematic, deltaSeconds);
      if (cinematic.elapsed >= cinematic.duration) {
        const finishedKind = cinematic.kind;
        cinematic = null;
        if (finishedKind === 'EVASION') mothershipGameplayRoot.rotation.set(0, 0, 0);
        if (finishedKind === 'CRASH') {
          completedCombat = true;
          if (combatState) {
            combatState.result = 'FAILED';
            options.onCombatComplete?.(combatState);
          }
        }
      }
    }
    const moveLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a');
    const moveRight = pressedKeys.has('arrowright') || pressedKeys.has('d');
    const movement = Number(moveRight) - Number(moveLeft);
    const visibleWidth = getVisibleWidth(camera, engine);
    const cameraTravel = Math.max(0, visibleWidth * map.camera.travelScreensFromStart);
    const mothershipTravel = Math.max(52, cameraTravel + visibleWidth * 0.38);
    if (!cinematic) mothershipGameplayRoot.position.x = Scalar.Clamp(mothershipGameplayRoot.position.x + movement * 34 * deltaSeconds, -mothershipTravel, mothershipTravel);
    if (combatState && !cinematic) {
      combatState.mothership.position.x = mothershipGameplayRoot.position.x;
      combatState.mothership.position.z = 0;
      tickCombat(combatState, deltaSeconds);
      if (combatState.extractionStatus === 'IN_PROGRESS') commandExtraction(combatState, deltaSeconds);
      mothershipGameplayRoot.position.x = combatState.mothership.position.x;
      combatVfx.syncCombatState(combatState);
      if (combatState.result !== 'ACTIVE' && !completedCombat) {
        completedCombat = true;
        options.onCombatComplete?.(combatState);
      }
    }
    const desiredCameraX = Scalar.Clamp(mothershipGameplayRoot.position.x, -cameraTravel, cameraTravel);
    cameraX = Scalar.Lerp(cameraX, desiredCameraX, 1 - Math.pow(0.0005, deltaSeconds));
    camera.position.x = cameraX;
    camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
    for (const { layer, root } of backgroundPlanes) root.position.x = cameraX * (1 - layer.parallax);
    cloudTextureOffset = (cloudTextureOffset + deltaSeconds * CLOUD_DRIFT_SPEED) % 1;
    for (const { layer, plane } of backgroundPlanes) {
      if (layer.key !== 'clouds' || !(plane?.material instanceof StandardMaterial)) continue;
      const texture = plane.material.diffuseTexture;
      if (texture instanceof Texture) texture.uOffset = cloudTextureOffset;
    }
    animatePrototypes(fighterVisuals, dronePoolRoot, groundBattleRoot, elapsed, deltaSeconds);
    combatVfx.update(deltaSeconds, elapsed);
  };
  scene.onBeforeRenderObservable.add(update);
  engine.runRenderLoop(() => scene.render());
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);

  return {
    engine,
    scene,
    camera,
    mothershipGameplayRoot,
    triggerAbility: triggerCombatAbility,
    toggleAbsorption: triggerBeam,
    setPaused(nextPaused: boolean) { paused = nextPaused; },
    dispose() {
      scene.onBeforeRenderObservable.removeCallback(update);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('resize', resize);
      fighterVisuals.forEach((fighter) => disposeFighterVisual(fighter));
      combatVfx.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function updateMothershipCinematic(root: TransformNode, cinematic: MothershipCinematic, dt: number): void {
  cinematic.elapsed = Math.min(cinematic.duration, cinematic.elapsed + dt);
  const progress = cinematic.elapsed / cinematic.duration;
  const eased = Math.sin(progress * Math.PI);
  if (cinematic.kind === 'EVASION') {
    root.position.x = cinematic.origin.x + cinematic.direction * eased * 8;
    root.position.y = cinematic.origin.y + eased * 2.2;
    root.position.z = cinematic.origin.z + Math.sin(progress * Math.PI * 2) * 1.2;
    root.rotation.z = cinematic.direction * eased * 0.42;
    root.rotation.y = cinematic.direction * eased * 0.24;
    return;
  }
  root.position.x = cinematic.origin.x + cinematic.direction * eased * 2.5;
  root.position.y = cinematic.origin.y - progress * 20;
  root.position.z = cinematic.origin.z - progress * 18;
  root.rotation.x = progress * 1.1;
  root.rotation.z = cinematic.direction * progress * 0.75;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function getOrCreateNode(scene: Scene, name: string): TransformNode {
  return scene.getTransformNodeByName(name) ?? new TransformNode(name, scene);
}

function createFallbackBackground(scene: Scene, map: BattleMapDefinition): Array<{ layer: BackgroundLayer; root: TransformNode; plane: AbstractMesh }> {
  const environmentRoot = getOrCreateNode(scene, 'EnvironmentRoot');
  return BACKGROUND_LAYERS.map((layer) => {
    const root = getOrCreateNode(scene, layer.name);
    root.parent = environmentRoot;
    root.position.set(0, layer.y, layer.z);
    const plane = MeshBuilder.CreatePlane(`${layer.name}Plane`, {
      width: WORLD_WIDTH,
      height: getBackgroundPlaneHeight(layer.key),
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    plane.parent = root;
    plane.renderingGroupId = layer.renderingGroupId;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    const relativeUrl = mapBackgroundUrl(map, layer.key);
    if (relativeUrl) assignBackgroundMaterial(plane, relativeUrl, scene, layer.key === 'foregroundAtmosphere', getBackgroundTextureRepeat(layer.key));
    else plane.material = fallbackBackgroundMaterial(scene, layer.key);
    return { layer, root, plane };
  });
}

function applyEditorBackgroundMaterials(
  layers: Array<{ layer: BackgroundLayer; root: TransformNode; plane: AbstractMesh | null }>,
  map: BattleMapDefinition,
  scene: Scene,
): void {
  for (const { layer, plane } of layers) {
    if (!plane) continue;
    const url = mapBackgroundUrl(map, layer.key);
    plane.isVisible = true;
    plane.setEnabled(true);
    plane.isPickable = false;
    plane.renderingGroupId = layer.renderingGroupId;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    if (url) assignBackgroundMaterial(plane, url, scene, layer.key === 'foregroundAtmosphere', getBackgroundTextureRepeat(layer.key));
  }
}

function getBackgroundPlaneHeight(key: keyof BattleMapDefinition['backgrounds']): number {
  if (key === 'sky' || key === 'clouds') return 202.5;
  if (key === 'near') return 60;
  if (key === 'ground') return 42.4;
  return 67.5;
}

function getBackgroundTextureRepeat(key: keyof BattleMapDefinition['backgrounds']): number {
  return key === 'sky' || key === 'clouds' ? 1 : BACKGROUND_REPEAT;
}

function setGameplayRenderingGroup(...roots: TransformNode[]): void {
  for (const root of roots) {
    for (const mesh of root.getChildMeshes()) mesh.renderingGroupId = 3;
  }
}

function createFallbackMothershipAndUnits(
  scene: Scene,
  map: BattleMapDefinition,
  mothershipGameplayRoot: TransformNode,
  fighterPoolRoot: TransformNode,
  dronePoolRoot: TransformNode,
  groundBattleRoot: TransformNode,
): void {
  const airBattleRoot = getOrCreateNode(scene, 'AirBattleRoot');
  mothershipGameplayRoot.parent = airBattleRoot;
  mothershipGameplayRoot.position.set(0, MOTHERSHIP_Y, 0);
  const mothershipVisualRoot = getOrCreateNode(scene, 'MothershipVisualRoot');
  mothershipVisualRoot.parent = mothershipGameplayRoot;
  createMothershipVisual(mothershipVisualRoot, map, scene);
  createMothershipSockets(mothershipVisualRoot, scene);
  fighterPoolRoot.parent = airBattleRoot;
  dronePoolRoot.parent = airBattleRoot;
  createAirPrototypes(dronePoolRoot, scene);
  const groundLaneDefinitions = getOrCreateNode(scene, 'GroundLaneDefinitions');
  groundLaneDefinitions.parent = groundBattleRoot;
  createGroundPrototypes(groundBattleRoot, scene);
}

function assignBackgroundMaterial(mesh: AbstractMesh, url: string, scene: Scene, isAtmosphere: boolean, repeatX = 1): void {
  const material = new StandardMaterial(`${mesh.name}Material`, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = 1;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = 2;
  material.disableDepthWrite = true;
  material.diffuseColor = new Color3(1, 1, 1);
  material.emissiveColor = new Color3(1, 1, 1);
  const texture = new Texture(url, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.uScale = repeatX;
  texture.vScale = 1;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.hasAlpha = isAtmosphere || !url.endsWith('sky-day-base.webp');
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  mesh.material = material;
}

function fallbackBackgroundMaterial(scene: Scene, key: keyof BattleMapDefinition['backgrounds']): StandardMaterial {
  const material = new StandardMaterial(`${key}FallbackMaterial`, scene);
  material.disableLighting = true;
  material.disableDepthWrite = true;
  material.diffuseColor = key === 'sky' ? new Color3(0.23, 0.52, 0.7) : new Color3(0.1, 0.24, 0.28);
  material.alpha = key === 'foregroundAtmosphere' ? 0.18 : 1;
  return material;
}

function createMothershipVisual(root: TransformNode, map: BattleMapDefinition, scene: Scene): void {
  const hullMaterial = new StandardMaterial('MothershipHullMaterial', scene);
  hullMaterial.diffuseColor = new Color3(0.62, 0.66, 0.68);
  hullMaterial.specularColor = new Color3(0.1, 0.16, 0.2);
  hullMaterial.roughness = 0.62;
  const hullTextureUrl = sharedMaterialUrl(map, 'mothershipHullBaseColor');
  if (hullTextureUrl) hullMaterial.diffuseTexture = new Texture(hullTextureUrl, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);

  const hull = MeshBuilder.CreateCylinder('MothershipModel', {
    diameterTop: 18,
    diameterBottom: 24,
    height: 3.8,
    tessellation: 96,
  }, scene);
  hull.parent = root;
  hull.material = hullMaterial;
  const rimMaterial = new StandardMaterial('MothershipRimMaterial', scene);
  rimMaterial.diffuseColor = new Color3(0.12, 0.16, 0.18);
  rimMaterial.specularColor = new Color3(0.08, 0.12, 0.15);
  const rim = MeshBuilder.CreateTorus('MothershipRim', { diameter: 22, thickness: 0.38, tessellation: 96 }, scene);
  rim.parent = root;
  rim.scaling.y = 0.72;
  rim.position.y = -0.2;
  rim.material = rimMaterial;
}

function createMothershipSockets(root: TransformNode, scene: Scene): void {
  const weaponSockets = new TransformNode('WeaponSockets', scene);
  weaponSockets.parent = root;
  for (const side of [-1, 1]) {
    const socket = new TransformNode(`WeaponSocket${side > 0 ? 'Right' : 'Left'}`, scene);
    socket.parent = weaponSockets;
    socket.position.set(5, -0.7, side * 2.1);
  }
  const droneSockets = new TransformNode('DroneSpawnSockets', scene);
  droneSockets.parent = root;
  for (const [index, position] of [[-1.2, 4.5, 0], [2.3, 5.1, 0], [6, 3.8, 0]].entries()) {
    const socket = new TransformNode(`DroneSpawnSocket${index}`, scene);
    socket.parent = droneSockets;
    socket.position.set(position[0], position[1], position[2]);
  }
  const vfxSockets = new TransformNode('MothershipVfxSockets', scene);
  vfxSockets.parent = root;
}

function createAirPrototypes(droneRoot: TransformNode, scene: Scene): void {
  const droneMaterial = new StandardMaterial('DronePrototypeMaterial', scene);
  droneMaterial.diffuseColor = new Color3(0.9, 0.55, 0.24);
  droneMaterial.emissiveColor = new Color3(0.18, 0.05, 0.01);
  for (let index = 0; index < 3; index += 1) {
    const drone = MeshBuilder.CreateSphere(`DronePrototype${index + 1}`, { diameter: 2.2, segments: 12 }, scene);
    drone.parent = droneRoot;
    drone.position.set(-10 + index * 16, -1 + (index % 2) * 6, -1);
    drone.material = droneMaterial;
  }
}

function createFighterVisuals(scene: Scene, fighterRoot: TransformNode): FighterVisual[] {
  const fighterVisuals: FighterVisual[] = [];
  const headings = [-0.72, 0, 0.72];
  for (let index = 0; index < 3; index += 1) {
    const name = `FighterPrototype${index + 1}`;
    const existing = scene.getMeshByName(name);
    const mesh = existing instanceof Mesh
      ? existing
      : MeshBuilder.CreatePlane(name, { size: 1 }, scene);
    if (!existing) {
      mesh.parent = fighterRoot;
      mesh.position.set(-20 + index * 17, 14 + (index % 2) * 5, 1.5 + index);
    }
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.scaling.set(FIGHTER_SPRITE_SIZE, FIGHTER_SPRITE_SIZE, 1);
    mesh.isPickable = false;
    const heading = headings[index];
    const texture = new Texture(FIGHTER_SPRITE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
    setAtlasFrame(texture, FIGHTER_ATLAS_COLUMNS, FIGHTER_ATLAS_ROWS, index * 2);
    texture.hasAlpha = true;
    const material = new StandardMaterial(`${name}SpriteMaterial`, scene);
    material.diffuseColor = Color3.White();
    material.emissiveColor = new Color3(0.24, 0.32, 0.38);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Engine.ALPHA_COMBINE;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    mesh.material = material;
    mesh.metadata = { ...(mesh.metadata ?? {}), battleFighterSprite: true, battleBaseY: mesh.position.y };
    const fallback = MeshBuilder.CreatePolyhedron(`${name}Fallback`, { type: 1, size: 1.7 }, scene);
    fallback.parent = fighterRoot;
    fallback.position = mesh.position.clone();
    fallback.isVisible = false;
    fallback.isPickable = false;
    fallback.metadata = { battleFighterFallback: true, battleBaseY: mesh.position.y };
    const trail = createFighterTrail(name, scene, mesh.getAbsolutePosition(), heading);
    fighterVisuals.push({
      mesh,
      fallback,
      trail,
      baseX: mesh.position.x,
      baseY: mesh.position.y,
      baseZ: mesh.position.z,
      heading,
      phase: index * 1.7,
    });
  }
  return fighterVisuals;
}

function createFighterTrail(id: string, scene: Scene, position: Vector3, heading: number): FighterTrailVisual {
  const generator = new TransformNode(`${id}-engine-nozzle`, scene);
  positionFighterTrailGenerator(generator, position, heading);
  generator.computeWorldMatrix(true);
  const trailMaterial = new StandardMaterial(`${id}-engine-trail-material`, scene);
  trailMaterial.diffuseColor = new Color3(1, 0.46, 0.12);
  trailMaterial.emissiveColor = new Color3(0.78, 0.16, 0.025);
  trailMaterial.alpha = 0.34;
  trailMaterial.disableLighting = true;
  trailMaterial.backFaceCulling = false;
  const mesh = new TrailMesh(`${id}-engine-trail`, generator, scene, {
    diameter: FIGHTER_TRAIL_DIAMETER,
    length: FIGHTER_TRAIL_LENGTH,
    segments: FIGHTER_TRAIL_SEGMENTS,
    sections: 6,
    autoStart: true,
  });
  mesh.material = trailMaterial;
  mesh.isPickable = false;
  const coreMaterial = new StandardMaterial(`${id}-engine-trail-core-material`, scene);
  coreMaterial.diffuseColor = new Color3(1, 0.88, 0.48);
  coreMaterial.emissiveColor = new Color3(1, 0.42, 0.05);
  coreMaterial.alpha = 0.84;
  coreMaterial.alphaMode = Engine.ALPHA_ADD;
  coreMaterial.disableLighting = true;
  coreMaterial.backFaceCulling = false;
  const coreMesh = new TrailMesh(`${id}-engine-trail-core`, generator, scene, {
    diameter: FIGHTER_TRAIL_CORE_DIAMETER,
    length: FIGHTER_TRAIL_CORE_LENGTH,
    segments: FIGHTER_TRAIL_CORE_SEGMENTS,
    sections: 6,
    autoStart: true,
  });
  coreMesh.material = coreMaterial;
  coreMesh.isPickable = false;
  const smokeMaterial = new StandardMaterial(`${id}-engine-smoke-material`, scene);
  smokeMaterial.diffuseColor = new Color3(0.28, 0.22, 0.18);
  smokeMaterial.emissiveColor = new Color3(0.08, 0.025, 0.01);
  smokeMaterial.alpha = 0.38;
  smokeMaterial.disableLighting = true;
  smokeMaterial.backFaceCulling = false;
  return { generator, mesh, coreMesh, smokeMaterial, smokePuffs: [], smokeAccumulator: 0, nextSmokeId: 0 };
}

function positionFighterTrailGenerator(generator: TransformNode, position: Vector3, heading: number): void {
  const direction = new Vector3(Math.sin(heading), 0, Math.cos(heading));
  generator.position.set(
    position.x - direction.x * FIGHTER_TRAIL_NOZZLE_OFFSET,
    position.y - 0.14,
    position.z - direction.z * FIGHTER_TRAIL_NOZZLE_OFFSET,
  );
  generator.rotation.set(0, heading, 0);
}

function syncFighterSmokeTrail(trail: FighterTrailVisual, scene: Scene, dt: number, emissionEnabled: boolean): void {
  for (const puff of trail.smokePuffs) {
    puff.age += dt;
    const progress = Math.min(1, puff.age / FIGHTER_SMOKE_LIFETIME);
    puff.mesh.visibility = Math.max(0, 0.44 - progress * 0.44);
    puff.mesh.scaling.setAll(0.42 + progress * 0.72);
  }
  while (trail.smokePuffs.length > 0 && trail.smokePuffs[0].age >= FIGHTER_SMOKE_LIFETIME) {
    trail.smokePuffs.shift()?.mesh.dispose();
  }
  if (!emissionEnabled) return;
  trail.smokeAccumulator += dt;
  while (trail.smokeAccumulator >= FIGHTER_SMOKE_INTERVAL) {
    trail.smokeAccumulator -= FIGHTER_SMOKE_INTERVAL;
    const puff = MeshBuilder.CreateSphere(`${trail.generator.name}-smoke-${trail.nextSmokeId++}`, { diameter: 0.72, segments: 8 }, scene);
    puff.position = trail.generator.position.clone();
    puff.material = trail.smokeMaterial;
    puff.renderingGroupId = 3;
    puff.isPickable = false;
    trail.smokePuffs.push({ mesh: puff, age: 0 });
  }
}

function disposeFighterVisual(fighter: FighterVisual): void {
  fighter.fallback.dispose();
  fighter.trail.mesh.stop();
  fighter.trail.coreMesh.stop();
  fighter.trail.mesh.dispose();
  fighter.trail.coreMesh.dispose();
  fighter.trail.smokePuffs.splice(0).forEach((puff) => puff.mesh.dispose());
  fighter.trail.smokeMaterial.dispose();
  fighter.trail.generator.dispose();
}

function createGroundPrototypes(root: TransformNode, scene: Scene): void {
  const laneMaterial = new StandardMaterial('GroundPrototypeMaterial', scene);
  laneMaterial.diffuseColor = new Color3(0.52, 0.4, 0.3);
  laneMaterial.emissiveColor = new Color3(0.06, 0.03, 0.01);
  const lanes = new TransformNode('GroundLanePrototypeAnchors', scene);
  lanes.parent = root;
  [-36, -8, 24].forEach((x, index) => {
    const anchor = new TransformNode(`GroundLaneAnchor${index + 1}`, scene);
    anchor.parent = lanes;
    anchor.position.set(x, -7, 0);
    const turret = MeshBuilder.CreateBox(`GroundTurretPrototype${index + 1}`, { width: 8, height: 2.2, depth: 3.2 }, scene);
    turret.parent = anchor;
    turret.position.y = 2;
    turret.material = laneMaterial;
    const barrel = MeshBuilder.CreateCylinder(`GroundBarrelPrototype${index + 1}`, { diameter: 0.7, height: 5, tessellation: 12 }, scene);
    barrel.parent = anchor;
    barrel.position.set(1, 4.1, -0.2);
    barrel.rotation.z = Math.PI / 2;
    barrel.material = laneMaterial;
  });
}

function animatePrototypes(fighterVisuals: FighterVisual[], droneRoot: TransformNode, groundRoot: TransformNode, elapsed: number, dt: number): void {
  fighterVisuals.forEach((fighter) => {
    const flightCycle = elapsed * 0.42 + fighter.phase;
    fighter.mesh.position.x = fighter.baseX + Math.sin(flightCycle) * 9;
    fighter.mesh.position.y = fighter.baseY + Math.sin(elapsed * 1.8 + fighter.phase) * 0.62;
    fighter.mesh.position.z = fighter.baseZ + Math.cos(flightCycle) * 2.2;
    fighter.mesh.rotation.z = Math.cos(flightCycle) * 0.13;
    fighter.fallback.position.copyFrom(fighter.mesh.position);
    fighter.fallback.rotation.y = fighter.heading;
    const spriteReady = fighter.mesh.material instanceof StandardMaterial
      && fighter.mesh.material.diffuseTexture instanceof Texture
      && fighter.mesh.material.diffuseTexture.isReady();
    fighter.mesh.isVisible = spriteReady;
    fighter.fallback.isVisible = !spriteReady;
    positionFighterTrailGenerator(fighter.trail.generator, fighter.mesh.getAbsolutePosition(), fighter.heading);
    fighter.trail.mesh.isVisible = spriteReady;
    fighter.trail.mesh.visibility = 0.52;
    fighter.trail.coreMesh.isVisible = spriteReady;
    fighter.trail.coreMesh.visibility = 0.72;
    syncFighterSmokeTrail(fighter.trail, fighter.mesh.getScene(), dt, spriteReady);
  });
  droneRoot.getChildMeshes().forEach((drone, index) => {
    const metadata = getAnimationMetadata(drone);
    drone.position.y = metadata.baseY + Math.sin(elapsed * 2.2 + index * 1.7) * 0.22;
    drone.rotation.y += 0.008;
  });
  groundRoot.getChildMeshes().forEach((mesh, index) => {
    if (mesh.name.includes('GroundTurret')) mesh.rotation.y = Math.sin(elapsed * 0.3 + index) * 0.08;
  });
}

function getAnimationMetadata(mesh: AbstractMesh): { baseY: number } {
  const metadata = (mesh.metadata ?? {}) as Record<string, unknown>;
  if (typeof metadata.battleBaseY !== 'number') metadata.battleBaseY = mesh.position.y;
  mesh.metadata = metadata;
  return { baseY: metadata.battleBaseY as number };
}

function setAtlasFrame(texture: Texture, columns: number, rows: number, frame: number): void {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  const safeFrame = Math.max(0, Math.min(safeColumns * safeRows - 1, Math.floor(frame)));
  texture.uScale = 1 / safeColumns;
  texture.vScale = 1 / safeRows;
  texture.uOffset = (safeFrame % safeColumns) / safeColumns;
  texture.vOffset = Math.floor(safeFrame / safeColumns) / safeRows;
}

function getVisibleWidth(camera: UniversalCamera, engine: Engine): number {
  const height = Math.max(1, engine.getRenderHeight());
  const aspect = engine.getRenderWidth() / height;
  const visibleHeight = 2 * Math.abs(camera.position.z) * Math.tan(camera.fov / 2);
  return visibleHeight * aspect;
}
