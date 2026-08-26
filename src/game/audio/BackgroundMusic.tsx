'use client';

import { useEffect, useRef } from 'react';

const MENU_BGM_URL = '/assets/runtime/audio/bgm-menu.mp3';
const BATTLE_BGM_URL = '/assets/runtime/audio/bgm-battle.mp3';
const BACKGROUND_MUSIC_ENABLED = false;

type BackgroundMusicProps = {
  isBattle: boolean;
};

export function BackgroundMusic({ isBattle }: BackgroundMusicProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.35;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      trackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !BACKGROUND_MUSIC_ENABLED) return undefined;

    const nextTrack = isBattle ? BATTLE_BGM_URL : MENU_BGM_URL;
    if (trackRef.current !== nextTrack) {
      trackRef.current = nextTrack;
      audio.src = nextTrack;
      audio.load();
    }

    const play = () => {
      void audio.play().catch(() => {
        // Browsers may block autoplay until the user interacts with the page.
      });
    };

    audio.addEventListener('canplay', play, { once: true });
    play();

    return () => audio.removeEventListener('canplay', play);
  }, [isBattle]);

  useEffect(() => {
    if (!BACKGROUND_MUSIC_ENABLED) return undefined;
    const resumeAudio = () => {
      const audio = audioRef.current;
      if (audio?.paused) {
        void audio.play().catch(() => {
          // Keep waiting for a browser gesture if playback is still blocked.
        });
      }
    };

    document.addEventListener('pointerdown', resumeAudio, { passive: true });
    document.addEventListener('keydown', resumeAudio);
    return () => {
      document.removeEventListener('pointerdown', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
  }, []);

  return null;
}
