import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-mobile';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
const viewportWidth = Number(process.env.SIDE_VIEW_WIDTH ?? 900);
const viewportHeight = Number(process.env.SIDE_VIEW_HEIGHT ?? 500);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

const battleState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
const advanceTime = async (milliseconds) => page.evaluate((time) => window.advanceTime?.(time), milliseconds);
const holdMovementButton = async (button, milliseconds) => {
  const box = await button.boundingBox();
  if (!box) throw new Error('Movement button has no hitbox.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await advanceTime(milliseconds);
  await page.mouse.up();
};

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  // The Next.js development toolbar occupies the same lower-left corner in local dev only.
  // Hide it so pointer assertions address the game controls, not framework chrome.
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));
  await page.evaluate(() => window.advanceTime?.(2800));
  const bounds = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return { status: rect('.battle-status-hud'), survival: rect('.battle-survival-hud'), target: rect('.battle-target-hud'), actions: rect('.battle-action-bar') };
  });
  for (const [name, rect] of Object.entries(bounds)) {
    if (!rect) throw new Error(`${name} HUD is missing.`);
    if (rect.left < -1 || rect.top < -1 || rect.right > viewportWidth + 1 || rect.bottom > viewportHeight + 1) throw new Error(`${name} HUD is outside the ${viewportWidth}x${viewportHeight} viewport: ${JSON.stringify(rect)}`);
  }

  const movementButtons = page.locator('.battle-movement-controls button');
  if (await movementButtons.count() !== 2) throw new Error('Expected two mobile movement buttons.');
  const leftButton = movementButtons.nth(0);
  const rightButton = movementButtons.nth(1);
  await leftButton.waitFor({ state: 'visible', timeout: 5000 });
  await rightButton.waitFor({ state: 'visible', timeout: 5000 });
  const movementBounds = await Promise.all([leftButton.boundingBox(), rightButton.boundingBox()]);
  for (const [index, rect] of movementBounds.entries()) {
    if (!rect || rect.width < 44 || rect.height < 44) throw new Error(`Movement button ${index} does not meet the 44px minimum touch target.`);
    if (rect.left < -1 || rect.top < -1 || rect.right > viewportWidth + 1 || rect.bottom > viewportHeight + 1) throw new Error(`Movement button ${index} is outside the viewport.`);
  }

  const beforeRight = await battleState();
  await holdMovementButton(rightButton, 400);
  const afterRight = await battleState();
  if (afterRight.ship.x <= beforeRight.ship.x + 6) throw new Error(`Right pointer hold did not move the mothership: ${beforeRight.ship.x} → ${afterRight.ship.x}`);
  await advanceTime(250);
  const afterRightRelease = await battleState();
  if (Math.abs(afterRightRelease.ship.x - afterRight.ship.x) > 0.1) throw new Error('Mothership continued moving after pointerup.');

  await holdMovementButton(leftButton, 400);
  const afterLeft = await battleState();
  if (afterLeft.ship.x >= afterRightRelease.ship.x - 6) throw new Error(`Left pointer hold did not move the mothership: ${afterRightRelease.ship.x} → ${afterLeft.ship.x}`);

  const rightBox = await rightButton.boundingBox();
  if (!rightBox) throw new Error('Right movement button has no hitbox.');
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
  await page.mouse.down();
  await advanceTime(200);
  await rightButton.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  const beforeCancelledRelease = await battleState();
  await advanceTime(250);
  await page.mouse.up();
  const afterCancelledRelease = await battleState();
  if (Math.abs(afterCancelledRelease.ship.x - beforeCancelledRelease.ship.x) > 0.1) throw new Error('Mothership continued moving after pointercancel.');

  const targetState = await battleState();
  const target = targetState.targets.find((candidate) => candidate.discovered && candidate.remainingAmount > 0);
  if (!target) throw new Error('No discovered absorbable target is available for mobile absorption verification.');
  const movementButton = target.x < targetState.ship.x ? leftButton : rightButton;
  await holdMovementButton(movementButton, Math.max(0, Math.abs(target.x - targetState.ship.x) / 34 * 1000));
  await page.locator('[data-testid="battle-action-absorb"]').click();
  await advanceTime(450);
  const afterAbsorption = await battleState();
  const absorbedTarget = afterAbsorption.targets.find((candidate) => candidate.id === target.id);
  if (!absorbedTarget || absorbedTarget.remainingAmount >= target.remainingAmount) throw new Error('Mobile movement did not reach an absorbable target or the beam did not harvest it.');

  await page.screenshot({ path: `${outputDirectory}/battle-${viewportWidth}x${viewportHeight}.png`, fullPage: true });
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, bounds, movementBounds, beforeRight, afterRight, afterLeft, afterCancelledRelease, afterAbsorption, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
