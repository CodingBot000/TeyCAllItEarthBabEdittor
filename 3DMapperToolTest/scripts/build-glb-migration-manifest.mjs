import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const catalogRoot = join(root, 'local-assets', 'glb', 'catalog');
const output = join(root, 'src', 'data', 'catalogs', 'catalog-index.json');

function findCatalogs(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findCatalogs(path) : path.endsWith('/catalog.json') ? [path] : [];
  });
}

const packages = findCatalogs(catalogRoot).map((file) => {
  const catalog = JSON.parse(readFileSync(file, 'utf8'));
  return {
    packageId: catalog.packageId,
    sourceRoot: catalog.sourceRoot,
    generatedAtUtc: catalog.generatedAtUtc,
    total: catalog.total,
    exported: catalog.exported,
    failed: catalog.failed,
    assets: (catalog.assets ?? []).map(({ absoluteGlbPath, ...asset }) => asset),
  };
});

mkdirSync(join(root, 'src', 'data', 'catalogs'), { recursive: true });
writeFileSync(output, `${JSON.stringify({ generatedAtUtc: new Date().toISOString(), packages }, null, 2)}\n`);
console.log(`Wrote ${output}: ${packages.reduce((sum, entry) => sum + entry.assets.length, 0)} catalog assets`);
