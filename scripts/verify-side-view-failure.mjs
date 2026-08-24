import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-failure-flow';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1&battle-fallback=1&battle-debug=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function');
  await page.keyboard.press('c');
  await page.evaluate(() => window.advanceTime?.(2600));
  await page.getByText('긴급 수리 정산').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: `${outputDirectory}/01-failed-debrief.png`, fullPage: true });
  const campaign = await page.evaluate(() => JSON.parse(localStorage.getItem('they-call-it-earth.prototype.save.v1') ?? 'null'));
  const repair = campaign?.pendingDebrief?.repairAssessment ?? null;
  if (!repair || repair.biomassCost <= 0 || repair.alloyCost <= 0) throw new Error('Repair assessment was not persisted after failure.');
  if (campaign.resources.biomass < 0 || campaign.resources.alloy < 0) throw new Error('Repair cost produced a negative wallet.');
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, outcome: campaign.pendingDebrief.outcome, repair, resources: campaign.resources, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
