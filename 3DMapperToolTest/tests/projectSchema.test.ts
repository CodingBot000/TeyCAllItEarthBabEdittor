import { describe, expect, it } from 'vitest';
import { createDefaultProject, normaliseDegrees, parseProjectFile, snapQuarterTurn } from '../src/domain/projectSchema';

describe('project schema', () => {
  it('creates the documented six-face preset', () => {
    const project = createDefaultProject('building-001');
    expect(project.model.dimensions).toEqual({ x: 6, y: 11, z: 5 });
    expect(project.faces.front.id).toBe('F-01');
    expect(project.faces.left).toMatchObject({ id: 'L-04', texture: 'left', rotationDeg: -90 });
    expect(Object.keys(project.faces)).toHaveLength(6);
  });

  it('normalises and snaps quarter turns', () => {
    expect(normaliseDegrees(540)).toBe(180);
    expect(normaliseDegrees(-270)).toBe(90);
    expect(snapQuarterTurn(136)).toBe(180);
    expect(snapQuarterTurn(-44)).toBe(0);
  });

  it('rejects projects without the required editor data', () => {
    expect(() => parseProjectFile({ id: 'missing-faces' })).toThrow();
  });

  it('accepts custom texture URLs and advanced UV values', () => {
    const project = createDefaultProject('building-001');
    project.faces.front.texture = 'data:image/png;base64,fixture';
    project.faces.front.offset = [0.25, -0.1];
    project.faces.front.scale = [1.5, 0.75];
    project.faces.front.flipU = true;
    expect(parseProjectFile(project).faces.front).toMatchObject({
      texture: 'data:image/png;base64,fixture',
      offset: [0.25, -0.1],
      scale: [1.5, 0.75],
      flipU: true,
    });
  });
});
