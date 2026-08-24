import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-full-flow';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

async function activate(locator) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  await locator.evaluate((element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
}

try {
  await page.goto(`${baseUrl}/?battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '새 캠페인' }).click();
  const newCampaignState = await page.evaluate(() => JSON.parse(localStorage.getItem('they-call-it-earth.prototype.save.v1') ?? 'null'));
  if (newCampaignState?.currentCityId !== null) throw new Error(`New campaign unexpectedly started at ${newCampaignState?.currentCityId}.`);
  await page.screenshot({ path: `${outputDirectory}/01-world-map.png`, fullPage: true });

  await activate(page.getByRole('button', { name: /대한민국.*KR/ }));
  await activate(page.getByRole('button', { name: '서울', exact: true }));
  const cityAction = page.locator('.city-panel .panel-actions button');
  const cityActionText = await cityAction.textContent();
  if (!cityActionText?.includes('노드로 이동')) throw new Error(`Expected move action, received: ${cityActionText}`);
  await cityAction.click();
  await page.locator('.loadout-screen').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: '과충전 셀 추가' }).click();
  await page.screenshot({ path: `${outputDirectory}/02-loadout.png`, fullPage: true });
  await page.getByRole('button', { name: /임무 확정/ }).click();
  await page.getByRole('button', { name: /영공 진입/ }).waitFor({ timeout: 10000 });
  const launchedCampaign = await page.evaluate(() => JSON.parse(localStorage.getItem('they-call-it-earth.prototype.save.v1') ?? 'null'));
  if (launchedCampaign?.schemaVersion !== 5 || !launchedCampaign?.plannedMission?.battleSetup) throw new Error('Mission launch did not persist the v5 battle setup.');
  await page.getByRole('button', { name: /영공 진입/ }).click();
  await page.locator('canvas[aria-label="Babylon battle scene"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-testid="battle-action-absorb"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => typeof window.render_game_to_text === 'function');

  const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
  const target = initial.targets.find((candidate) => candidate.discovered && candidate.remainingAmount > 0) ?? initial.targets.find((candidate) => candidate.remainingAmount > 0);
  if (!target) throw new Error('No absorbable target was generated.');
  const poolBefore = launchedCampaign.cities.seoul?.sideViewResources?.pools?.[target.kind]?.remainingAmount;
  if (!Number.isFinite(poolBefore)) throw new Error(`No persisted pool exists for ${target.kind}.`);
  const movementMs = Math.max(0, Math.abs(target.x - initial.ship.x) / 34 * 1000);
  const directionKey = target.x < initial.ship.x ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(directionKey);
  await page.evaluate((milliseconds) => window.advanceTime?.(milliseconds), movementMs);
  await page.keyboard.up(directionKey);
  await page.locator('[data-testid="battle-action-absorb"]').click();
  await page.evaluate(() => window.advanceTime?.(450));
  await page.screenshot({ path: `${outputDirectory}/03-absorption.png`, fullPage: true });
  await page.evaluate(() => window.advanceTime?.(2800));
  await page.screenshot({ path: `${outputDirectory}/04-auto-ground-combat.png`, fullPage: true });

  const battleState = JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
  await writeFile(`${outputDirectory}/battle-state.json`, JSON.stringify(battleState, null, 2));
  await page.locator('[data-testid="battle-action-extract"]').click();
  await page.evaluate(() => window.advanceTime?.(700));
  await page.getByRole('button', { name: /포획 인원 배분 열기/ }).waitFor({ timeout: 10000 });
  const stagedCampaign = await page.evaluate(() => JSON.parse(localStorage.getItem('they-call-it-earth.prototype.save.v1') ?? 'null'));
  const battleTarget = battleState.targets.find((candidate) => candidate.id === target.id);
  const consumedAmount = battleTarget ? Math.max(0, target.initialAmount - battleTarget.remainingAmount) : 0;
  const poolAfter = stagedCampaign?.cities.seoul?.sideViewResources?.pools?.[target.kind]?.remainingAmount;
  if (!Number.isFinite(poolAfter) || Math.abs(poolAfter - (poolBefore - consumedAmount)) > 0.01) {
    throw new Error(`City resource pool was not persisted correctly for ${target.kind}: ${poolBefore} → ${poolAfter}, consumed ${consumedAmount}`);
  }
  await page.screenshot({ path: `${outputDirectory}/05-debrief.png`, fullPage: true });
  await page.getByRole('button', { name: /포획 인원 배분 열기/ }).click();
  await page.getByRole('button', { name: /처리 확정/ }).click();
  await page.getByRole('button', { name: '업그레이드' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '업그레이드' }).click();
  await page.screenshot({ path: `${outputDirectory}/06-upgrades.png`, fullPage: true });

  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, targetId: target.id, stagedOutcome: stagedCampaign?.pendingDebrief?.outcome ?? null, pool: { kind: target.kind, before: poolBefore, after: poolAfter, consumed: consumedAmount }, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
