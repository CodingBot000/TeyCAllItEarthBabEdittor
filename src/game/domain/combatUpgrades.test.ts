import { describe, expect, it } from 'vitest';
import { CITIES } from '../data/cities';
import { TACTICAL_PRESETS } from '../data/tacticalPresets';
import { BALANCE } from './balance';
import { createNewCampaign } from './campaignRules';
import { activateAbility, createCombatState, tickCombat } from './combatRules';
import type { CombatState, EnemyState, MissileState, Vec2 } from './types';

function createState(upgrades: Record<string, number> = {}): CombatState {
  const campaign = createNewCampaign(8472);
  campaign.upgrades = upgrades;
  const city = CITIES.find((candidate) => candidate.id === 'seoul')!;
  const state = createCombatState(campaign, city, campaign.cities[city.id], TACTICAL_PRESETS[city.tacticalPresetId]);
  state.overchargeCells = 5;
  state.mothership.position = { x: 0, z: 0 };
  return state;
}

function fighter(id: string, position: Vec2): EnemyState {
  return {
    id, kind: 'fighter', position: { ...position, y: 33 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0, pitch: 0, bank: 0,
    squadId: 1, formationSlot: 0, orbitDirection: 1, orbitRadius: 20, orbitVerticalRadius: 8, orbitDepthRadius: 4,
    orbitPlaneTilt: 0, orbitPhase: 0, orbitAngularSpeed: 0.4, orbitEccentricity: 0.1, orbitWobblePhase: 0,
    attackRunPhase: 0, attackRunStrength: 1, attackRunElapsed: 0, recoverDuration: 2, flightMode: 'ORBIT',
    keepOutCorrected: false, health: BALANCE.defense.fighterHealth, attackCooldown: 99, disabledUntil: 0,
    absorptionStatus: 'NEUTRAL',
  };
}

function missile(id: string, position: Vec2): MissileState {
  return {
    id, source: 'fighter', sourceId: 'fighter-source', launchPosition: { ...position }, launchY: 30,
    position: { ...position }, y: 30, target: { x: 0, z: 0 }, targetY: 30, speed: 0, damage: 10, age: 0,
  };
}

describe('mothership weapon upgrades', () => {
  it('applies upgraded plasma damage to fighters instead of instant-killing them', () => {
    const state = createState({ 'plasma-damage': 2 });
    state.enemies = [fighter('fighter-plasma', { x: 2, z: 2 })];
    state.enemies[0].health = 100;

    expect(activateAbility(state, 'plasma', { x: 2, z: 2 }).ok).toBe(true);
    expect(state.enemies[0].health).toBe(100 - BALANCE.plasma.fighterDamage * 1.3);
  });

  it('uses EMP level for fighter chance, target cap, and disable duration', () => {
    const state = createState({ 'emp-duration': 3 });
    state.enemies = Array.from({ length: 6 }, (_, index) => fighter(`fighter-emp-${index}`, { x: index, z: 0 }));
    state.modifiers.empFighterDisableChance = 1;

    expect(activateAbility(state, 'emp', { x: 0, z: 0 }).ok).toBe(true);
    const disabled = state.enemies.filter((enemy) => enemy.disabledUntil > state.elapsedSeconds);
    expect(disabled).toHaveLength(4);
    expect(disabled.every((enemy) => enemy.disabledUntil === BALANCE.emp.duration * 1.6)).toBe(true);
  });

  it('fires air defense at multiple nearest fighters with upgraded damage', () => {
    const state = createState({ 'air-defense-damage': 3, 'air-defense-multitarget': 3 });
    state.enemies = Array.from({ length: 5 }, (_, index) => fighter(`fighter-air-${index}`, { x: index + 3, z: 0 }));
    state.modifiers.airDefenseLaserTargetCount = 4;

    tickCombat(state, 0.01);

    expect(state.airDefenseShots).toHaveLength(4);
    expect(state.airDefenseShots.every((shot) => shot.damage === 16)).toBe(true);
    expect(state.airDefenseShots.map((shot) => shot.targetId)).not.toContain('fighter-air-4');
  });

  it('attempts affordable point-defense targets and charges energy per target', () => {
    const state = createState({ 'point-defense-efficiency': 3, 'point-defense-multitarget': 3 });
    state.missiles = Array.from({ length: 5 }, (_, index) => missile(`missile-${index}`, { x: index + 8, z: 0 }));
    state.modifiers.pointDefenseAccuracy = 1;
    state.modifiers.pointDefenseTargetCount = 4;
    state.modifiers.pointDefenseEnergyCost = 5;
    state.mothership.energy = 17;

    tickCombat(state, 0.01, { unitInvincibilityEnabled: true });

    expect(state.pointDefenseShots).toHaveLength(3);
    expect(state.pointDefenseShots.every((shot) => shot.success)).toBe(true);
    expect(state.mothership.energy).toBeCloseTo(2.35, 4);
  });
});
