'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CITY_BY_ID } from '../data/cities';
import type { CampaignState, CombatState } from '../domain/types';
import type { BattleLaunchRequest } from './BattleGateway';
import { getBattleDebugOptions } from './gameplay/BattleDebug';
import { createSideViewBattleSession } from './gameplay/sideViewBattleRules';
import { getBattleMapDefinition, loadBattleMapDefinition } from './maps/battleMapCatalog';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import type { BattleRuntime, BattleRuntimeSnapshot } from './runtime/createBattleRuntime';
import { useI18n } from '../i18n/I18nProvider';

interface BattleScreenProps {
  campaign: CampaignState;
  request: BattleLaunchRequest;
  onComplete: (state: CombatState) => void;
}

export function BattleScreen({ campaign, request, onComplete }: BattleScreenProps) {
  const { formatNumber, language, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<BattleRuntime | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BattleRuntimeSnapshot | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [abortConfirmationOpen, setAbortConfirmationOpen] = useState(false);
  const fallbackMap = getBattleMapDefinition(request.mapId);
  const [loadedMap, setLoadedMap] = useState<typeof fallbackMap | null>(null);
  const map = loadedMap?.id === fallbackMap.id ? loadedMap : fallbackMap;
  const debugOptions = useMemo(
    () => getBattleDebugOptions(typeof window === 'undefined' ? '' : window.location.search),
    [],
  );
  const city = CITY_BY_ID[request.cityId];
  const preset = city ? TACTICAL_PRESETS[city.tacticalPresetId] : undefined;
  const session = useMemo(
    () => {
      if (!campaign || !city || !preset) return undefined;
      const created = createSideViewBattleSession(campaign, city, campaign.cities[city.id], preset, request.missionId);
      if (debugOptions.fastBattle) {
        created.profile = { ...created.profile, survivalUnlockSeconds: 0, extractionChannelSeconds: 0.5 };
        created.combatState.survivalUnlockSeconds = 0;
        created.combatState.overchargeCells = Math.max(3, created.combatState.overchargeCells);
        created.combatState.initialOverchargeCells = Math.max(3, created.combatState.initialOverchargeCells);
      }
      return created;
    },
    [campaign, city, debugOptions.fastBattle, preset, request.missionId],
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
        language,
        debugControls: debugOptions.controls,
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
  }, [combatState, debugOptions.controls, language, map, onComplete, session?.profile]);

  const runCommand = (command: () => { ok: boolean; reason?: string }, successMessage: string) => {
    const result = command();
    setActionMessage(result.ok ? successMessage : result.reason ?? t('battle.commandUnavailable'));
  };
  const nearbyTarget = snapshot?.targets.find((target) => target.id === snapshot.nearbyTargetId) ?? null;
  const guidanceTarget = snapshot?.guidanceTarget ?? null;
  const empAvailability = snapshot?.abilities.emp;
  const plasmaAvailability = snapshot?.abilities.plasma;
  const beamAvailability = snapshot?.abilities.beam;
  const overdriveAvailability = snapshot?.abilities.overdrive;
  const extractAvailability = snapshot?.abilities.extract;
  const abilityHint = (availability: BattleRuntimeSnapshot['abilities'][keyof BattleRuntimeSnapshot['abilities']] | undefined) => {
    if (!availability || availability.enabled || !availability.reason) return undefined;
    return availability.reason === 'COOLDOWN'
      ? t('battle.reason.COOLDOWN', { seconds: Math.ceil(availability.cooldownRemaining) })
      : t(`battle.reason.${availability.reason}`);
  };
  const extractionVisible = snapshot?.extractionStatus !== undefined && snapshot.extractionStatus !== 'LOCKED';
  const extractionActive = snapshot?.extractionStatus === 'IN_PROGRESS';
  const beginPointerMovement = (event: ReactPointerEvent<HTMLButtonElement>, direction: -1 | 1) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    runtimeRef.current?.setMovementInput(direction, 'pointer');
  };
  const endPointerMovement = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    runtimeRef.current?.setMovementInput(0, 'pointer');
  };
  const confirmAbort = () => {
    const result = runtimeRef.current?.abortMission();
    if (!result) return;
    if (!result.ok) setActionMessage(result.reason ?? t('battle.commandUnavailable'));
    setAbortConfirmationOpen(false);
  };

  return (
    <main className="battle-screen" data-map-id={map.id} data-battle-phase={phase}>
      <canvas ref={canvasRef} className="battle-canvas" aria-label="Babylon battle scene" />
      <div className="battle-scene-label" aria-hidden="true">
        <span>BATTLE SCENE</span>
        <strong>{map.displayName.toUpperCase()}</strong>
      </div>
      <button className="battle-exit-button" type="button" disabled={phase !== 'ready'} onClick={() => setAbortConfirmationOpen(true)}>{t('battle.abortMission')}</button>
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
        <span>{nearbyTarget ? t('battle.targetReady') : guidanceTarget?.discovered ? t('battle.signalTracked') : guidanceTarget ? t('battle.signalUnknown') : t('battle.autoScan')}</span>
        <strong>{nearbyTarget
          ? `${nearbyTarget.kind} · ${formatNumber(Math.ceil(nearbyTarget.remainingAmount))}`
          : guidanceTarget
            ? `${guidanceArrow(guidanceTarget.direction)} ${formatNumber(Math.ceil(guidanceTarget.distance))}m`
            : t('battle.moveToTarget')}</strong>
        <small>{snapshot.targets.filter((target) => target.discovered && target.remainingAmount > 0).length} / {snapshot.targets.filter((target) => target.remainingAmount > 0).length} {t('battle.discovered')} · {t('battle.scanRange', { range: Math.round(snapshot.effectiveAutoScanRange) })}</small>
      </section> : null}
      <div className="battle-action-bar" role="toolbar" aria-label={t('tactical.resources')}>
        <button
          className="battle-action-button battle-action-emp"
          type="button"
          data-testid="battle-action-emp"
          disabled={phase !== 'ready' || !empAvailability?.enabled}
          title={abilityHint(empAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('emp'), t('battle.empActivated'))}
        >
          <kbd>E</kbd><span>{t('tactical.emp')}</span>{abilityHint(empAvailability) ? <small>{abilityHint(empAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-plasma"
          type="button"
          data-testid="battle-action-plasma"
          disabled={phase !== 'ready' || !plasmaAvailability?.enabled}
          title={abilityHint(plasmaAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('plasma'), t('battle.plasmaActivated'))}
        >
          <kbd>P</kbd><span>{t('tactical.plasma')}</span>{abilityHint(plasmaAvailability) ? <small>{abilityHint(plasmaAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-absorb"
          type="button"
          data-testid="battle-action-absorb"
          disabled={phase !== 'ready' || !beamAvailability?.enabled}
          title={abilityHint(beamAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.toggleAbsorption(), snapshot?.activeAbility === 'beam' ? t('battle.absorptionStopped') : t('battle.absorptionStarted'))}
        >
          <kbd>B</kbd><span>{t('tactical.absorb')}</span>{abilityHint(beamAvailability) ? <small>{abilityHint(beamAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-overdrive"
          type="button"
          data-testid="battle-action-overdrive"
          disabled={phase !== 'ready' || !overdriveAvailability?.enabled}
          title={abilityHint(overdriveAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('overdrive'), t('battle.overdriveActivated'))}
        >
          <kbd>S</kbd><span>{t('tactical.overdrive')}</span>{abilityHint(overdriveAvailability) ? <small>{abilityHint(overdriveAvailability)}</small> : null}
        </button>
        {extractionVisible ? <button
          className={`battle-action-button battle-action-extract ${extractionActive ? 'active' : ''}`}
          type="button"
          data-testid="battle-action-extract"
          disabled={phase !== 'ready' || !extractAvailability?.enabled || extractionActive || snapshot?.extractionStatus === 'COMPLETE'}
          title={abilityHint(extractAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.beginExtraction(), t('battle.extractionStarted'))}
        >
          <kbd>X</kbd><span>{extractionActive ? t('battle.extracting') : t('tactical.extract')}</span>
        </button> : null}
      </div>
      <div className="battle-movement-controls" aria-label={t('battle.mobileMove')}>
        <button
          type="button"
          aria-label={t('battle.moveLeft')}
          onPointerDown={(event) => beginPointerMovement(event, -1)}
          onPointerUp={endPointerMovement}
          onPointerCancel={endPointerMovement}
          onLostPointerCapture={endPointerMovement}
        >◀</button>
        <button
          type="button"
          aria-label={t('battle.moveRight')}
          onPointerDown={(event) => beginPointerMovement(event, 1)}
          onPointerUp={endPointerMovement}
          onPointerCancel={endPointerMovement}
          onLostPointerCapture={endPointerMovement}
        >▶</button>
      </div>
      {actionMessage ? <div className="battle-action-message" role="status">{actionMessage}</div> : null}
      {phase === 'loading' ? <div className="battle-scene-state">LOADING BATTLE SCENE</div> : null}
      {phase === 'error' ? <div className="battle-scene-error" role="alert"><strong>BATTLE SCENE ERROR</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>{t('battle.retry')}</button></div> : null}
      {abortConfirmationOpen ? <section className="battle-abort-modal" role="dialog" aria-modal="true" aria-labelledby="battle-abort-title">
        <strong id="battle-abort-title">{t('battle.abortTitle')}</strong>
        <p>{t('battle.abortCopy')}</p>
        <div>
          <button type="button" onClick={() => setAbortConfirmationOpen(false)}>{t('battle.continueBattle')}</button>
          <button className="danger" type="button" onClick={confirmAbort}>{t('battle.abortConfirm')}</button>
        </div>
      </section> : null}
      <div className="battle-control-hint" aria-hidden="true">A / D or ← / → MOVE · B ABSORB · E EMP · P PLASMA · S OVERDRIVE · X EXTRACT · ESC PAUSE</div>
    </main>
  );
}

function BattleStat({ label, value, maximum, tone }: { label: string; value: number; maximum: number; tone: 'hull' | 'shield' | 'energy' }) {
  const percentage = maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
  return <div className={`battle-stat battle-stat-${tone}`}><div><span>{label}</span><strong>{Math.ceil(value)} / {maximum}</strong></div><div className="battle-stat-track"><i style={{ width: `${percentage}%` }} /></div></div>;
}

function guidanceArrow(direction: 'LEFT' | 'RIGHT' | 'ON_SCREEN'): string {
  if (direction === 'LEFT') return '←';
  if (direction === 'RIGHT') return '→';
  return '•';
}
