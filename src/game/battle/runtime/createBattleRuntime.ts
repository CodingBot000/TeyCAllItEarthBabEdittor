import {
  Color3,
  Engine,
  HemisphericLight,
  Scalar,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
} from '@babylonjs/core';
import { loadScene } from 'babylonjs-editor-tools';
import { scriptsMap } from '../../../scripts';
import { activateAbility, applyMothershipProjectileDamage, startBeamOnTarget, stopBeam, tickCombat } from '../../domain/combatRules';
import type { AbilityId, AbsorbableKind, CommandResult, CombatState, ExtractionStatus } from '../../domain/types';
import type { BattleMapDefinition } from '../contracts/BattleMapDefinition';
import type { BattleGameplayProfile } from '../gameplay/BattleGameplayProfile';
import { battleAbilityAvailability, type AbilityAvailability, type BattleActionId } from '../gameplay/battleAbilityAvailability';
import { abortSideViewBattle, beginSideViewExtraction, nearestUsableSideViewTarget, selectAutomaticSideViewAbilityTarget, sideViewBattleTimeRemaining, tickSideViewBattle } from '../gameplay/sideViewBattleRules';
import { mapBackgroundUrl } from '../maps/battleMapCatalog';
import { BattleAbsorbableRegions } from './BattleAbsorbableRegions';
import { BattleCohortVisuals } from './BattleCohortVisuals';
import { BattleCombatVfx } from './BattleCombatVfx';
import { BattleEntityVisuals, type BattleEntityVisualSnapshot } from './BattleEntityVisuals';

const WORLD_WIDTH = 360;
const BACKGROUND_TILE_WIDTH = 120;
const BACKGROUND_REPEAT = WORLD_WIDTH / BACKGROUND_TILE_WIDTH;
const CLOUD_DRIFT_SPEED = 0.0015;
const GROUND_LAYER_UI_LIFT_PIXELS = 72;
const CAMERA_Y = 5;
const CAMERA_Z = -92;
const CINEMATIC_EVASION_DURATION = 1.25;
const CINEMATIC_CRASH_DURATION = 2.4;

export interface BattleRuntime {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  mothershipGameplayRoot: TransformNode;
  triggerAbility(ability: Extract<AbilityId, 'emp' | 'plasma' | 'overdrive'>): CommandResult;
  toggleAbsorption(): CommandResult;
  beginExtraction(): CommandResult;
  abortMission(): CommandResult;
  setMovementInput(direction: -1 | 0 | 1, source?: 'keyboard' | 'pointer'): void;
  setPaused(paused: boolean): void;
  advanceTime(milliseconds: number): void;
  getSnapshot(): BattleRuntimeSnapshot;
  dispose(): void;
}

export interface BattleRuntimeOptions {
  combatState?: CombatState;
  gameplayProfile?: BattleGameplayProfile;
  language?: 'ko' | 'en';
  debugControls?: boolean;
  onCombatComplete?: (state: CombatState) => void;
  onCombatUpdate?: (snapshot: BattleRuntimeSnapshot) => void;
}

export interface BattleRuntimeTargetSnapshot {
  id: string;
  kind: AbsorbableKind;
  x: number;
  distance: number;
  discovered: boolean;
  status: CombatState['absorbableTargets'][number]['status'];
  remainingAmount: number;
  initialAmount: number;
}

export interface BattleRuntimeGuidanceTargetSnapshot {
  id: string;
  kind: AbsorbableKind;
  distance: number;
  direction: 'LEFT' | 'RIGHT' | 'ON_SCREEN';
  discovered: boolean;
}

export interface BattleRuntimeProfileSnapshot {
  id: string | null;
  version: number | null;
  enemyPressureMultiplier: number;
  groundPressureMultiplier: number;
  facilityCount: number;
  groundDefenderCount: number;
  requiredOccupationNodeCount: number;
}

export interface BattleRuntimeSnapshot {
  coordinateSystem: string;
  mapId: string;
  paused: boolean;
  elapsedSeconds: number;
  survivalRemainingSeconds: number;
  extractionStatus: ExtractionStatus;
  extractionProgress: number;
  result: CombatState['result'];
  endReason: CombatState['endReason'];
  effectiveAutoScanRange: number;
  profile: BattleRuntimeProfileSnapshot;
  ship: { x: number; hull: number; maxHull: number; shield: number; maxShield: number; energy: number; maxEnergy: number };
  cargo: { used: number; capacity: number; captives: number; biomass: number; alloy: number; intel: number; coreCharge: number };
  alert: number;
  overchargeCells: number;
  activeAbility: AbilityId | null;
  activeTargetId: string | null;
  nearbyTargetId: string | null;
  guidanceTarget: BattleRuntimeGuidanceTargetSnapshot | null;
  abilities: Record<BattleActionId, AbilityAvailability>;
  cooldowns: CombatState['cooldowns'];
  targets: BattleRuntimeTargetSnapshot[];
  groundSwarm: {
    activeProjectiles: number;
    recentImpacts: number;
    projectiles: Array<{ id: string; targetId: string; progress: number; startX: number; targetX: number; arcHeight: number }>;
  };
  cohorts: Array<{ id: string; x: number; strength: number; cohesion: number; order: CombatState['deployedCohorts'][number]['order']; deployed: boolean; recoverable: boolean }>;
  enemies: Array<{ id: string; x: number; z: number; altitude: number; health: number }>;
  groundEntities: Array<{ id: string; kind: 'DEFENDER' | 'FACILITY'; x: number; health: number; destroyed: boolean; disabled: boolean }>;
  visuals: BattleEntityVisualSnapshot;
}

interface BackgroundLayer {
  name: string;
  key: keyof BattleMapDefinition['backgrounds'];
  z: number;
  y: number;
  parallax: number;
  renderingGroupId: number;
}

interface MothershipCinematic {
  kind: 'EVASION' | 'CRASH';
  elapsed: number;
  duration: number;
  origin: Vector3;
  direction: number;
}

const BACKGROUND_LAYERS: BackgroundLayer[] = [
  { name: 'SkyRoot', key: 'sky', z: 30, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CloudRoot', key: 'clouds', z: 27, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CityFarRoot', key: 'far', z: 22, y: 9, parallax: 0.15, renderingGroupId: 0 },
  { name: 'CityMiddleRoot', key: 'middle', z: 16, y: -6, parallax: 0.35, renderingGroupId: 1 },
  { name: 'CityNearRoot', key: 'near', z: 10, y: -20, parallax: 0.6, renderingGroupId: 2 },
  { name: 'GroundRoot', key: 'ground', z: 4, y: -12, parallax: 1, renderingGroupId: 2 },
  { name: 'ForegroundRoot', key: 'foregroundAtmosphere', z: -5, y: 1, parallax: 0.8, renderingGroupId: 3 },
];

export async function createBattleRuntime(canvas: HTMLCanvasElement, map: BattleMapDefinition, options: BattleRuntimeOptions = {}): Promise<BattleRuntime> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });
  const scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.12, 0.17, 1);
  scene.autoClear = true;

  try {
    await withTimeout(loadScene('/scene/', 'battlescene.babylon', scene, scriptsMap, { texturesQuality: 'high' }), 15000, 'Editor scene load timed out');
    if (!scene.getMeshByName('SkyRootPlane')) throw new Error('Editor scene is missing the SkyRootPlane contract node.');
  } catch (error) {
    scene.dispose();
    engine.dispose();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Battle Editor scene could not be loaded: ${message}`, { cause: error });
  }

  const cameraRig = getOrCreateNode(scene, 'CameraRig');
  let camera = scene.getCameraByName('BattleCamera') as UniversalCamera | null;
  if (!camera) camera = new UniversalCamera('BattleCamera', new Vector3(0, CAMERA_Y, CAMERA_Z), scene);
  if (!camera.parent) camera.parent = cameraRig;
  camera.fov = map.camera.fovDegrees * Math.PI / 180;
  camera.minZ = 0.1;
  camera.maxZ = 1000;
  camera.setTarget(new Vector3(0, CAMERA_Y, 0));
  camera.inputs.clear();
  scene.activeCamera = camera;

  const light = scene.getLightByName('BattleSkyLight') as HemisphericLight | null;
  if (!light) {
    const fallbackLight = new HemisphericLight('BattleSkyLight', new Vector3(0, 1, -1), scene);
    fallbackLight.intensity = 0.9;
    fallbackLight.diffuse = new Color3(0.82, 0.94, 1);
    fallbackLight.groundColor = new Color3(0.1, 0.16, 0.19);
  }

  const backgroundPlanes = BACKGROUND_LAYERS.map((layer) => ({ layer, root: getOrCreateNode(scene, layer.name), plane: scene.getMeshByName(`${layer.name}Plane`) }));
  applyEditorBackgroundMaterials(backgroundPlanes, map, scene);
  const mothershipGameplayRoot = getOrCreateNode(scene, 'MothershipGameplayRoot');
  const fighterPoolRoot = getOrCreateNode(scene, 'FighterPoolRoot');
  const dronePoolRoot = getOrCreateNode(scene, 'DronePoolRoot');
  const groundBattleRoot = getOrCreateNode(scene, 'GroundBattleRoot');
  if (options.debugControls !== true) hideDebugPrototypes(fighterPoolRoot, dronePoolRoot, groundBattleRoot);
  const combatVfx = new BattleCombatVfx(scene, mothershipGameplayRoot);
  const absorbableRegions = new BattleAbsorbableRegions(scene, options.language);
  const cohortVisuals = new BattleCohortVisuals(scene);
  const entityVisuals = new BattleEntityVisuals(scene, fighterPoolRoot, groundBattleRoot);
  setGameplayRenderingGroup(mothershipGameplayRoot, fighterPoolRoot, dronePoolRoot, groundBattleRoot);
  let paused = false;
  let elapsed = 0;
  let cinematic: MothershipCinematic | null = null;
  let completedCombat = false;
  let automationStepping = false;
  let cloudTextureOffset = 0;
  let cameraX = mothershipGameplayRoot.position.x;
  camera.position.x = cameraX;
  camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
  const pressedKeys = new Set<string>();
  const movementInputs: Record<'keyboard' | 'pointer', -1 | 0 | 1> = { keyboard: 0, pointer: 0 };
  const combatState = options.combatState;
  const gameplayProfile = options.gameplayProfile;
  const debugControls = options.debugControls === true;
  let lastSnapshotSecond = -1;
  const triggerCombatAbility = (ability: Extract<AbilityId, 'emp' | 'plasma' | 'overdrive'>): CommandResult => {
    if (!combatState || combatState.result !== 'ACTIVE') return { ok: false, reason: 'COMBAT IS OVER' };
    if (ability === 'overdrive') {
      const result = activateAbility(combatState, ability);
      emitSnapshot(true);
      return result;
    }
    const target = selectAutomaticSideViewAbilityTarget(combatState, ability);
    if (!target) return { ok: false, reason: 'NO VALID TARGET' };
    const result = activateAbility(combatState, ability, target);
    if (result.ok) combatVfx.triggerAbility(ability, new Vector3(target.x, -4.2, target.z));
    emitSnapshot(true);
    return result;
  };
  const triggerCombatHit = (kind: 'SHIELD' | 'HULL') => {
    if (!combatState || combatState.result !== 'ACTIVE') {
      combatVfx.triggerMothershipHit(kind);
      return;
    }
    if (kind === 'SHIELD') combatState.mothership.shield = Math.max(120, combatState.mothership.shield);
    else combatState.mothership.shield = 0;
    applyMothershipProjectileDamage(combatState, kind === 'SHIELD' ? 72 : combatState.mothership.hull + 100, 'fighter', { x: 0.72, y: -0.18, z: -1 }, `debug-${kind.toLowerCase()}-hit-${combatState.nextEntityId++}`);
  };
  const triggerBeam = (): CommandResult => {
    if (!combatState || combatState.result !== 'ACTIVE') {
      combatVfx.toggleAbsorption(new Vector3(mothershipGameplayRoot.position.x, -4.2, 0));
      return { ok: false, reason: 'COMBAT STATE UNAVAILABLE' };
    }
    if (combatState.activeAbility === 'beam') {
      stopBeam(combatState, 'MANUAL');
      emitSnapshot(true);
      return { ok: true };
    }
    const target = nearestUsableSideViewTarget(combatState);
    if (!target) return { ok: false, reason: 'MOVE OVER AN ABSORBABLE REGION' };
    const result = startBeamOnTarget(combatState, target.id);
    emitSnapshot(true);
    return result;
  };
  const beginExtraction = (): CommandResult => {
    if (!combatState) return { ok: false, reason: 'COMBAT STATE UNAVAILABLE' };
    const result = beginSideViewExtraction(combatState);
    emitSnapshot(true);
    return result;
  };
  const abortMission = (): CommandResult => {
    if (!combatState) return { ok: false, reason: 'COMBAT STATE UNAVAILABLE' };
    const result = abortSideViewBattle(combatState);
    if (result.ok && !completedCombat) {
      completedCombat = true;
      options.onCombatComplete?.(combatState);
    }
    emitSnapshot(true);
    return result;
  };
  const setMovementInput = (direction: -1 | 0 | 1, source: 'keyboard' | 'pointer' = 'keyboard') => {
    movementInputs[source] = direction;
  };
  const syncKeyboardMovement = () => {
    const moveLeft = pressedKeys.has('arrowleft') || pressedKeys.has('a');
    const moveRight = pressedKeys.has('arrowright') || pressedKeys.has('d');
    setMovementInput(moveLeft === moveRight ? 0 : moveRight ? 1 : -1, 'keyboard');
  };
  const getSnapshot = (): BattleRuntimeSnapshot => {
    if (!combatState) return emptyBattleSnapshot(map.id, paused, mothershipGameplayRoot.position.x, elapsed);
    const nearbyTarget = nearestUsableSideViewTarget(combatState);
    const visibleHalfWidth = getVisibleWidth(camera, engine) / 2;
    const guidanceCandidates = combatState.absorbableTargets
      .filter((target) => target.remainingAmount > 0)
      .map((target) => ({ target, distance: Math.abs(target.center.x - combatState.mothership.position.x) }));
    const offscreenCandidates = guidanceCandidates.filter(({ target }) => Math.abs(target.center.x - cameraX) > visibleHalfWidth);
    const guidanceTarget = (offscreenCandidates.length > 0 ? offscreenCandidates : guidanceCandidates)
      .sort((a, b) => a.distance - b.distance)[0];
    const guidanceDirection = guidanceTarget
      ? guidanceTarget.target.center.x < cameraX - visibleHalfWidth ? 'LEFT' : guidanceTarget.target.center.x > cameraX + visibleHalfWidth ? 'RIGHT' : 'ON_SCREEN'
      : null;
    return {
      coordinateSystem: 'side-view world: x increases right; gameplay z is fixed at 0',
      mapId: map.id,
      paused,
      elapsedSeconds: round(combatState.elapsedSeconds, 3),
      survivalRemainingSeconds: round(sideViewBattleTimeRemaining(combatState), 3),
      extractionStatus: combatState.extractionStatus,
      extractionProgress: round(combatState.mothership.extractionProgress, 4),
      result: combatState.result,
      endReason: combatState.endReason,
      effectiveAutoScanRange: round((gameplayProfile?.autoScanRange ?? 0) + combatState.modifiers.scanRangeBonus, 2),
      profile: {
        id: gameplayProfile?.id ?? null,
        version: gameplayProfile?.version ?? null,
        enemyPressureMultiplier: combatState.enemyPressureMultiplier,
        groundPressureMultiplier: gameplayProfile?.groundPressureMultiplier ?? 1,
        facilityCount: combatState.facilities.length,
        groundDefenderCount: combatState.groundDefenders.length,
        requiredOccupationNodeCount: combatState.controlNodes.filter((node) => node.requiredForOccupation).length,
      },
      ship: {
        x: round(combatState.mothership.position.x, 3),
        hull: round(combatState.mothership.hull, 2),
        maxHull: combatState.mothership.maxHull,
        shield: round(combatState.mothership.shield, 2),
        maxShield: combatState.mothership.maxShield,
        energy: round(combatState.mothership.energy, 2),
        maxEnergy: combatState.mothership.maxEnergy,
      },
      cargo: {
        used: round(combatState.mothership.cargoUsed, 2),
        capacity: combatState.mothership.maxCargo,
        captives: round(combatState.cargo.captives, 2),
        biomass: round(combatState.cargo.biomass, 2),
        alloy: round(combatState.cargo.alloy, 2),
        intel: round(combatState.cargo.intel, 2),
        coreCharge: round(combatState.cargo.coreCharge, 2),
      },
      alert: round(combatState.localAlert, 2),
      overchargeCells: combatState.overchargeCells,
      activeAbility: combatState.activeAbility,
      activeTargetId: combatState.activeBeamTargetId,
      nearbyTargetId: nearbyTarget?.id ?? null,
      guidanceTarget: guidanceTarget && guidanceDirection ? {
        id: guidanceTarget.target.id,
        kind: guidanceTarget.target.kind,
        distance: round(guidanceTarget.distance, 3),
        direction: guidanceDirection,
        discovered: guidanceTarget.target.discovered,
      } : null,
      abilities: battleAbilityAvailability(combatState),
      cooldowns: { ...combatState.cooldowns },
      targets: combatState.absorbableTargets.map((target) => ({
        id: target.id,
        kind: target.kind,
        x: round(target.center.x, 3),
        distance: round(Math.abs(target.center.x - combatState.mothership.position.x), 3),
        discovered: target.discovered,
        status: target.status,
        remainingAmount: round(target.remainingAmount, 2),
        initialAmount: target.initialAmount,
      })),
      groundSwarm: {
        activeProjectiles: combatState.groundSwarmProjectiles.length,
        recentImpacts: combatState.groundSwarmImpacts.length,
        projectiles: combatState.groundSwarmProjectiles.map((projectile) => ({
          id: projectile.id,
          targetId: projectile.targetId,
          progress: round(projectile.progress, 3),
          startX: round(projectile.startX, 3),
          targetX: round(projectile.targetX, 3),
          arcHeight: round(projectile.arcHeight, 3),
        })),
      },
      cohorts: combatState.deployedCohorts.map((cohort) => ({
        id: cohort.cohortId,
        x: round(cohort.position.x, 3),
        strength: round(cohort.strength, 2),
        cohesion: round(cohort.cohesion, 2),
        order: cohort.order,
        deployed: cohort.deployed,
        recoverable: cohort.recoverable,
      })),
      enemies: combatState.enemies.map((enemy) => ({ id: enemy.id, x: round(enemy.position.x, 3), z: round(enemy.position.z, 3), altitude: round(enemy.altitude, 3), health: round(enemy.health, 2) })),
      groundEntities: [
        ...combatState.groundDefenders.map((defender) => ({ id: defender.id, kind: 'DEFENDER' as const, x: round(defender.position.x, 3), health: round(defender.health, 2), destroyed: defender.health <= 0, disabled: defender.disabledUntil > combatState.elapsedSeconds })),
        ...combatState.facilities.map((facility) => ({ id: facility.id, kind: 'FACILITY' as const, x: round(facility.position.x, 3), health: round(facility.health, 2), destroyed: facility.destroyed, disabled: facility.disabledUntil > combatState.elapsedSeconds })),
      ],
      visuals: entityVisuals.getSnapshot(),
    };
  };
  const emitSnapshot = (force = false) => {
    if (!options.onCombatUpdate) return;
    const second = Math.floor((combatState?.elapsedSeconds ?? elapsed) * 10);
    if (!force && second === lastSnapshotSecond) return;
    lastSnapshotSecond = second;
    options.onCombatUpdate(getSnapshot());
  };
  const startCinematic = (kind: MothershipCinematic['kind']) => {
    if (cinematic || kind === 'CRASH' && completedCombat) return;
    cinematic = { kind, elapsed: 0, duration: kind === 'CRASH' ? CINEMATIC_CRASH_DURATION : CINEMATIC_EVASION_DURATION, origin: mothershipGameplayRoot.position.clone(), direction: movementInputs.keyboard < 0 || movementInputs.pointer < 0 ? -1 : 1 };
    if (kind === 'CRASH' && combatState && combatState.result === 'ACTIVE') {
      combatState.mothership.shield = 0;
      applyMothershipProjectileDamage(combatState, combatState.mothership.hull + 100, 'sam', { x: -0.6, y: -0.4, z: -1 }, `crash-hit-${combatState.nextEntityId++}`);
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key.toLowerCase() === 'a' || event.key.toLowerCase() === 'd') {
      event.preventDefault();
      pressedKeys.add(event.key.toLowerCase());
      syncKeyboardMovement();
    }
    if (debugControls && event.key === '1') {
      event.preventDefault();
      triggerCombatHit('SHIELD');
    }
    if (debugControls && event.key === '2') {
      event.preventDefault();
      triggerCombatHit('HULL');
    }
    if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      triggerCombatAbility('emp');
    }
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault();
      triggerCombatAbility('plasma');
    }
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      triggerCombatAbility('overdrive');
    }
    if (event.key.toLowerCase() === 'b') {
      event.preventDefault();
      triggerBeam();
    }
    if (debugControls && event.key.toLowerCase() === 'q') { event.preventDefault(); startCinematic('EVASION'); }
    if (debugControls && event.key.toLowerCase() === 'c') { event.preventDefault(); startCinematic('CRASH'); }
    if (event.key.toLowerCase() === 'x' && combatState) { event.preventDefault(); beginExtraction(); }
    if (event.key === 'Escape') { paused = !paused; emitSnapshot(true); }
  };
  const keyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key.toLowerCase());
    syncKeyboardMovement();
  };
  const resetMovementInputs = () => {
    pressedKeys.clear();
    setMovementInput(0, 'keyboard');
    setMovementInput(0, 'pointer');
  };
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', resetMovementInputs);

  const simulateStep = (deltaSeconds: number) => {
    if (paused) return;
    elapsed += deltaSeconds;
    if (cinematic) {
      updateMothershipCinematic(mothershipGameplayRoot, cinematic, deltaSeconds);
      if (cinematic.elapsed >= cinematic.duration) {
        const finishedKind = cinematic.kind;
        cinematic = null;
        if (finishedKind === 'EVASION') mothershipGameplayRoot.rotation.set(0, 0, 0);
        if (finishedKind === 'CRASH') {
          completedCombat = true;
          if (combatState) {
            combatState.result = 'FAILED';
            options.onCombatComplete?.(combatState);
          }
        }
      }
    }
    const movement = Scalar.Clamp(movementInputs.keyboard + movementInputs.pointer, -1, 1);
    const visibleWidth = getVisibleWidth(camera, engine);
    const cameraTravel = Math.max(0, visibleWidth * map.camera.travelScreensFromStart);
    const mothershipTravel = Math.max(52, cameraTravel + visibleWidth * 0.38);
    if (!cinematic) mothershipGameplayRoot.position.x = Scalar.Clamp(mothershipGameplayRoot.position.x + movement * 34 * deltaSeconds, -mothershipTravel, mothershipTravel);
    if (combatState && !cinematic) {
      combatState.mothership.position.x = mothershipGameplayRoot.position.x;
      combatState.mothership.position.z = 0;
      tickCombat(combatState, deltaSeconds);
      if (gameplayProfile) tickSideViewBattle(combatState, gameplayProfile, deltaSeconds);
      mothershipGameplayRoot.position.x = combatState.mothership.position.x;
      combatVfx.syncCombatState(combatState);
      absorbableRegions.sync(combatState, elapsed);
      cohortVisuals.sync(combatState, elapsed);
      entityVisuals.sync(combatState);
      if (combatState.result !== 'ACTIVE' && !completedCombat) {
        completedCombat = true;
        options.onCombatComplete?.(combatState);
      }
    }
    const desiredCameraX = Scalar.Clamp(mothershipGameplayRoot.position.x, -cameraTravel, cameraTravel);
    cameraX = Scalar.Lerp(cameraX, desiredCameraX, 1 - Math.pow(0.0005, deltaSeconds));
    camera.position.x = cameraX;
    camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
    for (const { layer, root } of backgroundPlanes) {
      root.position.x = cameraX * (1 - layer.parallax);
      root.position.y = layer.y + getGroundLayerUiLift(layer, camera, engine);
    }
    cloudTextureOffset = (cloudTextureOffset + deltaSeconds * CLOUD_DRIFT_SPEED) % 1;
    for (const { layer, plane } of backgroundPlanes) {
      if (layer.key !== 'clouds' || !(plane?.material instanceof StandardMaterial)) continue;
      const texture = plane.material.diffuseTexture;
      if (texture instanceof Texture) texture.uOffset = cloudTextureOffset;
    }
    combatVfx.update(deltaSeconds, elapsed);
    emitSnapshot();
  };
  const update = () => {
    if (!automationStepping) simulateStep(Math.min(engine.getDeltaTime() / 1000, 0.05));
  };
  const advanceTime = (milliseconds: number) => {
    automationStepping = true;
    const steps = Math.max(1, Math.round(Math.max(0, milliseconds) / (1000 / 60)));
    for (let index = 0; index < steps; index += 1) simulateStep(1 / 60);
    scene.render();
    emitSnapshot(true);
  };
  if (combatState) {
    absorbableRegions.sync(combatState, elapsed);
    cohortVisuals.sync(combatState, elapsed);
    combatVfx.syncCombatState(combatState);
    entityVisuals.sync(combatState);
  }
  emitSnapshot(true);
  scene.onBeforeRenderObservable.add(update);
  engine.runRenderLoop(() => scene.render());
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);

  return {
    engine,
    scene,
    camera,
    mothershipGameplayRoot,
    triggerAbility: triggerCombatAbility,
    toggleAbsorption: triggerBeam,
    beginExtraction,
    abortMission,
    setMovementInput,
    setPaused(nextPaused: boolean) { paused = nextPaused; emitSnapshot(true); },
    advanceTime,
    getSnapshot,
    dispose() {
      scene.onBeforeRenderObservable.removeCallback(update);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', resetMovementInputs);
      window.removeEventListener('resize', resize);
      absorbableRegions.dispose();
      cohortVisuals.dispose();
      entityVisuals.dispose();
      combatVfx.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function updateMothershipCinematic(root: TransformNode, cinematic: MothershipCinematic, dt: number): void {
  cinematic.elapsed = Math.min(cinematic.duration, cinematic.elapsed + dt);
  const progress = cinematic.elapsed / cinematic.duration;
  const eased = Math.sin(progress * Math.PI);
  if (cinematic.kind === 'EVASION') {
    root.position.x = cinematic.origin.x + cinematic.direction * eased * 8;
    root.position.y = cinematic.origin.y + eased * 2.2;
    root.position.z = cinematic.origin.z + Math.sin(progress * Math.PI * 2) * 1.2;
    root.rotation.z = cinematic.direction * eased * 0.42;
    root.rotation.y = cinematic.direction * eased * 0.24;
    return;
  }
  root.position.x = cinematic.origin.x + cinematic.direction * eased * 2.5;
  root.position.y = cinematic.origin.y - progress * 20;
  root.position.z = cinematic.origin.z - progress * 18;
  root.rotation.x = progress * 1.1;
  root.rotation.z = cinematic.direction * progress * 0.75;
}

function emptyBattleSnapshot(mapId: string, paused: boolean, shipX: number, elapsedSeconds: number): BattleRuntimeSnapshot {
  return {
    coordinateSystem: 'side-view world: x increases right; gameplay z is fixed at 0',
    mapId,
    paused,
    elapsedSeconds: round(elapsedSeconds, 3),
    survivalRemainingSeconds: 0,
    extractionStatus: 'LOCKED',
    extractionProgress: 0,
    result: 'ACTIVE',
    endReason: null,
    effectiveAutoScanRange: 0,
    profile: { id: null, version: null, enemyPressureMultiplier: 1, groundPressureMultiplier: 1, facilityCount: 0, groundDefenderCount: 0, requiredOccupationNodeCount: 0 },
    ship: { x: round(shipX, 3), hull: 0, maxHull: 0, shield: 0, maxShield: 0, energy: 0, maxEnergy: 0 },
    cargo: { used: 0, capacity: 0, captives: 0, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 },
    alert: 0,
    overchargeCells: 0,
    activeAbility: null,
    activeTargetId: null,
    nearbyTargetId: null,
    guidanceTarget: null,
    abilities: emptyAbilityAvailability(),
    cooldowns: { beam: 0, scan: 0, plasma: 0, emp: 0, overdrive: 0 },
    targets: [],
    groundSwarm: { activeProjectiles: 0, recentImpacts: 0, projectiles: [] },
    cohorts: [],
    enemies: [],
    groundEntities: [],
    visuals: { fighters: [], ground: [] },
  };
}

function emptyAbilityAvailability(): Record<BattleActionId, AbilityAvailability> {
  const unavailable = (energyCost: number, cellCost: number): AbilityAvailability => ({ enabled: false, reason: 'COMBAT_OVER', cooldownRemaining: 0, energyCost, cellCost });
  return {
    emp: unavailable(180, 1),
    plasma: unavailable(90, 1),
    beam: unavailable(0, 0),
    overdrive: unavailable(280, 1),
    extract: unavailable(0, 0),
  };
}

function round(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function getOrCreateNode(scene: Scene, name: string): TransformNode {
  return scene.getTransformNodeByName(name) ?? new TransformNode(name, scene);
}

function applyEditorBackgroundMaterials(
  layers: Array<{ layer: BackgroundLayer; root: TransformNode; plane: AbstractMesh | null }>,
  map: BattleMapDefinition,
  scene: Scene,
): void {
  for (const { layer, plane } of layers) {
    if (!plane) continue;
    const url = mapBackgroundUrl(map, layer.key);
    plane.isVisible = true;
    plane.setEnabled(true);
    plane.isPickable = false;
    plane.renderingGroupId = layer.renderingGroupId;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    if (url) assignBackgroundMaterial(plane, url, scene, layer.key === 'foregroundAtmosphere', getBackgroundTextureRepeat(layer.key, map));
  }
}

function getBackgroundTextureRepeat(key: keyof BattleMapDefinition['backgrounds'], map: BattleMapDefinition): number {
  if (map.id === 'river-day' || map.id === 'desert-day') return 1;
  return key === 'sky' || key === 'clouds' ? 1 : BACKGROUND_REPEAT;
}

function getGroundLayerUiLift(layer: BackgroundLayer, camera: UniversalCamera, engine: Engine): number {
  if (layer.key !== 'near' && layer.key !== 'ground') return 0;
  const distance = Math.abs(layer.z - camera.position.z);
  const visibleHeight = 2 * distance * Math.tan(camera.fov / 2);
  return GROUND_LAYER_UI_LIFT_PIXELS * visibleHeight / Math.max(1, engine.getRenderHeight());
}

function setGameplayRenderingGroup(...roots: TransformNode[]): void {
  for (const root of roots) {
    for (const mesh of root.getChildMeshes()) mesh.renderingGroupId = 3;
  }
}

function hideDebugPrototypes(...roots: TransformNode[]): void {
  for (const root of roots) {
    for (const mesh of root.getChildMeshes()) {
      if (/^(FighterPrototype|DronePrototype|GroundTurretPrototype|GroundBarrelPrototype|GroundSamPrototype)/.test(mesh.name)) mesh.setEnabled(false);
    }
  }
}

function assignBackgroundMaterial(mesh: AbstractMesh, url: string, scene: Scene, isAtmosphere: boolean, repeatX = 1): void {
  const material = new StandardMaterial(`${mesh.name}Material`, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = 1;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = 2;
  material.disableDepthWrite = true;
  material.diffuseColor = new Color3(1, 1, 1);
  material.emissiveColor = new Color3(1, 1, 1);
  const texture = new Texture(url, scene, true, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.uScale = repeatX;
  texture.vScale = 1;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.hasAlpha = isAtmosphere || !url.endsWith('sky-day-base.webp');
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  mesh.material = material;
}

function getVisibleWidth(camera: UniversalCamera, engine: Engine): number {
  const height = Math.max(1, engine.getRenderHeight());
  const aspect = engine.getRenderWidth() / height;
  const visibleHeight = 2 * Math.abs(camera.position.z) * Math.tan(camera.fov / 2);
  return visibleHeight * aspect;
}
