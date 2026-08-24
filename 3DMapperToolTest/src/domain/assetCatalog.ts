import { z } from 'zod';

const catalogAssetSchema = z.object({
  id: z.string().min(1),
  sourcePath: z.string(),
  sourceRelativePath: z.string(),
  package: z.string().min(1),
  category: z.string().min(1),
  glbPath: z.string().min(1),
  rootName: z.string().min(1),
  status: z.string().min(1),
  fileBytes: z.number().int().nonnegative(),
  error: z.string().optional(),
});

export const assetCatalogPackageSchema = z.object({
  packageId: z.string().min(1),
  sourceRoot: z.string().min(1),
  generatedAtUtc: z.string().min(1),
  total: z.number().int().nonnegative(),
  exported: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  assets: z.array(catalogAssetSchema),
});

export const assetCatalogIndexSchema = z.object({
  generatedAtUtc: z.string().min(1),
  packages: z.array(assetCatalogPackageSchema),
});

export type CatalogAsset = z.infer<typeof catalogAssetSchema>;
export type AssetCatalogPackage = z.infer<typeof assetCatalogPackageSchema>;
export type AssetCatalogIndex = z.infer<typeof assetCatalogIndexSchema>;

export function parseAssetCatalogIndex(value: unknown): AssetCatalogIndex {
  return assetCatalogIndexSchema.parse(value);
}

export function catalogAssets(index: AssetCatalogIndex): CatalogAsset[] {
  return index.packages.flatMap((entry) => entry.assets);
}

export function catalogExportedAssets(index: AssetCatalogIndex): CatalogAsset[] {
  return catalogAssets(index).filter((asset) => asset.status === 'exported');
}

export function catalogCategories(index: AssetCatalogIndex): string[] {
  return [...new Set(catalogExportedAssets(index).map((asset) => asset.category))].sort();
}

export function catalogPackages(index: AssetCatalogIndex): string[] {
  return index.packages.filter((entry) => entry.exported > 0).map((entry) => entry.packageId).sort();
}

export function catalogDisplayName(asset: CatalogAsset): string {
  return asset.id.split('.').at(-1) ?? asset.id;
}
