'use client';

import { useCallback, useEffect, useState } from 'react';
import { CITIES } from './data/cities';
import { CITY_BY_ID } from './data/world';
import { applyCombatResult, createNewCampaign } from './domain/campaignRules';
import type { CampaignState } from './domain/types';
import { clearCampaign, loadCampaign, saveCampaign } from './infrastructure/persistence/saveRepository';
import { battleRequestFor, type BattleLaunchRequest } from './battle/BattleGateway';
import { BattleScreen } from './battle/BattleScreen';
import { MainMenuScreen } from './presentation/screens/MainMenuScreen';
import { WorldMapScreen } from './presentation/screens/WorldMapScreen';
import { useI18n } from './i18n/I18nProvider';

type PhaseOneScreen = 'MAIN_MENU' | 'WORLD_MAP' | 'BATTLE';

export function GameApp() {
  const { t } = useI18n();
  // Read localStorage after hydration so the server and first client render stay identical.
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [screen, setScreen] = useState<PhaseOneScreen>('MAIN_MENU');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [battleRequest, setBattleRequest] = useState<BattleLaunchRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // This effect is intentionally a hydration gate: localStorage is unavailable during SSR.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadCampaign();
    setCampaign(saved);
    setSelectedCityId(saved?.currentCityId ?? null);
    setStorageReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const startNewGame = () => {
    const next = createNewCampaign(Date.now() % 1_000_000);
    saveCampaign(next);
    setCampaign(next);
    setSelectedCityId(null);
    setNotice(null);
    setBattleRequest(null);
    setScreen('WORLD_MAP');
  };

  const continueGame = () => {
    if (!campaign) {
      startNewGame();
      return;
    }
    setSelectedCityId(campaign.currentCityId);
    setNotice(null);
    setBattleRequest(null);
    setScreen('WORLD_MAP');
  };

  const resetGame = () => {
    clearCampaign();
    setCampaign(null);
    setSelectedCityId(null);
    setNotice(null);
    setBattleRequest(null);
    setScreen('MAIN_MENU');
  };

  const phaseOneUnavailable = () => {
    setNotice(t('phaseOne.battleUnavailable'));
  };

  const enterBattle = () => {
    if (!campaign || !selectedCityId) return;
    setBattleRequest(battleRequestFor(campaign, selectedCityId));
    setScreen('BATTLE');
  };

  const completeBattle = useCallback((combat: import('./domain/types').CombatState) => {
    const city = CITY_BY_ID[combat.cityId];
    if (!campaign || !city) return;
    const next = applyCombatResult(campaign, combat, city);
    saveCampaign(next);
    setCampaign(next);
    setBattleRequest(null);
    setScreen('WORLD_MAP');
  }, [campaign]);

  if (!storageReady || !campaign || screen === 'MAIN_MENU') {
    return <MainMenuScreen hasSave={Boolean(campaign)} onNewGame={startNewGame} onContinue={continueGame} onReset={resetGame} />;
  }

  if (screen === 'BATTLE' && battleRequest) {
    return <BattleScreen request={battleRequest} onComplete={completeBattle} onExit={() => { setBattleRequest(null); setScreen('WORLD_MAP'); }} />;
  }

  return <WorldMapScreen
    campaign={campaign}
    cities={CITIES}
    selectedCityId={selectedCityId}
    travel={null}
    notice={notice}
    onSelectCity={(cityId) => { setSelectedCityId(cityId); setNotice(null); }}
    onMove={phaseOneUnavailable}
    onEngage={enterBattle}
    onOpenUpgrades={phaseOneUnavailable}
    onReturnMenu={() => { setNotice(null); setScreen('MAIN_MENU'); }}
  />;
}
