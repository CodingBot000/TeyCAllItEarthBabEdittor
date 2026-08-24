import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-mobile';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewportWidth = Number(process.env.SIDE_VIEW_WIDTH ?? 900);
const viewportHeight = Number(process.env.SIDE_VIEW_HEIGHT ?? 500);
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1&battle-fallback=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 15000 });
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
  await page.screenshot({ path: `${outputDirectory}/battle-${viewportWidth}x${viewportHeight}.png`, fullPage: true });
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, bounds, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
