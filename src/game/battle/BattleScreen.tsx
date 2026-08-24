'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CITY_BY_ID } from '../data/cities';
import type { CombatState } from '../domain/types';
import { loadCampaign } from '../infrastructure/persistence/saveRepository';
import type { BattleLaunchRequest } from './BattleGateway';
import { createSideViewBattleSession } from './gameplay/sideViewBattleRules';
import { getBattleMapDefinition, loadBattleMapDefinition } from './maps/battleMapCatalog';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import type { BattleRuntime, BattleRuntimeSnapshot } from './runtime/createBattleRuntime';
import { useI18n } from '../i18n/I18nProvider';

interface BattleScreenProps {
  request: BattleLaunchRequest;
  onExit: () => void;
  onComplete?: (state: CombatState) => void;
}

export function BattleScreen({ request, onExit, onComplete }: BattleScreenProps) {
  const { formatNumber, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<BattleRuntime | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BattleRuntimeSnapshot | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const fallbackMap = getBattleMapDefinition(request.mapId);
  const [loadedMap, setLoadedMap] = useState<typeof fallbackMap | null>(null);
  const map = loadedMap?.id === fallbackMap.id ? loadedMap : fallbackMap;
  const [campaign] = useState(() => loadCampaign());
  const city = CITY_BY_ID[request.cityId];
  const preset = city ? TACTICAL_PRESETS[city.tacticalPresetId] : undefined;
  const session = useMemo(
    () => {
      if (!campaign || !city || !preset) return undefined;
      const created = createSideViewBattleSession(campaign, city, campaign.cities[city.id], preset, request.missionId);
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('battle-fast')) {
        created.profile = { ...created.profile, survivalUnlockSeconds: 0, extractionChannelSeconds: 0.5 };
        created.combatState.survivalUnlockSeconds = 0;
        created.combatState.overchargeCells = Math.max(3, created.combatState.overchargeCells);
        created.combatState.initialOverchargeCells = Math.max(3, created.combatState.initialOverchargeCells);
      }
      return created;
    },
    [campaign, city, preset, request.missionId],
  );
  const combatState = session?.combatState;

  useEffect(() => {
    let cancelled = false;
    void loadBattleMapDefinition(request.mapId).then((loadedMap) => {
      if (!cancelled) setLoadedMap(loadedMap);
    });
    return () => { cancelled = true; };
  }, [fallbackMap, request.mapId]);

  useEffect(() => {
    let cancelled = false;
    let clearAutomationHooks = () => {};
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    setPhase('loading');
    setError(null);

    void import('./runtime/createBattleRuntime')
      .then(({ createBattleRuntime }) => createBattleRuntime(canvas, map, {
        combatState,
        gameplayProfile: session?.profile,
        onCombatComplete: onComplete,
        onCombatUpdate: (next) => { if (!cancelled) setSnapshot(next); },
      }))
      .then((runtime) => {
        if (cancelled) {
          runtime.dispose();
          return;
        }
        runtimeRef.current = runtime;
        setSnapshot(runtime.getSnapshot());
        const automationWindow = window as Window & { render_game_to_text?: () => string; advanceTime?: (milliseconds: number) => void };
        const renderGameToText = () => JSON.stringify(runtime.getSnapshot());
        const advanceTime = (milliseconds: number) => runtime.advanceTime(milliseconds);
        automationWindow.render_game_to_text = renderGameToText;
        automationWindow.advanceTime = advanceTime;
        clearAutomationHooks = () => {
          if (automationWindow.render_game_to_text === renderGameToText) delete automationWindow.render_game_to_text;
          if (automationWindow.advanceTime === advanceTime) delete automationWindow.advanceTime;
        };
        setPhase('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'The battle scene could not be created.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
      clearAutomationHooks();
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [combatState, map, onComplete, session?.profile]);

  const runCommand = (command: () => { ok: boolean; reason?: string }, successMessage: string) => {
    const result = command();
    setActionMessage(result.ok ? successMessage : result.reason ?? t('battle.commandUnavailable'));
  };
  const nearbyTarget = snapshot?.targets.find((target) => target.id === snapshot.nearbyTargetId) ?? null;
  const extractionVisible = snapshot?.extractionStatus !== undefined && snapshot.extractionStatus !== 'LOCKED';
  const extractionActive = snapshot?.extractionStatus === 'IN_PROGRESS';

  return (
    <main className="battle-screen" data-map-id={map.id} data-battle-phase={phase}>
      <canvas ref={canvasRef} className="battle-canvas" aria-label="Babylon battle scene" />
      <div className="battle-scene-label" aria-hidden="true">
        <span>EDITOR GREYBOX</span>
        <strong>{map.displayName.toUpperCase()}</strong>
      </div>
      <button className="battle-exit-button" type="button" onClick={onExit}>← BACK TO MAP</button>
      {snapshot ? <section className="battle-status-hud" aria-label={t('battle.status')}>
        <BattleStat label={t('debrief.hull')} value={snapshot.ship.hull} maximum={snapshot.ship.maxHull} tone="hull" />
        <BattleStat label={t('debrief.shield')} value={snapshot.ship.shield} maximum={snapshot.ship.maxShield} tone="shield" />
        <BattleStat label={t('battle.energy')} value={snapshot.ship.energy} maximum={snapshot.ship.maxEnergy} tone="energy" />
        <div className="battle-status-readouts">
          <span><small>{t('tactical.cargo')}</small><strong>{formatNumber(Math.floor(snapshot.cargo.used))} / {formatNumber(snapshot.cargo.capacity)}</strong></span>
          <span><small>{t('tactical.alert')}</small><strong>{Math.round(snapshot.alert)}%</strong></span>
        </div>
      </section> : null}
      {snapshot ? <section className={`battle-survival-hud extraction-${snapshot.extractionStatus.toLowerCase()}`} aria-live="polite">
        <span>{snapshot.extractionStatus === 'LOCKED' ? t('battle.survive') : extractionActive ? t('battle.extracting') : t('battle.escapeReady')}</span>
        <strong>{snapshot.extractionStatus === 'LOCKED' ? `${Math.ceil(snapshot.survivalRemainingSeconds)}s` : extractionActive ? `${Math.round(snapshot.extractionProgress * 100)}%` : t('common.ready')}</strong>
      </section> : null}
      {snapshot ? <section className={`battle-target-hud ${nearbyTarget ? 'target-ready' : ''}`} aria-live="polite">
        <span>{nearbyTarget ? t('battle.targetReady') : t('battle.autoScan')}</span>
        <strong>{nearbyTarget ? `${nearbyTarget.kind} · ${formatNumber(Math.ceil(nearbyTarget.remainingAmount))}` : t('battle.moveToTarget')}</strong>
        <small>{snapshot.targets.filter((target) => target.discovered && target.remainingAmount > 0).length} / {snapshot.targets.filter((target) => target.remainingAmount > 0).length} {t('battle.discovered')}</small>
      </section> : null}
      <div className="battle-action-bar" role="toolbar" aria-label={t('tactical.resources')}>
        <button
          className="battle-action-button battle-action-emp"
          type="button"
          data-testid="battle-action-emp"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('emp'), t('battle.empActivated'))}
        >
          <kbd>E</kbd><span>{t('tactical.emp')}</span>
        </button>
        <button
          className="battle-action-button battle-action-plasma"
          type="button"
          data-testid="battle-action-plasma"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('plasma'), t('battle.plasmaActivated'))}
        >
          <kbd>P</kbd><span>{t('tactical.plasma')}</span>
        </button>
        <button
          className="battle-action-button battle-action-absorb"
          type="button"
          data-testid="battle-action-absorb"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.toggleAbsorption(), snapshot?.activeAbility === 'beam' ? t('battle.absorptionStopped') : t('battle.absorptionStarted'))}
        >
          <kbd>B</kbd><span>{t('tactical.absorb')}</span>
        </button>
        <button
          className="battle-action-button battle-action-overdrive"
          type="button"
          data-testid="battle-action-overdrive"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('overdrive'), t('battle.overdriveActivated'))}
        >
          <kbd>S</kbd><span>{t('tactical.overdrive')}</span>
        </button>
        {extractionVisible ? <button
          className={`battle-action-button battle-action-extract ${extractionActive ? 'active' : ''}`}
          type="button"
          data-testid="battle-action-extract"
          disabled={phase !== 'ready' || extractionActive || snapshot?.extractionStatus === 'COMPLETE'}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.beginExtraction(), t('battle.extractionStarted'))}
        >
          <kbd>X</kbd><span>{extractionActive ? t('battle.extracting') : t('tactical.extract')}</span>
        </button> : null}
      </div>
      {actionMessage ? <div className="battle-action-message" role="status">{actionMessage}</div> : null}
      {phase === 'loading' ? <div className="battle-scene-state">LOADING BATTLE SCENE</div> : null}
      {phase === 'error' ? <div className="battle-scene-error" role="alert"><strong>BATTLE SCENE ERROR</strong><span>{error}</span><button type="button" onClick={onExit}>RETURN TO MAP</button></div> : null}
      <div className="battle-control-hint" aria-hidden="true">A / D or ← / → MOVE · B ABSORB · E EMP · P PLASMA · S OVERDRIVE · X EXTRACT · ESC PAUSE</div>
    </main>
  );
}

function BattleStat({ label, value, maximum, tone }: { label: string; value: number; maximum: number; tone: 'hull' | 'shield' | 'energy' }) {
  const percentage = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  return <div className={`battle-stat battle-stat-${tone}`}><div><span>{label}</span><strong>{Math.ceil(value)} / {maximum}</strong></div><div className="battle-stat-track"><i style={{ width: `${percentage}%` }} /></div></div>;
}
