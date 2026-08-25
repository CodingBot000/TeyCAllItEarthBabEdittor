import { BALANCE } from '../../domain/balance';
import { abilityCheck, heavyAbilityCellCost } from '../../domain/combatRules';
import type { CombatState } from '../../domain/types';
import { nearestUsableSideViewTarget, selectAutomaticSideViewAbilityTarget } from './sideViewBattleRules';

export type BattleActionId = 'emp' | 'plasma' | 'beam' | 'overdrive' | 'assault' | 'extract';
export type AbilityAvailabilityReason = 'NO_CELLS' | 'LOW_ENERGY' | 'COOLDOWN' | 'NO_TARGET' | 'COMBAT_OVER' | 'OUT_OF_RANGE' | 'CARGO_FULL' | 'OVERHEATED' | 'EXTRACT_LOCKED' | 'EXTRACTING';

export interface AbilityAvailability {
  enabled: boolean;
  reason?: AbilityAvailabilityReason;
  cooldownRemaining: number;
  energyCost: number;
  cellCost: number;
}

export function battleAbilityAvailability(state: CombatState): Record<BattleActionId, AbilityAvailability> {
  return {
    emp: heavyAbilityAvailability(state, 'emp'),
    plasma: heavyAbilityAvailability(state, 'plasma'),
    beam: beamAvailability(state),
    overdrive: overdriveAvailability(state),
    assault: assaultAvailability(state),
    extract: extractionAvailability(state),
  };
}

function heavyAbilityAvailability(state: CombatState, ability: 'emp' | 'plasma'): AbilityAvailability {
  const baseline = availabilityForCheck(state, ability, ability === 'emp' ? BALANCE.emp.energy : BALANCE.plasma.energy);
  if (!baseline.enabled) return baseline;
  const target = selectAutomaticSideViewAbilityTarget(state, ability);
  if (!target) return unavailable(state, ability, ability === 'emp' ? BALANCE.emp.energy : BALANCE.plasma.energy, 'NO_TARGET');
  return availabilityForCheck(state, ability, ability === 'emp' ? BALANCE.emp.energy : BALANCE.plasma.energy, target);
}

function overdriveAvailability(state: CombatState): AbilityAvailability {
  return availabilityForCheck(state, 'overdrive', BALANCE.overdrive.energy);
}

function beamAvailability(state: CombatState): AbilityAvailability {
  if (state.activeAbility === 'beam') return available(state, 'beam', 0);
  const baseline = availabilityForCheck(state, 'beam', 0);
  if (!baseline.enabled) return baseline;
  if (!nearestUsableSideViewTarget(state)) return unavailable(state, 'beam', 0, 'NO_TARGET');
  return baseline;
}

function assaultAvailability(state: CombatState): AbilityAvailability {
  if (state.result !== 'ACTIVE') return unavailable(state, 'assault', 0, 'COMBAT_OVER');
  return available(state, 'assault', 0);
}

function extractionAvailability(state: CombatState): AbilityAvailability {
  if (state.result !== 'ACTIVE') return unavailable(state, 'extract', 0, 'COMBAT_OVER');
  if (state.extractionStatus === 'AVAILABLE') return available(state, 'extract', 0);
  if (state.extractionStatus === 'IN_PROGRESS' || state.extractionStatus === 'COMPLETE') return unavailable(state, 'extract', 0, 'EXTRACTING');
  return unavailable(state, 'extract', 0, 'EXTRACT_LOCKED');
}

function availabilityForCheck(state: CombatState, ability: 'emp' | 'plasma' | 'beam' | 'overdrive', energyCost: number, target?: { x: number; z: number }): AbilityAvailability {
  const check = abilityCheck(state, ability, target);
  if (check.ok) return available(state, ability, energyCost);
  return unavailable(state, ability, energyCost, availabilityReason(check.reason));
}

function available(state: CombatState, ability: BattleActionId, energyCost: number): AbilityAvailability {
  return { enabled: true, cooldownRemaining: cooldownFor(state, ability), energyCost, cellCost: cellCostFor(ability) };
}

function unavailable(state: CombatState, ability: BattleActionId, energyCost: number, reason: AbilityAvailabilityReason): AbilityAvailability {
  return { enabled: false, reason, cooldownRemaining: cooldownFor(state, ability), energyCost, cellCost: cellCostFor(ability) };
}

function cooldownFor(state: CombatState, ability: BattleActionId): number {
  return ability === 'extract' || ability === 'assault' ? 0 : Math.max(0, state.cooldowns[ability]);
}

function cellCostFor(ability: BattleActionId): number {
  return ability === 'extract' || ability === 'assault' ? 0 : heavyAbilityCellCost(ability);
}

function availabilityReason(reason: string | undefined): AbilityAvailabilityReason {
  if (reason?.includes('COOLDOWN')) return 'COOLDOWN';
  if (reason?.includes('ENERGY')) return 'LOW_ENERGY';
  if (reason?.includes('OVERCHARGE')) return 'NO_CELLS';
  if (reason?.includes('CARGO')) return 'CARGO_FULL';
  if (reason?.includes('OVERHEATED')) return 'OVERHEATED';
  if (reason?.includes('RANGE')) return 'OUT_OF_RANGE';
  if (reason?.includes('Combat is over')) return 'COMBAT_OVER';
  return 'NO_TARGET';
}
