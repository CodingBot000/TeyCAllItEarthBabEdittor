import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/ground-unit-positioning';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ ...(browserExecutable ? { executablePath: browserExecutable } : {}), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
const results = [];
let page;

async function open(width, height, controls = false) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1${controls ? '&battle-debug=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.evaluate(() => window.advanceTime(0));
  console.log(`Ready: ${width}x${height}`);
  return read();
}
async function read() { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); }
async function advance(milliseconds) { await page.evaluate((ms) => window.advanceTime(ms), milliseconds); return read(); }
async function capture(name, state = null) {
  const snapshot = state ?? await read();
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });
  await writeFile(`${outputDirectory}/${name}.json`, JSON.stringify(snapshot, null, 2));
}
function checkSync(state, previous = null, launches = new Map()) {
  const dt = previous ? state.elapsedSeconds - previous.elapsedSeconds : 0;
  for (const unit of state.groundEntities.filter((item) => item.aiMode)) {
    const visual = state.visuals.ground.find((item) => item.id === unit.id);
    assert(visual, `Missing SAM visual ${unit.id}`);
    assert(Math.abs(unit.x - visual.x) < 0.003);
    assert.equal(visual.facingX, unit.facingX);
    if (unit.muzzle) {
      assert(Math.abs(unit.muzzle.x - visual.muzzle.x) < 0.003);
      assert(Math.abs(unit.muzzle.y - 16.5 - visual.muzzle.y) < 0.003);
      assert(Math.abs(unit.muzzle.z - visual.muzzle.z) < 0.003);
    }
    const old = previous?.groundEntities.find((item) => item.id === unit.id);
    if (old && dt > 0) assert(Math.abs(unit.x - old.x) <= 11.9 * dt + 0.025, `SAM teleported: ${unit.id}`);
    assert(Math.abs(unit.velocityX) <= 11.9 + 1e-8);
    if (unit.aiMode !== 'HOLD') assert.equal(unit.canFire, false);
  }
  for (const missile of state.missiles.filter((item) => item.coordinateSpace === 'SIDE_VIEW_COMBAT')) {
    assert(missile.launchAngleRadians >= 20 * Math.PI / 180 - 1e-9 && missile.launchAngleRadians <= 40 * Math.PI / 180 + 1e-9);
    const visual = state.projectileVisuals.find((item) => item.id === missile.id);
    assert(visual, `Missing projectile ${missile.id}`);
    assert(Math.abs(visual.x - missile.position.x) < 1e-5);
    assert(Math.abs(visual.y - missile.y + 16.5) < 1e-5);
    assert(Math.abs(visual.z - missile.position.z) < 1e-5);
    assert(Math.abs(visual.launchX - missile.launchPosition.x) < 1e-5);
    assert(Math.abs(visual.launchY - missile.launchY + 16.5) < 1e-5);
    const launch = JSON.stringify([missile.launchPosition, missile.launchY, missile.launchDirection]);
    if (launches.has(missile.id)) assert.equal(launches.get(missile.id), launch);
    launches.set(missile.id, launch);
  }
}

try {
  for (const [width, height] of [[1280, 720], [900, 500], [640, 360]]) {
    let previous = await open(width, height);
    const launches = new Map(); const directions = new Set();
    let state;
    for (let i = 0; i < 12; i += 1) {
      state = await advance(500);
      checkSync(state, previous, launches);
      for (const missile of state.missiles.filter((item) => item.coordinateSpace)) directions.add(Math.sign(missile.launchDirection.x));
      previous = state;
    }
    assert(directions.has(-1) && directions.has(1), 'Expected both left and right launches');
    await capture(`both-directions-${width}`, state);
    const bounds = state.groundEntities.find((unit) => unit.aiMode)?.visibleBounds;
    assert(bounds && bounds.minX < 0 && bounds.maxX > 0);
    results.push({ width, height, bounds, launchCount: launches.size, directions: [...directions] });
    console.log(`Verified left/right launch and spatial sync: ${width}x${height}`);
  }

  // Real movement drives overhead retreat, edge-side switching and camera escape.
  let previous = await open(1280, 720);
  const observed = new Set(); const launches = new Map();
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 60; i += 1) {
    const state = await advance(200); checkSync(state, previous, launches);
    for (const mode of ['RETREAT', 'REPOSITION', 'ENTER_VIEW']) {
      if (!observed.has(mode) && state.groundEntities.some((unit) => unit.aiMode === mode)) {
        observed.add(mode); await capture(mode.toLowerCase(), state);
      }
    }
    previous = state;
  }
  await page.keyboard.up('ArrowRight');
  assert(observed.has('RETREAT'), 'No overhead/close retreat was observed');
  assert(observed.has('REPOSITION'), 'No edge reposition was observed');
  await capture('camera-edge', await advance(1500));
  const beforeResize = await read();
  await page.setViewportSize({ width: 640, height: 360 });
  const afterResize = await advance(100); checkSync(afterResize, beforeResize, launches);
  await capture('resize', afterResize);

  // The shipped layout stays 16:9 even on portrait devices. Constrain only this
  // test page's actual canvas (not the numeric AI bounds) to exercise no-space.
  await open(1280, 720);
  await page.addStyleTag({ content: '.battle-screen { width: 360px !important; height: 720px !important; aspect-ratio: auto !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const blocked = await advance(18000);
  const narrowBounds = blocked.groundEntities.find((unit) => unit.aiMode).visibleBounds;
  assert(narrowBounds.maxX - narrowBounds.minX < 40, 'Canvas constraint did not change the actual camera frustum');
  assert(blocked.groundEntities.filter((unit) => unit.aiMode).every((unit) => unit.aiMode === 'WAIT_FOR_SPACE'));
  assert.equal(blocked.missiles.filter((item) => item.coordinateSpace).length, 0);
  await capture('wait-for-space', blocked);

  // Move left until ground defenders/linked facilities leave EMP selection range.
  // EMP auto-targets those before SAMs, and its radius (18) is less than range (28).
  let state = await open(1280, 720);
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 100; i += 1) {
    state = await advance(100);
    if (state.ship.x < -25 && state.groundEntities.some((unit) => unit.aiMode && Math.abs(unit.x - state.ship.x) < 24)) break;
  }
  await page.keyboard.up('ArrowLeft');
  await page.locator('[data-testid="battle-action-emp"]').click();
  const emp = await advance(100);
  const disabled = emp.groundEntities.filter((unit) => unit.aiMode === 'DISABLED');
  assert(disabled.length > 0, 'EMP did not disable a SAM');
  const held = await advance(1000);
  for (const unit of disabled) {
    const current = held.groundEntities.find((item) => item.id === unit.id);
    assert.equal(current.x, unit.x); assert.equal(current.facingX, unit.facingX); assert.equal(current.canFire, false);
  }
  await capture('emp', held);
  await page.keyboard.press('Escape');
  const paused = await read(); await advance(1000);
  assert.equal((await read()).elapsedSeconds, paused.elapsedSeconds);
  await page.keyboard.press('Escape');
  await advance(17000);
  assert((await read()).groundEntities.some((unit) => unit.aiMode && unit.aiMode !== 'DISABLED'));
  await page.getByRole('button', { name: 'Open collision overlay debug panel', exact: true }).click();
  await advance(100); await capture('geometry-overlay');
  await open(1280, 720, true);
  await page.keyboard.press('3');
  const groundDestroyed = await advance(100);
  assert.equal(groundDestroyed.visuals.effects.explosionCount, 1, 'Ground destruction lost the original explosion VFX');
  assert.equal(groundDestroyed.visuals.effects.shatterCount, 1, 'Ground destruction did not create one shatter effect');
  assert.equal(groundDestroyed.visuals.effects.shatterPieceCount, 10, 'Ground destruction did not create ten image shards');
  await capture('ground-shatter', groundDestroyed);
  await page.keyboard.press('4');
  await advance(100);
  await page.keyboard.press('4');
  const fighterDestroyed = await advance(100);
  assert(fighterDestroyed.visuals.effects.explosionCount >= 1, 'Fighter destruction lost the original explosion VFX');
  assert(fighterDestroyed.visuals.effects.shatterCount >= 1, 'Fighter destruction did not create image shards');
  assert(fighterDestroyed.visuals.effects.shatterPieceCount >= 10, 'Fighter destruction did not create ten image shards');
  await capture('fighter-shatter', fighterDestroyed);
  await page.keyboard.press('c');
  const crash = await read(); await advance(200);
  assert.equal((await read()).elapsedSeconds, crash.elapsedSeconds, 'Crash cinematic advanced combat AI');
  await capture('destruction');
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, results, observed: [...observed], errors }, null, 2));
  console.log(JSON.stringify({ ok: true, results, observed: [...observed], errors }));
} catch (error) {
  await capture('failure').catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
