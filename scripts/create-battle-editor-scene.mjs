import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Color3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  SceneSerializer,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';

const projectRoot = process.cwd();
const sceneRoot = path.join(projectRoot, 'assets/battlescene.scene');
const engine = new NullEngine();
const scene = new Scene(engine);
scene.clearColor.set(0.04, 0.12, 0.17, 1);

const textureMaterials = new Map();
const sceneRootNode = new TransformNode('BattleSceneRoot', scene);
const environmentRoot = childNode('EnvironmentRoot', sceneRootNode);

const BACKGROUND_WORLD_WIDTH = 360;
const BACKGROUND_TILE_WIDTH = 120;
const BACKGROUND_REPEAT = BACKGROUND_WORLD_WIDTH / BACKGROUND_TILE_WIDTH;
const BACKGROUND_PLANE_HEIGHTS = {
  SkyRoot: 202.5,
  CityFarRoot: 67.5,
  CityMiddleRoot: 67.5,
  CityNearRoot: 60,
  GroundRoot: 42.4,
  ForegroundRoot: 67.5,
};

const layers = [
  ['SkyRoot', 'backgrounds/sky-day-base.webp', 30, 4, false],
  ['CityFarRoot', 'backgrounds/city-far-day.webp', 22, 9, true],
  ['CityMiddleRoot', 'backgrounds/city-middle-day.webp', 16, -6, true],
  ['CityNearRoot', 'backgrounds/city-near-day.webp', 10, -20, true],
  ['GroundRoot', 'backgrounds/ground-road-day.webp', 4, -12, true],
  ['ForegroundRoot', 'backgrounds/foreground-atmosphere-day.webp', -5, 1, true],
];
for (let index = 0; index < layers.length; index += 1) {
  const [name, asset, z, y, hasAlpha] = layers[index];
  const root = childNode(name, environmentRoot);
  root.position.set(0, y, z);
  const textureUScale = name === 'SkyRoot' ? 1 : BACKGROUND_REPEAT;
  const plane = MeshBuilder.CreatePlane(name + 'Plane', {
    width: BACKGROUND_WORLD_WIDTH,
    height: BACKGROUND_PLANE_HEIGHTS[name],
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  plane.parent = root;
  plane.renderingGroupId = name === 'SkyRoot' || name === 'CityFarRoot' ? 0 : name === 'CityMiddleRoot' ? 1 : name === 'ForegroundRoot' ? 3 : 2;
  plane.isPickable = false;
  const material = new StandardMaterial(name + 'Material', scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = 2;
  material.disableDepthWrite = true;
  material.diffuseColor = new Color3(1, 1, 1);
  const textureUrl = 'assets/battlescene/maps/city-day/' + asset;
  material.metadata = { textureUrl, hasAlpha, useAlphaFromDiffuseTexture: true, textureUScale };
  plane.material = material;
  textureMaterials.set(material.id, material.metadata);
}

const cameraRig = childNode('CameraRig', sceneRootNode);
const camera = new UniversalCamera('BattleCamera', new Vector3(0, 5, -92), scene);
camera.parent = cameraRig;
camera.fov = 35 * Math.PI / 180;
camera.minZ = 0.1;
camera.maxZ = 1000;
camera.setTarget(new Vector3(0, 5, 0));
camera.inputs.clear();
scene.activeCamera = camera;

const light = new HemisphericLight('BattleSkyLight', new Vector3(0, 1, -1), scene);
light.intensity = 0.9;
light.diffuse = new Color3(0.82, 0.94, 1);
light.groundColor = new Color3(0.1, 0.16, 0.19);

const airRoot = childNode('AirBattleRoot', sceneRootNode);
const gameplayRoot = childNode('MothershipGameplayRoot', airRoot);
gameplayRoot.position.set(0, 8, 0);
const visualRoot = childNode('MothershipVisualRoot', gameplayRoot);
const hullMaterial = createMaterial('MothershipHullMaterial', new Color3(0.28, 0.37, 0.42), 'mothership-hull-basecolor.webp');
const hull = MeshBuilder.CreateBox('MothershipModel', { width: 20, height: 4.8, depth: 6.6 }, scene);
hull.parent = visualRoot;
hull.scaling.z = 0.72;
hull.material = hullMaterial;
const bridge = MeshBuilder.CreateSphere('MothershipBridge', { diameter: 5.8, segments: 24 }, scene);
bridge.parent = visualRoot;
bridge.position.set(1.5, 2.5, 0);
bridge.scaling.y = 0.48;
bridge.material = hullMaterial;

const wingMaterial = createMaterial('MothershipWingMaterial', new Color3(0.12, 0.2, 0.24));
for (const side of [-1, 1]) {
  const wing = MeshBuilder.CreateBox('MothershipWing' + (side > 0 ? 'Right' : 'Left'), { width: 8, height: 0.6, depth: 7.2 }, scene);
  wing.parent = visualRoot;
  wing.position.set(-2.5, -1.4, side * 3.2);
  wing.rotation.y = side * 0.14;
  wing.material = wingMaterial;
}

const glowMaterial = createMaterial('MothershipEngineGlowMaterial', new Color3(0.05, 0.25, 0.3));
glowMaterial.emissiveColor = new Color3(0.15, 0.95, 1);
for (const side of [-1, 1]) {
  const engineMesh = MeshBuilder.CreateCylinder('MothershipEngine' + (side > 0 ? 'Right' : 'Left'), { diameter: 1.8, height: 4.3, tessellation: 20 }, scene);
  engineMesh.parent = visualRoot;
  engineMesh.position.set(-9, 0, side * 1.8);
  engineMesh.rotation.z = Math.PI / 2;
  engineMesh.material = glowMaterial;
}

const weaponSockets = childNode('WeaponSockets', visualRoot);
childNode('WeaponSocketLeft', weaponSockets).position.set(5, -0.7, -2.1);
childNode('WeaponSocketRight', weaponSockets).position.set(5, -0.7, 2.1);
const droneSockets = childNode('DroneSpawnSockets', visualRoot);
childNode('DroneSpawnSocketLeft', droneSockets).position.set(-1.2, 4.5, 0);
childNode('DroneSpawnSocketCenter', droneSockets).position.set(2.3, 5.1, 0);
childNode('DroneSpawnSocketRight', droneSockets).position.set(6, 3.8, 0);
childNode('MothershipVfxSockets', visualRoot);

const fighterRoot = childNode('FighterPoolRoot', airRoot);
const droneRoot = childNode('DronePoolRoot', airRoot);
const fighterMaterial = createMaterial('FighterPrototypeMaterial', new Color3(0.65, 0.77, 0.82));
const droneMaterial = createMaterial('DronePrototypeMaterial', new Color3(0.9, 0.55, 0.24));
for (let index = 0; index < 3; index += 1) {
  const fighter = MeshBuilder.CreatePolyhedron('FighterPrototype' + (index + 1), { type: 1, size: 3.2 }, scene);
  fighter.parent = fighterRoot;
  fighter.position.set(-20 + index * 17, 14 + (index % 2) * 5, 1.5 + index);
  fighter.scaling.y = 0.35;
  fighter.material = fighterMaterial;
  const drone = MeshBuilder.CreateSphere('DronePrototype' + (index + 1), { diameter: 2.2, segments: 12 }, scene);
  drone.parent = droneRoot;
  drone.position.set(-10 + index * 16, -1 + (index % 2) * 6, -1);
  drone.material = droneMaterial;
}

const groundRoot = childNode('GroundBattleRoot', sceneRootNode);
const laneDefinitions = childNode('GroundLaneDefinitions', groundRoot);
const laneMaterial = createMaterial('GroundPrototypeMaterial', new Color3(0.52, 0.4, 0.3));
for (const [index, x] of [-36, -8, 24].entries()) {
  const anchor = childNode('GroundLaneAnchor' + (index + 1), laneDefinitions);
  anchor.position.set(x, -7, 0);
  const turret = MeshBuilder.CreateBox('GroundTurretPrototype' + (index + 1), { width: 8, height: 2.2, depth: 3.2 }, scene);
  turret.parent = anchor;
  turret.position.y = 2;
  turret.material = laneMaterial;
  const barrel = MeshBuilder.CreateCylinder('GroundBarrelPrototype' + (index + 1), { diameter: 0.7, height: 5, tessellation: 12 }, scene);
  barrel.parent = anchor;
  barrel.position.set(1, 4.1, -0.2);
  barrel.rotation.z = Math.PI / 2;
  barrel.material = laneMaterial;
}
childNode('WorldVfxRoot', sceneRootNode);
childNode('BattleDebugRoot', sceneRootNode);

const serialized = SceneSerializer.Serialize(scene);
const geometryById = new Map((serialized.geometries?.vertexData ?? []).map((geometry) => [geometry.id, geometry]));
const materialById = new Map((serialized.materials ?? []).map((material) => [material.id, material]));
for (const material of materialById.values()) {
  const texture = textureMaterials.get(material.id);
  if (!texture) continue;
  material.diffuseTexture = textureRecord(texture.textureUrl, texture.hasAlpha, texture.textureUScale);
  material.useAlphaFromDiffuseTexture = texture.useAlphaFromDiffuseTexture;
}

await fs.rm(sceneRoot, { recursive: true, force: true });
await Promise.all(['cameras', 'lights', 'meshes', 'nodes', 'geometries', 'shadowGenerators', 'animationGroups', 'sprite-managers', 'sprite-maps'].map((directory) => fs.mkdir(path.join(sceneRoot, directory), { recursive: true })));
await fs.writeFile(path.join(sceneRoot, 'config.json'), JSON.stringify({
  clearColor: [0.04, 0.12, 0.17, 1],
  ambientColor: [0.02, 0.05, 0.07],
  environment: { environmentIntensity: 0, environmentTexture: null },
  fog: { fogEnabled: false, fogMode: 0, fogStart: 10, fogEnd: 1000, fogDensity: 0.001, fogColor: [0.04, 0.12, 0.17] },
  physics: { gravity: [0, -9.81, 0] },
  rendering: [],
  metadata: { battleScene: { mapPreview: 'city-day', cameraMode: 'horizontal-only', editorGreybox: true } },
  animations: [],
  editorCamera: { position: [0, 5, -92], rotation: [0, 0, 0], fov: 0.610865, name: 'Editor preview', id: 'editor-camera', uniqueId: 999999, type: 'EditorCamera', isEnabled: true },
}, null, 2));

for (const item of serialized.cameras ?? []) await writeJson(path.join(sceneRoot, 'cameras', item.id + '.json'), item);
for (const item of serialized.lights ?? []) await writeJson(path.join(sceneRoot, 'lights', item.id + '.json'), item);
for (const item of serialized.transformNodes ?? []) await writeJson(path.join(sceneRoot, 'nodes', item.id + '.json'), item);
for (const mesh of serialized.meshes ?? []) {
  const geometry = geometryById.get(mesh.geometryId);
  if (geometry) {
    mesh.positions = geometry.positions;
    mesh.normals = geometry.normals;
    mesh.uvs = geometry.uvs;
    mesh.indices = geometry.indices;
    mesh.hasUVs = Boolean(geometry.uvs?.length);
    delete mesh.geometryId;
    delete mesh.geometryUniqueId;
    delete mesh.delayLoadingFile;
    delete mesh._binaryInfo;
  }
  const material = mesh.materialId ? materialById.get(mesh.materialId) : null;
  await writeJson(path.join(sceneRoot, 'meshes', mesh.id + '.json'), { meshes: [mesh], materials: material ? [material] : [] });
}
await fs.writeFile(path.join(sceneRoot, 'attributes.json'), JSON.stringify({ doNotExport: false }, null, 2));
await fs.writeFile(path.join(projectRoot, 'project.bjseditor'), JSON.stringify({ plugins: [], version: '5.4.2', packageManager: 'npm', lastOpenedScene: '/assets/battlescene.scene', compressedTexturesEnabled: false, compressedTexturesEnabledInPreview: false }, null, 2));

function childNode(name, parent) {
  const node = new TransformNode(name, scene);
  node.parent = parent;
  return node;
}

function createMaterial(name, color, textureAsset) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.08, 0.12, 0.15);
  if (textureAsset) {
    const textureUrl = 'assets/battlescene/shared/mothership/mapping/' + textureAsset;
    material.metadata = { textureUrl, hasAlpha: false, useAlphaFromDiffuseTexture: false };
    textureMaterials.set(material.id, material.metadata);
  }
  return material;
}

function textureRecord(url, hasAlpha, uScale = 1) {
  return {
    tags: null,
    url,
    uOffset: 0,
    vOffset: 0,
    uScale,
    vScale: 1,
    uAng: 0,
    vAng: 0,
    wAng: 0,
    uRotationCenter: 0.5,
    vRotationCenter: 0.5,
    wRotationCenter: 0.5,
    homogeneousRotationInUVTransform: false,
    isBlocking: true,
    name: url,
    hasAlpha,
    getAlphaFromRGB: false,
    level: 1,
    coordinatesIndex: 0,
    optimizeUVAllocation: true,
    coordinatesMode: 0,
    wrapU: 1,
    wrapV: 1,
    wrapR: 1,
    anisotropicFilteringLevel: 4,
    isCube: false,
    is3D: false,
    is2DArray: false,
    gammaSpace: true,
    invertZ: false,
    lodLevelInAlpha: false,
    lodGenerationOffset: 0,
    lodGenerationScale: 0,
    linearSpecularLOD: false,
    isRenderTarget: false,
    animations: [],
    invertY: true,
    samplingMode: 3,
    _useSRGBBuffer: false,
    noMipmap: true,
  };
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
