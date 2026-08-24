/**
 * Shared side-view coordinates for the runtime ground-weapon visuals and
 * their combat effects. Keep these values together so gameplay VFX does not
 * drift away from the sprite when the ground layout is tuned.
 */
export const GROUND_ENTITY_ROOT_Y = -14.5;
export const GROUND_SAM_BODY_LOCAL_Y = 2;
export const GROUND_SAM_BODY_HEIGHT = 8;
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
export const GROUND_ATTACK_TARGET_Y = GROUND_ENTITY_ROOT_Y + GROUND_SAM_BODY_LOCAL_Y;
