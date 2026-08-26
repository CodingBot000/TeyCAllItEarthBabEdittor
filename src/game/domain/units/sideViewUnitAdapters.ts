import { BALANCE } from '../balance';
import { mothershipContactVolume } from '../combatGeometry';
import { MOTHERSHIP_SIDE_VIEW_MAX_SPEED, worldToCombat, type SideViewSpatialContext } from '../sideViewSpatialRules';
import type { CombatState } from '../types';
import { createGroundPositioningState, tickGroundCombatAi } from './groundCombatAi';
import { SAM_ATTACK_POLICY, SAM_COMBAT_PROFILE } from './unitCombatProfiles';

export function tickSideViewGroundUnits(state: CombatState, dt: number, context?: SideViewSpatialContext): void {
  const activeIds = new Set<string>();
  const target = state.mothership.hull > 0 ? mothershipContactVolume(state, BALANCE.defense.samProjectileRadius) : null;
  for (const facility of state.facilities) {
    if (facility.kind !== 'SAM' || facility.destroyed || facility.health <= 0) continue;
    activeIds.add(facility.id);
    const previous = state.groundUnitAi[facility.id] ?? createGroundPositioningState(facility.id);
    if (!context) {
      state.groundUnitAi[facility.id] = { ...previous, mode: 'WAIT_FOR_SPACE', velocityX: 0, moveDirectionX: 0,
        goalX: null, canFire: false, geometricallyEligible: false, blockedReason: 'MISSING_SPATIAL_CONTEXT',
        shot: { allowed: false, reason: 'MISSING_SPATIAL_CONTEXT' }, muzzle: null, visibleBounds: null, allowedBounds: null };
      continue;
    }
    const result = tickGroundCombatAi({ id: facility.id, root: worldToCombat({ x: facility.position.x, y: context.groundRootY, z: context.groundRootZ }),
      previous, target, profile: SAM_COMBAT_PROFILE, policy: SAM_ATTACK_POLICY, baseSpeed: MOTHERSHIP_SIDE_VIEW_MAX_SPEED,
      worldBounds: context.worldBounds, visibleBounds: context.visibleBounds, dt, now: state.elapsedSeconds,
      disabled: facility.disabledUntil > state.elapsedSeconds });
    facility.position.x = result.x;
    state.groundUnitAi[facility.id] = result.state;
  }
  for (const id of Object.keys(state.groundUnitAi)) if (!activeIds.has(id)) delete state.groundUnitAi[id];
}
