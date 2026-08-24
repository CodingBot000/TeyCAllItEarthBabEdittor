import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const assetRoot = join(root, 'local-assets', 'glb');
const catalogRoot = join(root, 'local-assets', 'glb', 'catalog');

function findFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? findFiles(path) : [path];
  });
}

const files = findFiles(assetRoot).filter((file) => file.endsWith('.glb'));
const catalogFilesOnDisk = files.filter((file) => file.includes(`${join('local-assets', 'glb', 'catalog')}/`));
const invalid = [];
for (const file of files) {
  const stat = statSync(file);
  const magic = readFileSync(file, { encoding: null }).subarray(0, 4).toString('ascii');
  if (stat.size < 20 || magic !== 'glTF') invalid.push(`${file}: size=${stat.size}, magic=${magic}`);
}

const catalogFiles = findFiles(catalogRoot).filter((file) => file.endsWith('/catalog.json'));
const catalogCounts = catalogFiles.map((file) => {
  const catalog = JSON.parse(readFileSync(file, 'utf8'));
  const exported = (catalog.assets ?? []).filter((asset) => asset.status === 'exported').length;
  return `${catalog.packageId}=${exported}`;
});

if (invalid.length) {
  console.error('External GLB validation failed:');
  invalid.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}

console.log(`External GLB validation passed: catalog=${catalogFilesOnDisk.length}, total=${files.length} GLB files, catalogs ${catalogCounts.join(', ') || 'none'}`);
