'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CITY_BY_ID } from '../data/cities';
import { createCombatState } from '../domain/combatRules';
import type { CombatState } from '../domain/types';
import { loadCampaign } from '../infrastructure/persistence/saveRepository';
import type { BattleLaunchRequest } from './BattleGateway';
import { getBattleMapDefinition, loadBattleMapDefinition } from './maps/battleMapCatalog';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import type { BattleRuntime } from './runtime/createBattleRuntime';
import { useI18n } from '../i18n/I18nProvider';

interface BattleScreenProps {
  request: BattleLaunchRequest;
  onExit: () => void;
  onComplete?: (state: CombatState) => void;
}

export function BattleScreen({ request, onExit, onComplete }: BattleScreenProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<BattleRuntime | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const fallbackMap = getBattleMapDefinition(request.mapId);
  const [loadedMap, setLoadedMap] = useState<typeof fallbackMap | null>(null);
  const map = loadedMap?.id === fallbackMap.id ? loadedMap : fallbackMap;
  const [campaign] = useState(() => loadCampaign());
  const city = CITY_BY_ID[request.cityId];
  const preset = city ? TACTICAL_PRESETS[city.tacticalPresetId] : undefined;
  const combatState = useMemo(
    () => campaign && city && preset
      ? createCombatState(campaign, city, campaign.cities[city.id], preset)
      : undefined,
    [campaign, city, preset],
  );

  useEffect(() => {
    let cancelled = false;
    void loadBattleMapDefinition(request.mapId).then((loadedMap) => {
      if (!cancelled) setLoadedMap(loadedMap);
    });
    return () => { cancelled = true; };
  }, [fallbackMap, request.mapId]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    setPhase('loading');
    setError(null);

    void import('./runtime/createBattleRuntime')
      .then(({ createBattleRuntime }) => createBattleRuntime(canvas, map, { combatState, onCombatComplete: onComplete }))
      .then((runtime) => {
        if (cancelled) {
          runtime.dispose();
          return;
        }
        runtimeRef.current = runtime;
        setPhase('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'The battle scene could not be created.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [combatState, map, onComplete]);

  return (
    <main className="battle-screen" data-map-id={map.id} data-battle-phase={phase}>
      <canvas ref={canvasRef} className="battle-canvas" aria-label="Babylon battle scene" />
      <div className="battle-scene-label" aria-hidden="true">
        <span>EDITOR GREYBOX</span>
        <strong>{map.displayName.toUpperCase()}</strong>
      </div>
      <button className="battle-exit-button" type="button" onClick={onExit}>← BACK TO MAP</button>
      <div className="battle-action-bar" role="toolbar" aria-label={t('tactical.resources')}>
        <button
          className="battle-action-button battle-action-emp"
          type="button"
          data-testid="battle-action-emp"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current?.triggerAbility('emp')}
        >
          <kbd>E</kbd><span>{t('tactical.emp')}</span>
        </button>
        <button
          className="battle-action-button battle-action-plasma"
          type="button"
          data-testid="battle-action-plasma"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current?.triggerAbility('plasma')}
        >
          <kbd>P</kbd><span>{t('tactical.plasma')}</span>
        </button>
        <button
          className="battle-action-button battle-action-absorb"
          type="button"
          data-testid="battle-action-absorb"
          disabled={phase !== 'ready'}
          onClick={() => runtimeRef.current?.toggleAbsorption()}
        >
          <kbd>B</kbd><span>{t('tactical.absorb')}</span>
        </button>
      </div>
      {phase === 'loading' ? <div className="battle-scene-state">LOADING BATTLE SCENE</div> : null}
      {phase === 'error' ? <div className="battle-scene-error" role="alert"><strong>BATTLE SCENE ERROR</strong><span>{error}</span><button type="button" onClick={onExit}>RETURN TO MAP</button></div> : null}
      <div className="battle-control-hint" aria-hidden="true">A / D or ← / → MOVE · 1 SHIELD · 2 HULL · E EMP · P PLASMA · B ABSORB · Q EVADE · C CRASH · X EXTRACT · ESC PAUSE</div>
    </main>
  );
}
