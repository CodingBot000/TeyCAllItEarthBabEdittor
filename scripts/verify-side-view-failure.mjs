import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-failure-flow';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
const forceFlameFallback = process.env.SIDE_VIEW_FORCE_FLAME_FALLBACK === '1';
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (forceFlameFallback && (text.includes('mothership-flame-16x4.webp') || text.includes('Failed to load resource: net::ERR_FAILED'))) return;
  errors.push(`console: ${text}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

async function activate(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
}

try {
  if (forceFlameFallback) await page.route('**/mothership-flame-16x4.webp', (route) => route.abort('failed'));
  await page.goto(`${baseUrl}/?battle-fast=1&battle-debug=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await activate(page.getByRole('button', { name: '새 캠페인' }));
  await activate(page.getByRole('button', { name: /대한민국.*KR/ }));
  await activate(page.getByRole('button', { name: '서울', exact: true }));
  await activate(page.locator('.city-inline-action'));
  await page.locator('.loadout-screen').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: /임무 확정/ }).click();
  await page.getByRole('button', { name: /영공 진입/ }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /영공 진입/ }).click();
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function');
  await page.getByTestId('battle-invincibility-toggle').click();
  await page.keyboard.press('2');
  await page.evaluate(() => window.advanceTime?.(2200));
  const destruction = await page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? 'null'));
  if (destruction?.result !== 'FAILED' || destruction?.endReason !== 'MOTHERSHIP_DISABLED') throw new Error('Mothership destruction did not enter the failed combat state.');
  if (destruction?.cinematic?.kind !== 'CRASH' || destruction.cinematic.progress <= 0 || destruction.cinematic.progress >= 1) throw new Error('Crash descent cinematic was not active before debrief.');
  if (!destruction?.mothershipDestruction?.active || destruction.mothershipDestruction.phase !== 'FALLING') throw new Error('The 5.8 second destruction sequence did not reach its falling phase.');
  const expectedFireCount = forceFlameFallback ? 2 : 3;
  if (destruction.mothershipDestruction.fireCount !== expectedFireCount || destruction.mothershipDestruction.smokeCount < 1) throw new Error('The flame trail and smoke trail were not active during descent.');
  if (destruction.mothershipDestruction.flameFallbackActive !== forceFlameFallback) throw new Error('The procedural cylinder flame fallback did not match texture readiness.');
  if (destruction.mothershipDestruction.triggeredExplosions < 6 || destruction.mothershipDestruction.triggeredExplosions > 11) throw new Error('Timed airborne destruction bursts did not advance during descent.');
  await page.locator('.battle-screen').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outputDirectory}/01-crash-descent.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime?.(2250));
  const impact = await page.evaluate(() => JSON.parse(window.render_game_to_text?.() ?? 'null'));
  if (impact?.cinematic?.kind !== 'CRASH' || impact?.mothershipDestruction?.phase !== 'IMPACT') throw new Error('Ground impact did not remain in the battle scene.');
  if (!impact.mothershipDestruction.impactTriggered || impact.mothershipDestruction.triggeredExplosions !== 14) throw new Error('Ground impact did not add three explosions after the eleven airborne bursts.');
  if (impact.mothershipDestruction.debrisCount !== 16 || impact.mothershipDestruction.fireCount !== 0) throw new Error('Ground impact debris or flame shutdown did not match the destruction contract.');
  await page.locator('.battle-screen').waitFor({ state: 'visible' });
  await page.screenshot({ path: `${outputDirectory}/02-ground-impact.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime?.(1500));
  await page.getByText('긴급 수리 정산').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: `${outputDirectory}/03-failed-debrief.png`, fullPage: true });
  const campaign = await page.evaluate(() => JSON.parse(localStorage.getItem('they-call-it-earth.prototype.save.v1') ?? 'null'));
  const repair = campaign?.pendingDebrief?.repairAssessment ?? null;
  if (!repair || repair.biomassCost <= 0 || repair.alloyCost <= 0) throw new Error('Repair assessment was not persisted after failure.');
  if (campaign.resources.biomass < 0 || campaign.resources.alloy < 0) throw new Error('Repair cost produced a negative wallet.');
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, outcome: campaign.pendingDebrief.outcome, forceFlameFallback, destruction, impact, repair, resources: campaign.resources, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
