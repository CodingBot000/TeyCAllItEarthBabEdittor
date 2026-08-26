import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3011';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/cohort-human-drop';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
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

  const before = await read();
  assert.equal(before.legacyInfectedAssault.active, false);
  await page.locator('[data-testid="battle-action-assault"]').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const clicked = await advance(700);
  await capture('01-button-falling');
  assert.equal(clicked.cohortHumanDrop.active, true);
  assert.equal(clicked.cohortHumanDrop.spriteReady, true);
  assert(clicked.cohortHumanDrop.fallingCount > 0, 'Button did not start human sprite drops');
  assert.equal(clicked.cohortHumanDrop.tailCount, clicked.cohortHumanDrop.fallingCount);
  assert.equal(clicked.cohortHumanDrop.tint, '#75f5d1');
  assert.equal(clicked.legacyInfectedAssault.active, false);

  const landed = await advance(1200);
  await capture('02-button-landed');
  assert(landed.cohortHumanDrop.landedCount > 0, 'Human drop wave did not reach the ground');
  assert(landed.cohortHumanDrop.groundImpactCount > 0, 'Human drop wave did not create ground impacts');

  const finished = await advance(1300);
  await capture('03-button-finished');
  assert.equal(finished.cohortHumanDrop.active, false);
  assert.equal(finished.legacyInfectedAssault.active, false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.keyboard.press('/');
  const keyboard = await advance(700);
  assert.equal(keyboard.cohortHumanDrop.active, true);
  assert(keyboard.cohortHumanDrop.fallingCount > 0, 'Slash key did not start human sprite drops');
  assert.equal(keyboard.legacyInfectedAssault.active, false);

  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedResponses.length, 0, failedResponses.join('\n'));
  const result = { ok: true, clicked, landed, finished, keyboard, errors, failedResponses };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, clicked: clicked.cohortHumanDrop, landed: landed.cohortHumanDrop, finished: finished.cohortHumanDrop, keyboard: keyboard.cohortHumanDrop, errors, failedResponses }));
} catch (error) {
  await capture('failure').catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
}
