import { useState, type RefObject } from 'react';
import type { BuildingDefinition, FaceKey } from '../../domain/buildingCatalog';
import { CAMERA_PRESETS, CAMERA_PRESET_LABELS, type CameraPreset } from '../../domain/cameraPresets';
import { Icon } from './Icon';

interface ViewportProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  definition: BuildingDefinition;
  activeFace: FaceKey;
  phase: 'loading' | 'ready' | 'error';
  error: string | null;
  importedModelName: string | null;
  onFileDrop: (file: File) => void;
  cameraPreset: CameraPreset;
  onCameraPreset: (preset: CameraPreset) => void;
}

export function Viewport({ canvasRef, definition, activeFace, phase, error, importedModelName, onFileDrop, cameraPreset, onCameraPreset }: ViewportProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  return (
    <section
      className="viewport-shell"
      aria-label="3D building viewport"
      onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingFile(false);
        const file = event.dataTransfer.files[0];
        if (file) onFileDrop(file);
      }}
    >
      <div className="viewport-title"><span>BUILDING EDITOR / TEXTURE MAPPING</span><strong>{definition.id.toUpperCase()} · {definition.dimensions.width} × {definition.dimensions.height} × {definition.dimensions.depth}</strong></div>
      <div className="viewport-toolbar" aria-label="Viewport tools">
        <button className="tool-button selected" type="button" title="Select tool"><Icon name="cursor" size={18} /></button>
        <button className="tool-button" type="button" title="Move tool"><Icon name="move" size={18} /></button>
        <button className="tool-button" type="button" title="Orbit tool"><Icon name="rotate" size={18} /></button>
        <button className="tool-button" type="button" title="Frame selection"><Icon name="frame" size={18} /></button>
        <span className="tool-divider" />
        <button className={`tool-button${activeFace ? ' has-selection' : ''}`} type="button" title="Camera snapshot"><Icon name="camera" size={18} /></button>
        <button className="tool-button" type="button" title="Toggle grid"><Icon name="grid" size={18} /></button>
      </div>
      <div className="camera-presets" aria-label="Camera presets">
        {CAMERA_PRESETS.map((preset) => <button type="button" key={preset} className={cameraPreset === preset ? 'selected' : ''} onClick={() => onCameraPreset(preset)}>{CAMERA_PRESET_LABELS[preset]}</button>)}
      </div>
      <canvas ref={canvasRef} className="scene-canvas" aria-label="Interactive building scene" />
      {isDraggingFile ? <div className="glb-drop-overlay">DROP GLB OR TEXTURE IMAGE</div> : null}
      {importedModelName ? <div className="imported-badge">GLB · {importedModelName}</div> : null}
      <div className="viewport-gizmo" aria-hidden="true"><span className="gizmo-y">Y</span><span className="gizmo-z">Z</span><span className="gizmo-x">X</span><i /></div>
      <div className="viewport-hint">DRAG TO ORBIT <span>·</span> WHEEL TO ZOOM</div>
      <div className="viewport-status"><span className={`status-dot ${phase}`} />{phase === 'loading' ? 'LOADING SCENE' : phase === 'error' ? error ?? 'SCENE ERROR' : 'SCENE READY'}</div>
    </section>
  );
}
