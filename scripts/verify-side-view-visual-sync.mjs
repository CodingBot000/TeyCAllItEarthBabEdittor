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
  await page.goto(`${baseUrl}/?debug=battle&city=shanghai&battle-fast=1`, { waitUntil: 'domcontentloaded' });
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
    const expectedVisualX = state.ship.worldX + enemy.x - state.ship.x;
    const expectedVisualY = state.ship.worldY + enemy.y - state.ship.combatAltitude;
    const expectedVisualZ = state.ship.worldZ + enemy.z - state.ship.z;
    if (!fighter
      || Math.abs(fighter.x - expectedVisualX) > 0.02
      || Math.abs(fighter.y - expectedVisualY) > 0.02
      || Math.abs(fighter.z - expectedVisualZ) > 0.02) throw new Error(`Fighter ${enemy.id} true-3D position diverged.`);
    if (enemy.keepOutMetric < 0.999 || fighter.keepOutMetric < 0.999) throw new Error(`Fighter ${enemy.id} entered the mothership keep-out envelope.`);
    if (enemy.relativeDistance3D < 29.9 || fighter.relativeDistance3D < 29.9) throw new Error(`Fighter ${enemy.id} moved inside the minimum attack-pass radius.`);
  }
  if (state.visuals.fighters.some((fighter) => fighter.trailVisible)) throw new Error('Temporary fighter exhaust trail should be disabled.');
  if (!state.visuals.fighters.some((fighter) => Math.abs(fighter.bank) > 0.01)) throw new Error('Formation fighters never produced a visible bank value.');
  if (state.visuals.fighters.some((fighter) => fighter.smokePuffCount !== 0)) throw new Error('Temporary fighter exhaust smoke should be disabled.');
  const groundEntityIds = state.groundEntities.map((entity) => `${entity.kind}:${entity.id}`).sort();
  const groundVisualIds = state.visuals.ground.map((visual) => `${visual.kind}:${visual.id}`).sort();
  if (JSON.stringify(groundEntityIds) !== JSON.stringify(groundVisualIds)) throw new Error(`Ground visual IDs diverged: ${JSON.stringify({ groundEntityIds, groundVisualIds })}`);
  for (const entity of state.groundEntities.filter((unit) => unit.aiMode)) {
    const visual = state.visuals.ground.find((unit) => unit.id === entity.id);
    if (Math.abs(entity.x - visual.x) > 0.003 || entity.facingX !== visual.facingX) throw new Error(`SAM pose diverged: ${entity.id}`);
    if (entity.muzzle && (Math.abs(entity.muzzle.x - visual.muzzle.x) > 0.003 || Math.abs(entity.muzzle.y - 16.5 - visual.muzzle.y) > 0.003)) throw new Error(`SAM socket diverged: ${entity.id}`);
  }
  for (const missile of state.missiles.filter((item) => item.coordinateSpace === 'SIDE_VIEW_COMBAT')) {
    const visual = state.projectileVisuals.find((item) => item.id === missile.id);
    if (!visual || Math.abs(visual.x - missile.position.x) > 0.001 || Math.abs(visual.y - missile.y + 16.5) > 0.001) throw new Error(`Combat projectile diverged: ${missile.id}`);
  }
  await page.screenshot({ path: `${outputDirectory}/visual-sync.png`, fullPage: true });
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({
    ok: true,
    enemyIds,
    groundEntityIds,
    fighterDistances: state.enemies.map((enemy) => ({ id: enemy.id, distance: enemy.relativeDistance3D, keepOutMetric: enemy.keepOutMetric, flightMode: enemy.flightMode })),
    errors,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
