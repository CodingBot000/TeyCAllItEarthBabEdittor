import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 2048;
const HEIGHT = 724;
const biomes = [
  {
    id: 'river-day',
    displayName: 'River Metropolis',
    source: 'art-source/battlescene/maps/river/river-metropolis-master-v1.png',
    curatedLayers: {
      far: 'art-source/battlescene/maps/river/layers-v2/river-far-v2.png',
      middle: 'art-source/battlescene/maps/river/layers-v2/river-middle-v2.png',
      near: 'art-source/battlescene/maps/river/layers-v2/river-near-v2.png',
      ground: 'art-source/battlescene/maps/river/layers-v2/river-ground-v2.png',
    },
    outputNames: { sky: 'sky-river-day-base.webp', clouds: 'clouds-river-day.webp', far: 'city-far-river-day-v2.webp', middle: 'city-middle-river-day-v2.webp', near: 'city-near-river-day-v2.webp', ground: 'ground-river-day-v2.webp', foreground: 'foreground-atmosphere-river-day.webp' },
  },
  {
    id: 'desert-day',
    displayName: 'Desert Tech Hub',
    source: 'art-source/battlescene/maps/desert/desert-tech-hub-master-v1.png',
    curatedLayers: {
      far: 'art-source/battlescene/maps/desert/layers-v2/desert-far-v2.png',
      middle: 'art-source/battlescene/maps/desert/layers-v2/desert-middle-v2.png',
      near: 'art-source/battlescene/maps/desert/layers-v2/desert-near-v2.png',
      ground: 'art-source/battlescene/maps/desert/layers-v2/desert-ground-v2.png',
    },
    outputNames: { sky: 'sky-desert-day-base.webp', clouds: 'clouds-desert-day.webp', far: 'city-far-desert-day-v2.webp', middle: 'city-middle-desert-day-v2.webp', near: 'city-near-desert-day-v2.webp', ground: 'ground-desert-day-v2.webp', foreground: 'foreground-atmosphere-desert-day.webp' },
  },
];

for (const biome of biomes) await buildBiome(biome);

async function buildBiome(biome) {
  const assetRoot = path.join('assets/battlescene/maps', biome.id);
  const assetBackgrounds = path.join(assetRoot, 'backgrounds');
  const runtimeRoot = path.join('public/assets/runtime/battlescene/maps', biome.id);
  const runtimeBackgrounds = path.join(runtimeRoot, 'backgrounds');
  await Promise.all([mkdir(assetBackgrounds, { recursive: true }), mkdir(runtimeBackgrounds, { recursive: true })]);
  const master = sharp(biome.source).resize(WIDTH, HEIGHT, { fit: 'fill' }).ensureAlpha();
  const masterBuffer = await master.png().toBuffer();
  const skyBuffer = await sharp(masterBuffer).extract({ left: 0, top: 0, width: WIDTH, height: 250 }).resize(WIDTH, HEIGHT, { fit: 'fill' }).blur(2.2).webp({ quality: 88 }).toBuffer();
  const cloudsBuffer = await maskedLayer(masterBuffer, [
    { offset: 0, opacity: 0 }, { offset: 0.04, opacity: 0.18 }, { offset: 0.28, opacity: 0.14 }, { offset: 0.42, opacity: 0 }, { offset: 1, opacity: 0 },
  ], 2.8);
  const farBuffer = await curatedLayerOrMask(biome.curatedLayers.far, masterBuffer, [
    { offset: 0, opacity: 0 }, { offset: 0.16, opacity: 0.05 }, { offset: 0.28, opacity: 0.9 }, { offset: 0.62, opacity: 0.82 }, { offset: 0.7, opacity: 0 }, { offset: 1, opacity: 0 },
  ], 1.4);
  const middleBuffer = await curatedLayerOrMask(biome.curatedLayers.middle, masterBuffer, [
    { offset: 0, opacity: 0 }, { offset: 0.38, opacity: 0 }, { offset: 0.48, opacity: 0.9 }, { offset: 0.77, opacity: 0.92 }, { offset: 0.83, opacity: 0 }, { offset: 1, opacity: 0 },
  ], 0.7);
  const nearBuffer = await curatedLayerOrMask(biome.curatedLayers.near, masterBuffer, [
    { offset: 0, opacity: 0 }, { offset: 0.62, opacity: 0 }, { offset: 0.71, opacity: 0.95 }, { offset: 0.9, opacity: 0.96 }, { offset: 0.94, opacity: 0 }, { offset: 1, opacity: 0 },
  ], 0.3);
  const groundBuffer = await curatedLayerOrMask(biome.curatedLayers.ground, masterBuffer, [
    { offset: 0, opacity: 0 }, { offset: 0.82, opacity: 0 }, { offset: 0.9, opacity: 1 }, { offset: 1, opacity: 1 },
  ], 0);
  const foregroundBuffer = await createForegroundAtmosphere(biome.id);
  const outputs = [
    [biome.outputNames.sky, skyBuffer],
    [biome.outputNames.clouds, cloudsBuffer],
    [biome.outputNames.far, farBuffer],
    [biome.outputNames.middle, middleBuffer],
    [biome.outputNames.near, nearBuffer],
    [biome.outputNames.ground, groundBuffer],
    [biome.outputNames.foreground, foregroundBuffer],
  ];
  for (const [name, buffer] of outputs) {
    await Promise.all([writeFile(path.join(assetBackgrounds, name), buffer), writeFile(path.join(runtimeBackgrounds, name), buffer)]);
  }
  const preview = await sharp(skyBuffer)
    .composite([cloudsBuffer, farBuffer, middleBuffer, nearBuffer, groundBuffer, foregroundBuffer].map((input) => ({ input })))
    .png()
    .toBuffer();
  await writeFile(path.join(assetRoot, 'layered-preview-v2.png'), preview);
  const manifest = {
    id: biome.id,
    version: 2,
    displayName: biome.displayName,
    assetRoot: `battlescene/maps/${biome.id}`,
    backgrounds: {
      sky: `backgrounds/${biome.outputNames.sky}`,
      clouds: `backgrounds/${biome.outputNames.clouds}`,
      far: `backgrounds/${biome.outputNames.far}`,
      middle: `backgrounds/${biome.outputNames.middle}`,
      near: `backgrounds/${biome.outputNames.near}`,
      ground: `backgrounds/${biome.outputNames.ground}`,
      foregroundAtmosphere: `backgrounds/${biome.outputNames.foreground}`,
    },
    sharedMaterials: {
      mothershipHullBaseColor: 'battlescene/shared/mothership/mapping/mothership-hull-disc-basecolor.webp',
      mothershipHullHeightSource: 'battlescene/shared/mothership/mapping/mothership-hull-height-source.webp',
      mothershipEmissiveDecals: 'battlescene/shared/mothership/mapping/mothership-emissive-decals.webp',
    },
    camera: { viewportSpanScreens: 3, travelScreensFromStart: 1, fovDegrees: 35 },
    parallax: { sky: 0, clouds: 0, far: 0.15, middle: 0.35, near: 0.6, ground: 1, foregroundAtmosphere: 0.8 },
  };
  const manifestBuffer = `${JSON.stringify(manifest, null, 2)}\n`;
  await Promise.all([writeFile(path.join(assetRoot, 'map.manifest.json'), manifestBuffer), writeFile(path.join(runtimeRoot, 'map.manifest.json'), manifestBuffer)]);
}

async function curatedLayerOrMask(sourcePath, masterBuffer, stops, blurSigma) {
  if (!existsSync(sourcePath)) return maskedLayer(masterBuffer, stops, blurSigma);
  return sharp(sourcePath)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .ensureAlpha()
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
}

async function maskedLayer(masterBuffer, stops, blurSigma) {
  const gradientStops = stops.map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="white" stop-opacity="${stop.opacity}"/>`).join('');
  const mask = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}"><defs><linearGradient id="mask" x1="0" y1="0" x2="0" y2="1">${gradientStops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#mask)"/></svg>`);
  let image = sharp(masterBuffer).removeAlpha();
  if (blurSigma > 0) image = image.blur(blurSigma);
  const rgb = await image.png().toBuffer();
  const alpha = await sharp(mask).extractChannel('alpha').raw().toBuffer();
  return sharp(rgb).joinChannel(alpha, { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
}

async function createForegroundAtmosphere(id) {
  const color = id === 'river-day' ? '105,205,225' : '236,180,105';
  const svg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}"><defs><linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgb(${color})" stop-opacity="0"/><stop offset="68%" stop-color="rgb(${color})" stop-opacity="0"/><stop offset="100%" stop-color="rgb(${color})" stop-opacity="0.12"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#fog)"/></svg>`);
  return sharp(svg).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
}
