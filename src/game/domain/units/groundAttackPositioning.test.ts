import { describe, expect, it } from 'vitest';
import { createFixedStepper } from '../sideViewSpatialRules';
import { createGroundPositioningState, tickGroundCombatAi, type GroundCombatInput } from './groundCombatAi';
import { SAM_ATTACK_POLICY, SAM_COMBAT_PROFILE } from './unitCombatProfiles';

function fixture(x = 0): GroundCombatInput {
  return { id: 'unit-a', root: { x, y: 0, z: 1.1 }, target: { center: { x: 0, y: 33, z: 0 }, radii: { x: 10.9, y: 3.1, z: 10.9 }, kind: 'SHIELD', revision: 1 },
    previous: createGroundPositioningState('unit-a'), profile: SAM_COMBAT_PROFILE, policy: SAM_ATTACK_POLICY,
    worldBounds: { minX: -132, maxX: 132 }, visibleBounds: { minX: -120, maxX: 120 }, baseSpeed: 17, dt: 1 / 60, now: 0, disabled: false };
}
function step(input: GroundCombatInput, seconds = input.dt) {
  const result = tickGroundCombatAi({ ...input, dt: seconds });
  input.root.x = result.x; input.previous = result.state; input.now += seconds;
  return result;
}
describe('common ground attack positioning', () => {
  it.each([0, -120, 120])('reaches HOLD from x=%s within travel time, never exceeding 70%% speed', (x) => {
    const input = fixture(x);
    for (let i = 0; i < 1200 && input.previous.mode !== 'HOLD'; i += 1) {
      const before = input.root.x; step(input);
      expect(Math.abs(input.root.x - before)).toBeLessThanOrEqual(11.9 / 60 + 1e-9);
    }
    expect(input.previous.mode).toBe('HOLD');
    expect(input.previous.canFire).toBe(true);
    const held = input.root.x;
    for (let i = 0; i < 180; i += 1) step(input);
    expect(input.root.x).toBe(held);
  });
  it('moves at 11.9 with a stationary target, and holds rather than broadening forbidden angles', () => {
    const input = fixture(0);
    const result = step(input, 0.1);
    expect(Math.abs(result.x)).toBeCloseTo(1.19, 10);
    expect(result.state.canFire).toBe(false);
    expect(result.state.mode).toBe('RETREAT');
  });
  it('commits to the other side when the current side is blocked, crossing underneath without oscillation', () => {
    const input = fixture(10); input.visibleBounds = { minX: -90, maxX: 20 };
    step(input);
    expect(input.previous.mode).toBe('REPOSITION');
    const goal = input.previous.goalX;
    for (let i = 0; i < 900 && input.previous.mode !== 'HOLD'; i += 1) {
      const result = step(input);
      expect(input.previous.goalX).toBe(goal);
      if (result.state.mode !== 'HOLD') expect(result.state.canFire).toBe(false);
    }
    expect(input.root.x).toBeLessThan(0);
    expect(input.previous.mode).toBe('HOLD');
    expect(input.previous.facingX).toBe(1);
  });
  it('waits if both sides are blocked, and replans after the target moves', () => {
    const input = fixture(); input.visibleBounds = { minX: -15, maxX: 15 };
    for (let i = 0; i < 120; i += 1) step(input);
    expect(input.root.x).toBe(0);
    expect(input.previous.mode).toBe('WAIT_FOR_SPACE');
    input.target!.center.x = 45;
    for (let i = 0; i < 120; i += 1) step(input);
    expect(input.previous.mode).toBe('HOLD');
  });
  it('does not clamp offscreen units when the camera moves or viewport narrows', () => {
    const input = fixture(-120); input.visibleBounds = { minX: -50, maxX: 50 };
    step(input, 0.1);
    expect(input.root.x).toBeCloseTo(-118.81, 8);
    expect(input.previous.mode).toBe('ENTER_VIEW');
    input.visibleBounds = { minX: 20, maxX: 70 };
    step(input, 0.1);
    expect(input.root.x).toBeCloseTo(-117.62, 8);
    expect(input.previous.canFire).toBe(false);
    input.visibleBounds = { minX: 0, maxX: 3 };
    step(input);
    expect(input.previous.mode).toBe('WAIT_FOR_SPACE');
  });
  it('does not outrun a faster camera or target', () => {
    const input = fixture(-40);
    for (let i = 0; i < 600; i += 1) {
      input.target!.center.x += 17 / 60;
      input.visibleBounds.minX += 17 / 60; input.visibleBounds.maxX += 17 / 60;
      const before = input.root.x; step(input);
      expect(Math.abs(input.root.x - before)).toBeLessThanOrEqual(11.9 / 60 + 1e-8);
    }
    expect(input.previous.canFire).toBe(false);
  });
  it('freezes movement and facing during EMP, and stops without a target', () => {
    const input = fixture(); step(input);
    const x = input.root.x; const facing = input.previous.facingX;
    input.disabled = true; step(input, 1);
    expect(input.root.x).toBe(x); expect(input.previous.facingX).toBe(facing);
    expect(input.previous.mode).toBe('DISABLED');
    input.disabled = false; input.target = null; step(input);
    expect(input.previous.mode).toBe('NO_TARGET');
  });
  it('accepts a different attack policy without unit-specific branches', () => {
    const input = fixture();
    input.policy = {
      findFiringIntervals: () => [{ minX: 8, maxX: 12, facingX: -1 }],
      evaluateShot: ({ origin }) => origin.x >= 8 && origin.x <= 12
        ? { allowed: true, aimPoint: { x: 0, y: 0, z: 0 }, launchDirection: { x: -1, y: 0, z: 0 }, launchAngleRadians: 0, targetVolumeRevision: 1, targetKind: 'GROUND' }
        : { allowed: false, reason: 'TEST_RANGE' },
    };
    input.profile = { ...input.profile, muzzle: { x: 0, y: 0, z: 0 } };
    for (let i = 0; i < 120; i += 1) step(input);
    expect(input.previous.mode).toBe('HOLD'); expect(input.root.x).toBe(10);
  });
  it('produces identical results at 30/60/120 FPS and with a large advanceTime delta', () => {
    const run = (fps: number) => {
      const input = fixture(-120); const advance = createFixedStepper((dt) => step(input, dt));
      for (let i = 0; i < fps * 5; i += 1) advance(1 / fps);
      return input;
    };
    expect(run(30)).toEqual(run(60)); expect(run(120)).toEqual(run(60));
    const single = fixture(-120); createFixedStepper((dt) => step(single, dt))(5);
    expect(single).toEqual(run(60));
  });
});
