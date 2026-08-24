import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-biome-art';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];

try {
  const cases = [
    { city: 'shanghai', mapId: 'river-day', key: 'ArrowLeft', image: 'river-left.png' },
    { city: 'dubai', mapId: 'desert-day', key: 'ArrowRight', image: 'desert-right.png' },
  ];
  const results = [];
  for (const testCase of cases) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${testCase.mapId}: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${testCase.mapId}: ${String(error)}`));
    await page.goto(`${baseUrl}/?debug=battle&city=${testCase.city}&battle-fast=1&battle-fallback=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
    await page.keyboard.down(testCase.key);
    await page.evaluate(() => window.advanceTime?.(2400));
    await page.keyboard.up(testCase.key);
    await page.evaluate(() => window.advanceTime?.(300));
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
    const manifest = await page.evaluate(async (mapId) => (await (await fetch(`/assets/runtime/battlescene/maps/${mapId}/map.manifest.json`)).json()), testCase.mapId);
    if (state.mapId !== testCase.mapId || manifest.version !== 2 || !manifest.backgrounds.far.includes('-v2.webp') || !manifest.backgrounds.ground.includes('-v2.webp')) {
      throw new Error(`Biome v2 manifest did not load for ${testCase.mapId}.`);
    }
    await page.screenshot({ path: `${outputDirectory}/${testCase.image}`, fullPage: true });
    results.push({ mapId: state.mapId, shipX: state.ship.x, manifestVersion: manifest.version, far: manifest.backgrounds.far, ground: manifest.backgrounds.ground });
    await page.close();
  }
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, results, errors }, null, 2));
} catch (error) {
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
