import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/absorption-beam-v2';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
const viewportWidth = Number(process.env.SIDE_VIEW_WIDTH ?? 1280);
const viewportHeight = Number(process.env.SIDE_VIEW_HEIGHT ?? 720);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
const errors = [];
const failedResponses = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
const advance = async (milliseconds) => {
  await page.evaluate((duration) => window.advanceTime?.(duration), milliseconds);
  return state();
};

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));
  await advance(700);

  const before = await state();
  const target = before.targets.find((candidate) => candidate.kind === 'MACHINERY' && candidate.discovered && candidate.remainingAmount > 0)
    ?? before.targets.find((candidate) => candidate.discovered && candidate.remainingAmount > 0);
  if (!target) throw new Error('No discovered absorbable target is available.');
  await page.screenshot({ path: `${outputDirectory}/00-before.png`, fullPage: true });

  const absorbButton = page.locator('[data-testid="battle-action-absorb"]');
  await absorbButton.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="battle-action-absorb"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await absorbButton.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));

  await advance(120);
  const ignitionEarly = await state();
  await page.screenshot({ path: `${outputDirectory}/01-ignition-120ms.png`, fullPage: true });
  if (ignitionEarly.absorptionVfx?.phase !== 'IGNITING') throw new Error(`Expected IGNITING at 120ms, received ${ignitionEarly.absorptionVfx?.phase}.`);
  if (ignitionEarly.absorptionVfx?.virtualObjectTravelDuration !== 0.8 || ignitionEarly.absorptionVfx?.virtualObjectPoolCount !== 20 || ignitionEarly.absorptionVfx?.virtualObjectSizeMultiplier !== 1.5 || ignitionEarly.absorptionVfx?.virtualObjectCount < 1) {
    throw new Error(`Virtual absorption objects did not start with the expected pool/timing: ${JSON.stringify(ignitionEarly.absorptionVfx)}`);
  }
  const firstVirtualObject = ignitionEarly.absorptionVfx.virtualObjects[0];
  if (!firstVirtualObject || firstVirtualObject.motionProgress >= firstVirtualObject.progress) throw new Error('Virtual absorption object did not begin with an accelerating motion curve.');

  await advance(380);
  const sustainedStart = await state();
  await page.screenshot({ path: `${outputDirectory}/02-sustained-500ms.png`, fullPage: true });
  if (sustainedStart.absorptionVfx?.phase !== 'SUSTAINED') throw new Error(`Expected SUSTAINED at 500ms, received ${sustainedStart.absorptionVfx?.phase}.`);
  if (sustainedStart.absorptionVfx?.outerLayerCount !== 3 || sustainedStart.absorptionVfx?.shaftCount !== 12 || sustainedStart.absorptionVfx?.meshCount !== 24) {
    throw new Error(`Unexpected absorption mesh budget: ${JSON.stringify(sustainedStart.absorptionVfx)}`);
  }
  const sameObject = sustainedStart.absorptionVfx.virtualObjects.find((object) => object.serial === firstVirtualObject.serial);
  if (!sameObject || sameObject.progress <= firstVirtualObject.progress || sameObject.motionProgress <= firstVirtualObject.motionProgress) {
    throw new Error(`Virtual object did not move upward through the 0.8s curve: ${JSON.stringify({ firstVirtualObject, sameObject })}`);
  }

  await advance(250);
  const sustained = await state();
  await page.screenshot({ path: `${outputDirectory}/03-sustained-750ms.png`, fullPage: true });
  if (sustained.absorptionVfx?.phase !== 'SUSTAINED') throw new Error(`Expected SUSTAINED at 750ms, received ${sustained.absorptionVfx?.phase}.`);
  let arrived = await state();
  for (let index = 0; index < 60 && arrived.absorptionVfx?.virtualObjects.some((object) => object.serial === firstVirtualObject.serial); index += 1) {
    arrived = await advance(20);
  }
  if (arrived.absorptionVfx?.virtualObjects.some((object) => object.serial === firstVirtualObject.serial)) throw new Error('A virtual object remained after its 0.8 second travel duration.');
  await page.screenshot({ path: `${outputDirectory}/03b-virtual-object-arrival.png`, fullPage: true });

  let depletedState = sustained;
  for (let index = 0; index < 220; index += 1) {
    await advance(100);
    depletedState = await state();
    const current = depletedState.targets.find((candidate) => candidate.id === target.id);
    if (current?.remainingAmount <= 0) break;
  }
  const depletedTarget = depletedState.targets.find((candidate) => candidate.id === target.id);
  if (!depletedTarget || depletedTarget.remainingAmount > 0) throw new Error(`Target did not deplete: ${JSON.stringify(depletedTarget)}`);
  await page.screenshot({ path: `${outputDirectory}/04-depleted-fade-start.png`, fullPage: true });

  await advance(120);
  const fading = await state();
  await page.screenshot({ path: `${outputDirectory}/05-fading-120ms.png`, fullPage: true });
  if (fading.absorptionVfx?.phase !== 'FADING') throw new Error(`Expected FADING at 120ms, received ${fading.absorptionVfx?.phase}.`);

  await advance(230);
  const finished = await state();
  await page.screenshot({ path: `${outputDirectory}/06-finished.png`, fullPage: true });
  if (finished.absorptionVfx?.phase !== 'OFF' || finished.absorptionVfx?.active !== false) {
    throw new Error(`Absorption VFX did not finish its fade: ${JSON.stringify(finished.absorptionVfx)}`);
  }
  if (finished.absorptionVfx?.virtualObjectCount !== 0 || finished.absorptionVfx?.virtualObjects?.length !== 0) {
    throw new Error(`Virtual absorption objects remained after beam shutdown: ${JSON.stringify(finished.absorptionVfx)}`);
  }
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  if (failedResponses.length > 0) throw new Error(`Failed responses:\n${failedResponses.join('\n')}`);

  const result = {
    ok: true,
    viewport: { width: viewportWidth, height: viewportHeight },
    targetId: target.id,
    targetKind: target.kind,
    beforeRemaining: target.remainingAmount,
    afterRemaining: depletedTarget.remainingAmount,
    ignition: ignitionEarly.absorptionVfx,
    sustained: sustained.absorptionVfx,
    fading: fading.absorptionVfx,
    finished: finished.absorptionVfx,
    errors,
    failedResponses,
  };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
}
