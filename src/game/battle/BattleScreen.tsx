'use client';

import { useEffect, useRef, useState } from 'react';
import type { BattleLaunchRequest } from './BattleGateway';
import { getBattleMapDefinition } from './maps/battleMapCatalog';
import type { BattleRuntime } from './runtime/createBattleRuntime';

interface BattleScreenProps {
  request: BattleLaunchRequest;
  onExit: () => void;
}

export function BattleScreen({ request, onExit }: BattleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<BattleRuntime | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const map = getBattleMapDefinition(request.mapId);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    setPhase('loading');
    setError(null);

    void import('./runtime/createBattleRuntime')
      .then(({ createBattleRuntime }) => createBattleRuntime(canvas, map))
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
  }, [map, request.mapId]);

  return (
    <main className="battle-screen" data-map-id={map.id} data-battle-phase={phase}>
      <canvas ref={canvasRef} className="battle-canvas" aria-label="Babylon battle scene" />
      <div className="battle-scene-label" aria-hidden="true">
        <span>EDITOR GREYBOX</span>
        <strong>{map.displayName.toUpperCase()}</strong>
      </div>
      <button className="battle-exit-button" type="button" onClick={onExit}>← BACK TO MAP</button>
      {phase === 'loading' ? <div className="battle-scene-state">LOADING BATTLE SCENE</div> : null}
      {phase === 'error' ? <div className="battle-scene-error" role="alert"><strong>BATTLE SCENE ERROR</strong><span>{error}</span><button type="button" onClick={onExit}>RETURN TO MAP</button></div> : null}
      <div className="battle-control-hint" aria-hidden="true">A / D or ← / → MOVE MOTHERSHIP · ESC PAUSE</div>
    </main>
  );
}
