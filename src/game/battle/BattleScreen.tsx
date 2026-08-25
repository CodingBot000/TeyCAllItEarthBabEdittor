'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CITY_BY_ID } from '../data/cities';
import type { CampaignState, CombatState } from '../domain/types';
import type { BattleLaunchRequest } from './BattleGateway';
import { getBattleDebugOptions } from './gameplay/BattleDebug';
import { createSideViewBattleSession } from './gameplay/sideViewBattleRules';
import { getBattleMapDefinition, loadBattleMapDefinition } from './maps/battleMapCatalog';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { BATTLE_BACKGROUND_LAYERS, type BattleBackgroundLayerKey, type BattleRuntime, type BattleRuntimeSnapshot } from './runtime/createBattleRuntime';
import { GROUND_ENTITY_ROOT_Y } from './runtime/battleVisualCoordinates';
import { useI18n } from '../i18n/I18nProvider';

interface BattleScreenProps {
  campaign: CampaignState;
  request: BattleLaunchRequest;
  onComplete: (state: CombatState) => void;
}

type BackgroundLayerYValues = Record<BattleBackgroundLayerKey, number>;
type UnitPositionGroup = BattleRuntimeSnapshot['visuals']['ground'][number]['group'];
type UnitPosition = { y: number };
type UnitPositionValues = Record<string, UnitPosition>;
type CollisionOverlayScales = { shield: number; hull: number };

const INITIAL_BACKGROUND_LAYER_Y = Object.fromEntries(
  BATTLE_BACKGROUND_LAYERS.map((layer) => [layer.key, layer.y]),
) as BackgroundLayerYValues;

export function BattleScreen({ campaign, request, onComplete }: BattleScreenProps) {
  const { formatNumber, language, t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<BattleRuntime | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BattleRuntimeSnapshot | null>(null);
  const [invincibilityEnabled, setInvincibilityEnabled] = useState(true);
  const [unitInvincibilityEnabled, setUnitInvincibilityEnabled] = useState(true);
  const [pointDefenseDisabled, setPointDefenseDisabled] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [abortConfirmationOpen, setAbortConfirmationOpen] = useState(false);
  const [backgroundDebugOpen, setBackgroundDebugOpen] = useState(true);
  const [backgroundLayerY, setBackgroundLayerY] = useState<BackgroundLayerYValues>(() => ({ ...INITIAL_BACKGROUND_LAYER_Y }));
  const [backgroundCopyStatus, setBackgroundCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [unitPositions, setUnitPositions] = useState<UnitPositionValues>({});
  const [unitPositionDefaults, setUnitPositionDefaults] = useState<UnitPositionValues>({});
  const [unitCopyStatus, setUnitCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [collisionDebugOpen, setCollisionDebugOpen] = useState(false);
  const [collisionOverlayScales, setCollisionOverlayScales] = useState<CollisionOverlayScales>({ shield: 1, hull: 1 });
  const [collisionCopyStatus, setCollisionCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fallbackMap = getBattleMapDefinition(request.mapId);
  const [loadedMap, setLoadedMap] = useState<typeof fallbackMap | null>(null);
  const map = loadedMap?.id === fallbackMap.id ? loadedMap : fallbackMap;
  const debugOptions = useMemo(
    () => getBattleDebugOptions(typeof window === 'undefined' ? '' : window.location.search),
    [],
  );
  const backgroundDebugEnabled = debugOptions.directBattle || debugOptions.fastBattle;
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

  useEffect(() => {
    const groundUnits = snapshot?.visuals.ground;
    if (!groundUnits?.length) return;
    setUnitPositionDefaults((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const unit of groundUnits) {
        if (!next[unit.group]) {
          next[unit.group] = { y: unit.y };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
    setUnitPositions((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const unit of groundUnits) {
        if (!next[unit.group]) {
          next[unit.group] = { y: unit.y };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [snapshot?.visuals.ground]);

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
  const assaultAvailability = snapshot?.abilities.assault;
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
  const toggleInvincibility = () => {
    const next = !invincibilityEnabled;
    setInvincibilityEnabled(next);
    runtimeRef.current?.setInvincibilityEnabled(next);
  };
  const toggleUnitInvincibility = () => {
    const next = !unitInvincibilityEnabled;
    setUnitInvincibilityEnabled(next);
    runtimeRef.current?.setUnitInvincibilityEnabled(next);
  };
  const togglePointDefense = () => {
    const next = !pointDefenseDisabled;
    setPointDefenseDisabled(next);
    runtimeRef.current?.setPointDefenseDisabled(next);
  };
  const setBackgroundLayerPosition = (key: BattleBackgroundLayerKey, value: number) => {
    const nextValue = Math.max(-80, Math.min(80, Math.round(value * 100) / 100));
    setBackgroundLayerY((previous) => ({ ...previous, [key]: nextValue }));
    runtimeRef.current?.setBackgroundLayerY(key, nextValue);
    setBackgroundCopyStatus('idle');
  };
  const adjustBackgroundLayer = (key: BattleBackgroundLayerKey, delta: number) => {
    setBackgroundLayerPosition(key, backgroundLayerY[key] + delta);
  };
  const resetBackgroundLayers = () => {
    setBackgroundLayerY({ ...INITIAL_BACKGROUND_LAYER_Y });
    for (const layer of BATTLE_BACKGROUND_LAYERS) runtimeRef.current?.setBackgroundLayerY(layer.key, layer.y);
    setBackgroundCopyStatus('idle');
  };
  const backgroundLayerOutput = BATTLE_BACKGROUND_LAYERS
    .map((layer, index) => `${String(index + 1).padStart(2, '0')} ${layer.key}: y=${backgroundLayerY[layer.key].toFixed(2)}`)
    .join('\n');
  const copyBackgroundLayerOutput = async () => {
    try {
      await navigator.clipboard.writeText(backgroundLayerOutput);
      setBackgroundCopyStatus('copied');
    } catch {
      setBackgroundCopyStatus('failed');
    }
  };
  const setUnitPosition = (group: UnitPositionGroup, value: number) => {
    const next = { y: Math.round(value * 100) / 100 };
    setUnitPositions((previous) => ({ ...previous, [group]: next }));
    runtimeRef.current?.setGroundUnitGroupPosition(group, next.y);
    setUnitCopyStatus('idle');
  };
  const adjustUnitPosition = (group: UnitPositionGroup, delta: number) => {
    const current = unitPositions[group] ?? unitPositionDefaults[group] ?? { y: GROUND_ENTITY_ROOT_Y };
    setUnitPosition(group, current.y + delta);
  };
  const resetUnitPositions = () => {
    runtimeRef.current?.resetGroundUnitPositions();
    setUnitPositions({ ...unitPositionDefaults });
    setUnitCopyStatus('idle');
  };
  const groundUnits = snapshot?.visuals.ground ?? [];
  const groundUnitGroups = [...new Set(groundUnits.map((unit) => unit.group))].map((group) => ({
    group,
    count: groundUnits.filter((unit) => unit.group === group).length,
  }));
  const unitPositionOutput = groundUnitGroups
    .map(({ group }, index) => {
      const value = unitPositions[group] ?? unitPositionDefaults[group] ?? { y: GROUND_ENTITY_ROOT_Y };
      return `${String(index + 1).padStart(2, '0')} ${group.toLowerCase()}: y=${value.y.toFixed(2)}`;
    })
    .join('\n');
  const copyUnitPositionOutput = async () => {
    try {
      await navigator.clipboard.writeText(unitPositionOutput);
      setUnitCopyStatus('copied');
    } catch {
      setUnitCopyStatus('failed');
    }
  };
  const setCollisionOverlayScale = (kind: 'shield' | 'hull', value: number) => {
    const nextValue = Math.max(0.25, Math.min(3, Math.round(value * 100) / 100));
    setCollisionOverlayScales((previous) => ({ ...previous, [kind]: nextValue }));
    runtimeRef.current?.setCollisionOverlayScale(kind, nextValue);
    setCollisionCopyStatus('idle');
  };
  const adjustCollisionOverlayScale = (kind: 'shield' | 'hull', delta: number) => {
    setCollisionOverlayScale(kind, collisionOverlayScales[kind] + delta);
  };
  const resetCollisionOverlayScales = () => {
    runtimeRef.current?.resetCollisionOverlayScale();
    setCollisionOverlayScales({ shield: 1, hull: 1 });
    setCollisionCopyStatus('idle');
  };
  const setCollisionDebugVisible = (visible: boolean) => {
    setCollisionDebugOpen(visible);
    runtimeRef.current?.setCollisionOverlayVisible(visible);
  };
  const collisionOverlayOutput = `shieldScale=${collisionOverlayScales.shield.toFixed(2)}\nhullScale=${collisionOverlayScales.hull.toFixed(2)}`;
  const copyCollisionOverlayOutput = async () => {
    try {
      await navigator.clipboard.writeText(collisionOverlayOutput);
      setCollisionCopyStatus('copied');
    } catch {
      setCollisionCopyStatus('failed');
    }
  };

  return (
    <main className="battle-screen" data-map-id={map.id} data-battle-phase={phase}>
      <canvas ref={canvasRef} className="battle-canvas" aria-label="Babylon battle scene" />
      <div className="battle-scene-label" aria-hidden="true">
        <span>BATTLE SCENE</span>
        <strong>{map.displayName.toUpperCase()}</strong>
      </div>
      {backgroundDebugEnabled ? backgroundDebugOpen ? <aside className="battle-background-debug" data-testid="battle-background-debug">
        <div className="battle-background-debug-header">
          <div>
            <span>DEBUG TOOL</span>
            <strong>BACKGROUND ALIGNMENT</strong>
          </div>
          <div className="battle-background-debug-header-actions">
            <button type="button" onClick={() => setBackgroundDebugOpen(false)} aria-label="Close background alignment debug panel">CLOSE</button>
            <button type="button" disabled={phase !== 'ready'} onClick={resetBackgroundLayers} aria-label="Reset background layer positions">RESET</button>
          </div>
        </div>
        <p className="battle-background-debug-hint">Y WORLD UNITS · ▲ UP / ▼ DOWN · DRAG FOR FINE ADJUSTMENT</p>
        <div className="battle-background-debug-list">
          {BATTLE_BACKGROUND_LAYERS.map((layer, index) => {
            const value = backgroundLayerY[layer.key];
            return <div className="battle-background-debug-row" data-layer-key={layer.key} key={layer.key}>
              <div className="battle-background-debug-row-title">
                <span><b>L{String(index + 1).padStart(2, '0')}</b> {layer.key.toUpperCase()}</span>
                <output>Y {value.toFixed(2)}</output>
              </div>
              <div className="battle-background-debug-controls">
                <button type="button" disabled={phase !== 'ready'} onClick={() => adjustBackgroundLayer(layer.key, 0.25)} aria-label={`Move ${layer.key} up`}>▲</button>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="0.25"
                  value={value}
                  disabled={phase !== 'ready'}
                  onChange={(event) => setBackgroundLayerPosition(layer.key, Number(event.target.value))}
                  aria-label={`${layer.key} Y position`}
                />
                <button type="button" disabled={phase !== 'ready'} onClick={() => adjustBackgroundLayer(layer.key, -0.25)} aria-label={`Move ${layer.key} down`}>▼</button>
              </div>
            </div>;
          })}
        </div>
        <div className="battle-background-debug-output">
          <div className="battle-background-debug-output-title"><span>FINAL VALUES TO SEND</span><button type="button" disabled={phase !== 'ready'} onClick={copyBackgroundLayerOutput}>{backgroundCopyStatus === 'copied' ? 'COPIED' : 'COPY'}</button></div>
          <textarea readOnly value={backgroundLayerOutput} rows={BATTLE_BACKGROUND_LAYERS.length} aria-label="Final background layer positions" />
          {backgroundCopyStatus === 'failed' ? <small>Copy failed — select the values manually.</small> : <small>Send the layer number and Y value, for example: 03 far y=9.25</small>}
        </div>
        <div className="battle-background-debug-output battle-unit-position-debug">
          <div className="battle-background-debug-output-title"><span>UNIT POSITION DEBUG</span><div className="battle-background-debug-header-actions"><button type="button" disabled={phase !== 'ready'} onClick={resetUnitPositions}>RESET</button><button type="button" disabled={phase !== 'ready' || !unitPositionOutput} onClick={copyUnitPositionOutput}>{unitCopyStatus === 'copied' ? 'COPIED' : 'COPY'}</button></div></div>
          <p className="battle-background-debug-hint">Y WORLD UNITS · SAME UNIT TYPES MOVE TOGETHER</p>
          <div className="battle-background-debug-list">
            {groundUnitGroups.map(({ group, count }, index) => {
              const value = unitPositions[group] ?? unitPositionDefaults[group] ?? { y: GROUND_ENTITY_ROOT_Y };
              return <div className="battle-background-debug-row" data-unit-key={group} key={group}>
                <div className="battle-background-debug-row-title"><span><b>U{String(index + 1).padStart(2, '0')}</b> {group} ×{count}</span><output>Y {value.y.toFixed(2)}</output></div>
                <div className="battle-background-debug-controls"><button type="button" disabled={phase !== 'ready'} onClick={() => adjustUnitPosition(group, -0.25)} aria-label={`Move ${group} down`}>▼</button><input type="range" min="-30" max="10" step="0.25" value={value.y} disabled={phase !== 'ready'} onChange={(event) => setUnitPosition(group, Number(event.target.value))} aria-label={`${group} Y position`} /><button type="button" disabled={phase !== 'ready'} onClick={() => adjustUnitPosition(group, 0.25)} aria-label={`Move ${group} up`}>▲</button></div>
              </div>;
            })}
          </div>
          <div className="battle-background-debug-output-title"><span>UNIT VALUES TO SEND</span></div>
          <textarea readOnly value={unitPositionOutput} rows={Math.max(3, groundUnits.length)} aria-label="Final unit positions" />
          {unitCopyStatus === 'failed' ? <small>Copy failed — select the values manually.</small> : <small>Copy the X and Y values after aligning the unit sprites.</small>}
        </div>
      </aside> : <button className="battle-background-debug-toggle" data-testid="battle-background-debug-toggle" type="button" onClick={() => setBackgroundDebugOpen(true)} aria-label="Open background alignment debug panel">BG DEBUG</button> : null}
      {backgroundDebugEnabled ? collisionDebugOpen ? <aside className="battle-background-debug battle-collision-debug" data-testid="battle-collision-debug">
        <div className="battle-background-debug-header">
          <div><span>DEBUG TOOL</span><strong>COLLISION OVERLAY</strong></div>
          <div className="battle-background-debug-header-actions"><button type="button" onClick={() => setCollisionDebugVisible(false)} aria-label="Close collision overlay debug panel">CLOSE</button><button type="button" disabled={phase !== 'ready'} onClick={resetCollisionOverlayScales} aria-label="Reset collision overlay scales">RESET</button></div>
        </div>
        <p className="battle-background-debug-hint">SHIELD / HULL SCALE · 1.00 IS THE CURRENT COLLISION AREA</p>
        <div className="battle-background-debug-list">
          {(['shield', 'hull'] as const).map((kind) => {
            const label = kind === 'shield' ? 'SHIELD' : 'HULL';
            const value = collisionOverlayScales[kind];
            return <div className="battle-background-debug-row" data-collision-kind={kind} key={kind}>
              <div className="battle-background-debug-row-title"><span><b>{label}</b> COLLISION AREA</span><output>{value.toFixed(2)}x</output></div>
              <div className="battle-background-debug-controls"><button type="button" disabled={phase !== 'ready'} onClick={() => adjustCollisionOverlayScale(kind, -0.05)} aria-label={`Shrink ${label.toLowerCase()} collision area`}>−</button><input type="range" min="0.25" max="3" step="0.05" value={value} disabled={phase !== 'ready'} onChange={(event) => setCollisionOverlayScale(kind, Number(event.target.value))} aria-label={`${label} collision area scale`} /><button type="button" disabled={phase !== 'ready'} onClick={() => adjustCollisionOverlayScale(kind, 0.05)} aria-label={`Enlarge ${label.toLowerCase()} collision area`}>+</button></div>
            </div>;
          })}
        </div>
        <div className="battle-background-debug-output">
          <div className="battle-background-debug-output-title"><span>COLLISION VALUES TO SEND</span><button type="button" disabled={phase !== 'ready'} onClick={copyCollisionOverlayOutput}>{collisionCopyStatus === 'copied' ? 'COPIED' : 'COPY'}</button></div>
          <textarea readOnly value={collisionOverlayOutput} rows={2} aria-label="Final collision overlay scales" />
          {collisionCopyStatus === 'failed' ? <small>Copy failed — select the values manually.</small> : <small>Copy these scale values after matching the visible mothership.</small>}
        </div>
      </aside> : <button className="battle-background-debug-toggle battle-collision-debug-toggle" data-testid="battle-collision-debug-toggle" type="button" onClick={() => { setBackgroundDebugOpen(false); setCollisionDebugVisible(true); }} aria-label="Open collision overlay debug panel">COLLISION DEBUG</button> : null}
      <div className="battle-top-right-actions">
        <button className={`battle-point-defense-button ${pointDefenseDisabled ? 'is-on' : ''}`} data-testid="battle-point-defense-toggle" type="button" aria-pressed={pointDefenseDisabled} disabled={phase !== 'ready'} onClick={togglePointDefense}>
          {pointDefenseDisabled ? '요격빔 차단 ON' : '요격빔 차단 OFF'}
        </button>
        <button className={`battle-invincibility-button ${invincibilityEnabled ? 'is-on' : ''}`} data-testid="battle-invincibility-toggle" type="button" aria-pressed={invincibilityEnabled} disabled={phase !== 'ready'} onClick={toggleInvincibility}>
          {invincibilityEnabled ? t('battle.invincibilityOn') : t('battle.invincibilityOff')}
        </button>
        <button className={`battle-invincibility-button ${unitInvincibilityEnabled ? 'is-on' : ''}`} data-testid="battle-unit-invincibility-toggle" type="button" aria-pressed={unitInvincibilityEnabled} disabled={phase !== 'ready'} onClick={toggleUnitInvincibility}>
          {unitInvincibilityEnabled ? t('battle.unitInvincibilityOn') : t('battle.unitInvincibilityOff')}
        </button>
        <button className="battle-exit-button" type="button" disabled={phase !== 'ready'} onClick={() => setAbortConfirmationOpen(true)}>{t('battle.abortMission')}</button>
      </div>
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
          <kbd>N</kbd><span>{t('tactical.emp')}</span>{abilityHint(empAvailability) ? <small>{abilityHint(empAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-plasma"
          type="button"
          data-testid="battle-action-plasma"
          disabled={phase !== 'ready' || !plasmaAvailability?.enabled}
          title={abilityHint(plasmaAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('plasma'), t('battle.plasmaActivated'))}
        >
          <kbd>M</kbd><span>{t('tactical.plasma')}</span>{abilityHint(plasmaAvailability) ? <small>{abilityHint(plasmaAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-absorb"
          type="button"
          data-testid="battle-action-absorb"
          disabled={phase !== 'ready' || !beamAvailability?.enabled}
          title={abilityHint(beamAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.toggleAbsorption(), snapshot?.activeAbility === 'beam' ? t('battle.absorptionStopped') : t('battle.absorptionStarted'))}
        >
          <kbd>,</kbd><span>{t('tactical.absorb')}</span>{abilityHint(beamAvailability) ? <small>{abilityHint(beamAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-overdrive"
          type="button"
          data-testid="battle-action-overdrive"
          disabled={phase !== 'ready' || !overdriveAvailability?.enabled}
          title={abilityHint(overdriveAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.triggerAbility('overdrive'), t('battle.overdriveActivated'))}
        >
          <kbd>.</kbd><span>{t('tactical.overdrive')}</span>{abilityHint(overdriveAvailability) ? <small>{abilityHint(overdriveAvailability)}</small> : null}
        </button>
        <button
          className="battle-action-button battle-action-assault"
          type="button"
          data-testid="battle-action-assault"
          disabled={phase !== 'ready' || !assaultAvailability?.enabled}
          title={abilityHint(assaultAvailability)}
          onClick={() => runtimeRef.current && runCommand(() => runtimeRef.current!.dropInfectedAssault(), t('battle.infectedAssaultActivated'))}
        >
          <kbd>/</kbd><span>{t('tactical.infectedAssault')}</span>{abilityHint(assaultAvailability) ? <small>{abilityHint(assaultAvailability)}</small> : null}
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
