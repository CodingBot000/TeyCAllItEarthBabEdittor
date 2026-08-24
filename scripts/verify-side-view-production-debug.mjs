import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3011';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-production-debug';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
const saveKey = 'they-call-it-earth.prototype.save.v1';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '새 캠페인' }).click();
  await page.locator('.map-screen').waitFor({ timeout: 10000 });
  const savedBefore = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1&battle-debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.menu-screen').waitFor({ timeout: 10000 });
  const savedAfter = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  if (await page.locator('.battle-screen').count() !== 0) throw new Error('Production debug query entered battle.');
  if (savedBefore !== savedAfter) throw new Error('Production debug query changed the real campaign save.');
  await page.screenshot({ path: `${outputDirectory}/production-debug-ignored.png`, fullPage: true });
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, productionDebugIgnored: true, saveUnchanged: true, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
