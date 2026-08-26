import type { AirDefenseShotEvent, CombatState, MothershipHitEvent } from '../domain/types';

const ABSORPTION_BEAM_URL = '/assets/runtime/audio/sfx-absorption-beam-loop.mp3';
const SPACESHIP_LASER_URL = '/assets/runtime/audio/sfx-spacship_laser.mp3';
const SPACESHIP_BARRIER_URL = '/assets/runtime/audio/sfx-spaceship-barrier-defend.mp3';
const EXPLOSION_URL = '/assets/runtime/audio/sfx-explosion-sound.mp3';
const PLASMA_URL = '/assets/runtime/audio/sfx-plasma-sound.mp3';
const EMP_URL = '/assets/runtime/audio/sfx-emp-shock.mp3';

type AudioFactory = (source: string) => HTMLAudioElement;
type PlaybackSegment = { start: number; end: number };

/**
 * Runtime battle SFX are kept separate from the background music element so
 * actions can overlap without interrupting the music or one another.
 */
export class BattleSoundEffects {
  private readonly absorptionBeam: HTMLAudioElement;
  private readonly barrierDefend: HTMLAudioElement;
  private readonly oneShotAudios = new Set<HTMLAudioElement>();
  private readonly consumedHitIds = new Set<string>();
  private readonly consumedAirDefenseIds = new Set<string>();
  private readonly consumedAirDefenseTimes = new Set<number>();
  private readonly knownActiveEnemyIds = new Set<string>();
  private readonly knownActiveFacilityIds = new Set<string>();
  private readonly knownActiveDefenderIds = new Set<string>();
  private readonly knownNonDestroyedTargetIds = new Set<string>();
  private absorptionActive = false;
  private barrierDefendPlaying = false;
  private destructionStateInitialized = false;
  private disposed = false;

  constructor(private readonly audioFactory: AudioFactory = (source) => new Audio(source)) {
    this.absorptionBeam = this.createAudio(ABSORPTION_BEAM_URL, true, 0.48);
    this.barrierDefend = this.createAudio(SPACESHIP_BARRIER_URL, false, 0.68);
  }

  setAbsorptionActive(active: boolean): void {
    if (this.disposed || this.absorptionActive === active) return;
    this.absorptionActive = active;
    if (active) this.playLoop(this.absorptionBeam);
    else this.stopAudio(this.absorptionBeam);
  }

  playAbilitySound(ability: 'emp' | 'plasma'): void {
    if (this.disposed) return;
    this.playOneShot(ability === 'plasma' ? PLASMA_URL : EMP_URL, 0.58);
  }

  playExplosion(): void {
    if (this.disposed) return;
    this.playOneShot(EXPLOSION_URL, 0.64, { start: 1, end: 2 });
  }

  syncCombatState(state: Readonly<CombatState>): void {
    if (this.disposed) return;
    this.setAbsorptionActive(state.result === 'ACTIVE' && state.activeAbility === 'beam');
    this.syncMothershipHits(state.mothershipHits);
    this.syncAirDefenseShots(state.airDefenseShots);
    this.syncDestructionEvents(state);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.absorptionActive = false;
    this.stopAudio(this.absorptionBeam, true);
    this.stopAudio(this.barrierDefend, true);
    for (const audio of this.oneShotAudios) this.stopAudio(audio, true);
    this.oneShotAudios.clear();
    this.consumedHitIds.clear();
    this.consumedAirDefenseIds.clear();
    this.consumedAirDefenseTimes.clear();
    this.knownActiveEnemyIds.clear();
    this.knownActiveFacilityIds.clear();
    this.knownActiveDefenderIds.clear();
    this.knownNonDestroyedTargetIds.clear();
  }

  private syncMothershipHits(hits: readonly MothershipHitEvent[]): void {
    for (const hit of hits) {
      if (this.consumedHitIds.has(hit.id)) continue;
      this.consumedHitIds.add(hit.id);
      if (hit.kind === 'SHIELD') this.playBarrierDefend();
    }
    const retainedIds = new Set(hits.map((hit) => hit.id));
    for (const id of this.consumedHitIds) {
      if (!retainedIds.has(id)) this.consumedHitIds.delete(id);
    }
  }

  private syncAirDefenseShots(shots: readonly AirDefenseShotEvent[]): void {
    const retainedIds = new Set(shots.map((shot) => shot.id));
    const retainedTimes = new Set(shots.map((shot) => shot.occurredAt));
    for (const shot of shots) {
      if (this.consumedAirDefenseIds.has(shot.id)) continue;
      this.consumedAirDefenseIds.add(shot.id);
      // Multi-target laser fire creates one event per target at the same time.
      // Treat that group as one mothership trigger and play one sound.
      if (!this.consumedAirDefenseTimes.has(shot.occurredAt)) {
        this.consumedAirDefenseTimes.add(shot.occurredAt);
        this.playOneShot(SPACESHIP_LASER_URL, 0.62);
      }
    }
    for (const id of this.consumedAirDefenseIds) {
      if (!retainedIds.has(id)) this.consumedAirDefenseIds.delete(id);
    }
    for (const time of this.consumedAirDefenseTimes) {
      if (!retainedTimes.has(time)) this.consumedAirDefenseTimes.delete(time);
    }
  }

  private syncDestructionEvents(state: Readonly<CombatState>): void {
    const activeEnemyIds = new Set(state.enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id));
    const activeFacilityIds = new Set(state.facilities
      .filter((facility) => !facility.destroyed && facility.health > 0)
      .map((facility) => facility.id));
    const activeDefenderIds = new Set(state.groundDefenders
      .filter((defender) => defender.health > 0)
      .map((defender) => defender.id));
    const nonDestroyedTargetIds = new Set(state.absorbableTargets
      .filter((target) => target.status !== 'DESTROYED')
      .map((target) => target.id));

    if (this.destructionStateInitialized) {
      for (const id of this.knownActiveEnemyIds) if (!activeEnemyIds.has(id)) this.playExplosion();
      for (const id of this.knownActiveFacilityIds) if (!activeFacilityIds.has(id)) this.playExplosion();
      for (const id of this.knownActiveDefenderIds) if (!activeDefenderIds.has(id)) this.playExplosion();
      for (const id of this.knownNonDestroyedTargetIds) if (!nonDestroyedTargetIds.has(id)) {
        const target = state.absorbableTargets.find((candidate) => candidate.id === id);
        if (target?.status === 'DESTROYED') this.playExplosion();
      }
    }

    this.knownActiveEnemyIds.clear();
    activeEnemyIds.forEach((id) => this.knownActiveEnemyIds.add(id));
    this.knownActiveFacilityIds.clear();
    activeFacilityIds.forEach((id) => this.knownActiveFacilityIds.add(id));
    this.knownActiveDefenderIds.clear();
    activeDefenderIds.forEach((id) => this.knownActiveDefenderIds.add(id));
    this.knownNonDestroyedTargetIds.clear();
    nonDestroyedTargetIds.forEach((id) => this.knownNonDestroyedTargetIds.add(id));
    this.destructionStateInitialized = true;
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

  private playBarrierDefend(): void {
    if (this.barrierDefend.ended) this.barrierDefendPlaying = false;
    if (this.disposed || this.barrierDefendPlaying || (!this.barrierDefend.paused && !this.barrierDefend.ended)) return;
    this.barrierDefendPlaying = true;
    this.barrierDefend.currentTime = 0;
    void this.barrierDefend.play().catch(() => {
      this.barrierDefendPlaying = false;
      // Keep the battle running if the browser blocks audio playback.
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
