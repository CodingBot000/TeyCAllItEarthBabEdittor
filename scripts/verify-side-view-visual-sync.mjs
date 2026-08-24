import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/side-view-visual-sync';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

try {
  await page.goto(`${baseUrl}/?debug=battle&city=shanghai&battle-fast=1&battle-fallback=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.advanceTime?.(4000));
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => window.advanceTime?.(78000));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.advanceTime?.(17));
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
  const enemyIds = state.enemies.map((enemy) => enemy.id).sort();
  const visualFighterIds = state.visuals.fighters.map((fighter) => fighter.id).sort();
  if (enemyIds.length === 0 || JSON.stringify(enemyIds) !== JSON.stringify(visualFighterIds)) throw new Error(`Enemy/fighter visual IDs diverged: ${JSON.stringify({ enemyIds, visualFighterIds })}`);
  for (const enemy of state.enemies) {
    const fighter = state.visuals.fighters.find((candidate) => candidate.id === enemy.id);
    if (!fighter || Math.abs(fighter.x - enemy.x) > 0.01 || Math.abs(fighter.z - enemy.z * 0.12) > 0.01) throw new Error(`Fighter ${enemy.id} position diverged.`);
  }
  const groundEntityIds = state.groundEntities.map((entity) => `${entity.kind}:${entity.id}`).sort();
  const groundVisualIds = state.visuals.ground.map((visual) => `${visual.kind}:${visual.id}`).sort();
  if (JSON.stringify(groundEntityIds) !== JSON.stringify(groundVisualIds)) throw new Error(`Ground visual IDs diverged: ${JSON.stringify({ groundEntityIds, groundVisualIds })}`);
  await page.screenshot({ path: `${outputDirectory}/visual-sync.png`, fullPage: true });
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, enemyIds, groundEntityIds, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
