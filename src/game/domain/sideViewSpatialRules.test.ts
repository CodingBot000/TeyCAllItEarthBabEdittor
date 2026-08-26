import { readFileSync } from 'node:fs';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';
import { combatToWorld, groundMuzzlePose, GROUND_SAM_ATTACK_SPAWN_LOCAL, GROUND_SAM_ROOT_Y, GROUND_UNIT_ROOT_Z, worldToCombat } from './sideViewSpatialRules';
import { mothershipContactVolume } from './combatGeometry';
import type { CombatMothershipState } from './types';

describe('side-view space contract', () => {
  it('matches the actual Editor root chain and mirrored Babylon socket world matrix', () => {
    const engine = new NullEngine(); const scene = new Scene(engine);
    const definition = JSON.parse(readFileSync(new URL('../../../assets/battlescene.scene/nodes/GroundBattleRoot.json', import.meta.url), 'utf8'));
    const ground = new TransformNode('ground', scene);
    ground.position = Vector3.FromArray(definition.position);
    ground.scaling = Vector3.FromArray(definition.scaling);
    ground.rotation = Vector3.FromArray(definition.rotation);
    const visualRoot = new TransformNode('visual', scene); visualRoot.parent = ground;
    const vehicle = new TransformNode('vehicle', scene); vehicle.parent = visualRoot;
    vehicle.position.set(12, GROUND_SAM_ROOT_Y, GROUND_UNIT_ROOT_Z);
    const socket = new TransformNode('socket', scene); socket.parent = vehicle;
    for (const facing of [-1, 1] as const) {
      socket.position.set(GROUND_SAM_ATTACK_SPAWN_LOCAL.x * facing, GROUND_SAM_ATTACK_SPAWN_LOCAL.y, GROUND_SAM_ATTACK_SPAWN_LOCAL.z);
      socket.computeWorldMatrix(true);
      const actual = socket.getAbsolutePosition();
      const expected = combatToWorld(groundMuzzlePose(worldToCombat(vehicle.position), GROUND_SAM_ATTACK_SPAWN_LOCAL, facing));
      for (const axis of ['x', 'y', 'z'] as const) expect(actual[axis]).toBeCloseTo(expected[axis], 5);
    }
    scene.dispose(); engine.dispose();
  });
  it('keeps X/Y angle and the mothership pose unchanged through world/combat translation', () => {
    const definition = JSON.parse(readFileSync(new URL('../../../assets/battlescene.scene/nodes/MothershipGameplayRoot.json', import.meta.url), 'utf8'));
    expect(combatToWorld({ x: 0, y: BALANCE.mothership.baseAltitude, z: 0 }).y).toBe(definition.position[1]);
    const point = { x: 10, y: 28, z: 0.1 };
    expect(worldToCombat(combatToWorld(point))).toEqual(point);
  });
  it('selects the existing small shield/hull contact radii, never visual effect dimensions', () => {
    const mothership = { position: { x: 0, z: 0 }, shield: 1 } as CombatMothershipState;
    const shield = mothershipContactVolume({ mothership }, 0.25);
    expect(shield.radii.x).toBeCloseTo(10.9, 8); expect(shield.radii.y).toBeCloseTo(3.1, 8);
    mothership.shield = 0;
    const hull = mothershipContactVolume({ mothership }, 0.25);
    expect(hull.radii.x).toBeCloseTo(9.7, 8); expect(hull.radii.y).toBeCloseTo(2.35, 8);
    expect(hull.revision).not.toBe(shield.revision);
    mothership.shield = 1;
    expect(mothershipContactVolume({ mothership }, 0.25)).toEqual(shield);
  });
});
