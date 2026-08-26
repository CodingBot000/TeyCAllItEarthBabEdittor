import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.SIDE_VIEW_BASE_URL ?? 'http://localhost:3010';
const outputDirectory = process.env.SIDE_VIEW_OUTPUT_DIR ?? 'output/civilian-shelters';
const browserExecutable = process.env.SIDE_VIEW_BROWSER_EXECUTABLE;
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const failedResponses = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

const read = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text?.() ?? '{}'));
const advance = async (milliseconds) => {
  await page.evaluate((duration) => window.advanceTime?.(duration), milliseconds);
  return read();
};
const capture = async (name) => page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: true });

try {
  await page.goto(`${baseUrl}/?debug=battle&city=seoul&battle-fast=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.battle-screen[data-battle-phase="ready"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof window.advanceTime === 'function' && typeof window.render_game_to_text === 'function');
  await page.locator('nextjs-portal').evaluateAll((portals) => portals.forEach((portal) => { portal.style.display = 'none'; }));

  const initial = await read();
  const initialShelters = initial.targets.filter((target) => target.shelter);
  assert(initialShelters.length >= 2, `Expected at least two shelters, found ${initialShelters.length}`);
  assert(initialShelters.every((shelter) => shelter.shelter.state === 'INTACT'), 'A shelter did not start intact');
  assert(initialShelters.every((shelter) => shelter.shelter.occupants > 0 && shelter.remainingAmount === shelter.shelter.occupants), 'A shelter did not start with its fixed civilian group');
  assert(initialShelters.every((shelter) => shelter.shelter.capacity > 0 && shelter.shelter.interactable), 'A shelter did not expose capacity/interactable state');
  await capture('01-static-shelter-civilians');

  const moving = await advance(500);
  assert(moving.fleeingCrowds.every((crowd) => crowd.shelterState === 'OUTSIDE'), 'External civilians unexpectedly entered the disabled shelter movement flow');
  assert(moving.fleeingCrowds.some((crowd) => crowd.moving), 'External civilians are not moving outside shelters');
  await capture('02-citizens-outside');

  const settled = await advance(12000);
  const settledShelters = settled.targets.filter((target) => target.shelter);
  const shelteredCrowds = settled.fleeingCrowds.filter((crowd) => crowd.shelterState === 'SHELTERED');
  const blockedCrowds = settled.fleeingCrowds.filter((crowd) => crowd.shelterState === 'BLOCKED');
  assert(shelteredCrowds.length === 0 && blockedCrowds.length === 0, 'External civilians entered the disabled shelter movement flow');
  assert(settled.fleeingCrowds.every((crowd) => crowd.remainingAmount === 5000), 'External civilian groups changed before player interaction');
  assert(settledShelters.every((shelter) => shelter.shelter.occupants <= shelter.shelter.capacity + 0.001), 'A shelter exceeded capacity');
  assert(settledShelters.some((shelter) => shelter.shelter.occupants > 0), 'Shelter occupants were not retained');
  await capture('03-static-shelter-civilians');

  const occupiedShelter = settledShelters.find((shelter) => shelter.shelter.occupants > 0);
  assert(occupiedShelter, 'No occupied shelter was available for the destruction flow');
  const travelDirection = occupiedShelter.x < settled.ship.x ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(travelDirection);
  await advance(6800);
  await page.keyboard.up(travelDirection);
  const approach = await advance(1000);
  const targetShelter = approach.targets.find((target) => target.id === occupiedShelter.id);
  assert(targetShelter?.discovered, 'Occupied shelter was not discovered after approach');
  assert(Math.abs(approach.ship.x - occupiedShelter.x) <= 12, `Ship did not approach shelter: ${approach.ship.x} vs ${occupiedShelter.x}`);
  await page.keyboard.press(',');
  const breaching = await advance(2800);
  const breachingTarget = breaching.targets.find((target) => target.id === occupiedShelter.id);
  assert.equal(breachingTarget?.shelter?.state, 'BREACHING');
  await capture('04-shelter-breaching');
  const destroyed = await advance(500);
  await page.keyboard.press(',');
  const destroyedTarget = destroyed.targets.find((target) => target.id === occupiedShelter.id);
  assert.equal(destroyedTarget?.shelter?.state, 'DESTROYED');
  assert.equal(destroyedTarget?.shelter?.interactable, false);
  assert.equal(destroyedTarget?.status, 'AVAILABLE');
  assert((destroyedTarget?.shelter?.occupants ?? 0) > 0, 'Destroyed shelter did not expose its occupants');
  await capture('05-shelter-destroyed');

  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedResponses.length, 0, failedResponses.join('\n'));
  const result = {
    ok: true,
    initialShelters: initialShelters.map((shelter) => ({ id: shelter.id, capacity: shelter.shelter.capacity, occupants: shelter.shelter.occupants, state: shelter.shelter.state })),
    outsideCrowds: moving.fleeingCrowds.map((crowd) => ({ id: crowd.id, shelterState: crowd.shelterState, remainingAmount: crowd.remainingAmount })),
    settledShelters: settledShelters.map((shelter) => ({ id: shelter.id, capacity: shelter.shelter.capacity, occupants: shelter.shelter.occupants, availableSpace: shelter.shelter.availableSpace })),
    shelteredCrowds: shelteredCrowds.map((crowd) => ({ id: crowd.id, assignedShelterId: crowd.assignedShelterId, remainingAmount: crowd.remainingAmount })),
    blockedCrowds: blockedCrowds.map((crowd) => ({ id: crowd.id, remainingAmount: crowd.remainingAmount })),
    destroyedShelter: { id: occupiedShelter.id, state: destroyedTarget.shelter.state, interactable: destroyedTarget.shelter.interactable, occupants: destroyedTarget.shelter.occupants, status: destroyedTarget.status },
    errors,
    failedResponses,
  };
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, shelterCount: initialShelters.length, sheltered: shelteredCrowds.length, blocked: blockedCrowds.length, errors, failedResponses }));
} catch (error) {
  await capture('failure').catch(() => {});
  await writeFile(`${outputDirectory}/result.json`, JSON.stringify({ ok: false, error: String(error), errors, failedResponses }, null, 2));
  throw error;
} finally {
  await browser.close();
}
