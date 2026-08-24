import type { BuildingDefinition } from '../../domain/buildingCatalog';
import { buildingOptions } from '../state/useEditorStore';
import { Icon } from './Icon';

interface TopbarProps {
  definition: BuildingDefinition;
  buildingId: string;
  onBuildingChange: (id: BuildingDefinition['id']) => void;
  onOpen: () => void;
  onImportGlb: () => void;
  onSave: () => void;
  onExport: () => void;
  onExportPackage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function Topbar({ definition, buildingId, onBuildingChange, onOpen, onImportGlb, onSave, onExport, onExportPackage, canUndo, canRedo, onUndo, onRedo }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark"><Icon name="cube" size={28} /></span>
        <span className="brand-name">3D MAPPER</span>
      </div>
      <label className="topbar-building-select">
        <span className="sr-only">Select building</span>
        <select value={buildingId} onChange={(event) => onBuildingChange(event.target.value as BuildingDefinition['id'])}>
          {buildingOptions().map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}
        </select>
        <Icon name="chevron" size={16} />
      </label>
      <div className="topbar-actions">
        <button className="icon-button" type="button" title="Undo" aria-label="Undo" onClick={onUndo} disabled={!canUndo}><Icon name="undo" size={17} /></button>
        <button className="icon-button" type="button" title="Redo" aria-label="Redo" onClick={onRedo} disabled={!canRedo}><Icon name="redo" size={17} /></button>
        <button className="icon-button settings-button" type="button" title="Editor settings"><Icon name="settings" size={18} /></button>
        <button className="topbar-button secondary" type="button" onClick={onOpen}><Icon name="folder" size={17} /> OPEN</button>
        <button className="topbar-button secondary" type="button" onClick={onImportGlb}><Icon name="upload" size={17} /> IMPORT GLB</button>
        <button className="topbar-button primary" type="button" onClick={onSave}><Icon name="save" size={17} /> SAVE PROJECT</button>
        <button className="topbar-button secondary" type="button" onClick={onExportPackage}><Icon name="package" size={17} /> PACKAGE</button>
        <button className="topbar-button export" type="button" onClick={onExport}><Icon name="export" size={17} /> EXPORT GLB</button>
      </div>
    </header>
  );
}
