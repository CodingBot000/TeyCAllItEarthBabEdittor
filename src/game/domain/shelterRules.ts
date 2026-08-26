import type { AbsorbableTargetDefinition, AbsorbableTargetState, CombatState } from './types';

export const CIVILIAN_SHELTER_MOVE_SPEED = 16;
export const CIVILIAN_SHELTER_ENTRY_RATE = 4_800;
export const CIVILIAN_SHELTER_ARRIVAL_RADIUS = 2.4;
export const SHELTER_CAPACITY_RATIO = 0.55;
export const SHELTER_INITIAL_OCCUPANCY_RATIO = 0.72;
export const ENABLE_DYNAMIC_CIVILIAN_SHELTER_MOVEMENT = false;

/**
 * Side-view ORGANIC targets represent shelters with a pre-placed civilian
 * group inside. Ambient organic targets are civilians remaining outside.
 */
export function isShelterOrganicTarget(target: Pick<AbsorbableTargetDefinition, 'id' | 'kind'>): boolean {
  return target.kind === 'ORGANIC' && !target.id.startsWith('ambient:');
}

export function isExternalCivilianTarget(target: Pick<AbsorbableTargetDefinition, 'id' | 'kind'>): boolean {
  return target.kind === 'ORGANIC' && target.id.startsWith('ambient:');
}

export function shelterCapacityFor(initialAmount: number): number {
  return Math.max(5_000, Math.round(Math.max(0, initialAmount) * SHELTER_CAPACITY_RATIO));
}

export function shelterInitialOccupantsFor(initialAmount: number): number {
  return Math.max(1, Math.round(shelterCapacityFor(initialAmount) * SHELTER_INITIAL_OCCUPANCY_RATIO));
}

export function ensureShelterBreachState(target: AbsorbableTargetState): void {
  if (!isShelterOrganicTarget(target)) return;
  if (target.shelterBreachState === 'DESTROYED') {
    target.shelterBreachProgress = 1;
    return;
  }
  if (target.shelterBreachState) return;
  if (target.destroyedAmount > 0 && target.remainingAmount <= 0) {
    target.shelterBreachState = 'DESTROYED';
    target.shelterBreachProgress = 1;
    return;
  }
  target.shelterBreachState = 'INTACT';
  target.shelterBreachProgress = 0;
}

export function ensureShelterOccupancyState(target: AbsorbableTargetState): void {
  if (!isShelterOrganicTarget(target)) return;
  target.shelterCapacity = Math.max(1, target.shelterCapacity ?? shelterCapacityFor(target.initialAmount));
  target.shelterOccupants = clamp(target.remainingAmount, 0, target.shelterCapacity);
  target.remainingAmount = target.shelterOccupants;
}

export function tickCivilianShelters(state: CombatState, deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const shelters = state.absorbableTargets.filter(isShelterOrganicTarget);
  shelters.forEach((shelter) => {
    ensureShelterBreachState(shelter);
    ensureShelterOccupancyState(shelter);
  });
  const civilians = state.absorbableTargets.filter(isExternalCivilianTarget);
  for (const civilian of civilians) {
    ensureCivilianShelterState(civilian);
    // A beam locks its selected civilian group in place for the full
    // absorption channel. The visual adapter also freezes its walk cycle, but
    // keeping the domain position stable protects the rule if shelter motion
    // is enabled later.
    if (state.activeAbility === 'beam' && state.activeBeamTargetId === civilian.id) continue;
    if (civilian.remainingAmount <= 0.001) {
      civilian.remainingAmount = 0;
      civilian.civilianShelterState = 'SHELTERED';
      civilian.shelterTravelProgress = 1;
      continue;
    }

    let shelter = civilian.assignedShelterId
      ? shelters.find((candidate) => candidate.id === civilian.assignedShelterId) ?? null
      : null;
    if (!shelter || !canReceiveCivilian(shelter)) {
      shelter = nearestAvailableShelter(civilian, shelters);
      civilian.assignedShelterId = shelter?.id ?? null;
    }
    if (!shelter) {
      civilian.civilianShelterState = 'BLOCKED';
      civilian.shelterTravelProgress = 0;
      continue;
    }

    civilian.civilianShelterState = 'SEEKING_SHELTER';
    const distanceToShelter = Math.abs(shelter.center.x - civilian.center.x);
    const travelDistance = Math.max(1, Math.abs(shelter.center.x - (civilian.initialCenterX ?? civilian.center.x)));
    if (distanceToShelter > CIVILIAN_SHELTER_ARRIVAL_RADIUS) {
      civilian.center.x = moveTowards(civilian.center.x, shelter.center.x, CIVILIAN_SHELTER_MOVE_SPEED * deltaSeconds);
      civilian.shelterTravelProgress = clamp(1 - Math.abs(shelter.center.x - civilian.center.x) / travelDistance, 0, 1);
      continue;
    }

    civilian.center.x = shelter.center.x;
    const availableSpace = Math.max(0, (shelter.shelterCapacity ?? 0) - (shelter.shelterOccupants ?? 0));
    if (availableSpace <= 0.001) {
      civilian.civilianShelterState = 'BLOCKED';
      civilian.shelterTravelProgress = 1;
      continue;
    }
    const entering = Math.min(civilian.remainingAmount, availableSpace, CIVILIAN_SHELTER_ENTRY_RATE * deltaSeconds);
    shelter.shelterOccupants = Math.min(shelter.shelterCapacity ?? 0, (shelter.shelterOccupants ?? 0) + entering);
    shelter.remainingAmount = shelter.shelterOccupants;
    civilian.remainingAmount = Math.max(0, civilian.remainingAmount - entering);
    civilian.shelterTravelProgress = 1;
    if (civilian.remainingAmount <= 0.001) {
      civilian.remainingAmount = 0;
      civilian.civilianShelterState = 'SHELTERED';
    } else if (!canReceiveCivilian(shelter)) {
      civilian.civilianShelterState = 'BLOCKED';
    }
  }
}

function ensureCivilianShelterState(target: AbsorbableTargetState): void {
  if (!isExternalCivilianTarget(target)) return;
  target.civilianShelterState ??= 'OUTSIDE';
  target.assignedShelterId ??= null;
  target.shelterTravelProgress ??= 0;
  target.initialCenterX ??= target.center.x;
}

function canReceiveCivilian(shelter: AbsorbableTargetState): boolean {
  return isShelterOrganicTarget(shelter)
    && shelter.shelterBreachState === 'INTACT'
    && (shelter.shelterOccupants ?? 0) < (shelter.shelterCapacity ?? 0) - 0.001;
}

function nearestAvailableShelter(civilian: AbsorbableTargetState, shelters: AbsorbableTargetState[]): AbsorbableTargetState | null {
  return shelters
    .filter((shelter) => canReceiveCivilian(shelter))
    .sort((a, b) => Math.abs(a.center.x - civilian.center.x) - Math.abs(b.center.x - civilian.center.x))[0] ?? null;
}

function moveTowards(current: number, target: number, distance: number): number {
  if (Math.abs(target - current) <= distance) return target;
  return current + Math.sign(target - current) * distance;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
