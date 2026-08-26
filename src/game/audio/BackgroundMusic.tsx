'use client';

import { useEffect, useRef } from 'react';

const MENU_BGM_URL = '/assets/runtime/audio/bgm-menu.mp3';
const BATTLE_BGM_URL = '/assets/runtime/audio/bgm-battle.mp3';
const BACKGROUND_MUSIC_ENABLED = true;

type BackgroundMusicProps = {
  isBattle: boolean;
};

export function BackgroundMusic({ isBattle }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<string | null>(null);
  const playbackBlockedRef = useRef(false);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.35;
    audio.setAttribute('playsinline', '');
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      trackRef.current = null;
      playbackBlockedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !BACKGROUND_MUSIC_ENABLED) return undefined;

    const nextTrack = isBattle ? BATTLE_BGM_URL : MENU_BGM_URL;
    const play = () => {
      if (!audio.paused) return;
      const playPromise = audio.play();
      if (playPromise) {
        void playPromise.then(() => {
          playbackBlockedRef.current = false;
        }).catch(() => {
          playbackBlockedRef.current = true;
        });
      }
    };

    // Attach readiness listeners before load(). This avoids missing canplay
    // for cached tracks and avoids racing load() against play().
    audio.addEventListener('canplay', play, { once: true });
    audio.addEventListener('canplaythrough', play, { once: true });
    if (trackRef.current !== nextTrack) {
      trackRef.current = nextTrack;
      audio.pause();
      audio.src = nextTrack;
      audio.load();
    } else if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      play();
    }

    return () => {
      audio.removeEventListener('canplay', play);
      audio.removeEventListener('canplaythrough', play);
    };
  }, [isBattle]);

  useEffect(() => {
    if (!BACKGROUND_MUSIC_ENABLED) return undefined;
    const resumeAudio = () => {
      const audio = audioRef.current;
      if (audio && (audio.paused || playbackBlockedRef.current)) {
        const playPromise = audio.play();
        if (playPromise) {
          void playPromise.then(() => {
            playbackBlockedRef.current = false;
          }).catch(() => {
            playbackBlockedRef.current = true;
          });
        }
      }
    };

    document.addEventListener('pointerdown', resumeAudio, { passive: true });
    document.addEventListener('keydown', resumeAudio);
    document.addEventListener('click', resumeAudio, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
      document.removeEventListener('click', resumeAudio);
    };
  }, []);

  return null;
}
