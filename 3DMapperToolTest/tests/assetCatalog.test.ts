import { describe, expect, it } from 'vitest';
import catalogIndex from '../src/data/catalogs/catalog-index.json';
import { catalogAssets, catalogExportedAssets, parseAssetCatalogIndex } from '../src/domain/assetCatalog';
import { catalogAssetUrl, metadataForCatalogAsset } from '../src/engine/babylon/assetSourceResolver';
import sceneProject from '../projects/samples/jc-lp-megacity-demo.scene.json';
import { parseSceneProject } from '../src/domain/sceneProjectSchema';

describe('external GLB catalog', () => {
  it('parses catalog metadata without retaining absolute source paths', () => {
    const index = parseAssetCatalogIndex(catalogIndex);
    const asset = catalogAssets(index).find((entry) => entry.package === 'simpletown-city');

    expect(index.packages).toHaveLength(8);
    expect(catalogExportedAssets(index)).toHaveLength(1281);
    expect(catalogAssets(index)).toHaveLength(1282);
    expect(index.packages.find((entry) => entry.packageId === 'simpletown-city')?.exported).toBe(209);
    if (!asset) throw new Error('simpletown-city test asset is missing');
    expect(asset.glbPath).toMatch(/^\/assets\/runtime\/models\/catalog\//);
    expect(asset).not.toHaveProperty('absoluteGlbPath');
  });

  it('resolves the same logical asset to local and remote URLs', () => {
    const asset = catalogExportedAssets(parseAssetCatalogIndex(catalogIndex)).find((entry) => entry.package === 'simpletown-city');
    if (!asset) throw new Error('simpletown-city test asset is missing');
    expect(catalogAssetUrl(asset)).toContain('/__local_glb__/catalog/simpletown-city/');
    expect(catalogAssetUrl(asset, 'https://cdn.example.test/glb')).toContain('https://cdn.example.test/glb/catalog/simpletown-city/');
    expect(metadataForCatalogAsset(asset)).toMatchObject({ assetId: asset.id, category: asset.category, packageId: 'simpletown-city' });
  });

  it('accepts the JC LP MegaCity layout as a scene project', () => {
    const project = parseSceneProject(sceneProject);
    expect(project.mapId).toBe('jc-lp-megacity-demo');
    expect(project.objects).toHaveLength(4160);
    expect(project.objects[0]).toMatchObject({ instanceId: 'lp-megacity-demo-00001', category: 'scene' });
  });
});
