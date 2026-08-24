import { describe, expect, it } from 'vitest';
import { getBattleDebugOptions } from './BattleDebug';

describe('battle debug options', () => {
  it('enables explicit debug options outside production', () => {
    expect(getBattleDebugOptions('?debug=battle&city=seoul&map=river-day&battle-fast=1&battle-debug=1', 'development')).toEqual({
      directBattle: true,
      fastBattle: true,
      controls: true,
      cityId: 'seoul',
      mapId: 'river-day',
    });
  });

  it('ignores all debug query options in production', () => {
    expect(getBattleDebugOptions('?debug=battle&city=seoul&map=river-day&battle-fast=1&battle-debug=1', 'production')).toEqual({
      directBattle: false,
      fastBattle: false,
      controls: false,
      cityId: null,
      mapId: null,
    });
  });
});
