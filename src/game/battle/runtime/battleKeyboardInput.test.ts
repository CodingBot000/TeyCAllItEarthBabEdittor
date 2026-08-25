import { describe, expect, it } from 'vitest';
import { normalizeBattleKey } from './battleKeyboardInput';

describe('normalizeBattleKey', () => {
  it('maps Korean IME key values through physical codes', () => {
    expect(normalizeBattleKey({ key: 'ㅜ', code: 'KeyN' })).toBe('n');
    expect(normalizeBattleKey({ key: 'ㅡ', code: 'KeyM' })).toBe('m');
    expect(normalizeBattleKey({ key: 'ㅁ', code: 'Comma' })).toBe(',');
    expect(normalizeBattleKey({ key: 'ㅓ', code: 'Period' })).toBe('.');
    expect(normalizeBattleKey({ key: 'ㆍ', code: 'Slash' })).toBe('/');
  });

  it('keeps non-letter controls usable', () => {
    expect(normalizeBattleKey({ key: 'ArrowLeft', code: 'ArrowLeft' })).toBe('arrowleft');
    expect(normalizeBattleKey({ key: 'x', code: 'KeyX' })).toBe('x');
    expect(normalizeBattleKey({ key: '1', code: 'Digit1' })).toBe('1');
    expect(normalizeBattleKey({ key: 'Escape', code: 'Escape' })).toBe('escape');
  });

  it('falls back to event.key when a physical code is unavailable', () => {
    expect(normalizeBattleKey({ key: 'e', code: '' })).toBe('e');
  });
});
