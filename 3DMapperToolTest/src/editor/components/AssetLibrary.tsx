import { catalogCategories, catalogPackages, type AssetCatalogIndex, type CatalogAsset } from '../../domain/assetCatalog';
import { BUILDING_CATALOG, type BuildingId } from '../../domain/buildingCatalog';
import type { SceneTreeNode } from '../../domain/sceneTree';
import { buildingOptions, formatDimensions } from '../state/useEditorStore';
import { CatalogBrowser } from './CatalogBrowser';
import { Icon } from './Icon';
import { SceneAssetBrowser } from './SceneAssetBrowser';
import { SceneTree } from './SceneTree';

interface AssetLibraryProps {
  mode: 'building' | 'asset' | 'scene';
  activeBuildingId: BuildingId;
  catalog: AssetCatalogIndex;
  catalogAssets: CatalogAsset[];
  catalogQuery: string;
  catalogPackage: string;
  catalogCategory: string;
  selectedCatalogAssetId: string | null;
  onSelect: (id: BuildingId) => void;
  onCatalogQuery: (value: string) => void;
  onCatalogPackage: (value: string) => void;
  onCatalogCategory: (value: string) => void;
  onCatalogSelect: (asset: CatalogAsset) => void;
  onSceneSelect: () => void;
  onOpen: () => void;
  sceneNodes: SceneTreeNode[];
  selectedSceneNodeId: string | null;
  onSceneNodeSelect: (node: SceneTreeNode) => void;
}

export function AssetLibrary({ mode, activeBuildingId, catalog, catalogAssets, catalogQuery, catalogPackage, catalogCategory, selectedCatalogAssetId, onSelect, onCatalogQuery, onCatalogPackage, onCatalogCategory, onCatalogSelect, onSceneSelect, onOpen, sceneNodes, selectedSceneNodeId, onSceneNodeSelect }: AssetLibraryProps) {
  return (
    <aside className="asset-library panel-surface">
      <div className="section-header"><h2>{mode === 'building' ? 'BUILDING ASSETS' : mode === 'asset' ? 'GLB CATALOG' : 'SCENE ASSETS'}</h2><span className="catalog-mode-count">{mode === 'building' ? '4' : mode === 'asset' ? `${catalogAssets.length}/${catalog.packages.reduce((sum, entry) => sum + entry.exported, 0)}` : '01'}</span></div>
      {mode === 'building' ? <div className="asset-list">
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
      </div> : mode === 'asset' ? <CatalogBrowser assets={catalogAssets} packages={catalogPackages(catalog)} categories={catalogCategories(catalog)} query={catalogQuery} packageId={catalogPackage} category={catalogCategory} selectedAssetId={selectedCatalogAssetId} onQuery={onCatalogQuery} onPackage={onCatalogPackage} onCategory={onCatalogCategory} onSelect={onCatalogSelect} /> : <SceneAssetBrowser selected={selectedCatalogAssetId === 'jc-lp-megacity-demo'} onSelect={onSceneSelect} />}
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
