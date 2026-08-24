import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data/cities';
import { TACTICAL_PRESETS } from '../../data/tacticalPresets';
import { createNewCampaign, stageMissionResult } from '../../domain/campaignRules';
import { BALANCE } from '../../domain/balance';
import { tickCombat } from '../../domain/combatRules';
import { COASTAL_GAMEPLAY_PROFILE } from './BattleGameplayProfile';
import { generateAbsorbableClusters } from './generateAbsorbableClusters';
import { tickGroundSwarm } from './groundSwarmRules';
import { beginSideViewExtraction, createSideViewBattleSession, discoverNearbySideViewTargets, tickSideViewBattle } from './sideViewBattleRules';

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

  it('auto-deploys a selected cohort and assigns an assault target without player micro', () => {
    const base = createNewCampaign(7005);
    const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
    const campaign = {
      ...base,
      currentCityId: city.id,
      cohorts: {
        'cohort-1': { id: 'cohort-1', type: 'ASSAULT' as const, strength: 100, cohesion: 100, control: 100, experience: 0, status: 'RESERVE' as const, assignedCityId: null, createdAtBattle: 0 },
      },
      plannedMission: { id: 'mission-cohort-ai', cityId: city.id, missionType: 'RAID' as const, cohortIds: ['cohort-1'], overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 0 },
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
      plannedMission: { id: 'mission-occupation-ai', cityId: city.id, missionType: 'OCCUPATION' as const, cohortIds: ['cohort-1', 'cohort-2'], overchargeCells: 0, travelChargeCost: 0, cellChargeCost: 0, createdAtMinutes: 0 },
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
    for (let index = 0; index < 80 && combatState.result === 'ACTIVE'; index += 1) {
      tickCombat(combatState, 0.05);
      tickSideViewBattle(combatState, profile, 0.05);
    }
    expect(combatState.result).toBe('SUCCESS');
    const staged = stageMissionResult(campaign, combatState, city);
    expect(staged.pendingDebrief?.garrisonCandidateIds.length).toBeGreaterThanOrEqual(1);
  });
});
