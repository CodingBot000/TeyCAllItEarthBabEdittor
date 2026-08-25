import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const sourceRoot = path.join(projectRoot, 'art-source/battlescene/maps/city-night');
const masterSource = path.join(sourceRoot, 'night-master-v2.png');
const groundSource = path.join(sourceRoot, 'night-ground-sideview-v2.png');
const cityLayerSources = {
  far: path.join(sourceRoot, 'city-far-night-v3-raw.png'),
  middle: path.join(sourceRoot, 'city-middle-night-v3-raw.png'),
  near: path.join(sourceRoot, 'city-near-night-v4-raw.png'),
};
const cityLayerCleanSources = {
  far: path.join(sourceRoot, 'city-far-night-v3.png'),
  middle: path.join(sourceRoot, 'city-middle-night-v3.png'),
  near: path.join(sourceRoot, 'city-near-night-v4.png'),
};
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
  ['city-far-night.webp', await createCityLayer(cityLayerSources.far, cityLayerCleanSources.far, 200)],
  ['city-middle-night.webp', await createCityLayer(cityLayerSources.middle, cityLayerCleanSources.middle)],
  ['city-near-night.webp', await createCityLayer(cityLayerSources.near, cityLayerCleanSources.near, -140)],
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

console.log(`Generated ${layers.length} independent city-night layers from ${path.relative(projectRoot, masterSource)} and explicit city layer sources.`);

async function createSkyLayer(masterBuffer) {
  return sharp(masterBuffer)
    .extract({ left: 0, top: 0, width: WIDTH, height: 300 })
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .blur(1.6)
    .modulate({ brightness: 0.78, saturation: 0.86 })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
}

async function createCityLayer(sourcePath, cleanSourcePath, verticalOffset = 0) {
  const { data, info } = await sharp(sourcePath)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = removeGeneratedCheckerboard(data, info.width, info.height);
  const shifted = shiftRgbaLayer(data, alpha, info.width, info.height, verticalOffset);
  const rgba = sharp(shifted.rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .joinChannel(shifted.alpha, { raw: { width: info.width, height: info.height, channels: 1 } });
  const [webpBuffer] = await Promise.all([
    rgba.clone().webp({ quality: 80, alphaQuality: 92, effort: 6 }).toBuffer(),
    rgba.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(cleanSourcePath),
  ]);
  return webpBuffer;
}

function removeGeneratedCheckerboard(rgb, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isCheckerLike = (pixelIndex) => {
    const offset = pixelIndex * 3;
    const red = rgb[offset];
    const green = rgb[offset + 1];
    const blue = rgb[offset + 2];
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    return minimum >= 125 && maximum - minimum <= 42;
  };

  const enqueue = (pixelIndex) => {
    if (visited[pixelIndex] || !isCheckerLike(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }

  const alpha = Buffer.alloc(width * height, 255);
  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    if (!visited[pixelIndex]) continue;
    alpha[pixelIndex] = 0;
    const offset = pixelIndex * 3;
    rgb[offset] = 2;
    rgb[offset + 1] = 10;
    rgb[offset + 2] = 18;
  }
  return alpha;
}

function shiftRgbaLayer(rgb, alpha, width, height, verticalOffset) {
  const offset = Math.max(-height + 1, Math.min(height - 1, verticalOffset));
  if (offset === 0) return { rgb, alpha };
  const shiftedRgb = Buffer.alloc(rgb.length, 2);
  const shiftedAlpha = Buffer.alloc(alpha.length, 0);
  for (let y = 0; y < height; y += 1) {
    const targetY = y + offset;
    if (targetY < 0 || targetY >= height) continue;
    const sourceRgbOffset = y * width * 3;
    const targetRgbOffset = targetY * width * 3;
    rgb.copy(shiftedRgb, targetRgbOffset, sourceRgbOffset, sourceRgbOffset + width * 3);
    alpha.copy(shiftedAlpha, targetY * width, y * width, (y + 1) * width);
  }
  return { rgb: shiftedRgb, alpha: shiftedAlpha };
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
