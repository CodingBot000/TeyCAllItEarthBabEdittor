import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceRoot = path.join(projectRoot, 'public/assets/runtime/battlescene/maps/city-day/backgrounds');
const targetRoot = path.join(projectRoot, 'public/assets/runtime/battlescene/maps/city-night/backgrounds');
const editorTargetRoot = path.join(projectRoot, 'assets/battlescene/maps/city-night/backgrounds');
const files = [
  'sky-day-base.webp',
  'clouds-day.webp',
  'city-far-day.webp',
  'city-middle-day.webp',
  'city-near-day.webp',
  'ground-road-day.webp',
  'foreground-atmosphere-day.webp',
];

await fs.mkdir(targetRoot, { recursive: true });
await fs.mkdir(editorTargetRoot, { recursive: true });
for (const file of files) {
  const target = file.replace('-day', '-night');
  await sharp(path.join(sourceRoot, file))
    .modulate({ brightness: 0.48, saturation: 0.72, hue: 218 })
    .tint({ r: 22, g: 38, b: 78 })
    .webp({ quality: 82, alphaQuality: 88, effort: 6 })
    .toFile(path.join(targetRoot, target));
  await fs.copyFile(path.join(targetRoot, target), path.join(editorTargetRoot, target));
}

console.log(`Generated ${files.length} city-night WebP layers.`);
