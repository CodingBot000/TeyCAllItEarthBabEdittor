import {
  Color3,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scalar,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
} from '@babylonjs/core';
import { loadScene } from 'babylonjs-editor-tools';
import { scriptsMap } from '../../../scripts';
import type { BattleMapDefinition } from '../contracts/BattleMapDefinition';
import { mapBackgroundUrl, sharedMaterialUrl } from '../maps/battleMapCatalog';

const WORLD_WIDTH = 360;
const WORLD_HEIGHT = WORLD_WIDTH * 9 / 16;
const CAMERA_Y = 5;
const CAMERA_Z = -92;
const MOTHERSHIP_Y = 8;

export interface BattleRuntime {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  mothershipGameplayRoot: TransformNode;
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface BackgroundLayer {
  name: string;
  key: keyof BattleMapDefinition['backgrounds'];
  z: number;
  y: number;
  parallax: number;
  renderingGroupId: number;
}

const BACKGROUND_LAYERS: BackgroundLayer[] = [
  { name: 'SkyRoot', key: 'sky', z: 30, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CityFarRoot', key: 'far', z: 22, y: 0, parallax: 0.15, renderingGroupId: 0 },
  { name: 'CityMiddleRoot', key: 'middle', z: 16, y: -1, parallax: 0.35, renderingGroupId: 1 },
  { name: 'CityNearRoot', key: 'near', z: 10, y: -2, parallax: 0.6, renderingGroupId: 2 },
  { name: 'GroundRoot', key: 'ground', z: 4, y: -42, parallax: 1, renderingGroupId: 2 },
  { name: 'ForegroundRoot', key: 'foregroundAtmosphere', z: -5, y: 1, parallax: 0.8, renderingGroupId: 3 },
];

export async function createBattleRuntime(canvas: HTMLCanvasElement, map: BattleMapDefinition): Promise<BattleRuntime> {
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
  setGameplayRenderingGroup(mothershipGameplayRoot, fighterPoolRoot, dronePoolRoot, groundBattleRoot);

  let paused = false;
  let elapsed = 0;
  let cameraX = mothershipGameplayRoot.position.x;
  camera.position.x = cameraX;
  camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
  const pressedKeys = new Set<string>();
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'd') {
      event.preventDefault();
      pressedKeys.add(event.key.toLowerCase());
    }
    if (event.key === 'Escape') paused = !paused;
  };
  const keyUp = (event: KeyboardEvent) => pressedKeys.delete(event.key.toLowerCase());
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);

  const update = () => {
    if (paused) return;
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1000, 0.05);
    elapsed += deltaSeconds;
    const moveLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a');
    const moveRight = pressedKeys.has('arrowright') || pressedKeys.has('d');
    const movement = Number(moveRight) - Number(moveLeft);
    const visibleWidth = getVisibleWidth(camera, engine);
    const cameraTravel = Math.max(0, visibleWidth * map.camera.travelScreensFromStart);
    const mothershipTravel = Math.max(52, cameraTravel + visibleWidth * 0.38);
    mothershipGameplayRoot.position.x = Scalar.Clamp(
      mothershipGameplayRoot.position.x + movement * 34 * deltaSeconds,
      -mothershipTravel,
      mothershipTravel,
    );
    const desiredCameraX = Scalar.Clamp(mothershipGameplayRoot.position.x, -cameraTravel, cameraTravel);
    cameraX = Scalar.Lerp(cameraX, desiredCameraX, 1 - Math.pow(0.0005, deltaSeconds));
    camera.position.x = cameraX;
    camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
    for (const { layer, root } of backgroundPlanes) root.position.x = cameraX * (1 - layer.parallax);
    animatePrototypes(fighterPoolRoot, dronePoolRoot, groundBattleRoot, elapsed);
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
    setPaused(nextPaused: boolean) { paused = nextPaused; },
    dispose() {
      scene.onBeforeRenderObservable.removeCallback(update);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('resize', resize);
      scene.dispose();
      engine.dispose();
    },
  };
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
      height: layer.key === 'ground' ? WORLD_WIDTH * 0.34 : WORLD_HEIGHT,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    plane.parent = root;
    plane.renderingGroupId = layer.renderingGroupId;
    plane.isPickable = false;
    plane.alwaysSelectAsActiveMesh = true;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    const relativeUrl = mapBackgroundUrl(map, layer.key);
    if (relativeUrl) assignBackgroundMaterial(plane, relativeUrl, scene, layer.key === 'foregroundAtmosphere');
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
    plane.renderingGroupId = layer.renderingGroupId;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    if (url) assignBackgroundMaterial(plane, url, scene, layer.key === 'foregroundAtmosphere');
  }
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
  createAirPrototypes(fighterPoolRoot, dronePoolRoot, scene);
  const groundLaneDefinitions = getOrCreateNode(scene, 'GroundLaneDefinitions');
  groundLaneDefinitions.parent = groundBattleRoot;
  createGroundPrototypes(groundBattleRoot, scene);
}

function assignBackgroundMaterial(mesh: AbstractMesh, url: string, scene: Scene, isAtmosphere: boolean): void {
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
  hullMaterial.diffuseColor = new Color3(0.28, 0.37, 0.42);
  hullMaterial.specularColor = new Color3(0.1, 0.16, 0.2);
  hullMaterial.roughness = 0.62;
  const hullTextureUrl = sharedMaterialUrl(map, 'mothershipHullBaseColor');
  if (hullTextureUrl) hullMaterial.diffuseTexture = new Texture(hullTextureUrl, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);

  const hull = MeshBuilder.CreateBox('MothershipModel', { width: 20, height: 4.8, depth: 6.6 }, scene);
  hull.parent = root;
  hull.scaling.z = 0.72;
  hull.material = hullMaterial;
  const bridge = MeshBuilder.CreateSphere('MothershipBridge', { diameter: 5.8, segments: 24 }, scene);
  bridge.parent = root;
  bridge.position.set(1.5, 2.5, 0);
  bridge.scaling.y = 0.48;
  bridge.material = hullMaterial;

  const wingMaterial = new StandardMaterial('MothershipWingMaterial', scene);
  wingMaterial.diffuseColor = new Color3(0.12, 0.2, 0.24);
  wingMaterial.specularColor = new Color3(0.08, 0.12, 0.15);
  for (const side of [-1, 1]) {
    const wing = MeshBuilder.CreateBox(`MothershipWing${side > 0 ? 'Right' : 'Left'}`, { width: 8, height: 0.6, depth: 7.2 }, scene);
    wing.parent = root;
    wing.position.set(-2.5, -1.4, side * 3.2);
    wing.rotation.y = side * 0.14;
    wing.material = wingMaterial;
  }

  const glowMaterial = new StandardMaterial('MothershipEngineGlowMaterial', scene);
  glowMaterial.emissiveColor = new Color3(0.15, 0.95, 1);
  glowMaterial.diffuseColor = new Color3(0.05, 0.25, 0.3);
  for (const side of [-1, 1]) {
    const engine = MeshBuilder.CreateCylinder(`MothershipEngine${side > 0 ? 'Right' : 'Left'}`, { diameter: 1.8, height: 4.3, tessellation: 20 }, scene);
    engine.parent = root;
    engine.position.set(-9, 0, side * 1.8);
    engine.rotation.z = Math.PI / 2;
    engine.material = glowMaterial;
  }

  const decalUrl = sharedMaterialUrl(map, 'mothershipEmissiveDecals');
  if (decalUrl) {
    const decalMaterial = new StandardMaterial('MothershipEmissiveDecalMaterial', scene);
    decalMaterial.disableLighting = true;
    decalMaterial.useAlphaFromDiffuseTexture = true;
    decalMaterial.emissiveColor = new Color3(0.35, 1, 1);
    decalMaterial.diffuseTexture = new Texture(decalUrl, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    const decal = MeshBuilder.CreatePlane('MothershipEmissiveDecal', { width: 6, height: 1.2, sideOrientation: Mesh.DOUBLESIDE }, scene);
    decal.parent = root;
    decal.position.set(3.3, 0.2, -2.43);
    decal.rotation.x = Math.PI;
    decal.material = decalMaterial;
  }
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

function createAirPrototypes(fighterRoot: TransformNode, droneRoot: TransformNode, scene: Scene): void {
  const fighterMaterial = new StandardMaterial('FighterPrototypeMaterial', scene);
  fighterMaterial.diffuseColor = new Color3(0.65, 0.77, 0.82);
  fighterMaterial.emissiveColor = new Color3(0.04, 0.2, 0.24);
  const droneMaterial = new StandardMaterial('DronePrototypeMaterial', scene);
  droneMaterial.diffuseColor = new Color3(0.9, 0.55, 0.24);
  droneMaterial.emissiveColor = new Color3(0.18, 0.05, 0.01);
  for (let index = 0; index < 3; index += 1) {
    const fighter = MeshBuilder.CreatePolyhedron(`FighterPrototype${index + 1}`, { type: 1, size: 3.2 }, scene);
    fighter.parent = fighterRoot;
    fighter.position.set(-20 + index * 17, 14 + (index % 2) * 5, 1.5 + index);
    fighter.scaling.y = 0.35;
    fighter.material = fighterMaterial;
    const drone = MeshBuilder.CreateSphere(`DronePrototype${index + 1}`, { diameter: 2.2, segments: 12 }, scene);
    drone.parent = droneRoot;
    drone.position.set(-10 + index * 16, -1 + (index % 2) * 6, -1);
    drone.material = droneMaterial;
  }
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

function animatePrototypes(fighterRoot: TransformNode, droneRoot: TransformNode, groundRoot: TransformNode, elapsed: number): void {
  fighterRoot.getChildMeshes().forEach((fighter, index) => {
    const metadata = getAnimationMetadata(fighter);
    fighter.position.y = metadata.baseY + Math.sin(elapsed * 1.8 + index) * 0.28;
    fighter.rotation.z = Math.sin(elapsed * 1.1 + index) * 0.08;
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

function getVisibleWidth(camera: UniversalCamera, engine: Engine): number {
  const height = Math.max(1, engine.getRenderHeight());
  const aspect = engine.getRenderWidth() / height;
  const visibleHeight = 2 * Math.abs(camera.position.z) * Math.tan(camera.fov / 2);
  return visibleHeight * aspect;
}
