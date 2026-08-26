import type { AbsorbableTargetDefinition, AbsorbableTargetState } from './types';

/**
 * Side-view ORGANIC targets represent civilians sheltering in a bunker.
 * Ambient fleeing crowds remain directly absorbable and are intentionally not
 * protected by this state machine.
 */
export function isShelterOrganicTarget(target: Pick<AbsorbableTargetDefinition, 'id' | 'kind'>): boolean {
  return target.kind === 'ORGANIC' && !target.id.startsWith('ambient:');
}

export function ensureShelterBreachState(target: AbsorbableTargetState): void {
  if (!isShelterOrganicTarget(target)) return;
  if (target.remainingAmount <= 0) {
    target.shelterBreachState = 'DESTROYED';
    target.shelterBreachProgress = 1;
    return;
  }
  if (target.shelterBreachState) return;
  target.shelterBreachState = 'INTACT';
  target.shelterBreachProgress = 0;
}
