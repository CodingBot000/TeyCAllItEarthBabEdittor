import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/absorption-beam-virtual-objects';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failedResponses = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

const read = async () => JSON.parse(await page.evaluate(() => JSON.stringify(window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null)));
const advance = async (milliseconds) => { await page.evaluate((duration) => window.advanceTime?.(duration), milliseconds); return read(); };
const capture = async (name) => page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));
  await advance(700);
  let before = await read();
  const target = before.targets.find((candidate) => candidate.discovered && candidate.remainingAmount > 0 && candidate.status === 'AVAILABLE');
  assert(target, 'No available absorbable target for virtual-object test');
  await page.locator('[data-testid="battle-action-absorb"]').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

  const ignition = await advance(120);
  await capture('01-ignition');
  assert.equal(ignition.absorptionVfx.phase, 'IGNITING');
  assert.equal(ignition.absorptionVfx.virtualObjectPoolCount, 20);
  assert.equal(ignition.absorptionVfx.virtualObjectSizeMultiplier, 1.5);
  assert.equal(ignition.absorptionVfx.virtualObjectTravelDuration, 0.8);
  assert(ignition.absorptionVfx.virtualObjectCount >= 1);
  const first = ignition.absorptionVfx.virtualObjects[0];
  assert(first && first.progress > 0 && first.progress < 0.3);
  assert(first.size >= 1.35 && first.size <= 3.15, `Unexpected 1.5x silhouette size: ${first.size}`);
  assert(first.motionProgress < first.progress, 'Expected ease-in acceleration');

  const sustained = await advance(380);
  await capture('02-sustained');
  assert.equal(sustained.absorptionVfx.phase, 'SUSTAINED');
  const progressed = sustained.absorptionVfx.virtualObjects.find((object) => object.serial === first.serial);
  assert(progressed && progressed.progress > first.progress && progressed.motionProgress > first.motionProgress);

  const fullPool = await advance(280);
  assert(fullPool.absorptionVfx.virtualObjectCount >= 20, `Expected all 20 silhouettes to rise together: ${JSON.stringify(fullPool.absorptionVfx)}`);
  const poolObject = [...fullPool.absorptionVfx.virtualObjects].sort((a, b) => a.progress - b.progress)[0];
  assert(poolObject, 'The full silhouette pool did not expose an active object to track.');

  const beforeArrival = await advance(20);
  assert(beforeArrival.absorptionVfx.virtualObjects.some((object) => object.serial === poolObject.serial));
  let afterArrival = await read();
  for (let index = 0; index < 60 && afterArrival.absorptionVfx.virtualObjects.some((object) => object.serial === poolObject.serial); index += 1) {
    afterArrival = await advance(20);
  }
  await capture('03-arrival');
  assert(!afterArrival.absorptionVfx.virtualObjects.some((object) => object.serial === poolObject.serial), 'Object exceeded its 0.8 second travel');

  await page.locator('[data-testid="battle-action-absorb"]').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const fading = await advance(120);
  assert.equal(fading.absorptionVfx.phase, 'FADING');
  const finished = await advance(230);
  await capture('04-off');
  assert.equal(finished.absorptionVfx.phase, 'OFF');
  assert.equal(finished.absorptionVfx.virtualObjectCount, 0);
  assert.equal(finished.absorptionVfx.virtualObjects.length, 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedResponses.length, 0, failedResponses.join('\n'));
  const result = { ok: true, targetId: target.id, firstObject: first, progressed, fullPool: fullPool.absorptionVfx, ignition: ignition.absorptionVfx, sustained: sustained.absorptionVfx, arrived: afterArrival.absorptionVfx, finished: finished.absorptionVfx, errors, failedResponses };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, targetId: target.id, firstObject: first, progressed, errors, failedResponses }));
} catch (error) {
  await capture('failure').catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally { await browser.close(); }
