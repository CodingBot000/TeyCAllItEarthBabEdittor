export interface BattleDebugOptions {
  directBattle: boolean;
  fastBattle: boolean;
  controls: boolean;
  cityId: string | null;
  mapId: string | null;
}

/** Temporary product switch for all in-battle debug buttons and panels. */
export const SHOW_IN_BATTLE_DEBUG_CONTROLS = false;

export function getBattleDebugOptions(search: string, environment = process.env.NODE_ENV): BattleDebugOptions {
  const enabled = environment !== 'production';
  const query = new URLSearchParams(search);
  return {
    directBattle: enabled && query.get('debug') === 'battle',
    fastBattle: enabled && query.get('battle-fast') === '1',
    controls: enabled && query.get('battle-debug') === '1',
    cityId: enabled ? query.get('city') : null,
    mapId: enabled ? query.get('map') : null,
  };
}
