import { describe, expect, it } from 'vitest';
import { normalizeBattleKey } from './battleKeyboardInput';

describe('normalizeBattleKey', () => {
  it('maps Korean IME key values through physical codes', () => {
    expect(normalizeBattleKey({ key: 'ㄷ', code: 'KeyE' })).toBe('e');
    expect(normalizeBattleKey({ key: 'ㅔ', code: 'KeyP' })).toBe('p');
    expect(normalizeBattleKey({ key: 'ㅠ', code: 'KeyB' })).toBe('b');
    expect(normalizeBattleKey({ key: 'ㄴ', code: 'KeyS' })).toBe('s');
  });

  it('keeps non-letter controls usable', () => {
    expect(normalizeBattleKey({ key: 'ArrowLeft', code: 'ArrowLeft' })).toBe('arrowleft');
    expect(normalizeBattleKey({ key: '1', code: 'Digit1' })).toBe('1');
    expect(normalizeBattleKey({ key: 'Escape', code: 'Escape' })).toBe('escape');
  });

  it('falls back to event.key when a physical code is unavailable', () => {
    expect(normalizeBattleKey({ key: 'e', code: '' })).toBe('e');
  });
});
