import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const outputRoot = path.join(projectRoot, 'public/assets/runtime/sprites');
const assets = [
  {
    source: 'assets/_weapon-temp/final/organic-shelter-with-crowd-composite-v2-preview.png',
    output: 'target-organic-shelter-with-crowd-y0-web.webp',
  },
  {
    source: 'assets/_weapon-temp/final/organic-shelter-damaged-with-crowd-composite-v1-preview.png',
    output: 'target-organic-shelter-damaged-with-crowd-y0-web.webp',
  },
];

await fs.mkdir(outputRoot, { recursive: true });
const outputs = [];
for (const asset of assets) {
  const sourcePath = path.join(projectRoot, asset.source);
  const outputPath = path.join(outputRoot, asset.output);
  const info = await sharp(sourcePath)
    .resize({ width: 768, withoutEnlargement: true })
    .ensureAlpha()
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(outputPath);
  outputs.push({ file: asset.output, width: info.width, height: info.height, source: asset.source });
}

console.log(JSON.stringify({ outputs }, null, 2));
