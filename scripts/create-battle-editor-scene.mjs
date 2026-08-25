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
  Texture,
  TransformNode,
  UniversalCamera,
  VertexData,
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
const FIGHTER_SPRITE_URL = 'assets/battlescene/shared/units/fighter-8way.webp';
const FIGHTER_ATLAS_COLUMNS = 4;
const FIGHTER_ATLAS_ROWS = 2;
const FIGHTER_SPRITE_SIZE = 5.4;
const MOTHERSHIP_ATLAS_ASSET = 'mothership-saucer-atlas.png';
const BACKGROUND_PLANE_HEIGHTS = {
  SkyRoot: 202.5,
  CityFarRoot: 67.5,
  CityMiddleRoot: 67.5,
  CityNearRoot: 60,
  GroundRoot: 42.4,
  ForegroundRoot: 67.5,
};
const BACKGROUND_PLANE_WIDTHS = {
  GroundRoot: BACKGROUND_WORLD_WIDTH * 2,
};

const layers = [
  ['SkyRoot', 'backgrounds/sky-day-base.webp', 30, 6.5, false],
  ['CloudRoot', 'backgrounds/clouds-day.webp', 27, 13.25, true],
  ['CityFarRoot', 'backgrounds/city-far-day.webp', 22, 7, true],
  ['CityMiddleRoot', 'backgrounds/city-middle-day.webp', 16, 11.75, true],
  ['CityNearRoot', 'backgrounds/city-near-day.webp', 10, -5, true],
  ['GroundRoot', 'backgrounds/ground-sideview-day.webp', 4, -12, true],
  ['ForegroundRoot', 'backgrounds/foreground-atmosphere-day.webp', -5, 0.5, true],
];
for (let index = 0; index < layers.length; index += 1) {
  const [name, asset, z, y, hasAlpha] = layers[index];
  const root = childNode(name, environmentRoot);
  root.position.set(0, y, z);
  const planeWidth = BACKGROUND_PLANE_WIDTHS[name] ?? BACKGROUND_WORLD_WIDTH;
  const textureUScale = name === 'SkyRoot' || name === 'CloudRoot' ? 1 : BACKGROUND_REPEAT * (planeWidth / BACKGROUND_WORLD_WIDTH);
  const plane = MeshBuilder.CreatePlane(name + 'Plane', {
    width: planeWidth,
    height: BACKGROUND_PLANE_HEIGHTS[name],
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  plane.parent = root;
  plane.renderingGroupId = name === 'SkyRoot' || name === 'CityFarRoot' ? 0 : name === 'CityMiddleRoot' ? 1 : name === 'ForegroundRoot' ? 3 : 2;
  // Keep the editor preview directly adjustable. Runtime disables picking after
  // loading this scene so background planes cannot intercept gameplay input.
  plane.isPickable = true;
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
gameplayRoot.position.set(0, 16.5, 0);
const visualRoot = childNode('MothershipVisualRoot', gameplayRoot);
createEditorMothership(visualRoot);

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
const droneMaterial = createMaterial('DronePrototypeMaterial', new Color3(0.9, 0.55, 0.24));
for (let index = 0; index < 3; index += 1) {
  const fighter = MeshBuilder.CreatePlane('FighterPrototype' + (index + 1), { size: 1 }, scene);
  fighter.parent = fighterRoot;
  fighter.position.set(-20 + index * 17, 14 + (index % 2) * 5, 1.5 + index);
  fighter.scaling.set(FIGHTER_SPRITE_SIZE, FIGHTER_SPRITE_SIZE, 1);
  fighter.billboardMode = Mesh.BILLBOARDMODE_ALL;
  fighter.isPickable = false;
  const fighterMaterial = new StandardMaterial('FighterPrototypeMaterial' + (index + 1), scene);
  fighterMaterial.diffuseColor = Color3.White();
  fighterMaterial.emissiveColor = new Color3(0.24, 0.32, 0.38);
  fighterMaterial.disableLighting = true;
  fighterMaterial.backFaceCulling = false;
  fighterMaterial.useAlphaFromDiffuseTexture = true;
  fighterMaterial.transparencyMode = 2;
  const fighterTexture = new Texture(FIGHTER_SPRITE_URL, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
  const fighterFrame = index * 2;
  const fighterUScale = 1 / FIGHTER_ATLAS_COLUMNS;
  const fighterVScale = 1 / FIGHTER_ATLAS_ROWS;
  fighterTexture.uScale = fighterUScale;
  fighterTexture.vScale = fighterVScale;
  fighterTexture.uOffset = (fighterFrame % FIGHTER_ATLAS_COLUMNS) * fighterUScale;
  fighterTexture.vOffset = Math.floor(fighterFrame / FIGHTER_ATLAS_COLUMNS) * fighterVScale;
  fighterTexture.hasAlpha = true;
  fighterMaterial.diffuseTexture = fighterTexture;
  fighterMaterial.emissiveTexture = fighterTexture;
  fighterMaterial.metadata = {
    textureUrl: FIGHTER_SPRITE_URL,
    hasAlpha: true,
    useAlphaFromDiffuseTexture: true,
    textureUScale: fighterUScale,
    textureVScale: fighterVScale,
    textureUOffset: fighterTexture.uOffset,
    textureVOffset: fighterTexture.vOffset,
    textureWrapU: 0,
    textureWrapV: 0,
  };
  textureMaterials.set(fighterMaterial.id, fighterMaterial.metadata);
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
  material.diffuseTexture = textureRecord(
    texture.textureUrl,
    texture.hasAlpha,
    texture.textureUScale,
    texture.textureVScale,
    texture.textureUOffset,
    texture.textureVOffset,
    texture.textureWrapU,
    texture.textureWrapV,
  );
  if (texture.useAsEmissiveTexture) {
    material.emissiveTexture = textureRecord(
      texture.textureUrl,
      texture.hasAlpha,
      texture.textureUScale,
      texture.textureVScale,
      texture.textureUOffset,
      texture.textureVOffset,
      texture.textureWrapU,
      texture.textureWrapV,
    );
  }
  material.useAlphaFromDiffuseTexture = texture.useAlphaFromDiffuseTexture;
}

const existingPreview = await readOptionalFile(path.join(sceneRoot, 'preview.png'));
await fs.rm(sceneRoot, { recursive: true, force: true });
await Promise.all(['cameras', 'lights', 'meshes', 'nodes', 'geometries', 'shadowGenerators', 'animationGroups', 'sprite-managers', 'sprite-maps'].map((directory) => fs.mkdir(path.join(sceneRoot, directory), { recursive: true })));
await fs.writeFile(path.join(sceneRoot, 'config.json'), JSON.stringify({
  clearColor: [0.04, 0.12, 0.17, 1],
  ambientColor: [0.02, 0.05, 0.07],
  environment: { environmentIntensity: 0, environmentTexture: null },
  fog: { fogEnabled: false, fogMode: 0, fogStart: 10, fogEnd: 1000, fogDensity: 0.001, fogColor: [0.04, 0.12, 0.17] },
  physics: { gravity: [0, -9.81, 0] },
  rendering: [],
  metadata: { battleScene: { mapPreview: 'city-day', cameraMode: 'horizontal-only', editorGreybox: false, mothershipSource: 'TheyCallItEarth/MothershipVisual.ts' } },
  animations: [],
  editorCamera: { position: [0, 5, -92], rotation: [0, 0, 0], fov: 0.610865, name: 'Editor preview', id: 'editor-camera', uniqueId: 999999, type: 'EditorCamera', isEnabled: true },
}, null, 2));

for (const item of serialized.cameras ?? []) await writeJson(path.join(sceneRoot, 'cameras', item.id + '.json'), item);
for (const item of serialized.lights ?? []) await writeJson(path.join(sceneRoot, 'lights', item.id + '.json'), item);
for (const item of serialized.transformNodes ?? []) await writeJson(path.join(sceneRoot, 'nodes', item.id + '.json'), item);
for (const mesh of serialized.meshes ?? []) {
  const geometry = geometryById.get(mesh.geometryId);
  if (geometry) await externalizeGeometry(mesh, geometry);
  const material = mesh.materialId ? materialById.get(mesh.materialId) : null;
  await writeJson(path.join(sceneRoot, 'meshes', mesh.id + '.json'), { meshes: [mesh], materials: material ? [material] : [] });
}
await fs.writeFile(path.join(sceneRoot, 'attributes.json'), JSON.stringify({ doNotExport: false }, null, 2));
if (existingPreview) await fs.writeFile(path.join(sceneRoot, 'preview.png'), existingPreview);
await fs.writeFile(path.join(projectRoot, 'project.bjseditor'), JSON.stringify({
  plugins: [],
  version: '5.4.2',
  packageManager: 'npm',
  lastOpenedScene: '/assets/battlescene.scene',
  compressedTextureSoftware: 'PVRTexTool',
  compressedTexturesEnabled: false,
  compressedTexturesEnabledInPreview: false,
  compressedEtc2Enabled: false,
  compressedPvrtcEnabled: false,
  compressedTextureQuality: 'very-fast',
  gizmoSnap: {
    translationEnabled: false,
    translationStep: 1,
    rotationEnabled: false,
    rotationStepDegrees: 15,
    scaleEnabled: false,
    scaleStep: 0.25,
  },
}, null, 4) + '\n');

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

function createEditorMothership(root) {
  root.scaling.set(1.55, 1.15, 1.55);
  // Babylon TransformNodes are the Editor equivalent of empty Unity
  // GameObjects. Keep gameplay/VFX sockets beside one collapsible model root,
  // then split the visual parts into small logical groups for authoring.
  const modelRoot = childNode('MothershipModelRoot', root);
  const hullGroup = childNode('MothershipHullGroup', modelRoot);
  const ringGroup = childNode('MothershipRingGroup', modelRoot);
  const armorGroup = childNode('MothershipArmorGroup', modelRoot);
  const reactorGroup = childNode('MothershipReactorGroup', modelRoot);
  const emitterGroup = childNode('MothershipEmitterGroup', modelRoot);

  const hullMaterial = createMothershipMaterial(
    'mothership-hull-material',
    new Color3(0.055, 0.07, 0.1),
    new Color3(0.12, 0.025, 0.22),
    { textured: true, specular: new Color3(0.28, 0.32, 0.38), specularPower: 64 },
  );
  const topMaterial = createMothershipMaterial(
    'mothership-top-material',
    new Color3(0.1, 0.11, 0.14),
    new Color3(0.18, 0.035, 0.3),
    { textured: true, specular: new Color3(0.35, 0.38, 0.44), specularPower: 70, backFaceCulling: false },
  );
  const undersideMaterial = createMothershipMaterial(
    'mothership-underside-material',
    new Color3(0.1, 0.11, 0.14),
    new Color3(0.18, 0.035, 0.3),
    { textured: true, specular: new Color3(0.35, 0.38, 0.44), specularPower: 70, backFaceCulling: false },
  );
  const armorMaterial = createMothershipMaterial(
    'mothership-armor-material',
    new Color3(0.045, 0.06, 0.085),
    new Color3(0.01, 0.004, 0.02),
    { specular: new Color3(0.3, 0.34, 0.4), specularPower: 72 },
  );
  const edgeMaterial = createMothershipMaterial('mothership-edge-material', new Color3(0.12, 0.15, 0.2), new Color3(0.02, 0.008, 0.035));
  const violetMaterial = createMothershipMaterial('mothership-violet-material', new Color3(0.55, 0.08, 0.8), new Color3(0.9, 0.08, 1));
  const softVioletMaterial = createMothershipMaterial('mothership-soft-violet-material', new Color3(0.2, 0.05, 0.35), new Color3(0.35, 0.025, 0.55));

  const hull = MeshBuilder.CreateCylinder('mothership-hull', { diameterTop: 13.8, diameterBottom: 15.4, height: 1.15, tessellation: 64 }, scene);
  hull.parent = hullGroup;
  hull.material = hullMaterial;

  const topPlate = createTexturedRadialPlate('mothership-top-plate', 6.95, 0.59, topMaterial, { u0: 0.02, v0: 0.01, u1: 0.98, v1: 0.58 }, 64, 1);
  topPlate.parent = hullGroup;
  const undersidePlate = createTexturedRadialPlate('mothership-underside-plate', 6.3, -0.59, undersideMaterial, { u0: 0.04, v0: 0.58, u1: 0.96, v1: 0.99 }, 64, -1);
  undersidePlate.parent = hullGroup;

  const upper = MeshBuilder.CreateCylinder('mothership-upper', { diameterTop: 4.8, diameterBottom: 10.8, height: 1.25, tessellation: 64 }, scene);
  upper.parent = hullGroup;
  upper.position.y = 0.73;
  upper.material = armorMaterial;

  const dome = MeshBuilder.CreateSphere('mothership-dome', { diameter: 5.8, segments: 32 }, scene);
  dome.parent = hullGroup;
  dome.position.y = 1.22;
  dome.scaling.y = 0.32;
  dome.material = topMaterial;

  const outerTrim = MeshBuilder.CreateTorus('mothership-outer-trim', { diameter: 14.6, thickness: 0.3, tessellation: 64 }, scene);
  outerTrim.parent = hullGroup;
  outerTrim.position.y = 0.04;
  outerTrim.material = edgeMaterial;

  [6.35, 5.2, 3.95, 2.75].forEach((radius, index) => {
    const ring = MeshBuilder.CreateTorus(`mothership-top-ring-${index}`, { diameter: radius * 2, thickness: index === 0 ? 0.16 : 0.11, tessellation: 64 }, scene);
    ring.parent = ringGroup;
    ring.position.y = 0.66 + index * 0.015;
    ring.material = index === 1 || index === 3 ? softVioletMaterial : armorMaterial;
  });

  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    const panel = MeshBuilder.CreateBox(`mothership-armor-panel-${index}`, { width: 1.65, height: 0.16, depth: 0.74 }, scene);
    panel.parent = armorGroup;
    panel.position = new Vector3(Math.sin(angle) * 6.1, 0.72, Math.cos(angle) * 6.1);
    panel.rotation.y = angle;
    panel.material = armorMaterial;

    const light = MeshBuilder.CreateBox(`mothership-armor-light-${index}`, { width: 0.12, height: 0.045, depth: 0.48 }, scene);
    light.parent = armorGroup;
    light.position = new Vector3(Math.sin(angle) * 6.1, 0.83, Math.cos(angle) * 6.1);
    light.rotation.y = angle;
    light.material = violetMaterial;
  }

  const lower = MeshBuilder.CreateCylinder('mothership-lower-body', { diameterTop: 12.4, diameterBottom: 5.4, height: 0.9, tessellation: 64 }, scene);
  lower.parent = hullGroup;
  lower.position.y = -0.58;
  lower.material = undersideMaterial;

  const reactorHousing = MeshBuilder.CreateCylinder('mothership-reactor-housing', { diameterTop: 4.4, diameterBottom: 3.1, height: 0.5, tessellation: 48 }, scene);
  reactorHousing.parent = reactorGroup;
  reactorHousing.position.y = -0.96;
  reactorHousing.material = armorMaterial;
  const reactorRing = MeshBuilder.CreateTorus('mothership-reactor-ring', { diameter: 3.9, thickness: 0.28, tessellation: 48 }, scene);
  reactorRing.parent = reactorGroup;
  reactorRing.position.y = -1.23;
  reactorRing.material = violetMaterial;
  const reactorCore = MeshBuilder.CreateCylinder('mothership-reactor-core', { diameter: 2.35, height: 0.18, tessellation: 48 }, scene);
  reactorCore.parent = reactorGroup;
  reactorCore.position.y = -1.24;
  reactorCore.material = softVioletMaterial;
  const reactorGlow = MeshBuilder.CreateDisc('mothership-reactor-glow', { radius: 1.1, tessellation: 48 }, scene);
  reactorGlow.parent = reactorGroup;
  reactorGlow.rotation.x = Math.PI / 2;
  reactorGlow.position.y = -1.35;
  reactorGlow.material = violetMaterial;

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const emitter = MeshBuilder.CreateCylinder(`mothership-underside-emitter-${index}`, { diameter: 0.42, height: 0.12, tessellation: 12 }, scene);
    emitter.parent = emitterGroup;
    emitter.position = new Vector3(Math.sin(angle) * 4.7, -1.05, Math.cos(angle) * 4.7);
    emitter.material = index % 2 === 0 ? violetMaterial : softVioletMaterial;
  }

  root.getChildMeshes().forEach((mesh) => {
    mesh.receiveShadows = true;
  });
}

function createMothershipMaterial(name, diffuse, emissive, options = {}) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.specularColor = options.specular ?? new Color3(0.05, 0.08, 0.1);
  if (options.specularPower !== undefined) material.specularPower = options.specularPower;
  if (options.backFaceCulling !== undefined) material.backFaceCulling = options.backFaceCulling;
  if (options.textured) {
    const textureUrl = `assets/battlescene/shared/mothership/mapping/${MOTHERSHIP_ATLAS_ASSET}`;
    material.metadata = { textureUrl, hasAlpha: false, useAlphaFromDiffuseTexture: false };
    textureMaterials.set(material.id, { ...material.metadata, useAsEmissiveTexture: true });
  }
  return material;
}

function createTexturedRadialPlate(name, radius, y, material, region, segments, normalY) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const centerU = (region.u0 + region.u1) / 2;
  const centerV = (region.v0 + region.v1) / 2;
  const pushVertex = (x, z, u, v) => {
    positions.push(x, 0, z);
    normals.push(0, normalY, 0);
    uvs.push(u, 1 - v);
    return positions.length / 3 - 1;
  };
  const mapCoordinate = (value, min, max) => min + ((value / radius + 1) / 2) * (max - min);
  for (let index = 0; index < segments; index += 1) {
    const startAngle = (index / segments) * Math.PI * 2;
    const endAngle = ((index + 1) / segments) * Math.PI * 2;
    const startX = Math.sin(startAngle) * radius;
    const startZ = Math.cos(startAngle) * radius;
    const endX = Math.sin(endAngle) * radius;
    const endZ = Math.cos(endAngle) * radius;
    const center = pushVertex(0, 0, centerU, centerV);
    const start = pushVertex(startX, startZ, mapCoordinate(startX, region.u0, region.u1), mapCoordinate(startZ, region.v0, region.v1));
    const end = pushVertex(endX, endZ, mapCoordinate(endX, region.u0, region.u1), mapCoordinate(endZ, region.v0, region.v1));
    indices.push(center, normalY === 1 ? start : end, normalY === 1 ? end : start);
  }
  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, true);
  mesh.position.y = y;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function textureRecord(url, hasAlpha, uScale = 1, vScale = 1, uOffset = 0, vOffset = 0, wrapU = 1, wrapV = 1) {
  return {
    tags: null,
    url,
    uOffset,
    vOffset,
    uScale,
    vScale,
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
    wrapU,
    wrapV,
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

async function externalizeGeometry(mesh, geometry) {
  const positions = geometry.positions ?? [];
  const normals = geometry.normals ?? [];
  const uvs = geometry.uvs ?? [];
  const indices = geometry.indices ?? [];
  const subMeshes = mesh.subMeshes?.length ? mesh.subMeshes : [{
    materialIndex: 0,
    verticesStart: 0,
    verticesCount: positions.length / 3,
    indexStart: 0,
    indexCount: indices.length,
  }];
  const positionBuffer = float32Buffer(positions);
  const normalBuffer = float32Buffer(normals);
  const uvBuffer = float32Buffer(uvs);
  const indexBuffer = int32Buffer(indices);
  const subMeshBuffer = int32Buffer(subMeshes.flatMap((subMesh) => [
    subMesh.materialIndex,
    subMesh.verticesStart,
    subMesh.verticesCount,
    subMesh.indexStart,
    subMesh.indexCount,
  ]));
  const positionOffset = 0;
  const normalOffset = positionOffset + positionBuffer.length;
  const uvOffset = normalOffset + normalBuffer.length;
  const indexOffset = uvOffset + uvBuffer.length;
  const subMeshOffset = indexOffset + indexBuffer.length;
  const geometryId = `${mesh.id}-geometry`;
  const fileName = `${mesh.id}.babylonbinarymeshdata`;
  await fs.writeFile(path.join(sceneRoot, 'geometries', fileName), Buffer.concat([positionBuffer, normalBuffer, uvBuffer, indexBuffer, subMeshBuffer]));

  mesh.geometryUniqueId = geometry.uniqueId ?? mesh.geometryUniqueId;
  mesh.geometryId = geometryId;
  mesh.delayLoadingFile = `assets/battlescene.scene/geometries/${fileName}`;
  mesh.boundingBoxMaximum = axisBounds(positions, Math.max);
  mesh.boundingBoxMinimum = axisBounds(positions, Math.min);
  mesh._binaryInfo = {
    positionsAttrDesc: { count: positions.length, stride: 3, offset: positionOffset, dataType: 1 },
    normalsAttrDesc: { count: normals.length, stride: 3, offset: normalOffset, dataType: 1 },
    uvsAttrDesc: { count: uvs.length, stride: 2, offset: uvOffset, dataType: 1 },
    indicesAttrDesc: { count: indices.length, stride: 1, offset: indexOffset, dataType: 0 },
    subMeshesAttrDesc: { count: subMeshes.length, stride: 5, offset: subMeshOffset, dataType: 0 },
  };
  mesh.positions = null;
  mesh.normals = null;
  mesh.uvs = null;
  mesh.hasUVs = uvs.length > 0;
  mesh.indices = null;
  mesh.subMeshes = null;
}

function float32Buffer(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function int32Buffer(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeInt32LE(value, index * 4));
  return buffer;
}

function axisBounds(positions, aggregate) {
  if (positions.length < 3) return [0, 0, 0];
  const bounds = [positions[0], positions[1], positions[2]];
  for (let index = 3; index < positions.length; index += 3) {
    bounds[0] = aggregate(bounds[0], positions[index]);
    bounds[1] = aggregate(bounds[1], positions[index + 1]);
    bounds[2] = aggregate(bounds[2], positions[index + 2]);
  }
  return bounds;
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function readOptionalFile(file) {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
