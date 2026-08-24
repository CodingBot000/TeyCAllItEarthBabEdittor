import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'art-source', 'buildings');
const runtimeRoot = path.join(projectRoot, 'public', 'assets', 'buildings');

const catalog = {
  'building-001': { displayName: 'Brown Mid-rise Texture Test', dimensions: { width: 6, height: 11, depth: 5 } },
  'building-002': { displayName: 'Foreground Light Office Tower', dimensions: { width: 6, height: 12, depth: 5 } },
  'building-003': { displayName: 'Warm Brown Balcony Mid-rise', dimensions: { width: 8, height: 8, depth: 5 } },
  'building-004': { displayName: 'White and Brown Stepped Apartments', dimensions: { width: 8, height: 9, depth: 6 } },
};
const faces = ['front', 'back', 'right', 'left', 'roof', 'bottom'];

await fs.mkdir(runtimeRoot, { recursive: true });

for (const [id, definition] of Object.entries(catalog)) {
  const sourceDir = path.join(sourceRoot, id);
  const targetDir = path.join(runtimeRoot, id);
  await fs.mkdir(targetDir, { recursive: true });
  for (const face of faces) {
    const correctedInput = face === 'left' ? path.join(sourceDir, 'left.corrected.png') : path.join(sourceDir, `${face}.png`);
    const fallbackInput = path.join(sourceDir, `${face}.png`);
    const input = await exists(correctedInput) ? correctedInput : fallbackInput;
    await sharp(input).webp({ quality: 86, effort: 4 }).toFile(path.join(targetDir, `${face}.webp`));
  }
  const atlasInput = await firstExisting([
    path.join(sourceDir, 'atlas.png'),
    path.join(sourceDir, 'atlas.generated.png'),
    path.join(sourceDir, 'atlas.source.webp'),
  ]);
  await sharp(atlasInput).webp({ quality: 86, effort: 4 }).toFile(path.join(targetDir, 'atlas.webp'));
  const manifest = {
    id,
    displayName: definition.displayName,
    dimensions: definition.dimensions,
    atlas: `buildings/${id}/atlas.webp`,
    faces: Object.fromEntries(faces.map((face) => [face, `buildings/${id}/${face}.webp`])),
    mappingPreset: 'docs/battlescene/building_texture_mapping_preset.json',
    sourceReference: 'art-source/references/thetcall_inbattle_2d_day.png',
    notes: 'Generated from the preserved source images. The reference image is not used as a runtime texture.',
  };
  await fs.writeFile(path.join(targetDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`built ${id}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstExisting(candidates) {
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error(`No atlas source found. Tried: ${candidates.join(', ')}`);
}
