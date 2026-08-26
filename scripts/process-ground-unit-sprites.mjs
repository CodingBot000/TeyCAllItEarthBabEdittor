import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourcePath = path.join(projectRoot, 'art-source/battlescene/maps/city-night/ground-units-bundle-raw.png');
const shadowSourcePath = path.join(projectRoot, 'assets/battlescene/shared/units/ground-unit-shadow.svg');
const outputRoot = path.join(projectRoot, 'public/assets/runtime/sprites');
const cellSize = 627;
const padding = 4;
const units = [
  { name: 'ground-defender-mobile-side.png', column: 0, row: 0 },
  { name: 'ground-radar-facility-side.png', column: 1, row: 0 },
  { name: 'ground-airbase-facility-side.png', column: 0, row: 1 },
  { name: 'ground-power-facility-side.png', column: 1, row: 1 },
];

await fs.mkdir(outputRoot, { recursive: true });
await fs.copyFile(shadowSourcePath, path.join(outputRoot, 'ground-unit-shadow.svg'));
const { data, info } = await sharp(sourcePath).raw().toBuffer({ resolveWithObject: true });
const outputs = [];

for (const unit of units) {
  const cell = extractCell(unit);
  const outputPath = path.join(outputRoot, unit.name);
  await sharp(cell.data, { raw: { width: cell.width, height: cell.height, channels: 4 } }).png().toFile(outputPath);
  outputs.push({ file: unit.name, width: cell.width, height: cell.height, bottomTrimmed: true });
}

const manifest = { source: path.relative(projectRoot, sourcePath), shadow: path.relative(projectRoot, shadowSourcePath), outputs };
await fs.writeFile(path.join(outputRoot, 'ground-unit-sprites.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));

function extractCell(unit) {
  const left = unit.column * cellSize;
  const top = unit.row * cellSize;
  const alpha = new Uint8Array(cellSize * cellSize);
  let minX = cellSize;
  let minY = cellSize;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < cellSize; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      const sourceIndex = ((top + y) * info.width + left + x) * info.channels;
      const r = data[sourceIndex];
      const g = data[sourceIndex + 1];
      const b = data[sourceIndex + 2];
      const distance = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
      const pixelAlpha = distance < 70 ? 0 : distance < 150 ? Math.round((distance - 70) / 80 * 255) : 255;
      alpha[y * cellSize + x] = pixelAlpha;
      if (pixelAlpha > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0 || maxY < 0) throw new Error(`No sprite content found for ${unit.name}.`);
  const cropLeft = Math.max(0, minX - padding);
  const cropTop = Math.max(0, minY - padding);
  const cropRight = Math.min(cellSize - 1, maxX + padding);
  const cropBottom = maxY;
  const width = cropRight - cropLeft + 1;
  const height = cropBottom - cropTop + 1;
  const output = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((top + cropTop + y) * info.width + left + cropLeft + x) * info.channels;
      const alphaIndex = (cropTop + y) * cellSize + cropLeft + x;
      const outputIndex = (y * width + x) * 4;
      const pixelAlpha = alpha[alphaIndex];
      output[outputIndex] = pixelAlpha === 0 ? 0 : data[sourceIndex];
      output[outputIndex + 1] = pixelAlpha === 0 ? 0 : data[sourceIndex + 1];
      output[outputIndex + 2] = pixelAlpha === 0 ? 0 : data[sourceIndex + 2];
      output[outputIndex + 3] = pixelAlpha;
    }
  }

  return { data: output, width, height };
}
