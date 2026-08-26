import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AirDefenseShotEvent, CombatState, MothershipHitEvent } from '../domain/types';
import { BattleSoundEffects } from './BattleSoundEffects';

class FakeAudio {
  readonly source: string;
  loop = false;
  preload = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  readyState = 1;
  playCount = 0;
  pauseCount = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(source: string) {
    this.source = source;
  }

  play(): Promise<void> {
    this.playCount += 1;
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCount += 1;
    this.paused = true;
  }

  load(): void {}

  removeAttribute(): void {}

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  finish(): void {
    this.paused = true;
    this.ended = true;
    this.listeners.get('ended')?.forEach((listener) => listener());
  }
}

function createState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    result: 'ACTIVE',
    activeAbility: null,
    mothershipHits: [],
    airDefenseShots: [],
    enemies: [],
    facilities: [],
    groundDefenders: [],
    absorbableTargets: [],
    ...overrides,
  } as CombatState;
}

function shieldHit(id: string, occurredAt: number): MothershipHitEvent {
  return { id, source: 'fighter', kind: 'SHIELD', direction: { x: 0, y: 0, z: -1 }, shieldDamage: 1, hullDamage: 0, occurredAt };
}

function airDefenseShot(id: string, occurredAt: number): AirDefenseShotEvent {
  return { id, targetId: id, origin: { x: 0, z: 0 }, target: { x: 1, z: 1 }, targetAltitude: 2, damage: 1, occurredAt };
}

describe('battle sound effects', () => {
  afterEach(() => vi.useRealTimers());

  it('plays and stops the absorption loop without restarting it during sync', () => {
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    const absorption = audios[0];

    sounds.setAbsorptionActive(true);
    sounds.setAbsorptionActive(true);
    expect(absorption.playCount).toBe(1);
    expect(absorption.loop).toBe(true);

    sounds.setAbsorptionActive(false);
    expect(absorption.pauseCount).toBe(1);
    sounds.setAbsorptionActive(true);
    expect(absorption.playCount).toBe(2);
  });

  it('does not overlap barrier sounds, then allows the next hit after playback ends', () => {
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    const state = createState();
    const barrier = audios[1];
    const first = shieldHit('hit-1', 1);
    const second = shieldHit('hit-2', 1.1);

    state.mothershipHits = [first, second];
    sounds.syncCombatState(state);
    expect(barrier.playCount).toBe(1);

    barrier.finish();
    state.mothershipHits = [first, second, shieldHit('hit-3', 4)];
    sounds.syncCombatState(state);
    expect(barrier.playCount).toBe(2);
  });

  it('plays one laser sound per multi-target firing event while allowing separate shots to overlap', () => {
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    const state = createState();
    state.airDefenseShots = [airDefenseShot('shot-1', 3), airDefenseShot('shot-2', 3)];
    sounds.syncCombatState(state);
    expect(audios.filter((audio) => audio.source.includes('sfx-spacship_laser')).length).toBe(1);

    state.airDefenseShots = [...state.airDefenseShots, airDefenseShot('shot-3', 6)];
    sounds.syncCombatState(state);
    expect(audios.filter((audio) => audio.source.includes('sfx-spacship_laser')).length).toBe(2);
    sounds.dispose();
  });

  it('plays plasma and EMP once per successful trigger and only uses seconds 1 through 2 for explosions', async () => {
    vi.useFakeTimers();
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });

    sounds.playAbilitySound('plasma');
    sounds.playAbilitySound('emp');
    sounds.playExplosion();
    await Promise.resolve();

    const plasma = audios.find((audio) => audio.source.includes('sfx-plasma-sound'))!;
    const emp = audios.find((audio) => audio.source.includes('sfx-emp-shock'))!;
    const explosion = audios.find((audio) => audio.source.includes('sfx-explosion-sound'))!;
    expect(plasma.playCount).toBe(1);
    expect(emp.playCount).toBe(1);
    expect(explosion.currentTime).toBe(1);

    vi.advanceTimersByTime(1250);
    expect(explosion.pauseCount).toBe(1);
    sounds.dispose();
  });

  it('plays an explosion when an active enemy, facility, defender, or target becomes destroyed', () => {
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    const state = createState();
    state.enemies = [{ id: 'fighter-1', health: 10 } as CombatState['enemies'][number]];
    state.facilities = [{ id: 'facility-1', health: 10, destroyed: false } as CombatState['facilities'][number]];
    state.groundDefenders = [{ id: 'defender-1', health: 10 } as CombatState['groundDefenders'][number]];
    state.absorbableTargets = [{ id: 'vehicle-1', status: 'AVAILABLE' } as CombatState['absorbableTargets'][number]];
    sounds.syncCombatState(state);
    state.enemies = [];
    state.facilities[0].health = 0;
    state.facilities[0].destroyed = true;
    state.groundDefenders[0].health = 0;
    state.absorbableTargets[0].status = 'DESTROYED';
    sounds.syncCombatState(state);

    expect(audios.filter((audio) => audio.source.includes('sfx-explosion-sound')).length).toBe(4);
    sounds.dispose();
  });
});
