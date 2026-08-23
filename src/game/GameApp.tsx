'use client';

import { useState } from 'react';
import { CITIES } from './data/cities';
import { createNewCampaign } from './domain/campaignRules';
import type { CampaignState } from './domain/types';
import { clearCampaign, loadCampaign, saveCampaign } from './infrastructure/persistence/saveRepository';
import { MainMenuScreen } from './presentation/screens/MainMenuScreen';
import { WorldMapScreen } from './presentation/screens/WorldMapScreen';
import { useI18n } from './i18n/I18nProvider';

type PhaseOneScreen = 'MAIN_MENU' | 'WORLD_MAP';

export function GameApp() {
  const { t } = useI18n();
  const [campaign, setCampaign] = useState<CampaignState | null>(() => loadCampaign());
  const [screen, setScreen] = useState<PhaseOneScreen>('MAIN_MENU');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(() => campaign?.currentCityId ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  const startNewGame = () => {
    const next = createNewCampaign(Date.now() % 1_000_000);
    saveCampaign(next);
    setCampaign(next);
    setSelectedCityId(null);
    setNotice(null);
    setScreen('WORLD_MAP');
  };

  const continueGame = () => {
    if (!campaign) {
      startNewGame();
      return;
    }
    setSelectedCityId(campaign.currentCityId);
    setNotice(null);
    setScreen('WORLD_MAP');
  };

  const resetGame = () => {
    clearCampaign();
    setCampaign(null);
    setSelectedCityId(null);
    setNotice(null);
    setScreen('MAIN_MENU');
  };

  const phaseOneUnavailable = () => {
    setNotice(t('phaseOne.battleUnavailable'));
  };

  if (!campaign || screen === 'MAIN_MENU') {
    return <MainMenuScreen hasSave={Boolean(campaign)} onNewGame={startNewGame} onContinue={continueGame} onReset={resetGame} />;
  }

  return <WorldMapScreen
    campaign={campaign}
    cities={CITIES}
    selectedCityId={selectedCityId}
    travel={null}
    notice={notice}
    onSelectCity={(cityId) => { setSelectedCityId(cityId); setNotice(null); }}
    onMove={phaseOneUnavailable}
    onEngage={phaseOneUnavailable}
    onOpenUpgrades={phaseOneUnavailable}
    onReturnMenu={() => { setNotice(null); setScreen('MAIN_MENU'); }}
  />;
}
