import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.FIGHTER_GHOSTING_BASE_URL ?? 'http://localhost:3000/?battle-fast=1';
const outputDirectory = process.env.FIGHTER_GHOSTING_OUTPUT_DIR ?? 'output/fighter-frame-ghosting';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));

const battleState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '빠른 전투 테스트', exact: true }).click();
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');

  const initial = await battleState();
  const clearState = initial.rendering;
  if (!clearState?.sceneAutoClear || !clearState.sceneAutoClearDepthAndStencil || !clearState.postProcessAutoClear) {
    throw new Error(`Battle frame clear contract is disabled: ${JSON.stringify(clearState)}`);
  }

  await page.evaluate(() => window.advanceTime?.(70000));
  const frames = [];
  for (let index = 0; index < 9; index += 1) {
    if (index > 0) await page.evaluate(() => window.advanceTime?.(1000));
    await page.evaluate(() => window.advanceTime?.(17));
    const state = await battleState();
    const enemyIds = state.enemies.map((enemy) => enemy.id).sort();
    const fighterIds = state.visuals.fighters.map((fighter) => fighter.id).sort();
    if (JSON.stringify(enemyIds) !== JSON.stringify(fighterIds)) {
      throw new Error(`Enemy/fighter visual IDs diverged at frame ${index}: ${JSON.stringify({ enemyIds, fighterIds })}`);
    }
    if (!state.rendering?.sceneAutoClear || !state.rendering.sceneAutoClearDepthAndStencil || !state.rendering.postProcessAutoClear) {
      throw new Error(`Frame clear contract changed at frame ${index}: ${JSON.stringify(state.rendering)}`);
    }
    const screenshot = `${outputDirectory}/frame-${String(index).padStart(2, '0')}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    frames.push({ elapsedSeconds: state.elapsedSeconds, fighterIds, screenshot });
  }

  const empButton = page.getByRole('button', { name: /EMP 펄스/ });
  if (await empButton.isEnabled()) {
    await empButton.click();
    await page.evaluate(() => window.advanceTime?.(1200));
    await page.screenshot({ path: `${outputDirectory}/emp-clear.png`, fullPage: true });
  }

  const overdriveButton = page.getByRole('button', { name: /오버드라이브/ });
  if (await overdriveButton.isEnabled()) {
    await overdriveButton.click();
    await page.evaluate(() => window.advanceTime?.(1800));
    await page.screenshot({ path: `${outputDirectory}/overdrive-clear.png`, fullPage: true });
  }

  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: true, url: page.url(), clearState, frames, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, url: page.url(), error: String(error), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
