import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceRoot = path.join(projectRoot, 'art-source/battlescene/maps/city-night');
const masterSource = path.join(sourceRoot, 'night-master-v2.png');
const groundSource = path.join(sourceRoot, 'night-ground-sideview-v2.png');
const targetRoots = [
  path.join(projectRoot, 'assets/battlescene/maps/city-night/backgrounds'),
  path.join(projectRoot, 'public/assets/runtime/battlescene/maps/city-night/backgrounds'),
];

const WIDTH = 1672;
const HEIGHT = 941;
const GROUND_WIDTH = 2048;
const GROUND_HEIGHT = 724;

await Promise.all(targetRoots.map((root) => fs.mkdir(root, { recursive: true })));

const masterBuffer = await sharp(masterSource)
  .resize(WIDTH, HEIGHT, { fit: 'fill' })
  .removeAlpha()
  .png()
  .toBuffer();

const skyBuffer = await createSkyLayer(masterBuffer);
const layers = [
  ['sky-night-base.webp', skyBuffer],
  ['clouds-night.webp', await createMaskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 },
    { offset: 0.18, opacity: 0.06 },
    { offset: 0.34, opacity: 0.1 },
    { offset: 0.5, opacity: 0 },
    { offset: 1, opacity: 0 },
  ], WIDTH, HEIGHT, 2.8)],
  ['city-far-night.webp', await createMaskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 },
    { offset: 0.26, opacity: 0 },
    { offset: 0.32, opacity: 0.94 },
    { offset: 0.52, opacity: 0.94 },
    { offset: 0.58, opacity: 0 },
    { offset: 1, opacity: 0 },
  ], WIDTH, HEIGHT, 0.4)],
  ['city-middle-night.webp', await createMaskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 },
    { offset: 0.49, opacity: 0 },
    { offset: 0.55, opacity: 0.96 },
    { offset: 0.7, opacity: 0.96 },
    { offset: 0.76, opacity: 0 },
    { offset: 1, opacity: 0 },
  ], WIDTH, HEIGHT, 0.3, true)],
  ['city-near-night.webp', await createMaskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 },
    { offset: 0.68, opacity: 0 },
    { offset: 0.74, opacity: 0.98 },
    { offset: 1, opacity: 0.98 },
  ], 1774, 887, 0.3)],
  ['ground-sideview-night.webp', await createGroundLayer(groundSource)],
  ['foreground-atmosphere-night.webp', await createMaskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 },
    { offset: 0.64, opacity: 0 },
    { offset: 0.82, opacity: 0.035 },
    { offset: 1, opacity: 0.1 },
  ], WIDTH, HEIGHT, 1.8)],
];

for (const [name, buffer] of layers) {
  await Promise.all(targetRoots.map((root) => fs.writeFile(path.join(root, name), buffer)));
}

console.log(`Generated ${layers.length} independent city-night layers from ${path.relative(projectRoot, masterSource)}.`);

async function createSkyLayer(masterBuffer) {
  return sharp(masterBuffer)
    .extract({ left: 0, top: 0, width: WIDTH, height: 300 })
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .blur(1.6)
    .modulate({ brightness: 0.78, saturation: 0.86 })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
}

async function createMaskedLayer(masterBuffer, stops, width, height, blurSigma, opaque = false) {
  const maskSvg = Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="mask" x1="0" y1="0" x2="0" y2="1">${stops.map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="white" stop-opacity="${stop.opacity}"/>`).join('')}</linearGradient></defs><rect width="100%" height="100%" fill="url(#mask)"/></svg>`);
  let image = sharp(masterBuffer).resize(width, height, { fit: 'fill' }).removeAlpha();
  if (blurSigma > 0) image = image.blur(blurSigma);
  const alpha = await sharp(maskSvg).extractChannel(3).raw().toBuffer();
  if (opaque) alpha.fill(255);
  const rgb = await image.raw().toBuffer();
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] >= 8) continue;
    const offset = index * 3;
    rgb[offset] = 10;
    rgb[offset + 1] = 22;
    rgb[offset + 2] = 37;
  }
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .webp({ quality: 78, alphaQuality: 88, effort: 6 })
    .toBuffer();
}

async function createGroundLayer(sourcePath) {
  const source = await sharp(sourcePath)
    .resize(GROUND_WIDTH, GROUND_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const maskSvg = Buffer.from(`<svg width="${GROUND_WIDTH}" height="${GROUND_HEIGHT}"><defs><linearGradient id="mask" x1="0" y1="0" x2="0" y2="1"><stop offset="72.5%" stop-color="black"/><stop offset="73.4%" stop-color="white"/><stop offset="91.0%" stop-color="white"/><stop offset="92.0%" stop-color="black"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#mask)"/></svg>`);
  const alpha = await sharp(maskSvg).extractChannel(0).raw().toBuffer();
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] >= 8) continue;
    const offset = index * 3;
    source[offset] = 2;
    source[offset + 1] = 10;
    source[offset + 2] = 18;
  }
  return sharp(source, { raw: { width: GROUND_WIDTH, height: GROUND_HEIGHT, channels: 3 } })
    .joinChannel(alpha, { raw: { width: GROUND_WIDTH, height: GROUND_HEIGHT, channels: 1 } })
    .webp({ quality: 78, alphaQuality: 88, effort: 6 })
    .toBuffer();
}
