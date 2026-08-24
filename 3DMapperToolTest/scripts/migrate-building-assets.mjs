import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceProject = path.resolve(getArgument('--source-root') ?? path.join(projectRoot, '..', 'TeyCAllItEarthBabEdittor'));

const mappings = [
  [path.join(sourceProject, 'art-source', 'battlescene', 'maps', 'city-day', 'buildings'), path.join(projectRoot, 'art-source', 'buildings')],
  [path.join(sourceProject, 'public', 'assets', 'runtime', 'battlescene', 'maps', 'city-day', 'buildings'), path.join(projectRoot, 'public', 'assets', 'buildings')],
];

for (const [source, target] of mappings) {
  await fs.mkdir(target, { recursive: true });
  await copyDirectory(source, target);
  console.log(`copied ${source} -> ${target}`);
}

const referenceSource = path.join(sourceProject, 'docs', 'reference_images', 'thetcall_inbattle_2d_day.png');
const referenceTarget = path.join(projectRoot, 'art-source', 'references', 'thetcall_inbattle_2d_day.png');
await fs.mkdir(path.dirname(referenceTarget), { recursive: true });
await fs.copyFile(referenceSource, referenceTarget);
console.log(`copied ${referenceSource} -> ${referenceTarget}`);

async function copyDirectory(source, target) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(targetPath, { recursive: true });
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
