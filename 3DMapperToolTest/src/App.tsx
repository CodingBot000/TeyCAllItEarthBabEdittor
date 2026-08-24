import { useEffect, useRef, useState } from 'react';
import catalogIndexJson from './data/catalogs/catalog-index.json';
import { catalogExportedAssets, parseAssetCatalogIndex, type CatalogAsset } from './domain/assetCatalog';
import { getBuildingDefinition, type BuildingId, type FaceKey } from './domain/buildingCatalog';
import type { CameraPreset } from './domain/cameraPresets';
import { createBabylonEditorPackage } from './domain/editorPackage';
import type { MaterialSlotInfo } from './domain/materialSlots';
import type { SceneTreeNode } from './domain/sceneTree';
import { parseProjectFile } from './domain/projectSchema';
import { createBuildingScene, type BuildingSceneController } from './engine/babylon/buildingScene';
import { AssetLibrary } from './editor/components/AssetLibrary';
import { Inspector } from './editor/components/Inspector';
import { Topbar } from './editor/components/Topbar';
import { Viewport } from './editor/components/Viewport';
import { deleteGlbFile, loadGlbFile, saveGlbFile } from './editor/state/glbStorage';
import { useEditorStore } from './editor/state/useEditorStore';

type ScenePhase = 'loading' | 'ready' | 'error';
type EditorMode = 'building' | 'asset' | 'scene';

const catalog = parseAssetCatalogIndex(catalogIndexJson);
const allCatalogAssets = catalogExportedAssets(catalog);

function downloadJsonFile(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const sceneRef = useRef<BuildingSceneController | null>(null);
  const project = useEditorStore((state) => state.project);
  const activeFace = useEditorStore((state) => state.activeFace);
  const setBuilding = useEditorStore((state) => state.setBuilding);
  const setActiveFace = useEditorStore((state) => state.setActiveFace);
  const rotate = useEditorStore((state) => state.rotate);
  const resetRotation = useEditorStore((state) => state.resetRotation);
  const updateRotation = useEditorStore((state) => state.updateRotation);
  const updateFace = useEditorStore((state) => state.updateFace);
  const updateDisplayName = useEditorStore((state) => state.updateDisplayName);
  const setImportedGlb = useEditorStore((state) => state.setImportedGlb);
  const importProject = useEditorStore((state) => state.importProject);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.canUndo);
  const canRedo = useEditorStore((state) => state.canRedo);
  const markSaved = useEditorStore((state) => state.markSaved);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const [phase, setPhase] = useState<ScenePhase>('loading');
  const [mode, setMode] = useState<EditorMode>('building');
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sceneNodes, setSceneNodes] = useState<SceneTreeNode[]>([]);
  const [selectedSceneNodeId, setSelectedSceneNodeId] = useState<string | null>('face-front');
  const [importedModelName, setImportedModelName] = useState<string | null>(null);
  const [materialSlots, setMaterialSlots] = useState<MaterialSlotInfo[]>([]);
  const [selectedMaterialSlotId, setSelectedMaterialSlotId] = useState<string | null>('face-front-material');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('front');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogPackage, setCatalogPackage] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [selectedCatalogAssetId, setSelectedCatalogAssetId] = useState<string | null>(null);
  const restoredGlbKeyRef = useRef<string | null>(null);
  const loadedCatalogAssetRef = useRef(false);
  const definition = getBuildingDefinition(project.id);
  const selectedNode = sceneNodes.find((node) => node.id === selectedSceneNodeId) ?? null;
  const visibleCatalogAssets = allCatalogAssets.filter((asset) => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [asset.id, asset.sourcePath, asset.category].some((value) => value.toLowerCase().includes(normalizedQuery));
    const matchesPackage = !catalogPackage || asset.package === catalogPackage;
    const matchesCategory = !catalogCategory || asset.category === catalogCategory;
    return matchesQuery && matchesPackage && matchesCategory && asset.status === 'exported';
  });

  const refreshMaterialSlots = () => {
    const slots = sceneRef.current?.getMaterialSlots() ?? [];
    setMaterialSlots(slots);
    setSelectedMaterialSlotId(slots.find((slot) => slot.selected)?.id ?? slots[0]?.id ?? null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try {
      sceneRef.current = createBuildingScene(
        canvas,
        project,
        updateRotation,
        (face) => {
          setActiveFace(face);
          setSelectedSceneNodeId(`face-${face}`);
        },
        (id) => {
          setSelectedSceneNodeId(id);
          refreshMaterialSlots();
        },
      );
      setSceneNodes(sceneRef.current.getSceneTree());
      refreshMaterialSlots();
      setPhase('ready');
    } catch (error) {
      setPhase('error');
      setSceneError(error instanceof Error ? error.message : 'Could not create the Babylon scene.');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setProject(project);
    if (sceneRef.current) setSceneNodes(sceneRef.current.getSceneTree());
    refreshMaterialSlots();
  }, [project]);

  useEffect(() => {
    sceneRef.current?.setActiveFace(activeFace);
    setSelectedSceneNodeId(`face-${activeFace}`);
    refreshMaterialSlots();
  }, [activeFace]);

  useEffect(() => {
    const importedGlb = project.model.importedGlb;
    if (!sceneRef.current || !importedGlb || restoredGlbKeyRef.current === importedGlb.key) return;
    restoredGlbKeyRef.current = importedGlb.key;
    void loadGlbFile(importedGlb.key).then(async (file) => {
      if (!file || !sceneRef.current) throw new Error('Saved GLB asset is no longer available in browser storage.');
      const name = await sceneRef.current.loadGlb(file);
      setImportedModelName(name);
      setSelectedSceneNodeId('glb-root');
      setSceneNodes(sceneRef.current.getSceneTree());
      refreshMaterialSlots();
      setToast('SAVED GLB RESTORED');
    }).catch((error: unknown) => {
      setToast(error instanceof Error ? `GLB RESTORE FAILED: ${error.message}` : 'GLB RESTORE FAILED');
    });
  }, [project.model.importedGlb?.key, phase]);

  useEffect(() => {
    if (project.model.importedGlb || !importedModelName || loadedCatalogAssetRef.current) return;
    sceneRef.current?.clearImportedModel();
    setImportedModelName(null);
    setSelectedSceneNodeId('face-front');
    setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
    refreshMaterialSlots();
  }, [project.model.importedGlb?.key, importedModelName]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleRotate = (axis: 'x' | 'y', direction: -1 | 1) => {
    if (sceneRef.current) sceneRef.current.rotate(axis, direction);
    else rotate(axis, direction);
  };

  const handleReset = () => {
    if (sceneRef.current) sceneRef.current.resetRotation();
    else resetRotation();
  };

  const handleSave = () => {
    downloadJsonFile(project, `${project.id}.project.json`);
    markSaved();
    setToast('PROJECT JSON DOWNLOADED');
  };

  const handleExport = async () => {
    try {
      await sceneRef.current?.exportGlb();
      setToast('GLB EXPORT COMPLETE');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'GLB EXPORT FAILED');
    }
  };

  const handleGlbFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setToast('GLB IMPORT REQUIRES A .GLB FILE');
      return;
    }
    try {
      setMode('asset');
      setSelectedCatalogAssetId(null);
      loadedCatalogAssetRef.current = false;
      const previousGlbKey = project.model.importedGlb?.key;
      const storedGlb = await saveGlbFile(file);
      const name = await sceneRef.current?.loadGlb(file);
      if (previousGlbKey && previousGlbKey !== storedGlb.key) void deleteGlbFile(previousGlbKey);
      setImportedGlb(storedGlb);
      setImportedModelName(name ?? file.name);
      setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
      setSelectedSceneNodeId('glb-root');
      restoredGlbKeyRef.current = storedGlb.key;
      refreshMaterialSlots();
      setToast(`GLB IMPORTED · ${name ?? file.name}`);
    } catch (error) {
      setToast(error instanceof Error ? `GLB IMPORT FAILED: ${error.message}` : 'GLB IMPORT FAILED');
    }
  };

  const readTextureFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setToast('DROP A GLB OR IMAGE TEXTURE');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const textureUrl = String(reader.result);
      const appliedToMesh = sceneRef.current?.applyTextureToSelected(textureUrl) ?? false;
      updateFace(activeFace, { texture: textureUrl });
      setToast(appliedToMesh ? 'TEXTURE APPLIED TO SELECTED MESH' : `TEXTURE APPLIED TO ${activeFace.toUpperCase()}`);
    };
    reader.onerror = () => setToast('TEXTURE READ FAILED');
    reader.readAsDataURL(file);
  };

  const handleDroppedFile = (file: File) => {
    if (file.name.toLowerCase().endsWith('.glb')) void handleGlbFile(file);
    else readTextureFile(file);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseProjectFile(JSON.parse(await file.text()));
      importProject(parsed);
      setToast('PROJECT LOADED');
    } catch (error) {
      setToast(error instanceof Error ? `PROJECT LOAD FAILED: ${error.message}` : 'PROJECT LOAD FAILED');
    }
  };

  const handleBuildingChange = (id: BuildingId) => {
    const oldGlbKey = project.model.importedGlb?.key;
    sceneRef.current?.clearImportedModel();
    if (oldGlbKey) void deleteGlbFile(oldGlbKey);
    setImportedModelName(null);
    loadedCatalogAssetRef.current = false;
    setSelectedCatalogAssetId(null);
    setMode('building');
    setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
    setBuilding(id);
    setMaterialSlots([]);
    setSelectedMaterialSlotId(`face-front-material`);
    setToast(`${id.toUpperCase()} LOADED`);
  };

  const handleModeChange = (nextMode: EditorMode) => {
    if (nextMode === 'building' && mode !== 'building') {
      const oldGlbKey = project.model.importedGlb?.key;
      sceneRef.current?.clearImportedModel();
      loadedCatalogAssetRef.current = false;
      if (oldGlbKey) void deleteGlbFile(oldGlbKey);
      setImportedModelName(null);
      setSelectedCatalogAssetId(null);
      if (project.model.importedGlb) setImportedGlb(undefined);
      setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
      refreshMaterialSlots();
    }
    setMode(nextMode);
  };

  const handleCatalogSelect = (asset: CatalogAsset) => {
    const oldGlbKey = project.model.importedGlb?.key;
    if (oldGlbKey) {
      void deleteGlbFile(oldGlbKey);
      setImportedGlb(undefined);
    }
    setMode('asset');
    setSelectedCatalogAssetId(asset.id);
    loadedCatalogAssetRef.current = true;
    setToast(`LOADING ${asset.id}`);
    void sceneRef.current?.loadGlbSource({ kind: 'catalog', asset }).then((name) => {
      setImportedModelName(name);
      setSelectedSceneNodeId('glb-root');
      setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
      refreshMaterialSlots();
      setToast(`CATALOG ASSET LOADED · ${name}`);
    }).catch((error: unknown) => {
      setToast(error instanceof Error ? error.message : 'CATALOG ASSET LOAD FAILED');
    });
  };

  const handleSceneSelect = () => {
    const oldGlbKey = project.model.importedGlb?.key;
    if (oldGlbKey) {
      void deleteGlbFile(oldGlbKey);
      setImportedGlb(undefined);
    }
    setMode('scene');
    setSelectedCatalogAssetId('jc-lp-megacity-demo');
    loadedCatalogAssetRef.current = true;
    setToast('LOADING JC LP MEGACITY · 211 MB');
    void sceneRef.current?.loadGlbSource({
      kind: 'scene',
      sceneId: 'jc-lp-megacity-demo',
      url: '/__local_glb__/scenes/jc-lp-megacity/JC_LP_MegaCity_Demo_Static.glb',
      metadata: {
        assetId: 'jc-lp-megacity-demo',
        instanceId: 'jc-lp-megacity-demo-instance-1',
        category: 'scene',
        glbPath: 'scenes/jc-lp-megacity/JC_LP_MegaCity_Demo_Static.glb',
        nodeName: 'JC_LP_MegaCity_Demo_Static',
      },
    }).then((name) => {
      setImportedModelName(name);
      setSelectedSceneNodeId('glb-root');
      setSceneNodes(sceneRef.current?.getSceneTree() ?? []);
      refreshMaterialSlots();
      setToast(`SCENE LOADED · ${name}`);
    }).catch((error: unknown) => {
      setToast(error instanceof Error ? error.message : 'SCENE LOAD FAILED');
    });
  };

  const handleSceneNodeSelect = (node: SceneTreeNode) => {
    sceneRef.current?.selectSceneNode(node.id);
    setSelectedSceneNodeId(node.id);
    if (node.face) setActiveFace(node.face);
    refreshMaterialSlots();
  };

  const handleMaterialSlot = (id: string) => {
    sceneRef.current?.selectMaterialSlot(id);
    setSelectedMaterialSlotId(id);
    refreshMaterialSlots();
  };

  const handleCameraPreset = (preset: CameraPreset) => {
    sceneRef.current?.setCameraPreset(preset);
    setCameraPreset(preset);
  };

  const handleExportPackage = () => {
    const glbFileName = sceneRef.current?.getExportFileName() ?? `${project.id}.glb`;
    const editorPackage = createBabylonEditorPackage(project, glbFileName);
    downloadJsonFile(editorPackage, `${project.id}.babylon-editor-package.json`);
    setToast('BABYLON EDITOR PACKAGE METADATA DOWNLOADED');
  };

  return (
    <div className="mapper-app">
      <Topbar mode={mode} onModeChange={handleModeChange} definition={definition} buildingId={project.id} onBuildingChange={handleBuildingChange} onOpen={() => inputRef.current?.click()} onImportGlb={() => glbInputRef.current?.click()} onSave={handleSave} onExport={() => void handleExport()} onExportPackage={handleExportPackage} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void handleFile(event)} />
      <input ref={glbInputRef} className="sr-only" type="file" accept=".glb,model/gltf-binary" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleGlbFile(file); }} />
      <div className="workspace">
        <AssetLibrary mode={mode} activeBuildingId={project.id as BuildingId} catalog={catalog} catalogAssets={visibleCatalogAssets} catalogQuery={catalogQuery} catalogPackage={catalogPackage} catalogCategory={catalogCategory} selectedCatalogAssetId={selectedCatalogAssetId} onSelect={handleBuildingChange} onCatalogQuery={setCatalogQuery} onCatalogPackage={setCatalogPackage} onCatalogCategory={setCatalogCategory} onCatalogSelect={handleCatalogSelect} onSceneSelect={handleSceneSelect} onOpen={() => inputRef.current?.click()} sceneNodes={sceneNodes} selectedSceneNodeId={selectedSceneNodeId} onSceneNodeSelect={handleSceneNodeSelect} />
        <Viewport canvasRef={canvasRef} definition={definition} activeFace={activeFace as FaceKey} phase={phase} error={sceneError} importedModelName={importedModelName} onFileDrop={handleDroppedFile} cameraPreset={cameraPreset} onCameraPreset={handleCameraPreset} />
        <Inspector project={project} definition={definition} activeFace={activeFace as FaceKey} onActiveFace={setActiveFace} onRotate={handleRotate} onReset={handleReset} onFaceChange={updateFace} onNameChange={updateDisplayName} materialSlots={materialSlots} selectedMaterialSlotId={selectedMaterialSlotId} onMaterialSlot={handleMaterialSlot} selectedNode={selectedNode} />
      </div>
      <footer className="app-footer"><span>3D MAPPER TOOL <i /> BABYLON.JS RUNTIME</span><span>{lastSavedAt ? `AUTO-SAVED ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'AUTO SAVE: ON'}</span></footer>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
