export interface BattleKeyboardInput {
  key: string;
  code: string;
}

const PHYSICAL_KEY_BY_CODE: Record<string, string> = {
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
  KeyA: 'a',
  KeyD: 'd',
  KeyM: 'm',
  KeyN: 'n',
  KeyQ: 'q',
  KeyX: 'x',
  KeyC: 'c',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Digit1: '1',
  Digit2: '2',
  Escape: 'escape',
};

/**
 * Uses the physical key code first so Korean IME input still maps to the
 * intended battle control (for example event.key="ㅜ" with event.code="KeyN").
 */
export function normalizeBattleKey(event: BattleKeyboardInput): string {
  return PHYSICAL_KEY_BY_CODE[event.code] ?? event.key.toLowerCase();
}
