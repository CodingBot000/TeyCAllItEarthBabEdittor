import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data/cities';
import { TACTICAL_PRESETS } from '../../data/tacticalPresets';
import { createNewCampaign, stageMissionResult } from '../../domain/campaignRules';
import { BALANCE } from '../../domain/balance';
import { fighterCombatCenter, fighterKeepOutMetric, fighterSegmentKeepOutIntersection, projectFighterOutsideKeepOut, tickCombat as domainTickCombat, type CombatTickOptions } from '../../domain/combatRules';
import { createDeployedCohorts, resolveRecoveredCohorts, tickCohorts } from '../../domain/cohortRules';
import { mothershipContactVolume } from '../../domain/combatGeometry';
import type { CombatState } from '../../domain/types';
import { COASTAL_GAMEPLAY_PROFILE } from './BattleGameplayProfile';
import { createPlannedBattleSetup } from './battleSetupRules';
import { generateAbsorbableClusters } from './generateAbsorbableClusters';
import { tickGroundSwarm } from './groundSwarmRules';
import { ABSORBABLE_KINDS } from './sideViewResourcePools';
import { abortSideViewBattle, beginSideViewExtraction, createSideViewBattleSession, discoverNearbySideViewTargets, tickSideViewBattle } from './sideViewBattleRules';

const spatialFixture = { worldBounds: { minX: -132, maxX: 132 }, visibleBounds: { minX: -120, maxX: 120 }, groundRootY: -16.5, groundRootZ: 1.1 };
function tickCombat(state: CombatState, dt: number, options: CombatTickOptions = {}) {
  domainTickCombat(state, dt, { sideViewSpatial: spatialFixture, ...options });
}
function samFixture(x = -50) {
  const campaign = createNewCampaign(7412);
  const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
  const session = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
  const state = session.combatState;
  const sam = state.facilities.find((facility) => facility.kind === 'SAM')!;
  state.facilities = [sam]; state.enemies = []; state.lastWaveAlert = 100;
  sam.position.x = x; state.facilityCooldowns[sam.id] = 0;
  return { ...session, state, sam };
}

describe('side-view battle gameplay', () => {
  it('generates deterministic, spaced clusters across the initial and offscreen regions', () => {
    const sourceTargets = TACTICAL_PRESETS['coastal-megacity'].absorbableTargets;
    const input = {
      campaignSeed: 4242,
      cityId: 'seoul',
      visit: 1,
      missionId: 'mission-seoul-1',
      profile: COASTAL_GAMEPLAY_PROFILE,
      sourceTargets,
    };
    const first = generateAbsorbableClusters(input);
    const second = generateAbsorbableClusters(input);

    expect(second).toEqual(first);
    expect(first).toHaveLength(COASTAL_GAMEPLAY_PROFILE.clusterCount);
    expect(first.some((target) => Math.abs(target.center.x) < COASTAL_GAMEPLAY_PROFILE.initialViewHalfWidth)).toBe(true);
    expect(first.some((target) => target.center.x < -COASTAL_GAMEPLAY_PROFILE.initialViewHalfWidth)).toBe(true);
    expect(first.some((target) => target.center.x > COASTAL_GAMEPLAY_PROFILE.initialViewHalfWidth)).toBe(true);
    expect(new Set(first.map((target) => target.id)).size).toBe(first.length);
    const positions = first.map((target) => target.center.x).sort((a, b) => a - b);
    expect(positions.slice(1).every((position, index) => position - positions[index] >= COASTAL_GAMEPLAY_PROFILE.clusterSpacing * 0.72)).toBe(true);
    const initialTarget = first.slice().sort((a, b) => Math.abs(a.center.x) - Math.abs(b.center.x))[0];
    expect(initialTarget.requirement).toBe('NONE');
  });

  it('changes the generated layout for a later city visit', () => {
    const sourceTargets = TACTICAL_PRESETS['coastal-megacity'].absorbableTargets;
    const base = {
      campaignSeed: 4242,
      cityId: 'seoul',
      missionId: 'mission-seoul',
      profile: COASTAL_GAMEPLAY_PROFILE,
      sourceTargets,
    };
    const first = generateAbsorbableClusters({ ...base, visit: 1 });
    const second = generateAbsorbableClusters({ ...base, visit: 2 });
    expect(second.map((target) => target.center.x)).not.toEqual(first.map((target) => target.center.x));
  });

  it('keeps a mission layout stable while drawing later visits from the remaining city pools', () => {
    const base = createNewCampaign(4243);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const firstMissionId = 'mission-resource-pools-1';
    const campaign = {
      ...base,
      currentCityId: city.id,
      plannedMission: {
        id: firstMissionId,
        cityId: city.id,
        missionType: 'RAID' as const,
        cohortIds: [],
        overchargeCells: 0,
        travelChargeCost: 0,
        cellChargeCost: 0,
        createdAtMinutes: 0,
        battleSetup: createPlannedBattleSetup(base, city, firstMissionId),
      },
    };
    const first = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const reloaded = createSideViewBattleSession(structuredClone(campaign), city, structuredClone(campaign.cities[city.id]), TACTICAL_PRESETS[city.tacticalPresetId]);
    expect(reloaded.combatState.absorbableTargets.map((target) => ({ id: target.id, x: target.center.x, amount: target.initialAmount }))).toEqual(
      first.combatState.absorbableTargets.map((target) => ({ id: target.id, x: target.center.x, amount: target.initialAmount })),
    );
    for (const kind of ABSORBABLE_KINDS) {
      const generatedAmount = first.combatState.absorbableTargets.filter((target) => target.kind === kind).reduce((sum, target) => sum + target.initialAmount, 0);
      expect(generatedAmount).toBeLessThanOrEqual(campaign.cities[city.id].sideViewResources.pools[kind].remainingAmount);
    }

    const harvestedTarget = first.combatState.absorbableTargets.find((target) => target.initialAmount >= 1_000)!;
    const harvestedAmount = Math.min(1_000, harvestedTarget.remainingAmount);
    const poolBefore = campaign.cities[city.id].sideViewResources.pools[harvestedTarget.kind].remainingAmount;
    harvestedTarget.remainingAmount -= harvestedAmount;
    harvestedTarget.absorbedAmount += harvestedAmount;
    const staged = stageMissionResult(campaign, first.combatState, city);
    const poolAfter = staged.cities[city.id].sideViewResources.pools[harvestedTarget.kind].remainingAmount;
    expect(poolAfter).toBe(poolBefore - harvestedAmount);

    const secondMissionId = 'mission-resource-pools-2';
    const secondCampaign = {
      ...staged,
      currentCityId: city.id,
      pendingDebrief: null,
      plannedMission: {
        id: secondMissionId,
        cityId: city.id,
        missionType: 'RAID' as const,
        cohortIds: [],
        overchargeCells: 0,
        travelChargeCost: 0,
        cellChargeCost: 0,
        createdAtMinutes: staged.currentTimeMinutes,
        battleSetup: createPlannedBattleSetup(staged, city, secondMissionId),
      },
    };
    const second = createSideViewBattleSession(secondCampaign, city, secondCampaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    expect(second.combatState.absorbableTargets.map((target) => target.center.x)).not.toEqual(first.combatState.absorbableTargets.map((target) => target.center.x));
    for (const kind of ABSORBABLE_KINDS) {
      const generatedAmount = second.combatState.absorbableTargets.filter((target) => target.kind === kind).reduce((sum, target) => sum + target.initialAmount, 0);
      expect(generatedAmount).toBeLessThanOrEqual(staged.cities[city.id].sideViewResources.pools[kind].remainingAmount);
    }
  });

  it('applies River and Desert profile pressure, defense, and occupation data to the combat state', () => {
    const baseCity = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const sessionFor = (presetId: 'coastal-megacity' | 'river-metropolis' | 'desert-tech-hub') => {
      const campaign = createNewCampaign(7410);
      const city = { ...baseCity, tacticalPresetId: presetId };
      return createSideViewBattleSession(campaign, city, campaign.cities[baseCity.id], TACTICAL_PRESETS[presetId]);
    };
    const coastal = sessionFor('coastal-megacity');
    const river = sessionFor('river-metropolis');
    const desert = sessionFor('desert-tech-hub');

    expect(coastal.combatState.facilities.filter((facility) => facility.kind === 'SAM')).toHaveLength(3);
    expect(river.combatState.facilities.filter((facility) => facility.kind === 'SAM')).toHaveLength(2);
    expect(desert.combatState.controlNodes.filter((node) => node.requiredForOccupation)).toHaveLength(3);
    expect(desert.combatState.enemyPressureMultiplier).toBe(1.15);
    expect(desert.combatState.groundDefenders[0].health).toBeGreaterThan(coastal.combatState.groundDefenders[0].health);

    coastal.combatState.localAlert = 20;
    desert.combatState.localAlert = 20;
    tickCombat(coastal.combatState, 0.01);
    tickCombat(desert.combatState, 0.01);
    expect(desert.combatState.enemies.length).toBeGreaterThan(coastal.combatState.enemies.length);
  });

  it('creates deterministic fighter orbit variants with vertical separation around the mothership', () => {
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const first = createSideViewBattleSession(createNewCampaign(7420), city, createNewCampaign(7420).cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const secondCampaign = createNewCampaign(7420);
    const second = createSideViewBattleSession(secondCampaign, city, secondCampaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    first.combatState.localAlert = 20;
    second.combatState.localAlert = 20;

    tickCombat(first.combatState, 1 / 60);
    tickCombat(second.combatState, 1 / 60);

    const firstOrbit = first.combatState.enemies.map((enemy) => ({
      radius: enemy.orbitRadius,
      speed: enemy.orbitAngularSpeed,
      eccentricity: enemy.orbitEccentricity,
      verticalRadius: enemy.orbitVerticalRadius,
      depthRadius: enemy.orbitDepthRadius,
      planeTilt: enemy.orbitPlaneTilt,
      phase: enemy.orbitPhase,
      altitude: enemy.position.y,
    }));
    const secondOrbit = second.combatState.enemies.map((enemy) => ({
      radius: enemy.orbitRadius,
      speed: enemy.orbitAngularSpeed,
      eccentricity: enemy.orbitEccentricity,
      verticalRadius: enemy.orbitVerticalRadius,
      depthRadius: enemy.orbitDepthRadius,
      planeTilt: enemy.orbitPlaneTilt,
      phase: enemy.orbitPhase,
      altitude: enemy.position.y,
    }));

    expect(firstOrbit).toEqual(secondOrbit);
    expect(new Set(firstOrbit.map((enemy) => enemy.radius)).size).toBeGreaterThan(1);
    expect(new Set(firstOrbit.map((enemy) => enemy.phase)).size).toBeGreaterThan(1);
    expect(Math.max(...firstOrbit.map((enemy) => enemy.altitude)) - Math.min(...firstOrbit.map((enemy) => enemy.altitude))).toBeGreaterThan(0.5);
  });

  it('keeps fighter paths outside the mothership 3D keep-out envelope', () => {
    const campaign = createNewCampaign(7421);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const center = fighterCombatCenter(combatState);
    const projected = projectFighterOutsideKeepOut(center, center);
    expect(fighterKeepOutMetric(projected, center)).toBeGreaterThanOrEqual(1);
    expect(fighterSegmentKeepOutIntersection(
      { x: center.x - 40, y: center.y, z: center.z },
      { x: center.x + 40, y: center.y, z: center.z },
      center,
    )).not.toBeNull();

    combatState.localAlert = 20;
    combatState.mothership.hull = 1_000_000_000;
    combatState.mothership.maxHull = 1_000_000_000;
    combatState.mothership.shield = 1_000_000_000;
    combatState.mothership.maxShield = 1_000_000_000;
    tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
    let minimumDistance = Number.POSITIVE_INFINITY;
    let minimumMetric = Number.POSITIVE_INFINITY;
    let maximumFighterCount = 0;
    const seenModes = new Set<string>();
    for (let frame = 0; frame < 60 * 600; frame += 1) {
      tickCombat(combatState, 1 / 60, { unitInvincibilityEnabled: true, disablePointDefense: true });
      const currentCenter = fighterCombatCenter(combatState);
      maximumFighterCount = Math.max(maximumFighterCount, combatState.enemies.length);
      for (const enemy of combatState.enemies) {
        minimumMetric = Math.min(minimumMetric, fighterKeepOutMetric(enemy.position, currentCenter));
        minimumDistance = Math.min(minimumDistance, Math.hypot(
          enemy.position.x - currentCenter.x,
          enemy.position.y - currentCenter.y,
          enemy.position.z - currentCenter.z,
        ));
        seenModes.add(enemy.flightMode);
      }
    }
    expect(minimumMetric).toBeGreaterThanOrEqual(0.999);
    expect(minimumDistance).toBeGreaterThanOrEqual(BALANCE.defense.fighterAttackPassRadiusMin - 0.1);
    expect(maximumFighterCount).toBe(BALANCE.defense.fighterMaxCount);
    expect(seenModes.has('ATTACK_PASS')).toBe(true);
    expect(seenModes.has('RECOVER')).toBe(true);
    expect(seenModes.has('ORBIT')).toBe(true);
  }, 15_000);

  it('pairs SAM missiles with the facility position at the moment of firing', () => {
    const campaign = createNewCampaign(7412);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const sam = combatState.facilities.find((facility) => facility.kind === 'SAM')!;
    sam.position = { x: -50, z: 0 };
    combatState.facilityCooldowns[sam.id] = 0;

    tickCombat(combatState, 0.01);

    const missile = combatState.missiles.find((candidate) => candidate.source === 'sam' && candidate.sourceId === sam.id);
    expect(missile?.launchPosition.x).toBeCloseTo(-50.9, 8);
    expect(missile?.launchPosition.z).toBeCloseTo(0.1, 8);
    expect(missile?.launchY).toBe(4.6);
    expect(missile?.launchAngleRadians).toBeGreaterThanOrEqual(20 * Math.PI / 180);
    expect(missile?.launchAngleRadians).toBeLessThanOrEqual(40 * Math.PI / 180);
    const launch = { ...missile!.launchPosition };
    sam.position.x = 70;
    tickCombat(combatState, 0.01);
    expect(missile!.launchPosition).toEqual(launch);
  });

  it('fires two SAM missiles 0.3 seconds apart before restoring the normal cooldown', () => {
    const campaign = createNewCampaign(7414);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const sam = combatState.facilities.find((facility) => facility.kind === 'SAM')!;
    sam.position.x = -50;
    combatState.facilityCooldowns[sam.id] = 0;

    tickCombat(combatState, 0.01);
    expect(combatState.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(1);
    tickCombat(combatState, 0.25);
    tickCombat(combatState, 0.04);
    expect(combatState.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(1);
    tickCombat(combatState, 0.01);
    expect(combatState.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(2);

    const normalCooldown = combatState.facilityCooldowns[sam.id];
    expect(normalCooldown).toBeGreaterThanOrEqual(1.5);
    tickCombat(combatState, 0.25);
    expect(combatState.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(2);
    expect(combatState.facilityCooldowns[sam.id]).toBeCloseTo(normalCooldown - 0.25, 5);
  });

  it('does not register a missile hit until it reaches the visible mothership body', () => {
    const campaign = createNewCampaign(7415);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.facilities.forEach((facility) => { facility.destroyed = true; });
    combatState.mothership.shield = 0;

    const missileAt = (x: number) => ({
      id: `collision-test-${x}`,
      source: 'fighter' as const,
      sourceId: 'collision-test',
      launchPosition: { x, z: combatState.mothership.position.z },
      launchY: BALANCE.mothership.baseAltitude,
      position: { x, z: combatState.mothership.position.z },
      y: BALANCE.mothership.baseAltitude,
      target: { ...combatState.mothership.position },
      targetY: BALANCE.mothership.baseAltitude,
      speed: 0,
      damage: 100,
      age: 0,
    });

    const hullBefore = combatState.mothership.hull;
    combatState.missiles = [missileAt(combatState.mothership.position.x + 12)];
    tickCombat(combatState, 0.01);
    expect(combatState.mothership.hull).toBe(hullBefore);

    combatState.missiles = [missileAt(combatState.mothership.position.x + 8)];
    tickCombat(combatState, 0.01);
    expect(combatState.mothership.hull).toBeLessThan(hullBefore);
  });

  it('can disable point defense without removing incoming missiles', () => {
    const campaign = createNewCampaign(7416);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.facilities.forEach((facility) => { facility.destroyed = true; });
    const x = combatState.mothership.position.x + 12;
    combatState.missiles = [{
      id: 'point-defense-debug-missile',
      source: 'fighter',
      sourceId: 'point-defense-debug',
      launchPosition: { x, z: combatState.mothership.position.z },
      launchY: BALANCE.mothership.baseAltitude,
      position: { x, z: combatState.mothership.position.z },
      y: BALANCE.mothership.baseAltitude,
      target: { ...combatState.mothership.position },
      targetY: BALANCE.mothership.baseAltitude,
      speed: 0,
      damage: 10,
      age: 0,
    }];

    tickCombat(combatState, 0.01, { disablePointDefense: true });

    expect(combatState.pointDefenseShots).toHaveLength(0);
    expect(combatState.missiles[0]?.age).toBeCloseTo(0.01, 5);
  });

  it('does not impose a missile-count cap on a geometrically eligible SAM', () => {
    const campaign = createNewCampaign(7413);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const sam = combatState.facilities.find((facility) => facility.kind === 'SAM')!;
    sam.position = { x: 70, z: 0 };
    combatState.facilityCooldowns[sam.id] = 0;
    combatState.missiles = Array.from({ length: 16 }, (_, index) => ({
      id: `filler-${index}`,
      source: 'fighter' as const,
      sourceId: `fighter-${index}`,
      launchPosition: { x: 0, z: 0 },
      launchY: 24,
      position: { x: 0, z: 0 },
      y: 24,
      target: { x: 0, z: 0 },
      targetY: 33,
      speed: 1,
      damage: 1,
      age: 0,
    }));

    tickCombat(combatState, 0.01);

    expect(combatState.missiles.some((missile) => missile.source === 'sam' && missile.sourceId === sam.id)).toBe(true);
  });

  it('retreats from directly underneath, approaches from too far away, and fires only after stopping', () => {
    for (const x of [0, -110]) {
      const { state, sam } = samFixture(x);
      tickCombat(state, 1 / 60, { disablePointDefense: true });
      expect(state.missiles).toHaveLength(0);
      expect(Math.abs(sam.position.x - x)).toBeCloseTo(11.9 / 60, 8);
      expect(state.facilityCooldowns[sam.id]).toBe(0);
      for (let i = 0; i < 900 && state.missiles.length === 0; i += 1) tickCombat(state, 1 / 60, { disablePointDefense: true });
      expect(state.missiles).toHaveLength(1);
      expect(state.groundUnitAi[sam.id].mode).toBe('HOLD');
    }
  });

  it('fails closed without a side-view spatial context and leaves legacy firing intact', () => {
    const { state, sam } = samFixture();
    domainTickCombat(state, 0.1);
    expect(state.missiles).toHaveLength(0);
    expect(sam.position.x).toBe(-50);
    expect(state.groundUnitAi[sam.id].blockedReason).toBe('MISSING_SPATIAL_CONTEXT');
    state.battleMode = 'LEGACY_TACTICAL';
    domainTickCombat(state, 0.1);
    expect(state.missiles[0].launchY).toBe(3.5);
    expect(state.missiles[0].coordinateSpace).toBeUndefined();
  });

  it.each(['target', 'view', 'emp'] as const)('cancels pending burst on %s loss and uses a normal cooldown', (loss) => {
    const { state, sam } = samFixture();
    tickCombat(state, 0.01, { disablePointDefense: true });
    expect(state.facilityBurstRemaining[sam.id]).toBe(1);
    if (loss === 'target') state.mothership.position.x = sam.position.x;
    if (loss === 'emp') sam.disabledUntil = state.elapsedSeconds + 2;
    tickCombat(state, 0.1, { disablePointDefense: true, sideViewSpatial: loss === 'view'
      ? { ...spatialFixture, visibleBounds: { minX: 0, maxX: 100 } } : spatialFixture });
    expect(state.facilityBurstRemaining[sam.id]).toBe(0);
    expect(state.facilityCooldowns[sam.id]).toBeGreaterThanOrEqual(1.5);
    expect(state.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(1);
    const cooldown = state.facilityCooldowns[sam.id]; const x = sam.position.x;
    if (loss === 'emp') {
      const facing = state.groundUnitAi[sam.id].facingX;
      tickCombat(state, 0.25, { disablePointDefense: true });
      expect(state.facilityCooldowns[sam.id]).toBe(cooldown);
      expect(sam.position.x).toBe(x);
      expect(state.groundUnitAi[sam.id].facingX).toBe(facing);
      sam.disabledUntil = 0;
    }
    state.mothership.position.x = 0;
    tickCombat(state, 0.01, { disablePointDefense: true });
    expect(state.missiles.filter((missile) => missile.sourceId === sam.id)).toHaveLength(1);
  });

  it('uses current shield/hull geometry and preserves the legal initial direction and launch snapshot', () => {
    const { state, sam } = samFixture(-30);
    tickCombat(state, 0.01, { disablePointDefense: true });
    const missile = state.missiles[0];
    expect(missile).toBeDefined();
    const measuredAngle = Math.atan2(missile.y - missile.launchY, Math.abs(missile.position.x - missile.launchPosition.x));
    expect(measuredAngle).toBeCloseTo(missile.launchAngleRadians!, 8);
    const launch = JSON.stringify({ ...missile.launchPosition, y: missile.launchY });
    state.mothership.shield = 0; state.mothership.shieldRegenDelay = 5;
    expect(mothershipContactVolume(state, 0.25).radii.y).toBeCloseTo(2.35, 8);
    tickCombat(state, 0.01, { disablePointDefense: true });
    const hull = mothershipContactVolume(state, 0.25);
    const shot = state.groundUnitAi[sam.id].shot;
    expect(shot.allowed && shot.targetKind).toBe('HULL');
    const offset = missile.aimOffset!;
    expect((offset.x / hull.radii.x) ** 2 + (offset.y / hull.radii.y) ** 2 + (offset.z / hull.radii.z) ** 2).toBeLessThanOrEqual(1 + 1e-9);
    sam.destroyed = true; sam.health = 0;
    tickCombat(state, 0.01, { disablePointDefense: true });
    expect(state.groundUnitAi[sam.id]).toBeUndefined();
    expect(JSON.stringify({ ...missile.launchPosition, y: missile.launchY })).toBe(launch);
    expect(state.missiles).toContain(missile);
  });

  it('cleans AI on battle end and keeps shared presets, resource vehicles and control nodes stationary', () => {
    const original = JSON.stringify(TACTICAL_PRESETS);
    const { state } = samFixture(0);
    const resources = state.absorbableTargets.map((target) => ({ ...target.center }));
    const nodes = state.controlNodes.map((node) => ({ ...node.position }));
    for (let i = 0; i < 60; i += 1) tickCombat(state, 1 / 60);
    expect(JSON.stringify(TACTICAL_PRESETS)).toBe(original);
    expect(state.absorbableTargets.map((target) => target.center)).toEqual(resources);
    expect(state.controlNodes.map((node) => node.position)).toEqual(nodes);
    abortSideViewBattle(state);
    expect(state.groundUnitAi).toEqual({});
    const x = state.facilities[0].position.x;
    tickCombat(state, 1);
    expect(state.facilities[0].position.x).toBe(x);
  });

  it('makes drones and assault cohorts track the current moving facility position', () => {
    const { state, sam, profile } = samFixture(0);
    state.groundSwarmProjectiles = [{ id: 'moving-target-test', targetId: sam.id, startX: -20, targetX: 0, progress: 0.99, duration: 1, arcHeight: 3, weavePhase: 0, damage: 1 }];
    tickCombat(state, 0.1);
    tickGroundSwarm(state, profile, 0.1);
    expect(state.groundSwarmImpacts[0].x).toBe(sam.position.x);
    const campaign = createNewCampaign(7412);
    campaign.cohorts = { 'test-cohort': { id: 'test-cohort', type: 'ASSAULT', strength: 100, cohesion: 100, control: 100, experience: 0, status: 'RESERVE', assignedCityId: null, createdAtBattle: 0 } };
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    campaign.plannedMission = { id: 'test-mission', cityId: city.id, missionType: 'RAID', cohortIds: ['test-cohort'], overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 0, battleSetup: createPlannedBattleSetup(campaign, city, 'test-mission') };
    state.deployedCohorts = createDeployedCohorts(campaign);
    const cohort = state.deployedCohorts[0];
    expect(cohort).toBeDefined();
    cohort.deployed = true; cohort.order = 'ASSAULT'; cohort.targetEntityId = sam.id;
    sam.position.x = 25;
    tickCohorts(state, 0.1, true);
    expect(cohort.targetPosition?.x).toBe(25);
  });

  it('builds the side-view encounter from the 2D biome catalog instead of 3D preset geometry', () => {
    const campaign = createNewCampaign(7411);
    const sourceCity = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const city = { ...sourceCity, tacticalPresetId: 'river-metropolis' as const };
    const stripped3dPreset = {
      ...TACTICAL_PRESETS['river-metropolis'],
      absorbableTargets: [],
      facilities: [],
      controlNodes: [],
      groundDefenders: [],
      populationZones: [],
      clusters: [],
      urbanPlan: { roads: [], reservedZones: [] },
    };
    const session = createSideViewBattleSession(campaign, city, campaign.cities[sourceCity.id], stripped3dPreset);

    expect(session.profile.id).toBe('river-side-view-v1');
    expect(session.combatState.absorbableTargets.length).toBeGreaterThan(0);
    expect(session.combatState.facilities.length).toBe(5);
    expect(session.combatState.controlNodes.filter((node) => node.requiredForOccupation)).toHaveLength(2);
  });

  it('auto-discovers nearby clusters without spending tactical energy', () => {
    const campaign = createNewCampaign(7001);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const hidden = combatState.absorbableTargets.find((target) => !target.discovered)!;
    combatState.mothership.position.x = hidden.center.x;
    const energyBefore = combatState.mothership.energy;

    expect(discoverNearbySideViewTargets(combatState, profile)).toBeGreaterThan(0);
    expect(hidden.discovered).toBe(true);
    expect(combatState.mothership.energy).toBe(energyBefore);
  });

  it('extends automatic scan range with the scanner-array upgrade', () => {
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const base = createNewCampaign(70011);
    const baseline = createSideViewBattleSession(base, city, base.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const baselineTarget = baseline.combatState.absorbableTargets[0];
    baseline.combatState.absorbableTargets.forEach((target) => { target.discovered = target.id !== baselineTarget.id; });
    baselineTarget.center.x = baseline.profile.autoScanRange + baselineTarget.radius + 3;
    expect(discoverNearbySideViewTargets(baseline.combatState, baseline.profile)).toBe(0);
    expect(baselineTarget.discovered).toBe(false);

    const upgradedCampaign = { ...createNewCampaign(70011), upgrades: { 'scanner-array': 1 } };
    const upgraded = createSideViewBattleSession(upgradedCampaign, city, upgradedCampaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const upgradedTarget = upgraded.combatState.absorbableTargets[0];
    upgraded.combatState.absorbableTargets.forEach((target) => { target.discovered = target.id !== upgradedTarget.id; });
    upgradedTarget.center.x = upgraded.profile.autoScanRange + upgradedTarget.radius + 3;
    expect(discoverNearbySideViewTargets(upgraded.combatState, upgraded.profile)).toBe(1);
    expect(upgradedTarget.discovered).toBe(true);
  });

  it('locks extraction until survival time and then completes a timed channel', () => {
    const campaign = createNewCampaign(7002);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);

    expect(beginSideViewExtraction(combatState)).toEqual({ ok: false, reason: 'EXTRACTION LOCKED' });
    combatState.elapsedSeconds = profile.survivalUnlockSeconds;
    tickSideViewBattle(combatState, profile, 0);
    expect(combatState.extractionStatus).toBe('AVAILABLE');
    expect(beginSideViewExtraction(combatState)).toEqual({ ok: true });
    tickSideViewBattle(combatState, profile, profile.extractionChannelSeconds);
    expect(combatState.extractionStatus).toBe('COMPLETE');
    expect(combatState.result).toBe('PARTIAL');
  });

  it('launches a curved ground swarm burst and applies real defender damage on impact', () => {
    const campaign = createNewCampaign(7003);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const target = combatState.groundDefenders[0];
    const healthBefore = target.health;
    combatState.elapsedSeconds = 3;
    tickGroundSwarm(combatState, profile, 0);

    expect(combatState.groundSwarmProjectiles).toHaveLength(4);
    expect(new Set(combatState.groundSwarmProjectiles.map((projectile) => projectile.arcHeight)).size).toBeGreaterThan(1);
    let impactSeen = false;
    for (let index = 0; index < Math.ceil(BALANCE.groundSwarm.maximumDuration * 60) + 30; index += 1) {
      combatState.elapsedSeconds += 1 / 60;
      tickGroundSwarm(combatState, profile, 1 / 60);
      impactSeen ||= combatState.groundSwarmImpacts.length > 0;
    }
    expect(target.health).toBeLessThan(healthBefore);
    expect(impactSeen).toBe(true);
    expect(combatState.groundSwarmProjectiles.length).toBeLessThanOrEqual(BALANCE.groundSwarm.maximumActiveProjectiles);
  });

  it('charges a capped repair cost after mothership loss without soft-locking the campaign', () => {
    const campaign = createNewCampaign(7004);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.mothership.hull = 0;
    combatState.result = 'FAILED';
    const next = stageMissionResult(campaign, combatState, city);
    const repair = next.pendingDebrief?.repairAssessment;

    expect(repair?.biomassCost).toBeGreaterThan(0);
    expect(repair?.alloyCost).toBeGreaterThan(0);
    expect(repair!.biomassCost).toBeLessThanOrEqual(Math.floor(campaign.resources.biomass * BALANCE.repair.maximumWalletRatio));
    expect(repair!.alloyCost).toBeLessThanOrEqual(Math.floor(campaign.resources.alloy * BALANCE.repair.maximumWalletRatio));
    expect(next.resources.biomass).toBeGreaterThanOrEqual(0);
    expect(next.resources.alloy).toBeGreaterThanOrEqual(0);
    expect(next.mothership.hull).toBe(campaign.mothership.maxHull * BALANCE.repair.emergencyHullRatio);
  });

  it('records an aborted mission without emergency repair and recovers the configured cargo fraction', () => {
    const campaign = createNewCampaign(70041);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.cargo = { captives: 100, biomass: 200, alloy: 80, intel: 20, coreCharge: 0 };
    combatState.mothership.hull = 720;

    expect(abortSideViewBattle(combatState)).toEqual({ ok: true });
    const next = stageMissionResult(campaign, combatState, city);

    expect(combatState).toMatchObject({ result: 'FAILED', endReason: 'ABORTED' });
    expect(next.pendingDebrief?.repairAssessment).toBeNull();
    expect(next.pendingDebrief?.cargoRecovered).toMatchObject({ captives: 35, biomass: 70, alloy: 28, intel: 7 });
    expect(next.mothership.hull).toBe(720);
  });

  it('auto-deploys a selected cohort and assigns an assault target without player micro', () => {
    const base = createNewCampaign(7005);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const campaign = {
      ...base,
      currentCityId: city.id,
      cohorts: {
        'cohort-1': { id: 'cohort-1', type: 'ASSAULT' as const, strength: 100, cohesion: 100, control: 100, experience: 0, status: 'RESERVE' as const, assignedCityId: null, createdAtBattle: 0 },
      },
      plannedMission: { id: 'mission-cohort-ai', cityId: city.id, missionType: 'RAID' as const, cohortIds: ['cohort-1'], overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 0, battleSetup: createPlannedBattleSetup(base, city, 'mission-cohort-ai') },
    };
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.elapsedSeconds = BALANCE.sideViewCohort.deploymentDelay;
    tickSideViewBattle(combatState, profile, 0);

    expect(combatState.deployedCohorts[0]).toMatchObject({ cohortId: 'cohort-1', deployed: true, order: 'ASSAULT' });
    expect(combatState.deployedCohorts[0].targetEntityId).toBeTruthy();
    combatState.extractionStatus = 'IN_PROGRESS';
    tickSideViewBattle(combatState, profile, 0);
    expect(combatState.deployedCohorts[0].order).toBe('RETREAT');
  });

  it('keeps automatic entities bounded through a deterministic ten-minute soak', () => {
    const campaign = createNewCampaign(7006);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.mothership.maxHull = 1_000_000;
    combatState.mothership.hull = 1_000_000;
    combatState.mothership.maxShield = 1_000_000;
    combatState.mothership.shield = 1_000_000;
    for (let index = 0; index < 12_000; index += 1) {
      tickCombat(combatState, 0.05);
      tickSideViewBattle(combatState, profile, 0.05);
    }
    expect(combatState.elapsedSeconds).toBeCloseTo(600, 3);
    expect(combatState.enemies.length).toBeLessThanOrEqual(BALANCE.defense.fighterMaxCount);
    expect(combatState.groundSwarmProjectiles.length).toBeLessThanOrEqual(BALANCE.groundSwarm.maximumActiveProjectiles);
    expect(combatState.groundSwarmImpacts.length).toBeLessThanOrEqual(BALANCE.groundSwarm.projectilesPerBurst * 2);
    expect(combatState.missiles.length).toBeLessThan(200);
  });

  it('automates occupation assault, splits cohorts across nodes, and stages garrison candidates', () => {
    const base = createNewCampaign(7007);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const cohort = (id: string) => ({ id, type: 'ASSAULT' as const, strength: 500, cohesion: 100, control: 100, experience: 0, status: 'RESERVE' as const, assignedCityId: null, createdAtBattle: 0 });
    const campaign = {
      ...base,
      currentCityId: city.id,
      cohorts: { 'cohort-1': cohort('cohort-1'), 'cohort-2': cohort('cohort-2') },
      plannedMission: { id: 'mission-occupation-ai', cityId: city.id, missionType: 'OCCUPATION' as const, cohortIds: ['cohort-1', 'cohort-2'], overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 0, battleSetup: createPlannedBattleSetup(base, city, 'mission-occupation-ai') },
      cities: { ...base.cities, [city.id]: { ...base.cities[city.id], conquest: { ...base.cities[city.id].conquest, controlState: 'BREACHED' as const, breachProgress: 1 } } },
    };
    const { combatState, profile } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    combatState.mothership.maxHull = 1_000_000;
    combatState.mothership.hull = 1_000_000;
    combatState.mothership.maxShield = 1_000_000;
    combatState.mothership.shield = 1_000_000;
    for (let index = 0; index < 6_000 && !combatState.occupationReady; index += 1) {
      tickCombat(combatState, 0.05);
      tickSideViewBattle(combatState, profile, 0.05);
    }
    expect(combatState.occupationReady).toBe(true);
    expect(combatState.controlNodes.filter((node) => node.requiredForOccupation).every((node) => node.owner === 'ALIEN')).toBe(true);
    expect(beginSideViewExtraction(combatState)).toEqual({ ok: true });
    tickSideViewBattle(combatState, profile, 0);
    expect(combatState.deployedCohorts.filter((cohort) => cohort.deployed).every((cohort) => cohort.order !== 'RETREAT')).toBe(true);
    for (let index = 0; index < 80 && combatState.result === 'ACTIVE'; index += 1) {
      tickCombat(combatState, 0.05);
      tickSideViewBattle(combatState, profile, 0.05);
    }
    expect(combatState.result).toBe('SUCCESS');
    const garrisonHolder = combatState.deployedCohorts.find((cohort) => combatState.controlNodes.some((node) => node.requiredForOccupation && Math.abs(cohort.position.x - node.position.x) <= node.radius))!;
    combatState.mothership.position = { ...garrisonHolder.position };
    expect(resolveRecoveredCohorts(combatState).find((result) => result.cohortId === garrisonHolder.cohortId)?.status).toBe('GARRISON_CANDIDATE');
    const staged = stageMissionResult(campaign, combatState, city);
    expect(staged.pendingDebrief?.garrisonCandidateIds.length).toBeGreaterThanOrEqual(1);
  });
});
