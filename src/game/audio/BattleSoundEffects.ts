import type { AirDefenseShotEvent, CombatState } from '../domain/types';

const ABSORPTION_BEAM_URL = '/assets/runtime/audio/sfx-absorption-beam-loop.mp3';
const SPACESHIP_LASER_URL = '/assets/runtime/audio/sfx-spacship_laser.mp3';
const PLASMA_URL = '/assets/runtime/audio/sfx-plasma-sound.mp3';
const EMP_URL = '/assets/runtime/audio/sfx-emp-shock.mp3';
export const BATTLE_SOUND_EFFECTS_ENABLED = false;

type AudioFactory = (source: string) => HTMLAudioElement;
type PlaybackSegment = { start: number; end: number };

/**
 * Runtime battle SFX are kept separate from the background music element so
 * actions can overlap without interrupting the music or one another.
 */
export class BattleSoundEffects {
  private readonly absorptionBeam: HTMLAudioElement | null;
  private readonly oneShotAudios = new Set<HTMLAudioElement>();
  private readonly consumedAirDefenseIds = new Set<string>();
  private readonly consumedAirDefenseTimes = new Set<number>();
  private absorptionActive = false;
  private disposed = false;

  constructor(
    private readonly audioFactory: AudioFactory = (source) => new Audio(source),
    private readonly enabled = BATTLE_SOUND_EFFECTS_ENABLED,
  ) {
    this.absorptionBeam = this.enabled ? this.createAudio(ABSORPTION_BEAM_URL, true, 0.48) : null;
  }

  setAbsorptionActive(active: boolean): void {
    if (!this.enabled || this.disposed || this.absorptionActive === active) return;
    this.absorptionActive = active;
    if (active && this.absorptionBeam) this.playLoop(this.absorptionBeam);
    else if (this.absorptionBeam) this.stopAudio(this.absorptionBeam);
  }

  playAbilitySound(ability: 'emp' | 'plasma'): void {
    if (!this.enabled || this.disposed) return;
    this.playOneShot(ability === 'plasma' ? PLASMA_URL : EMP_URL, 0.58);
  }

  syncCombatState(state: Readonly<CombatState>): void {
    if (!this.enabled || this.disposed) return;
    this.setAbsorptionActive(state.result === 'ACTIVE' && state.activeAbility === 'beam');
    this.syncAirDefenseShots(state.airDefenseShots);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.absorptionActive = false;
    if (this.absorptionBeam) this.stopAudio(this.absorptionBeam, true);
    for (const audio of this.oneShotAudios) this.stopAudio(audio, true);
    this.oneShotAudios.clear();
    this.consumedAirDefenseIds.clear();
    this.consumedAirDefenseTimes.clear();
  }

  private syncAirDefenseShots(shots: readonly AirDefenseShotEvent[]): void {
    if (!this.enabled) return;
    const retainedIds = new Set(shots.map((shot) => shot.id));
    const retainedTimes = new Set(shots.map((shot) => shot.occurredAt));
    for (const shot of shots) {
      if (this.consumedAirDefenseIds.has(shot.id)) continue;
      this.consumedAirDefenseIds.add(shot.id);
      // Multi-target laser fire creates one event per target at the same time.
      // Treat that group as one mothership trigger and play one sound.
      if (!this.consumedAirDefenseTimes.has(shot.occurredAt)) {
        this.consumedAirDefenseTimes.add(shot.occurredAt);
        this.playOneShot(SPACESHIP_LASER_URL, 0.32);
      }
    }
    for (const id of this.consumedAirDefenseIds) {
      if (!retainedIds.has(id)) this.consumedAirDefenseIds.delete(id);
    }
    for (const time of this.consumedAirDefenseTimes) {
      if (!retainedTimes.has(time)) this.consumedAirDefenseTimes.delete(time);
    }
  }

  private createAudio(source: string, loop: boolean, volume: number): HTMLAudioElement {
    const audio = this.audioFactory(source);
    audio.loop = loop;
    audio.preload = 'auto';
    audio.volume = volume;
    return audio;
  }

  private playLoop(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Browser autoplay policy may wait for a user gesture.
    });
  }

  private playOneShot(source: string, volume: number, segment?: PlaybackSegment): void {
    if (this.disposed) return;
    const audio = this.createAudio(source, false, volume);
    this.oneShotAudios.add(audio);
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    let metadataListener: (() => void) | null = null;
    let timeUpdateListener: (() => void) | null = null;
    let started = false;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (endTimer !== null) clearTimeout(endTimer);
      if (metadataListener) audio.removeEventListener('loadedmetadata', metadataListener);
      if (timeUpdateListener) audio.removeEventListener('timeupdate', timeUpdateListener);
      audio.removeEventListener('ended', cleanup);
      this.oneShotAudios.delete(audio);
      this.stopAudio(audio, true);
    };
    audio.addEventListener('ended', cleanup, { once: true });
    const startPlayback = () => {
      if (started || cleaned) return;
      started = true;
      audio.currentTime = segment?.start ?? 0;
      if (segment) {
        timeUpdateListener = () => {
          if (audio.currentTime >= segment.end) cleanup();
        };
        audio.addEventListener('timeupdate', timeUpdateListener);
      }
      const playPromise = audio.play();
      if (!segment) {
        void playPromise.catch(cleanup);
        return;
      }
      void playPromise.then(() => {
        if (!cleaned) endTimer = setTimeout(cleanup, Math.max(0, segment.end - segment.start) * 1000 + 250);
      }).catch(cleanup);
    };
    if (segment && audio.readyState < 1) {
      metadataListener = startPlayback;
      audio.addEventListener('loadedmetadata', metadataListener, { once: true });
    } else {
      startPlayback();
    }
  }

  private stopAudio(audio: HTMLAudioElement, releaseSource = false): void {
    audio.pause();
    audio.currentTime = 0;
    if (releaseSource) {
      audio.removeAttribute('src');
      audio.load();
    }
  }
}
