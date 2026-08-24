import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Material,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  SceneLoader,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { GridMaterial } from '@babylonjs/materials';
import {
  FACE_KEYS,
  getBuildingDefinition,
  getTexturePath,
  type BuildingId,
  type FaceKey,
} from '../../domain/buildingCatalog';
import type { CameraPreset } from '../../domain/cameraPresets';
import type { MapperAssetMetadata } from '../../domain/assetMetadata';
import type { MaterialSlotInfo } from '../../domain/materialSlots';
import type { SceneTreeNode } from '../../domain/sceneTree';
import { snapQuarterTurn, type MapperProject } from '../../domain/projectSchema';
import { resolveGlbAssetSource, type GlbAssetSource } from './assetSourceResolver';

export interface BuildingSceneController {
  engine: Engine;
  scene: Scene;
  setProject(project: MapperProject): void;
  setActiveFace(face: FaceKey): void;
  setCameraPreset(preset: CameraPreset): void;
  rotate(axis: 'x' | 'y', direction: -1 | 1): void;
  resetRotation(): void;
  loadGlb(file: File): Promise<string>;
  loadGlbSource(source: GlbAssetSource): Promise<string>;
  clearImportedModel(): void;
  getSceneTree(): SceneTreeNode[];
  getMaterialSlots(): MaterialSlotInfo[];
  selectMaterialSlot(id: string): void;
  selectSceneNode(id: string): void;
  applyTextureToSelected(textureUrl: string): boolean;
  exportGlb(): Promise<string>;
  getExportFileName(): string;
  dispose(): void;
}

export function createBuildingScene(
  canvas: HTMLCanvasElement,
  initialProject: MapperProject,
  onRotationChange: (rotation: MapperProject['model']['rotationDeg']) => void,
  onFaceSelected: (face: FaceKey) => void,
  onSceneNodeSelected: (id: string) => void,
): BuildingSceneController {
  const engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor.set(0.015, 0.03, 0.045, 1);

  const camera = new ArcRotateCamera('MapperCamera', -Math.PI / 2.4, 1.08, 23, new Vector3(0, 5.5, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 42;
  camera.lowerBetaLimit = 0.18;
  camera.upperBetaLimit = Math.PI - 0.18;
  camera.wheelDeltaPercentage = 0.018;
  camera.panningSensibility = 0;
  scene.activeCamera = camera;

  const light = new HemisphericLight('MapperHemiLight', new Vector3(-0.45, 1, -0.65), scene);
  light.intensity = 1.05;
  light.diffuse = new Color3(0.87, 0.97, 1);
  light.groundColor = new Color3(0.08, 0.13, 0.18);

  const ground = MeshBuilder.CreateGround('MapperGround', { width: 42, height: 42 }, scene);
  const gridMaterial = new GridMaterial('MapperGridMaterial', scene);
  gridMaterial.majorUnitFrequency = 5;
  gridMaterial.minorUnitVisibility = 0.4;
  gridMaterial.gridRatio = 1;
  gridMaterial.mainColor = new Color3(0.025, 0.065, 0.08);
  gridMaterial.lineColor = new Color3(0.08, 0.22, 0.25);
  gridMaterial.opacity = 0.66;
  ground.material = gridMaterial;
  ground.isPickable = false;
  ground.metadata = { treeId: 'ground' };

  const buildingRoot = new TransformNode('BuildingRoot', scene);
  buildingRoot.metadata = { treeId: 'building-root', export: true };
  let plinth: Mesh | null = null;
  let currentProject = initialProject;
  let currentActiveFace: FaceKey = 'front';
  const panels = new Map<FaceKey, Mesh>();
  const panelMaterials = new Map<FaceKey, StandardMaterial>();
  const panelBaseUvs = new Map<FaceKey, number[]>();
  const labelMeshes: Mesh[] = [];
  let importedRoot: TransformNode | null = null;
  let importedModelName: string | null = null;
  let importedNodes: Array<TransformNode | AbstractMesh> = [];
  let importedMeshes: AbstractMesh[] = [];
  let selectedImportedMesh: AbstractMesh | null = null;
  let selectedSceneNodeId: string | null = 'face-front';
  let selectedMaterialSlotId: string | null = 'face-front-material';

  const build = (project: MapperProject) => {
    const definition = getBuildingDefinition(project.id);
    buildingRoot.getChildMeshes().forEach((mesh) => mesh.dispose(false, true));
    panels.clear();
    panelMaterials.clear();
    panelBaseUvs.clear();
    labelMeshes.length = 0;
    plinth?.dispose(false, true);
    buildingRoot.setEnabled(true);

    const { width, height, depth } = definition.dimensions;
    buildingRoot.rotation.set(
      degreesToRadians(project.model.rotationDeg.x),
      degreesToRadians(project.model.rotationDeg.y),
      degreesToRadians(project.model.rotationDeg.z),
    );

    const shell = MeshBuilder.CreateBox('BuildingShell', { width, height, depth }, scene);
    shell.parent = buildingRoot;
    shell.position.y = height / 2;
    shell.isPickable = false;
    shell.metadata = { treeId: 'building-shell', export: true };
    const shellMaterial = new StandardMaterial('BuildingShellMaterial', scene);
    shellMaterial.diffuseColor = new Color3(0.06, 0.05, 0.045);
    shellMaterial.specularColor = Color3.Black();
    shell.material = shellMaterial;

    const baseSize = Math.max(width, depth) + 2;
    plinth = MeshBuilder.CreateBox('MapperPlinth', { width: baseSize, height: 0.26, depth: baseSize }, scene);
    plinth.position.y = 0.13;
    plinth.metadata = { treeId: 'plinth' };
    const plinthMaterial = new StandardMaterial('MapperPlinthMaterial', scene);
    plinthMaterial.diffuseColor = new Color3(0.12, 0.19, 0.21);
    plinthMaterial.specularColor = Color3.Black();
    plinth.material = plinthMaterial;
    plinth.isPickable = false;

    createFacePanel('front', width, height, new Vector3(0, height / 2, -depth / 2 - 0.012), new Vector3(0, Math.PI, 0), project, buildingRoot);
    createFacePanel('back', width, height, new Vector3(0, height / 2, depth / 2 + 0.012), new Vector3(0, 0, 0), project, buildingRoot);
    createFacePanel('right', depth, height, new Vector3(width / 2 + 0.012, height / 2, 0), new Vector3(0, Math.PI / 2, 0), project, buildingRoot);
    createFacePanel('left', depth, height, new Vector3(-width / 2 - 0.012, height / 2, 0), new Vector3(0, -Math.PI / 2, 0), project, buildingRoot);
    createFacePanel('roof', width, depth, new Vector3(0, height + 0.012, 0), new Vector3(-Math.PI / 2, 0, 0), project, buildingRoot);
    createFacePanel('bottom', width, depth, new Vector3(0, -0.012, 0), new Vector3(Math.PI / 2, 0, 0), project, buildingRoot);
    addFaceLabels(definition.id, width, height, depth);
    updatePanelHighlight();

    camera.target.set(0, height / 2, 0);
    camera.radius = Math.max(18, height * 2.1);
  };

  const createFacePanel = (
    face: FaceKey,
    panelWidth: number,
    panelHeight: number,
    position: Vector3,
    rotation: Vector3,
    project: MapperProject,
    parent: TransformNode,
  ) => {
    const faceConfig = project.faces[face];
    const texture = new Texture(getTexturePath(project.id as BuildingId, faceConfig.texture), scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    configureTexture(texture, faceConfig);
    texture.anisotropicFilteringLevel = 8;
    const material = new StandardMaterial(`BuildingFaceMaterial-${faceConfig.id}`, scene);
    material.diffuseColor = Color3.White();
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.emissiveColor = new Color3(0.14, 0.14, 0.14);
    material.specularColor = Color3.Black();
    material.backFaceCulling = true;
    const panel = MeshBuilder.CreatePlane(`BuildingFacePanel-${faceConfig.id}`, {
      width: panelWidth,
      height: panelHeight,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    panel.parent = parent;
    panel.position.copyFrom(position);
    panel.rotation.copyFrom(rotation);
    panel.material = material;
    panel.metadata = { face, faceId: faceConfig.id, treeId: `face-${face}`, export: true };
    const baseUvs = panel.getVerticesData(VertexBuffer.UVKind);
    if (baseUvs) panelBaseUvs.set(face, [...baseUvs]);
    panels.set(face, panel);
    panelMaterials.set(face, material);
    updateFacePanel(face, faceConfig);
  };

  const updateFacePanel = (face: FaceKey, faceConfig: MapperProject['faces'][FaceKey]) => {
    const panel = panels.get(face);
    const material = panelMaterials.get(face);
    if (!panel || !material) return;
    const texturePath = getTexturePath(currentProject.id as BuildingId, faceConfig.texture);
    let texture = material.diffuseTexture as Texture | null;
    if (!texture || texture.url !== texturePath) {
      texture?.dispose();
      texture = new Texture(texturePath, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      material.diffuseTexture = texture;
      material.emissiveTexture = texture;
    }
    configureTexture(texture, faceConfig);
    const baseUvs = panelBaseUvs.get(face);
    if (baseUvs) {
      panel.setVerticesData(VertexBuffer.UVKind, [...baseUvs]);
      if (faceConfig.rotationDeg !== 0) rotatePlaneUv(panel, degreesToRadians(faceConfig.rotationDeg));
    }
  };

  const addFaceLabels = (buildingId: string, width: number, height: number, depth: number) => {
    const definition = getBuildingDefinition(buildingId);
    const labels = [
      { face: 'front' as const, position: new Vector3(0, height * 0.55, -depth / 2 - 0.048), rotation: new Vector3(0, Math.PI, 0) },
      { face: 'back' as const, position: new Vector3(0, height * 0.55, depth / 2 + 0.048), rotation: new Vector3(0, 0, 0) },
      { face: 'right' as const, position: new Vector3(width / 2 + 0.048, height * 0.55, 0), rotation: new Vector3(0, Math.PI / 2, 0) },
      { face: 'left' as const, position: new Vector3(-width / 2 - 0.048, height * 0.55, 0), rotation: new Vector3(0, -Math.PI / 2, 0) },
      { face: 'roof' as const, position: new Vector3(0, height + 0.05, 0), rotation: new Vector3(-Math.PI / 2, 0, 0) },
      { face: 'bottom' as const, position: new Vector3(0, -0.05, 0), rotation: new Vector3(Math.PI / 2, 0, 0) },
    ];
    for (const label of labels) {
      const texture = new DynamicTexture(`FaceLabel-${definition.faces[label.face].id}`, { width: 256, height: 96 }, scene, true);
      texture.hasAlpha = true;
      texture.drawText(definition.faces[label.face].id, 16, 63, 'bold 48px monospace', '#d9fff6', 'transparent', true);
      const material = new StandardMaterial(`FaceLabelMaterial-${label.face}`, scene);
      material.disableLighting = true;
      material.backFaceCulling = false;
      material.diffuseTexture = texture;
      material.emissiveTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      const plane = MeshBuilder.CreatePlane(`FaceLabel-${label.face}`, { size: 1 }, scene);
      plane.parent = buildingRoot;
      plane.position.copyFrom(label.position);
      plane.rotation.copyFrom(label.rotation);
      plane.scaling.set(1.25, 0.47, 1);
      plane.material = material;
      plane.isPickable = false;
      plane.metadata = { export: false };
      labelMeshes.push(plane);
    }
  };

  const updatePanelHighlight = () => {
    for (const face of FACE_KEYS) {
      const material = panelMaterials.get(face);
      if (!material) continue;
      material.emissiveColor = face === currentActiveFace ? new Color3(0.38, 0.84, 0.7) : new Color3(0.14, 0.14, 0.14);
    }
  };

  const clearImportedSelection = () => {
    if (selectedImportedMesh) selectedImportedMesh.showBoundingBox = false;
    selectedImportedMesh = null;
    selectedMaterialSlotId = `face-${currentActiveFace}-material`;
  };

  const sceneTreeForBuiltIn = (): SceneTreeNode[] => [
    { id: 'ground', name: 'MapperGround', type: 'mesh', depth: 0 },
    { id: 'building-root', name: 'BuildingRoot', type: 'group', depth: 0 },
    { id: 'building-shell', name: 'BuildingShell', type: 'mesh', depth: 1 },
    ...FACE_KEYS.map((face) => ({ id: `face-${face}`, name: `FacePanel · ${currentProject.faces[face].id}`, type: 'mesh' as const, depth: 1, face })),
    { id: 'plinth', name: 'MapperPlinth', type: 'mesh', depth: 0 },
  ];

  const getImportedNodeMetadata = (node: TransformNode | AbstractMesh): MapperAssetMetadata | null => {
    const mapper = node.metadata?.mapper as MapperAssetMetadata | undefined;
    return mapper ?? null;
  };

  const getSceneTree = (): SceneTreeNode[] => {
    if (!importedRoot) return sceneTreeForBuiltIn();
    const importedRootMetadata = getImportedNodeMetadata(importedRoot);
    const rootNode: SceneTreeNode = {
      id: 'glb-root',
      name: importedModelName ?? 'Imported GLB',
      type: 'group',
      depth: 0,
      imported: true,
      assetId: importedRootMetadata?.assetId,
      instanceId: importedRootMetadata?.instanceId,
      category: importedRootMetadata?.category,
      packageId: importedRootMetadata?.packageId,
      sourcePath: importedRootMetadata?.sourcePath,
      glbPath: importedRootMetadata?.glbPath,
    };
    const result: SceneTreeNode[] = [rootNode];
    const children = (parent: TransformNode | AbstractMesh, depth: number) => {
      importedNodes.filter((node) => node.parent === parent).forEach((node) => {
        const metadata = getImportedNodeMetadata(node);
        result.push({
          id: node.metadata?.treeId as string,
          name: node.name || 'Unnamed Node',
          type: node instanceof AbstractMesh ? 'mesh' : 'group',
          depth,
          parentId: parent.metadata?.treeId as string,
          imported: true,
          assetId: metadata?.assetId,
          instanceId: metadata?.instanceId,
          category: metadata?.category,
          packageId: metadata?.packageId,
          sourcePath: metadata?.sourcePath,
          glbPath: metadata?.glbPath,
        });
        children(node, depth + 1);
      });
    };
    children(importedRoot, 1);
    return result;
  };

  const selectSceneNode = (id: string) => {
    selectedSceneNodeId = id;
    clearImportedSelection();
    const face = id.startsWith('face-') ? id.slice('face-'.length) as FaceKey : undefined;
    if (face && FACE_KEYS.includes(face)) {
      currentActiveFace = face;
      selectedMaterialSlotId = `face-${face}-material`;
      updatePanelHighlight();
      onFaceSelected(face);
    } else {
      const node = importedNodes.find((candidate) => candidate.metadata?.treeId === id);
      if (node instanceof AbstractMesh) {
        selectedImportedMesh = node;
        selectedMaterialSlotId = null;
        selectedImportedMesh.showBoundingBox = true;
      }
    }
    onSceneNodeSelected(id);
  };

  const getMaterialTexture = (material: Material | null): Texture | null => {
    if (!material) return null;
    const candidate = material as Material & { diffuseTexture?: Texture | null; albedoTexture?: Texture | null };
    return candidate.albedoTexture ?? candidate.diffuseTexture ?? null;
  };

  const getMaterialSlots = (): MaterialSlotInfo[] => {
    const targetMesh = selectedImportedMesh;
    const targetMaterial = targetMesh?.material ?? panelMaterials.get(currentActiveFace) ?? null;
    if (!targetMaterial) return [];
    const targetId = targetMesh?.metadata?.treeId ?? `face-${currentActiveFace}`;
    if (targetMaterial instanceof MultiMaterial) {
      return targetMaterial.subMaterials.map((material, index) => ({
        id: `${targetId}-material-${index}`,
        name: material?.name ?? `Material Slot ${index + 1}`,
        type: material?.getClassName() ?? 'Empty',
        meshName: targetMesh?.name ?? `FacePanel-${currentActiveFace}`,
        textureName: getMaterialTexture(material)?.name ?? null,
        selected: selectedMaterialSlotId === `${targetId}-material-${index}`,
      }));
    }
    const id = `${targetId}-material`;
    return [{
      id,
      name: targetMaterial.name,
      type: targetMaterial.getClassName(),
      meshName: targetMesh?.name ?? `FacePanel-${currentActiveFace}`,
      textureName: getMaterialTexture(targetMaterial)?.name ?? null,
      selected: selectedMaterialSlotId === id || selectedMaterialSlotId === null,
    }];
  };

  const selectMaterialSlot = (id: string) => {
    selectedMaterialSlotId = id;
  };

  const getSelectedMaterial = (): Material | null => {
    const target = selectedImportedMesh?.material ?? panelMaterials.get(currentActiveFace) ?? null;
    if (!target) return null;
    if (target instanceof MultiMaterial) {
      const slot = getMaterialSlots().find((entry) => entry.id === selectedMaterialSlotId) ?? getMaterialSlots()[0];
      const index = slot ? Number(slot.id.split('-').at(-1)) : 0;
      return target.getSubMaterial(index);
    }
    return target;
  };

  const applyTextureTransformToMesh = (mesh: AbstractMesh, faceConfig: MapperProject['faces'][FaceKey]) => {
    const texture = getMaterialTexture(getSelectedMaterial());
    if (texture) configureTexture(texture, faceConfig);
  };

  const setCameraPreset = (preset: CameraPreset) => {
    const target = camera.target.clone();
    const distance = Math.max(18, camera.radius);
    const directions: Record<CameraPreset, Vector3> = {
      front: new Vector3(0, 0, -1),
      back: new Vector3(0, 0, 1),
      left: new Vector3(-1, 0, 0),
      right: new Vector3(1, 0, 0),
      top: new Vector3(0, 1, 0),
      bottom: new Vector3(0, -1, 0),
    };
    camera.setPosition(target.add(directions[preset].scale(distance)));
    camera.target.copyFrom(target);
  };

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
    const pickedMesh = pointerInfo.pickInfo?.pickedMesh as AbstractMesh | null;
    if (!pickedMesh) return;
    const face = pickedMesh.metadata?.face as FaceKey | undefined;
    if (face && FACE_KEYS.includes(face)) {
      selectSceneNode(`face-${face}`);
      return;
    }
    const treeId = pickedMesh.metadata?.treeId as string | undefined;
    if (treeId && pickedMesh.metadata?.imported) selectSceneNode(treeId);
  });

  const setProject = (project: MapperProject) => {
    const buildingChanged = currentProject.id !== project.id;
    currentProject = project;
    if (buildingChanged || panels.size === 0) {
      build(project);
      return;
    }
    buildingRoot.rotation.set(
      degreesToRadians(project.model.rotationDeg.x),
      degreesToRadians(project.model.rotationDeg.y),
      degreesToRadians(project.model.rotationDeg.z),
    );
    for (const face of FACE_KEYS) updateFacePanel(face, project.faces[face]);
    updatePanelHighlight();
    if (selectedImportedMesh) applyTextureTransformToMesh(selectedImportedMesh, project.faces[currentActiveFace]);
  };

  const rotate = (axis: 'x' | 'y', direction: -1 | 1) => {
    const rotation = { ...currentProject.model.rotationDeg };
    rotation[axis] = snapQuarterTurn(rotation[axis] + direction * 90);
    currentProject = { ...currentProject, model: { ...currentProject.model, rotationDeg: rotation } };
    buildingRoot.rotation[axis] = degreesToRadians(rotation[axis]);
    if (importedRoot) importedRoot.rotation[axis] = degreesToRadians(rotation[axis]);
    onRotationChange(rotation);
  };

  const resetRotation = () => {
    const definition = getBuildingDefinition(currentProject.id);
    currentProject = { ...currentProject, model: { ...currentProject.model, rotationDeg: { ...definition.defaultRotation } } };
    buildingRoot.rotation.set(0, 0, 0);
    if (importedRoot) importedRoot.rotation.set(0, 0, 0);
    onRotationChange(currentProject.model.rotationDeg);
  };

  const clearImportedModel = () => {
    importedRoot?.dispose(false, true);
    importedRoot = null;
    importedModelName = null;
    importedNodes = [];
    importedMeshes = [];
    clearImportedSelection();
    selectedSceneNodeId = 'face-front';
    buildingRoot.setEnabled(true);
    if (plinth) plinth.isVisible = true;
  };

  const loadGlb = async (file: File): Promise<string> => {
    if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Only .glb files can be imported as models.');
    return loadGlbSource({ kind: 'file', file });
  };

  const frameImportedModel = () => {
    if (!importedMeshes.length) return;
    const minimum = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const maximum = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    importedMeshes.forEach((mesh) => {
      const bounds = mesh.getBoundingInfo().boundingBox;
      minimum.minimizeInPlace(bounds.minimumWorld);
      maximum.maximizeInPlace(bounds.maximumWorld);
    });
    const center = minimum.add(maximum).scale(0.5);
    const extent = maximum.subtract(minimum);
    const radius = Math.max(extent.x, extent.y, extent.z, 1);
    camera.target.copyFrom(center);
    camera.radius = Math.min(Math.max(radius * 1.6, 18), 120);
    camera.upperRadiusLimit = Math.max(120, camera.radius * 2.5);
  };

  const loadGlbSource = async (source: GlbAssetSource): Promise<string> => {
    const resolved = resolveGlbAssetSource(source);
    clearImportedModel();
    try {
      await import('@babylonjs/loaders/glTF');
      const result = await SceneLoader.ImportMeshAsync('', resolved.url, '', scene, undefined, '.glb', resolved.fileName);
      importedRoot = new TransformNode(`ImportedGLB-${resolved.fileName}`, scene);
      const instanceId = resolved.metadata.instanceId ?? `${resolved.metadata.assetId ?? resolved.fileName}-instance-${crypto.randomUUID()}`;
      const rootMetadata: MapperAssetMetadata = {
        assetId: resolved.metadata.assetId ?? resolved.fileName,
        instanceId,
        category: resolved.metadata.category ?? 'imported',
        packageId: resolved.metadata.packageId,
        sourcePath: resolved.metadata.sourcePath,
        glbPath: resolved.metadata.glbPath ?? resolved.url,
        nodeName: resolved.metadata.nodeName ?? resolved.fileName,
      };
      importedRoot.metadata = { treeId: 'glb-root', imported: true, export: true, mapper: rootMetadata };
      importedRoot.setEnabled(true);
      importedNodes = [...new Set([...result.transformNodes, ...result.meshes])];
      importedNodes.forEach((node, index) => {
        if (!node.parent || !importedNodes.includes(node.parent as TransformNode | AbstractMesh)) node.parent = importedRoot;
        const metadata: MapperAssetMetadata = {
          ...rootMetadata,
          nodeName: node.name || rootMetadata.nodeName,
        };
        node.metadata = { ...(node.metadata ?? {}), treeId: `glb-node-${index}`, imported: true, export: true, mapper: metadata };
        node.setEnabled(true);
        if (node instanceof AbstractMesh) {
          node.isVisible = true;
          node.visibility = 1;
          node.isPickable = true;
        }
      });
      importedMeshes = importedNodes.filter((node): node is AbstractMesh => node instanceof AbstractMesh);
      importedModelName = resolved.fileName;
      buildingRoot.setEnabled(false);
      if (plinth) plinth.isVisible = false;
      selectedSceneNodeId = 'glb-root';
      frameImportedModel();
      return resolved.fileName;
    } catch (error) {
      clearImportedModel();
      const detail = error instanceof Error ? error.message : 'Unknown loader error.';
      throw new Error(`GLB LOAD FAILED · ${rootMetadataLabel(resolved.metadata)} · ${detail}`);
    } finally {
      if (resolved.revokeUrl) URL.revokeObjectURL(resolved.url);
    }
  };

  const applyTextureToSelected = (textureUrl: string): boolean => {
    const material = getSelectedMaterial();
    if (!material) return false;
    const target = material as Material & { diffuseTexture?: Texture | null; albedoTexture?: Texture | null };
    const previousTexture = getMaterialTexture(material);
    const texture = new Texture(textureUrl, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    if ('albedoTexture' in target) target.albedoTexture = texture;
    else target.diffuseTexture = texture;
    previousTexture?.dispose();
    configureTexture(texture, currentProject.faces[currentActiveFace]);
    return true;
  };

  const exportGlb = async () => {
    const previousGroundVisibility = ground.isVisible;
    const previousPlinthVisibility = plinth?.isVisible ?? false;
    ground.isVisible = false;
    if (plinth) plinth.isVisible = false;
    const name = importedModelName?.replace(/\.glb$/i, '') || currentProject.id;
    const { GLTF2Export } = await import('@babylonjs/serializers');
    const result = await GLTF2Export.GLBAsync(scene, name, {
      shouldExportNode: (node) => node === buildingRoot || node === importedRoot || node.metadata?.export === true,
    });
    ground.isVisible = previousGroundVisibility;
    if (plinth) plinth.isVisible = previousPlinthVisibility;
    const file = result.glTFFiles[`${name}.glb`];
    if (!(file instanceof Blob)) throw new Error('Babylon could not create a GLB file.');
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.glb`;
    anchor.click();
    URL.revokeObjectURL(url);
    return name;
  };

  const getExportFileName = () => `${importedModelName?.replace(/\.glb$/i, '') || currentProject.id}.glb`;

  build(initialProject);
  engine.runRenderLoop(() => scene.render());
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);

  return {
    engine,
    scene,
    setProject,
    setActiveFace: (face) => {
      currentActiveFace = face;
      selectedSceneNodeId = `face-${face}`;
      selectedMaterialSlotId = `face-${face}-material`;
      updatePanelHighlight();
    },
    rotate,
    resetRotation,
    setCameraPreset,
    loadGlb,
    loadGlbSource,
    clearImportedModel,
    getSceneTree,
    getMaterialSlots,
    selectMaterialSlot,
    selectSceneNode,
    applyTextureToSelected,
    exportGlb,
    getExportFileName,
    dispose: () => {
      window.removeEventListener('resize', resize);
      scene.dispose();
      engine.dispose();
    },
  };
}

function configureTexture(texture: Texture, faceConfig: MapperProject['faces'][FaceKey]): void {
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = faceConfig.scale[0] * (faceConfig.flipU ? -1 : 1);
  texture.vScale = faceConfig.scale[1] * (faceConfig.flipV ? -1 : 1);
  texture.uOffset = faceConfig.offset[0] + (faceConfig.flipU ? 1 : 0);
  texture.vOffset = faceConfig.offset[1] + (faceConfig.flipV ? 1 : 0);
}

function rotatePlaneUv(panel: Mesh, angle: number): void {
  const uvs = panel.getVerticesData(VertexBuffer.UVKind);
  if (!uvs) return;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let index = 0; index < uvs.length; index += 2) {
    const u = uvs[index] - 0.5;
    const v = uvs[index + 1] - 0.5;
    uvs[index] = u * cos - v * sin + 0.5;
    uvs[index + 1] = u * sin + v * cos + 0.5;
  }
  panel.updateVerticesData(VertexBuffer.UVKind, uvs);
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function rootMetadataLabel(metadata: Partial<MapperAssetMetadata>): string {
  return metadata.assetId ?? metadata.glbPath ?? 'unknown-asset';
}
