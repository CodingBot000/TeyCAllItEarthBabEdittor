'use client';

import { GameApp } from '../game/GameApp';
import { I18nProvider } from '../game/i18n/I18nProvider';
import { MobileLandscapeGuard } from '../game/presentation/MobileLandscapeGuard';
import '../game/presentation/styles.css';

export default function Home() {
  return (
    <I18nProvider>
      <GameApp />
      <MobileLandscapeGuard />
    </I18nProvider>
  );
}
