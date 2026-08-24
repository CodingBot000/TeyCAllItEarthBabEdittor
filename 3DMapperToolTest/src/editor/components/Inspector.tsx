import { FACE_KEYS, TEXTURE_OPTIONS, type BuildingDefinition, type FaceKey } from '../../domain/buildingCatalog';
import type { MapperProject } from '../../domain/projectSchema';
import type { MaterialSlotInfo } from '../../domain/materialSlots';
import type { SceneTreeNode } from '../../domain/sceneTree';
import { textureLabel } from '../state/useEditorStore';
import { Icon } from './Icon';
import { MaterialSlots } from './MaterialSlots';

interface InspectorProps {
  project: MapperProject;
  definition: BuildingDefinition;
  activeFace: FaceKey;
  onActiveFace: (face: FaceKey) => void;
  onRotate: (axis: 'x' | 'y', direction: -1 | 1) => void;
  onReset: () => void;
  onFaceChange: (face: FaceKey, patch: Partial<MapperProject['faces'][FaceKey]>) => void;
  onNameChange: (name: string) => void;
  materialSlots: MaterialSlotInfo[];
  selectedMaterialSlotId: string | null;
  onMaterialSlot: (id: string) => void;
  selectedNode: SceneTreeNode | null;
}

const faceLabels: Record<FaceKey, string> = { front: 'FRONT', back: 'BACK', right: 'RIGHT', left: 'LEFT', roof: 'ROOF', bottom: 'BOTTOM' };

export function Inspector({ project, definition, activeFace, onActiveFace, onRotate, onReset, onFaceChange, onNameChange, materialSlots, selectedMaterialSlotId, onMaterialSlot, selectedNode }: InspectorProps) {
  const rotation = project.model.rotationDeg;
  const activeConfig = project.faces[activeFace];
  const updateUv = (key: 'offset' | 'scale', index: 0 | 1, value: number) => {
    const next = [...activeConfig[key]] as [number, number];
    next[index] = value;
    onFaceChange(activeFace, { [key]: next });
  };
  return (
    <aside className="inspector panel-surface">
      <section className="inspector-section">
        <div className="section-header"><h2>BUILDING</h2><span className="section-index">01</span></div>
        <label className="field-label" htmlFor="building-inspector-select">ACTIVE ASSET</label>
        <div className="select-wrap"><select id="building-inspector-select" value={project.id} disabled><option>{project.id.toUpperCase()}</option></select><Icon name="chevron" size={15} /></div>
        <div className="dimensions-readout"><span>DIMENSIONS</span><strong>{definition.dimensions.width} × {definition.dimensions.height} × {definition.dimensions.depth} m</strong></div>
      </section>
      {selectedNode?.imported ? <section className="inspector-section selection-section">
        <div className="section-header"><h2>SELECTED NODE</h2><span className="section-index">GLB</span></div>
        <div className="selection-grid">
          <span>NODE</span><strong>{selectedNode.name}</strong>
          <span>PARENT</span><strong>{selectedNode.parentId ?? 'GLB ROOT'}</strong>
          <span>ASSET ID</span><strong>{selectedNode.assetId ?? '—'}</strong>
          <span>INSTANCE</span><strong>{selectedNode.instanceId ?? '—'}</strong>
          <span>CATEGORY</span><strong>{selectedNode.category ?? '—'}</strong>
          <span>GLB PATH</span><strong>{selectedNode.glbPath ?? '—'}</strong>
        </div>
      </section> : null}
      <section className="inspector-section">
        <div className="section-header"><h2>ROTATE BUILDING · 90°</h2><span className="section-index">02</span></div>
        <div className="rotation-cross">
          <button type="button" onClick={() => onRotate('x', 1)} aria-label="Rotate up">↑<small>UP</small></button>
          <button type="button" onClick={() => onRotate('y', -1)} aria-label="Rotate left">←<small>LEFT</small></button>
          <button type="button" onClick={() => onRotate('y', 1)} aria-label="Rotate right">→<small>RIGHT</small></button>
          <button type="button" onClick={() => onRotate('x', -1)} aria-label="Rotate down">↓<small>DOWN</small></button>
        </div>
        <button className="reset-button" type="button" onClick={onReset}>RESET ROTATION</button>
      </section>
      <section className="inspector-section">
        <div className="section-header"><h2>FINAL ROTATION</h2><button className="copy-inline" type="button" title="Copy rotation JSON" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(rotation, null, 2))}><Icon name="copy" size={14} /></button></div>
        <pre className="rotation-readout">{JSON.stringify(rotation, null, 2)}</pre>
      </section>
      <section className="inspector-section mapping-section">
        <div className="section-header"><h2>FACE MAPPING</h2><span className="section-index">03</span></div>
        <div className="mapping-heading"><span>FACE ID</span><span>TEXTURE</span><span>UV ROTATION</span></div>
        <div className="mapping-list">
          {FACE_KEYS.map((face) => {
            const config = project.faces[face];
            const isSelected = face === activeFace;
            return (
              <div className={`mapping-row${isSelected ? ' selected' : ''}`} key={face} onClick={() => onActiveFace(face)}>
                <button type="button" className="face-id" onClick={() => onActiveFace(face)}>{config.id}<span className="face-name">{faceLabels[face]}</span></button>
                <div className="select-wrap compact"><select aria-label={`${config.id} texture`} value={config.texture} onChange={(event) => onFaceChange(face, { texture: event.target.value })}>{!TEXTURE_OPTIONS.includes(config.texture as (typeof TEXTURE_OPTIONS)[number]) ? <option value={config.texture}>CUSTOM IMAGE</option> : null}{TEXTURE_OPTIONS.map((texture) => <option key={texture} value={texture}>{textureLabel(texture)}</option>)}</select><Icon name="chevron" size={12} /></div>
                <div className="select-wrap compact rotation-select"><select aria-label={`${config.id} UV rotation`} value={config.rotationDeg} onChange={(event) => onFaceChange(face, { rotationDeg: Number(event.target.value) })}>{[-180, -90, 0, 90, 180].map((value) => <option key={value} value={value}>{value}°</option>)}</select><Icon name="chevron" size={12} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="inspector-section uv-section">
        <div className="section-header"><h2>ADVANCED UV</h2><span className="section-index">04</span></div>
        <div className="uv-target">EDITING <strong>{activeConfig.id} · {faceLabels[activeFace]}</strong></div>
        <div className="uv-grid">
          <label><span>OFFSET U</span><input type="number" step="0.01" value={activeConfig.offset[0]} onChange={(event) => updateUv('offset', 0, Number(event.target.value))} /></label>
          <label><span>OFFSET V</span><input type="number" step="0.01" value={activeConfig.offset[1]} onChange={(event) => updateUv('offset', 1, Number(event.target.value))} /></label>
          <label><span>SCALE U</span><input type="number" min="0.05" step="0.05" value={activeConfig.scale[0]} onChange={(event) => updateUv('scale', 0, Math.max(0.05, Number(event.target.value) || 0.05))} /></label>
          <label><span>SCALE V</span><input type="number" min="0.05" step="0.05" value={activeConfig.scale[1]} onChange={(event) => updateUv('scale', 1, Math.max(0.05, Number(event.target.value) || 0.05))} /></label>
        </div>
        <div className="uv-toggle-row">
          <button type="button" className={activeConfig.flipU ? 'active' : ''} onClick={() => onFaceChange(activeFace, { flipU: !activeConfig.flipU })}>FLIP U <strong>{activeConfig.flipU ? 'ON' : 'OFF'}</strong></button>
          <button type="button" className={activeConfig.flipV ? 'active' : ''} onClick={() => onFaceChange(activeFace, { flipV: !activeConfig.flipV })}>FLIP V <strong>{activeConfig.flipV ? 'ON' : 'OFF'}</strong></button>
        </div>
      </section>
      <MaterialSlots slots={materialSlots} selectedSlotId={selectedMaterialSlotId} onSelect={onMaterialSlot} />
      <section className="inspector-section project-section">
        <div className="section-header"><h2>PROJECT</h2><Icon name="settings" size={15} /></div>
        <label className="project-field"><span>NAME</span><input value={project.displayName} onChange={(event) => onNameChange(event.target.value)} /></label>
        <label className="project-field"><span>UNITS</span><input value="Meters" readOnly /></label>
        <label className="project-field"><span>SCALE</span><input value="1.00" readOnly /></label>
        <label className="project-field"><span>UP AXIS</span><input value="Y-Up" readOnly /></label>
      </section>
    </aside>
  );
}
