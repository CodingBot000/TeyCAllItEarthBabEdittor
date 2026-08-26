'use client';

import { useCallback, useEffect, useState } from 'react';
import { CITIES } from './data/cities';
import { CITY_BY_ID } from './data/world';
import { isPlayableCity } from './data/playableCities';
import { createNewCampaign, stageMissionResult } from './domain/campaignRules';
import { finalizeDebriefAllocation } from './domain/conversionRules';
import { advanceCampaignTransit, commitMissionLaunch, grantEmergencyTravelCharge } from './domain/logisticsRules';
import type { CampaignState, CampaignTransitState, CombatState, DebriefSummary, MissionLoadout } from './domain/types';
import { clearCampaign, loadCampaign, saveCampaign } from './infrastructure/persistence/saveRepository';
import { battleRequestFor, type BattleLaunchRequest } from './battle/BattleGateway';
import { BattleScreen } from './battle/BattleScreen';
import { getBattleDebugOptions } from './battle/gameplay/BattleDebug';
import { battleMapIdForStage } from './battle/gameplay/battleSetupRules';
import { MainMenuScreen } from './presentation/screens/MainMenuScreen';
import { MissionLoadoutScreen } from './presentation/screens/MissionLoadoutScreen';
import { WorldMapScreen } from './presentation/screens/WorldMapScreen';
import { DebriefScreen } from './presentation/screens/DebriefScreen';
import { DebriefAllocationScreen } from './presentation/screens/DebriefAllocationScreen';
import { UpgradeScreen } from './presentation/screens/UpgradeScreen';
import { BackgroundMusic } from './audio/BackgroundMusic';

type GameScreen = 'MAIN_MENU' | 'WORLD_MAP' | 'MISSION_LOADOUT' | 'TRAVEL' | 'BATTLE' | 'DEBRIEF' | 'DEBRIEF_ALLOCATION' | 'UPGRADE';

export function GameApp() {
  const [campaign, setCampaign] = useState<CampaignState | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [screen, setScreen] = useState<GameScreen>('MAIN_MENU');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [travel, setTravel] = useState<CampaignTransitState | null>(null);
  const [battleRequest, setBattleRequest] = useState<BattleLaunchRequest | null>(null);
  const [debrief, setDebrief] = useState<DebriefSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDebugSession, setIsDebugSession] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const debugOptions = getBattleDebugOptions(window.location.search);
    const debugCityId = debugOptions.cityId && CITY_BY_ID[debugOptions.cityId] ? debugOptions.cityId : 'seoul';
    const saved = loadCampaign();
    if (debugOptions.directBattle) {
      const debugCampaign = structuredClone(saved ?? createNewCampaign(90210));
      debugCampaign.currentCityId = debugCityId;
      setCampaign(debugCampaign);
      setIsDebugSession(true);
      setSelectedCityId(debugCityId);
      setBattleRequest(battleRequestFor(debugCampaign, debugCityId, debugOptions.mapId ?? battleMapIdForStage(CITY_BY_ID[debugCityId], debugCampaign.completedBattles + 1)));
      setScreen('BATTLE');
    } else {
      setCampaign(saved);
      setIsDebugSession(false);
      setSelectedCityId(saved?.pendingDebrief?.cityId ?? saved?.activeTransit?.toCityId ?? saved?.plannedMission?.cityId ?? saved?.currentCityId ?? null);
      setTravel(saved?.activeTransit ?? null);
    }
    setStorageReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!campaign?.activeTransit) return;
    const interval = window.setInterval(() => {
      setCampaign((previous) => {
        if (!previous?.activeTransit) return previous;
        const next = advanceCampaignTransit(previous, 0.05);
        if (!isDebugSession) saveCampaign(next);
        setTravel(next.activeTransit);
        if (!next.activeTransit) {
          setSelectedCityId(next.currentCityId);
          setScreen('MISSION_LOADOUT');
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(interval);
  // The interval body uses a functional state update; only a new transit identity should restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.activeTransit?.loadoutId, isDebugSession]);

  const startNewGame = () => {
    const next = createNewCampaign(Date.now() % 1_000_000);
    saveCampaign(next);
    setIsDebugSession(false);
    setCampaign(next);
    setSelectedCityId(null);
    setTravel(null);
    setBattleRequest(null);
    setDebrief(null);
    setNotice(null);
    setScreen('WORLD_MAP');
  };

  const startQuickBattle = (mapId = 'city-day') => {
    const cityId = 'seoul';
    const debugCampaign = createNewCampaign(90210);
    debugCampaign.currentCityId = cityId;
    const query = mapId === 'city-night' ? '?battle-fast=1&map=city-night' : '?battle-fast=1';
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
    setIsDebugSession(true);
    setCampaign(debugCampaign);
    setSelectedCityId(cityId);
    setTravel(null);
    setBattleRequest(battleRequestFor(debugCampaign, cityId, mapId));
    setDebrief(null);
    setNotice(null);
    setScreen('BATTLE');
  };

  const startQuickNightBattle = () => startQuickBattle('city-night');

  const continueGame = () => {
    if (!campaign) {
      startNewGame();
      return;
    }
    setNotice(null);
    setBattleRequest(null);
    if (campaign.pendingDebrief) {
      setSelectedCityId(campaign.pendingDebrief.cityId);
      setScreen('DEBRIEF_ALLOCATION');
    } else if (campaign.activeTransit) {
      setTravel(campaign.activeTransit);
      setSelectedCityId(campaign.activeTransit.toCityId);
      setScreen('TRAVEL');
    } else if (campaign.plannedMission && campaign.currentCityId === campaign.plannedMission.cityId) {
      setSelectedCityId(campaign.plannedMission.cityId);
      setScreen('MISSION_LOADOUT');
    } else {
      setSelectedCityId(campaign.currentCityId);
      setScreen('WORLD_MAP');
    }
  };

  const resetGame = () => {
    clearCampaign();
    setIsDebugSession(false);
    setCampaign(null);
    setSelectedCityId(null);
    setTravel(null);
    setBattleRequest(null);
    setDebrief(null);
    setNotice(null);
    setScreen('MAIN_MENU');
  };

  const openMissionLoadout = () => {
    if (!campaign || !selectedCityId || !isPlayableCity(selectedCityId) || campaign.activeTransit) return;
    setNotice(null);
    setScreen('MISSION_LOADOUT');
  };

  const commitMission = (loadout: MissionLoadout) => {
    if (!campaign) return;
    const next = commitMissionLaunch(campaign, loadout);
    if (!next.activeTransit) return;
    if (!isDebugSession) saveCampaign(next);
    setCampaign(next);
    setTravel(next.activeTransit);
    setSelectedCityId(next.activeTransit.toCityId);
    setScreen('TRAVEL');
  };

  const requestEmergencyCharge = () => {
    if (!campaign) return;
    const next = grantEmergencyTravelCharge(campaign);
    if (!isDebugSession) saveCampaign(next);
    setCampaign(next);
  };

  const enterBattle = () => {
    if (!campaign || !selectedCityId || !isPlayableCity(selectedCityId)) return;
    setBattleRequest(battleRequestFor(campaign, selectedCityId, battleMapIdForStage(CITY_BY_ID[selectedCityId], campaign.completedBattles + 1)));
    setScreen('BATTLE');
  };

  const completeBattle = useCallback((combat: CombatState) => {
    const city = CITY_BY_ID[combat.cityId];
    if (!campaign || !city) return;
    const next = stageMissionResult(campaign, combat, city);
    const recoveredCargo = next.pendingDebrief?.cargoRecovered ?? combat.cargo;
    const summary: DebriefSummary = {
      success: combat.result === 'SUCCESS',
      outcome: combat.result === 'ACTIVE' ? 'FAILED' : combat.result,
      cityName: city.name,
      timeSeconds: combat.elapsedSeconds,
      harvestedPopulation: combat.harvestedPopulation,
      totalAbsorbed: combat.totalAbsorbed,
      cargoCapacity: combat.mothership.maxCargo,
      cargo: { ...recoveredCargo },
      absorbedByKind: { ...combat.absorbedByKind },
      earned: { biomass: recoveredCargo.biomass, alloy: recoveredCargo.alloy, intel: recoveredCargo.intel },
      destruction: next.cities[city.id].destruction,
      globalThreatDelta: next.pendingDebrief?.globalThreatDelta ?? next.globalThreat - campaign.globalThreat,
      destroyedInfrastructure: combat.destroyedInfrastructure,
      hullRatio: combat.mothership.hull / combat.mothership.maxHull,
      shieldRatio: combat.mothership.shield / combat.mothership.maxShield,
      repairAssessment: next.pendingDebrief?.repairAssessment,
    };
    if (!isDebugSession) saveCampaign(next);
    setCampaign(next);
    setDebrief(summary);
    setSelectedCityId(combat.cityId);
    setBattleRequest(null);
    setScreen('DEBRIEF');
  }, [campaign, isDebugSession]);

  const renderWithBackgroundMusic = (content: React.ReactNode) => (
    <>
      <BackgroundMusic isBattle={screen === 'BATTLE'} />
      {content}
    </>
  );

  if (!storageReady || !campaign || screen === 'MAIN_MENU') {
    return renderWithBackgroundMusic(<MainMenuScreen hasSave={Boolean(campaign)} onNewGame={startNewGame} onContinue={continueGame} onQuickBattle={process.env.NODE_ENV !== 'production' ? () => startQuickBattle() : undefined} onQuickNightBattle={process.env.NODE_ENV !== 'production' ? startQuickNightBattle : undefined} onReset={resetGame} />);
  }

  const selectedCity = selectedCityId ? CITY_BY_ID[selectedCityId] : null;

  if (screen === 'MISSION_LOADOUT' && selectedCity) {
    const existingLoadout = campaign.plannedMission?.cityId === selectedCity.id && !campaign.activeTransit ? campaign.plannedMission : null;
    return renderWithBackgroundMusic(<MissionLoadoutScreen campaign={campaign} city={selectedCity} existingLoadout={existingLoadout} onCancel={() => setScreen('WORLD_MAP')} onConfirm={commitMission} onResume={enterBattle} onEmergencyCharge={requestEmergencyCharge} />);
  }

  if (screen === 'WORLD_MAP' || screen === 'TRAVEL') {
    return renderWithBackgroundMusic(<WorldMapScreen campaign={campaign} cities={CITIES} selectedCityId={selectedCityId} travel={travel} notice={notice} onSelectCity={(cityId) => { setSelectedCityId(cityId); setNotice(null); }} onMove={openMissionLoadout} onEngage={enterBattle} onOpenUpgrades={() => setScreen('UPGRADE')} onReturnMenu={() => { setNotice(null); setScreen('MAIN_MENU'); }} />);
  }

  if (screen === 'BATTLE' && battleRequest) {
    return renderWithBackgroundMusic(<BattleScreen campaign={campaign} request={battleRequest} onComplete={completeBattle} />);
  }

  if (screen === 'DEBRIEF' && debrief) {
    return renderWithBackgroundMusic(<DebriefScreen summary={debrief} onAllocate={() => { setDebrief(null); setScreen('DEBRIEF_ALLOCATION'); }} />);
  }

  if (screen === 'DEBRIEF_ALLOCATION' && campaign.pendingDebrief) {
    return renderWithBackgroundMusic(<DebriefAllocationScreen campaign={campaign} pending={campaign.pendingDebrief} onFinalize={(plan) => {
      const finalized = finalizeDebriefAllocation(campaign, plan);
      if (finalized === campaign) return;
      if (!isDebugSession) saveCampaign(finalized);
      setCampaign(finalized);
      setSelectedCityId(campaign.pendingDebrief?.cityId ?? null);
      setScreen('WORLD_MAP');
    }} />);
  }

  if (screen === 'UPGRADE') {
    return renderWithBackgroundMusic(<UpgradeScreen campaign={campaign} onSave={(next) => { if (!isDebugSession) saveCampaign(next); setCampaign(next); }} onBack={() => setScreen('WORLD_MAP')} />);
  }

  return renderWithBackgroundMusic(null);
}
