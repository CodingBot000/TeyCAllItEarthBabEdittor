# Ground Unit Shadow Implementation Plan

## Goal

Give every side-view ground vehicle and structure a consistent, low-cost contact shadow. The shadow is a single shared soft ellipse, scaled by the rendered object's horizontal width rather than generated from the object's silhouette.

## Scope

- Ground defenders and facilities rendered by `BattleEntityVisuals`.
- Absorbable vehicles, residential targets, machinery, power, data, and relic structures rendered by `BattleAbsorbableRegions`.
- Excluded: fighters, motherships, cohorts, fleeing crowds, projectiles, and transient VFX.

## Visual rule

- One transparent SVG asset and one shared Babylon material per scene.
- Horizontal scale: `abs(objectWidth) * 1.08`.
- Fixed height: `0.58` world units.
- Contact point: object bottom minus `0.06` world units.
- Light direction cue: shadow center is shifted `+0.3` world units on X.
- Shadow sits behind the sprite at a fixed local Z offset and remains in rendering group 3.

## Execution and verification

1. Add the shared asset/resource helper.
2. Attach and size shadows in both ground-rendering paths.
3. Hide shadows with destroyed, depleted, undiscovered, or hidden objects.
4. Run typecheck/tests/build.
5. Run the side-view Playwright verification and inspect day/night gameplay screenshots at desktop and mobile widths.
