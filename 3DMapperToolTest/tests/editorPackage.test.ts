import { describe, expect, it } from 'vitest';
import { createBabylonEditorPackage } from '../src/domain/editorPackage';
import { createDefaultProject } from '../src/domain/projectSchema';

describe('Babylon Editor package metadata', () => {
  it('keeps the project intact and records the exported GLB contract', () => {
    const project = createDefaultProject('building-001');
    const editorPackage = createBabylonEditorPackage(project, 'building-001.glb');

    expect(editorPackage.target).toEqual({ editor: 'Babylon.js Editor', units: 'meters', upAxis: 'Y' });
    expect(editorPackage.scene).toEqual({
      rootNode: 'BuildingRoot',
      glbFileName: 'building-001.glb',
      projectFileName: 'building-001.project.json',
    });
    expect(editorPackage.project).toEqual(project);
    expect(editorPackage.project).not.toBe(project);
  });
});
