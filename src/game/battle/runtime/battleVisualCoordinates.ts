/**
 * Shared side-view coordinates for the runtime ground-weapon visuals and
 * their combat effects. Keep these values together so gameplay VFX does not
 * drift away from the sprite when the ground layout is tuned.
 */
export const GROUND_ENTITY_ROOT_Y = -18.5;
import { GROUND_SAM_ROOT_Y } from '../../domain/sideViewSpatialRules';
export { GROUND_SAM_ROOT_Y, GROUND_SAM_ATTACK_SPAWN_LOCAL } from '../../domain/sideViewSpatialRules';
export const GROUND_SAM_BODY_LOCAL_Y = 2;
export const GROUND_SAM_BODY_HEIGHT = 8;
// The SAM sprite's launcher tip is the authoritative visual launch socket.
// These coordinates are local to the SAM body plane/root.
const GROUND_SAM_VISIBLE_BOTTOM_PADDING = 0.75;
const GROUND_SAM_HEALTH_BAR_GAP = 0.17;

// The supplied SAM sprite has transparent padding below the visible vehicle.
// This places the bar just below the visible pixels rather than below the
// plane's full transparent bounds.
export const GROUND_SAM_HEALTH_BAR_LOCAL_Y = GROUND_SAM_BODY_LOCAL_Y
  - GROUND_SAM_BODY_HEIGHT / 2
  + GROUND_SAM_VISIBLE_BOTTOM_PADDING
  - GROUND_SAM_HEALTH_BAR_GAP;

// Projectiles intentionally finish at the weapon's visual center so they
// visibly penetrate the target instead of exploding above it.
export const GROUND_ATTACK_TARGET_Y = GROUND_SAM_ROOT_Y + GROUND_SAM_BODY_LOCAL_Y;
// The abduction beam should terminate on the same ground-world anchor as the
// other ground interactions instead of stopping in the city layers above it.
export const GROUND_ABSORPTION_TARGET_Y = GROUND_ATTACK_TARGET_Y;
