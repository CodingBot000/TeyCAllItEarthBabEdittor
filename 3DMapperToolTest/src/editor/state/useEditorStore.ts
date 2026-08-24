import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BUILDING_CATALOG,
  getBuildingDefinition,
  type BuildingId,
  type FaceKey,
  type Rotation,
  type TextureName,
} from '../../domain/buildingCatalog';
import {
  cloneProject,
  createDefaultProject,
  parseProjectFile,
  snapQuarterTurn,
  type MapperProject,
} from '../../domain/projectSchema';

interface EditorState {
  project: MapperProject;
  activeFace: FaceKey;
  lastSavedAt: string | null;
  past: MapperProject[];
  future: MapperProject[];
  canUndo: boolean;
  canRedo: boolean;
  setBuilding(buildingId: BuildingId): void;
  setActiveFace(face: FaceKey): void;
  rotate(axis: 'x' | 'y', direction: -1 | 1): void;
  resetRotation(): void;
  updateRotation(rotation: Rotation): void;
  updateFace(face: FaceKey, patch: Partial<MapperProject['faces'][FaceKey]>): void;
  updateDisplayName(displayName: string): void;
  setImportedGlb(importedGlb: MapperProject['model']['importedGlb']): void;
  importProject(value: unknown): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
}

const initialProject = createDefaultProject('building-001');
const MAX_HISTORY = 50;

function projectEqual(left: MapperProject, right: MapperProject): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function commitProject(state: EditorState, project: MapperProject): Pick<EditorState, 'project' | 'past' | 'future' | 'canUndo' | 'canRedo'> {
  if (projectEqual(state.project, project)) return state;
  const past = [...state.past, cloneProject(state.project)].slice(-MAX_HISTORY);
  return {
    project: cloneProject(project),
    past,
    future: [],
    canUndo: past.length > 0,
    canRedo: false,
  };
}

export const useEditorStore = create<EditorState>()(persist((set) => ({
  project: initialProject,
  activeFace: 'front',
  lastSavedAt: null,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  setBuilding: (buildingId) => set((state) => ({
    ...commitProject(state, createDefaultProject(buildingId)),
    activeFace: 'front',
    lastSavedAt: null,
  })),
  setActiveFace: (activeFace) => set({ activeFace }),
  rotate: (axis, direction) => set((state) => {
    const nextRotation = { ...state.project.model.rotationDeg };
    nextRotation[axis] = snapQuarterTurn(nextRotation[axis] + direction * 90);
    return commitProject(state, { ...state.project, model: { ...state.project.model, rotationDeg: nextRotation } });
  }),
  resetRotation: () => set((state) => {
    const definition = getBuildingDefinition(state.project.id);
    return commitProject(state, { ...state.project, model: { ...state.project.model, rotationDeg: { ...definition.defaultRotation } } });
  }),
  updateRotation: (rotation) => set((state) => commitProject(state, { ...state.project, model: { ...state.project.model, rotationDeg: rotation } })),
  updateFace: (face, patch) => set((state) => commitProject(state, { ...state.project, faces: { ...state.project.faces, [face]: { ...state.project.faces[face], ...patch } } })),
  updateDisplayName: (displayName) => set((state) => commitProject(state, { ...state.project, displayName })),
  setImportedGlb: (importedGlb) => set((state) => commitProject(state, {
    ...state.project,
    model: {
      ...state.project.model,
      source: importedGlb?.fileName ?? `models/${state.project.id}.glb`,
      importedGlb,
    },
  })),
  importProject: (value) => {
    const project = parseProjectFile(value);
    set((state) => ({ ...commitProject(state, project), activeFace: 'front', lastSavedAt: null }));
  },
  undo: () => set((state) => {
    const previous = state.past.at(-1);
    if (!previous) return state;
    const past = state.past.slice(0, -1);
    const future = [cloneProject(state.project), ...state.future].slice(0, MAX_HISTORY);
    return { project: cloneProject(previous), past, future, canUndo: past.length > 0, canRedo: future.length > 0 };
  }),
  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return state;
    const future = state.future.slice(1);
    const past = [...state.past, cloneProject(state.project)].slice(-MAX_HISTORY);
    return { project: cloneProject(next), past, future, canUndo: past.length > 0, canRedo: future.length > 0 };
  }),
  markSaved: () => set({ lastSavedAt: new Date().toISOString() }),
}), {
  name: '3d-mapper-project',
  partialize: (state) => ({ project: state.project, activeFace: state.activeFace }),
  merge: (persisted, current) => {
    const value = persisted as Partial<EditorState> | undefined;
    try {
      const project = value?.project ? parseProjectFile(value.project) : current.project;
      return { ...current, project, activeFace: value?.activeFace ?? current.activeFace, past: [], future: [], canUndo: false, canRedo: false };
    } catch {
      return current;
    }
  },
}));

export function buildingOptions(): BuildingId[] {
  return Object.keys(BUILDING_CATALOG) as BuildingId[];
}

export function formatDimensions(buildingId: BuildingId): string {
  const { width, height, depth } = BUILDING_CATALOG[buildingId].dimensions;
  return `${width.toFixed(1)}m × ${height.toFixed(1)}m × ${depth.toFixed(1)}m`;
}

export function textureLabel(texture: TextureName | string): string {
  return texture.includes('.') || texture.startsWith('data:') ? 'CUSTOM IMAGE' : `${texture}.webp`;
}
