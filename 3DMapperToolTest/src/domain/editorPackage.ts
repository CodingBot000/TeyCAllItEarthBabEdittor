import type { MapperProject } from './projectSchema';

export interface BabylonEditorPackage {
  format: '3d-mapper-babylon-editor-package';
  formatVersion: 1;
  generatedAt: string;
  target: {
    editor: 'Babylon.js Editor';
    units: 'meters';
    upAxis: 'Y';
  };
  scene: {
    rootNode: string;
    glbFileName: string;
    projectFileName: string;
  };
  project: MapperProject;
}

export function createBabylonEditorPackage(project: MapperProject, glbFileName: string): BabylonEditorPackage {
  return {
    format: '3d-mapper-babylon-editor-package',
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    target: { editor: 'Babylon.js Editor', units: 'meters', upAxis: 'Y' },
    scene: {
      rootNode: 'BuildingRoot',
      glbFileName,
      projectFileName: `${project.id}.project.json`,
    },
    project: structuredClone(project),
  };
}
