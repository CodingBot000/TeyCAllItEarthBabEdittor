import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-abort';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
const saveKey = 'they-call-it-earth.prototype.save.v1';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '새 캠페인' }).click();
  const savedBefore = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  if (!savedBefore) throw new Error('Could not create the control save used to verify debug isolation.');

  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1&battle-fallback=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));

  await page.getByRole('button', { name: '임무 포기', exact: true }).click();
  await page.locator('.battle-abort-modal').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: `${outputDirectory}/01-abort-confirmation.png`, fullPage: true });
  await page.locator('.battle-abort-modal .danger').click();
  await page.locator('.debrief-screen').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: `${outputDirectory}/02-aborted-debrief.png`, fullPage: true });

  const savedAfter = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  if (savedAfter !== savedBefore) throw new Error('Debug battle changed the real campaign save.');
  if (await page.locator('.debrief-repair').count() !== 0) throw new Error('Aborted mission incorrectly showed a mothership emergency repair assessment.');
  if (!await page.getByText('이번에는 하늘이 이겼습니다.').isVisible()) throw new Error('Aborted mission did not resolve through failed debrief.');
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, saveUnchanged: savedAfter === savedBefore, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
