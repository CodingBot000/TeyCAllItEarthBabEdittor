import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3011';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/selective-battle-audio';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
  args: ['--autoplay-policy=user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failedResponses = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

await page.addInitScript(() => {
  window.__battleAudioCalls = [];
  window.__battleAudios = [];
  const OriginalAudio = window.Audio;
  window.Audio = function(...args) {
    const audio = new OriginalAudio(...args);
    window.__battleAudios.push(audio);
    return audio;
  };
  window.Audio.prototype = OriginalAudio.prototype;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    window.__battleAudioCalls.push({ source: this.src, loop: this.loop, volume: this.volume });
    return originalPlay.call(this);
  };
});

const readSnapshot = async () => JSON.parse(await page.evaluate(() => JSON.stringify(window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null)));
const advance = async (milliseconds) => { await page.evaluate((duration) => window.advanceTime?.(duration), milliseconds); return readSnapshot(); };
const clickAction = async (testId) => page.locator(`[data-testid="${testId}"]`).click();

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));
  await advance(500);

  await clickAction('battle-action-emp');
  await advance(120);
  await clickAction('battle-action-plasma');
  await advance(120);
  await clickAction('battle-action-overdrive');
  await advance(120);
  await clickAction('battle-action-absorb');
  const active = await advance(240);
  await page.screenshot({ path: `${outputDirectory}/selected-effects.png`, fullPage: true });

  const audioCalls = await page.evaluate(() => window.__battleAudioCalls);
  const sourceName = (source) => source.split('/').pop();
  const names = audioCalls.map((call) => sourceName(call.source));
  assert.equal(names.filter((name) => name === 'sfx-emp-shock.mp3').length, 2, 'EMP and overdrive should each play the pulse sound');
  assert.equal(names.filter((name) => name === 'sfx-plasma-sound.mp3').length, 1);
  assert.equal(names.filter((name) => name === 'sfx-absorption-beam-loop.mp3').length, 1);
  assert.equal(names.filter((name) => name === 'sfx-spacship_laser.mp3').length, 0, 'Air-defense laser sound must stay disabled');
  assert.equal(active.activeAbility, 'beam');
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedResponses.length, 0, failedResponses.join('\n'));
  const result = { ok: true, audioCalls, activeAbility: active.activeAbility, errors, failedResponses };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, names, activeAbility: active.activeAbility, errors, failedResponses }));
} catch (error) {
  await page.screenshot({ path: `${outputDirectory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
}
