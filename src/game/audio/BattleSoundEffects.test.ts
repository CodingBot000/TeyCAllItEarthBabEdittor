import { describe, expect, it } from 'vitest';
import type { AirDefenseShotEvent, CombatState } from '../domain/types';
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

function airDefenseShot(id: string, occurredAt: number): AirDefenseShotEvent {
  return { id, targetId: id, origin: { x: 0, z: 0 }, target: { x: 1, z: 1 }, targetAltitude: 2, damage: 1, occurredAt };
}

describe('battle sound effects', () => {
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
    const firstLaser = audios.find((audio) => audio.source.includes('sfx-spacship_laser'))!;
    expect(audios.filter((audio) => audio.source.includes('sfx-spacship_laser')).length).toBe(1);
    expect(firstLaser.volume).toBe(0.32);

    state.airDefenseShots = [...state.airDefenseShots, airDefenseShot('shot-3', 6)];
    sounds.syncCombatState(state);
    expect(audios.filter((audio) => audio.source.includes('sfx-spacship_laser')).length).toBe(2);
    sounds.dispose();
  });

  it('plays plasma and EMP once per successful trigger', async () => {
    const audios: FakeAudio[] = [];
    const sounds = new BattleSoundEffects((source) => {
      const audio = new FakeAudio(source);
      audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    });

    sounds.playAbilitySound('plasma');
    sounds.playAbilitySound('emp');
    await Promise.resolve();

    const plasma = audios.find((audio) => audio.source.includes('sfx-plasma-sound'))!;
    const emp = audios.find((audio) => audio.source.includes('sfx-emp-shock'))!;
    expect(plasma.playCount).toBe(1);
    expect(emp.playCount).toBe(1);
    sounds.dispose();
  });
});
