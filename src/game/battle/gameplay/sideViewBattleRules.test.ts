import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data/cities';
import { TACTICAL_PRESETS } from '../../data/tacticalPresets';
import { createNewCampaign, stageMissionResult } from '../../domain/campaignRules';
import { BALANCE } from '../../domain/balance';
import { tickCombat } from '../../domain/combatRules';
import { resolveRecoveredCohorts } from '../../domain/cohortRules';
import { COASTAL_GAMEPLAY_PROFILE } from './BattleGameplayProfile';
import { createPlannedBattleSetup } from './battleSetupRules';
import { generateAbsorbableClusters } from './generateAbsorbableClusters';
import { tickGroundSwarm } from './groundSwarmRules';
import { ABSORBABLE_KINDS } from './sideViewResourcePools';
import { abortSideViewBattle, beginSideViewExtraction, createSideViewBattleSession, discoverNearbySideViewTargets, tickSideViewBattle } from './sideViewBattleRules';

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

  it('pairs SAM missiles with the facility position at the moment of firing', () => {
    const campaign = createNewCampaign(7412);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const sam = combatState.facilities.find((facility) => facility.kind === 'SAM')!;
    sam.position = { x: 0, z: 0 };
    combatState.facilityCooldowns[sam.id] = 0;

    tickCombat(combatState, 0.01);

    const missile = combatState.missiles.find((candidate) => candidate.source === 'sam' && candidate.sourceId === sam.id);
    expect(missile?.launchPosition).toEqual(sam.position);
    expect(missile?.launchY).toBe(3.5);
  });

  it('allows active SAMs to fire beyond the ship range and missile-count threshold', () => {
    const campaign = createNewCampaign(7413);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const { combatState } = createSideViewBattleSession(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
    const sam = combatState.facilities.find((facility) => facility.kind === 'SAM')!;
    sam.position = { x: 90, z: 0 };
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
    for (let index = 0; index < 240; index += 1) {
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
