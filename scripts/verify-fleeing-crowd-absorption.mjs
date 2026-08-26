import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/fleeing-crowd-absorption';
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

const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
const advance = async (milliseconds) => {
  await page.evaluate((duration) => window.advanceTime?.(duration), milliseconds);
  return read();
};
const capture = async (name) => page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));

  let current = await read();
  await page.keyboard.down('ArrowLeft');
  for (let index = 0; index < 100; index += 1) {
    if (current.nearbyTargetId?.startsWith('ambient:fleeing-crowd-')) break;
    current = await advance(100);
  }
  await page.keyboard.up('ArrowLeft');

  const targetId = current.nearbyTargetId;
  assert(targetId?.startsWith('ambient:fleeing-crowd-'), `Could not position the ship over a moving human group: ${targetId}`);
  const initialCrowd = current.fleeingCrowds.find((crowd) => crowd.id === targetId);
  assert(initialCrowd, `Missing visual snapshot for ${targetId}`);
  await capture('01-before-absorption');

  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="battle-action-absorb"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await page.locator('[data-testid="battle-action-absorb"]').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

  const absorbing = await advance(500);
  const frozenCrowd = absorbing.fleeingCrowds.find((crowd) => crowd.id === targetId);
  assert.equal(absorbing.activeTargetId, targetId);
  assert(frozenCrowd?.absorbing, `Expected ${targetId} to be absorbing`);
  assert.equal(frozenCrowd?.moving, false);
  assert.equal(frozenCrowd?.x, initialCrowd.x);
  assert.equal(frozenCrowd?.frame, initialCrowd.frame);
  await capture('02-absorption-frozen');

  const stillAbsorbing = await advance(500);
  const stillFrozenCrowd = stillAbsorbing.fleeingCrowds.find((crowd) => crowd.id === targetId);
  assert(stillFrozenCrowd?.absorbing, `The beam stopped absorbing ${targetId} unexpectedly`);
  assert.equal(stillFrozenCrowd?.moving, false);
  assert.equal(stillFrozenCrowd?.x, frozenCrowd.x);
  assert.equal(stillFrozenCrowd?.frame, frozenCrowd.frame);

  await page.locator('[data-testid="battle-action-absorb"]').evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  const resumed = await advance(500);
  const resumedCrowd = resumed.fleeingCrowds.find((crowd) => crowd.id === targetId);
  assert.equal(resumed.activeAbility, null);
  assert(resumedCrowd?.moving, `Expected ${targetId} to resume moving after the beam stopped`);
  assert(resumedCrowd && (resumedCrowd.x !== stillFrozenCrowd.x || resumedCrowd.frame !== stillFrozenCrowd.frame), 'Human group did not resume movement after absorption stopped');
  await capture('03-after-absorption');

  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedResponses.length, 0, failedResponses.join('\n'));
  const result = { ok: true, targetId, initialCrowd, frozenCrowd, stillFrozenCrowd, resumedCrowd, errors, failedResponses };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, targetId, initialX: initialCrowd.x, frozenX: frozenCrowd.x, resumedX: resumedCrowd.x, initialFrame: initialCrowd.frame, frozenFrame: frozenCrowd.frame, resumedFrame: resumedCrowd.frame, errors, failedResponses }));
} catch (error) {
  await capture('failure').catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
}
