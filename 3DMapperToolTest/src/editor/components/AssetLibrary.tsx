import { BUILDING_CATALOG, type BuildingId } from '../../domain/buildingCatalog';
import type { SceneTreeNode } from '../../domain/sceneTree';
import { buildingOptions, formatDimensions } from '../state/useEditorStore';
import { Icon } from './Icon';
import { SceneTree } from './SceneTree';

interface AssetLibraryProps {
  activeBuildingId: BuildingId;
  onSelect: (id: BuildingId) => void;
  onOpen: () => void;
  sceneNodes: SceneTreeNode[];
  selectedSceneNodeId: string | null;
  onSceneNodeSelect: (node: SceneTreeNode) => void;
}

export function AssetLibrary({ activeBuildingId, onSelect, onOpen, sceneNodes, selectedSceneNodeId, onSceneNodeSelect }: AssetLibraryProps) {
  return (
    <aside className="asset-library panel-surface">
      <div className="section-header"><h2>ASSET LIBRARY</h2><button className="mini-icon-button" type="button" title="Filter assets"><Icon name="filter" size={15} /></button></div>
      <div className="asset-list">
        {buildingOptions().map((buildingId) => {
          const building = BUILDING_CATALOG[buildingId];
          const selected = buildingId === activeBuildingId;
          return (
            <button key={buildingId} type="button" className={`asset-row${selected ? ' selected' : ''}`} onClick={() => onSelect(buildingId)}>
              <span className="asset-preview"><img src={`/assets/buildings/${buildingId}/front.webp`} alt="" /></span>
              <span className="asset-copy"><strong>{buildingId.toUpperCase()}</strong><span>{formatDimensions(buildingId)}</span></span>
              {selected ? <span className="asset-selected-mark">✓</span> : null}
            </button>
          );
        })}
      </div>
      <SceneTree nodes={sceneNodes} selectedNodeId={selectedSceneNodeId} onSelect={onSceneNodeSelect} />
      <div className="asset-library-footer">
        <button type="button" title="Open project" onClick={onOpen}><Icon name="folder" size={17} /></button>
        <button type="button" title="Duplicate project"><Icon name="copy" size={17} /></button>
        <button type="button" title="Delete selected asset"><Icon name="trash" size={17} /></button>
        <button type="button" title="Filter assets"><Icon name="filter" size={17} /></button>
      </div>
    </aside>
  );
}
