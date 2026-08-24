import type { CatalogAsset } from '../../domain/assetCatalog';
import type { MapperAssetMetadata } from '../../domain/assetMetadata';

export type GlbAssetSource =
  | { kind: 'file'; file: File; metadata?: Partial<MapperAssetMetadata> }
  | { kind: 'catalog'; asset: CatalogAsset }
  | { kind: 'scene'; sceneId: string; url: string; metadata?: Partial<MapperAssetMetadata> }
  | { kind: 'indexed-db'; key: string; fileName: string; file: File; metadata?: Partial<MapperAssetMetadata> };

export interface ResolvedGlbAsset {
  url: string;
  fileName: string;
  metadata: Partial<MapperAssetMetadata>;
  revokeUrl: boolean;
}

export function catalogAssetUrl(asset: CatalogAsset, baseUrl = import.meta.env.VITE_GLB_ASSET_BASE_URL): string {
  const relativePath = asset.glbPath
    .replace(/^\/+/, '')
    .replace(/^assets\/runtime\/models\//, '');
  const externalBase = baseUrl?.trim().replace(/\/$/, '');
  return externalBase ? `${externalBase}/${relativePath}` : `/__local_glb__/${relativePath}`;
}

export function metadataForCatalogAsset(asset: CatalogAsset): MapperAssetMetadata {
  return {
    assetId: asset.id,
    instanceId: `${asset.id}-instance-1`,
    category: asset.category,
    packageId: asset.package,
    sourcePath: asset.sourcePath,
    glbPath: asset.glbPath,
    nodeName: asset.rootName,
  };
}

export function resolveGlbAssetSource(source: GlbAssetSource): ResolvedGlbAsset {
  if (source.kind === 'catalog') {
    return {
      url: catalogAssetUrl(source.asset),
      fileName: `${source.asset.id.split('.').at(-1) ?? source.asset.id}.glb`,
      metadata: metadataForCatalogAsset(source.asset),
      revokeUrl: false,
    };
  }
  if (source.kind === 'scene') {
    return {
      url: source.url,
      fileName: source.sceneId.endsWith('.glb') ? source.sceneId : `${source.sceneId}.glb`,
      metadata: source.metadata ?? { assetId: source.sceneId, instanceId: `${source.sceneId}-instance-1`, category: 'scene', glbPath: source.url, nodeName: source.sceneId },
      revokeUrl: false,
    };
  }
  const url = URL.createObjectURL(source.file);
  return {
    url,
    fileName: source.file.name,
    metadata: source.metadata ?? { assetId: source.file.name, instanceId: `${source.file.name}-instance-1`, category: 'imported', glbPath: source.file.name, nodeName: source.file.name },
    revokeUrl: true,
  };
}
