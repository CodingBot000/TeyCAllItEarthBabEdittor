import type { CatalogAsset } from '../../domain/assetCatalog';
import { catalogDisplayName } from '../../domain/assetCatalog';

interface CatalogBrowserProps {
  assets: CatalogAsset[];
  packages: string[];
  categories: string[];
  query: string;
  packageId: string;
  category: string;
  selectedAssetId: string | null;
  onQuery: (value: string) => void;
  onPackage: (value: string) => void;
  onCategory: (value: string) => void;
  onSelect: (asset: CatalogAsset) => void;
}

export function CatalogBrowser({ assets, packages, categories, query, packageId, category, selectedAssetId, onQuery, onPackage, onCategory, onSelect }: CatalogBrowserProps) {
  return (
    <section className="catalog-browser" aria-label="GLB catalog browser">
      <div className="catalog-toolbar">
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="SEARCH ASSET ID" aria-label="Search catalog assets" />
        <select value={packageId} onChange={(event) => onPackage(event.target.value)} aria-label="Filter catalog package">
          <option value="">ALL PACKAGES</option>
          {packages.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
        </select>
        <select value={category} onChange={(event) => onCategory(event.target.value)} aria-label="Filter catalog category">
          <option value="">ALL CATEGORIES</option>
          {categories.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
        </select>
      </div>
      <div className="catalog-summary">{assets.length} CATALOG ASSETS · LOAD ONE ON SELECT</div>
      <div className="catalog-list">
        {assets.map((asset) => {
          const selected = selectedAssetId === asset.id;
          return (
            <button key={asset.id} type="button" className={`catalog-row${selected ? ' selected' : ''}`} onClick={() => onSelect(asset)}>
              <span className="catalog-row-mark">{selected ? '●' : '○'}</span>
              <span className="catalog-row-copy"><strong>{catalogDisplayName(asset)}</strong><span>{asset.package} · {asset.category}</span></span>
              <span className="catalog-row-size">{formatBytes(asset.fileBytes)}</span>
            </button>
          );
        })}
        {!assets.length ? <div className="catalog-empty">NO CATALOG ASSETS MATCH</div> : null}
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
