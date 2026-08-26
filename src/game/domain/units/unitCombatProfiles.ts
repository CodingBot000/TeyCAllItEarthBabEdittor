import type { UnitCombatProfile } from './unitCombatTypes';
import { GROUND_SAM_ATTACK_SPAWN_LOCAL } from '../sideViewSpatialRules';
import { elevationSectorPolicy } from './attackGeometry';

export const SAM_COMBAT_PROFILE: UnitCombatProfile = {
  movement: { speedRatio: 0.7, canFireWhileMoving: false, arrivalInset: 2 },
  attackShape: { minAngleRadians: 20 * Math.PI / 180, maxAngleRadians: 40 * Math.PI / 180 },
  muzzle: { ...GROUND_SAM_ATTACK_SPAWN_LOCAL },
  boundary: { halfWidth: 4, margin: 0.5 },
  weapon: { burstCount: 2, burstInterval: 0.3 },
};
export const SAM_ATTACK_POLICY = elevationSectorPolicy(SAM_COMBAT_PROFILE.attackShape);
