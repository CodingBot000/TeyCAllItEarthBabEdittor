import {
  Color3,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
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
import { BALANCE } from '../../domain/balance';
import { scriptsMap } from '../../../scripts';
import { activateAbility, applyMothershipProjectileDamage, fighterCombatCenter, fighterKeepOutMetric, startBeamOnTarget, stopBeam, tickCombat } from '../../domain/combatRules';
import type { AbilityId, AbsorbableKind, CommandResult, CombatState, ExtractionStatus } from '../../domain/types';
import type { BattleMapDefinition } from '../contracts/BattleMapDefinition';
import type { BattleGameplayProfile } from '../gameplay/BattleGameplayProfile';
import { battleAbilityAvailability, type AbilityAvailability, type BattleActionId } from '../gameplay/battleAbilityAvailability';
import { abortSideViewBattle, beginSideViewExtraction, nearestUsableSideViewTarget, selectAutomaticSideViewAbilityTarget, sideViewBattleTimeRemaining, tickSideViewBattle } from '../gameplay/sideViewBattleRules';
import { mapBackgroundUrl } from '../maps/battleMapCatalog';
import type { BattleAbsorptionVfxSnapshot } from './BattleAbsorptionVfx';
import { BattleAbsorbableRegions } from './BattleAbsorbableRegions';
import { BattleCohortVisuals } from './BattleCohortVisuals';
import { BattleCombatVfx } from './BattleCombatVfx';
import { BattleEntityVisuals, type BattleEntityVisualSnapshot, type GroundUnitGroup } from './BattleEntityVisuals';
import { BattleFleeingCrowdVisuals, registerFleeingCrowdTargets, type FleeingCrowdVisualSnapshot } from './BattleFleeingCrowdVisuals';
import { BattleInfectedAssaultVfx, type InfectedAssaultVfxSnapshot } from './BattleInfectedAssaultVfx';
import { BattleMothershipDestructionSequence, MOTHERSHIP_DESTRUCTION_TIMING, type MothershipDestructionVfxSnapshot } from './BattleMothershipDestructionSequence';
import { normalizeBattleKey } from './battleKeyboardInput';
import { GROUND_ABSORPTION_TARGET_Y } from './battleVisualCoordinates';

const WORLD_WIDTH = 360;
const BACKGROUND_TILE_WIDTH = 120;
const BACKGROUND_REPEAT = WORLD_WIDTH / BACKGROUND_TILE_WIDTH;
const NEAR_LAYER_SCALE = 0.7;
const NEAR_LAYER_PLANE_HEIGHT = 60;
const CLOUD_DRIFT_SPEED = 0.0015;
const GROUND_LAYER_UI_LIFT_PIXELS = 72;
const CAMERA_Y = 5;
const CAMERA_Z = -92;
const MOTHERSHIP_Y = 16.5;
const CINEMATIC_EVASION_DURATION = 1.25;
const CINEMATIC_CRASH_DURATION = MOTHERSHIP_DESTRUCTION_TIMING.durationSeconds;
const MOTHERSHIP_SIDE_VIEW_MAX_SPEED = 17;
const MOTHERSHIP_SIDE_VIEW_ACCELERATION = MOTHERSHIP_SIDE_VIEW_MAX_SPEED;
const MOTHERSHIP_SIDE_VIEW_DECELERATION = MOTHERSHIP_SIDE_VIEW_MAX_SPEED;
const MOTHERSHIP_DIRECTION_TURN_RADIANS = 0.14;
const MOTHERSHIP_BANK_RADIANS = 0.1;
const MOTHERSHIP_TILT_DURATION_SECONDS = 1;
const MOTHERSHIP_GLOW_MIN_INTENSITY = 0.5;
const MOTHERSHIP_GLOW_MAX_INTENSITY = 1;
const MOTHERSHIP_GLOW_SLOW_RISE_SECONDS = 0.9;
const MOTHERSHIP_GLOW_RISE_SECONDS = 1.5;
const MOTHERSHIP_GLOW_HOLD_SECONDS = 1;
const MOTHERSHIP_GLOW_FALL_SECONDS = 0.8;

export interface BattleRuntime {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  mothershipGameplayRoot: TransformNode;
  getBackgroundLayerY(key: BattleBackgroundLayerKey): number;
  setBackgroundLayerY(key: BattleBackgroundLayerKey, y: number): void;
  setGroundUnitGroupPosition(group: GroundUnitGroup, y: number): void;
  resetGroundUnitPositions(): void;
  setCollisionOverlayVisible(visible: boolean): void;
  setCollisionOverlayScale(kind: 'hull' | 'shield', scale: number): void;
  resetCollisionOverlayScale(): void;
  triggerAbility(ability: Extract<AbilityId, 'emp' | 'plasma' | 'overdrive'>): CommandResult;
  toggleAbsorption(): CommandResult;
  dropInfectedAssault(): CommandResult;
  beginExtraction(): CommandResult;
  abortMission(): CommandResult;
  setMovementInput(direction: -1 | 0 | 1, source?: 'keyboard' | 'pointer'): void;
  setInvincibilityEnabled(enabled: boolean): void;
  setUnitInvincibilityEnabled(enabled: boolean): void;
  setPointDefenseDisabled(disabled: boolean): void;
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
  cinematic: { kind: MothershipCinematic['kind']; progress: number } | null;
  mothershipDestruction: MothershipDestructionVfxSnapshot;
  infectedAssault: InfectedAssaultVfxSnapshot;
  fleeingCrowds: FleeingCrowdVisualSnapshot[];
  absorptionVfx: BattleAbsorptionVfxSnapshot;
  invincibilityEnabled: boolean;
  unitInvincibilityEnabled: boolean;
  effectiveAutoScanRange: number;
  profile: BattleRuntimeProfileSnapshot;
  camera: { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number };
  rendering: { sceneAutoClear: boolean; sceneAutoClearDepthAndStencil: boolean; postProcessAutoClear: boolean };
  ship: { x: number; z: number; worldX: number; worldY: number; worldZ: number; combatAltitude: number; hull: number; maxHull: number; shield: number; maxShield: number; energy: number; maxEnergy: number };
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
  enemies: Array<{ id: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; altitude: number; relativeDistance3D: number; keepOutMetric: number; keepOutCorrected: boolean; flightMode: CombatState['enemies'][number]['flightMode']; health: number }>;
  groundEntities: Array<{ id: string; kind: 'DEFENDER' | 'FACILITY'; x: number; health: number; destroyed: boolean; disabled: boolean }>;
  visuals: BattleEntityVisualSnapshot;
}

export type BattleBackgroundLayerKey = keyof BattleMapDefinition['backgrounds'];

export interface BattleBackgroundLayer {
  name: string;
  key: BattleBackgroundLayerKey;
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

export const BATTLE_BACKGROUND_LAYERS: BattleBackgroundLayer[] = [
  { name: 'SkyRoot', key: 'sky', z: 30, y: 6.5, parallax: 0, renderingGroupId: 0 },
  { name: 'CloudRoot', key: 'clouds', z: 27, y: 4, parallax: 0, renderingGroupId: 0 },
  { name: 'CityFarRoot', key: 'far', z: 22, y: 7, parallax: 0.15, renderingGroupId: 0 },
  { name: 'CityMiddleRoot', key: 'middle', z: 16, y: 11.75, parallax: 0.35, renderingGroupId: 1 },
  { name: 'CityNearRoot', key: 'near', z: 10, y: -5, parallax: 0.6, renderingGroupId: 2 },
  { name: 'GroundRoot', key: 'ground', z: 4, y: -12, parallax: 1, renderingGroupId: 2 },
  { name: 'ForegroundRoot', key: 'foregroundAtmosphere', z: -5, y: 0.5, parallax: 0.8, renderingGroupId: 3 },
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
  scene.autoClearDepthAndStencil = true;

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

  const backgroundPlanes = BATTLE_BACKGROUND_LAYERS.map((layer) => {
    const root = getOrCreateNode(scene, layer.name);
    const plane = scene.getMeshByName(`${layer.name}Plane`)
      ?? (layer.key === 'clouds'
        ? MeshBuilder.CreatePlane('CloudRootPlane', { width: WORLD_WIDTH, height: 202.5, sideOrientation: Mesh.DOUBLESIDE }, scene)
        : null);
    if (plane && plane.parent !== root) plane.parent = root;
    return { layer, root, plane };
  });
  const backgroundLayerY = new Map<BattleBackgroundLayerKey, number>(BATTLE_BACKGROUND_LAYERS.map((layer) => [layer.key, layer.y]));
  applyEditorBackgroundMaterials(backgroundPlanes, map, scene);
  const { gameplayRoot: mothershipGameplayRoot, visualRoot: mothershipVisualRoot } = restoreMothershipRuntimeHierarchy(scene);
  mothershipVisualRoot?.scaling.scaleInPlace(BALANCE.mothership.visualScale);
  const mothershipPurpleGlow = mothershipVisualRoot ? createMothershipPurpleGlow(scene, mothershipVisualRoot) : null;
  const fighterPoolRoot = getOrCreateNode(scene, 'FighterPoolRoot');
  const dronePoolRoot = getOrCreateNode(scene, 'DronePoolRoot');
  const groundBattleRoot = getOrCreateNode(scene, 'GroundBattleRoot');
  if (options.debugControls !== true) hideDebugPrototypes(scene);
  const absorbableRegions = new BattleAbsorbableRegions(scene, options.language);
  const fleeingCrowdVisuals = new BattleFleeingCrowdVisuals(scene, map.id === 'city-night');
  const cohortVisuals = new BattleCohortVisuals(scene);
  const infectedAssaultVfx = new BattleInfectedAssaultVfx(scene);
  const entityVisuals = new BattleEntityVisuals(scene, fighterPoolRoot, groundBattleRoot, mothershipGameplayRoot);
  const combatVfx = new BattleCombatVfx(
    scene,
    mothershipGameplayRoot,
    (source, sourceId) => source === 'sam' ? entityVisuals.getGroundAttackSpawnPosition(sourceId) : entityVisuals.getFighterMuzzlePosition(sourceId),
    mothershipVisualRoot ?? undefined,
    camera,
  );
  const mothershipDestructionVfx = new BattleMothershipDestructionSequence(scene);
  mothershipDestructionVfx.setQuality('HIGH');
  setGameplayRenderingGroup(mothershipGameplayRoot, fighterPoolRoot, dronePoolRoot, groundBattleRoot);
  let paused = false;
  let elapsed = 0;
  let cinematic: MothershipCinematic | null = null;
  let completedCombat = false;
  let automationStepping = false;
  let cloudTextureOffset = 0;
  let cameraX = mothershipGameplayRoot.position.x;
  let invincibilityEnabled = true;
  let unitInvincibilityEnabled = true;
  let pointDefenseDisabled = false;
  camera.position.x = cameraX;
  camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
  const applyBackgroundLayerPositions = () => {
    for (const { layer, root } of backgroundPlanes) {
      root.position.x = cameraX * (1 - layer.parallax);
      root.position.y = (backgroundLayerY.get(layer.key) ?? layer.y) + getGroundLayerUiLift(layer, camera, engine);
    }
  };
  const getBackgroundLayerY = (key: BattleBackgroundLayerKey): number => {
    const definition = BATTLE_BACKGROUND_LAYERS.find((layer) => layer.key === key);
    return backgroundLayerY.get(key) ?? definition?.y ?? 0;
  };
  const setBackgroundLayerY = (key: BattleBackgroundLayerKey, y: number): void => {
    backgroundLayerY.set(key, clampBackgroundLayerY(y));
    applyBackgroundLayerPositions();
  };
  const setGroundUnitGroupPosition = (group: GroundUnitGroup, y: number): void => {
    entityVisuals.setGroundUnitGroupPosition(group, y);
  };
  const resetGroundUnitPositions = (): void => {
    entityVisuals.resetGroundUnitPositions();
  };
  const setCollisionOverlayVisible = (visible: boolean): void => {
    combatVfx.setCollisionOverlayVisible(visible);
  };
  const setCollisionOverlayScale = (kind: 'hull' | 'shield', scale: number): void => {
    combatVfx.setCollisionOverlayScale(kind, scale);
  };
  const resetCollisionOverlayScale = (): void => {
    combatVfx.resetCollisionOverlayScale();
  };
  applyBackgroundLayerPositions();
  const pressedKeys = new Set<string>();
  const movementInputs: Record<'keyboard' | 'pointer', -1 | 0 | 1> = { keyboard: 0, pointer: 0 };
  let movementVelocity = 0;
  const combatState = options.combatState;
  if (combatState) registerFleeingCrowdTargets(combatState);
  const gameplayProfile = options.gameplayProfile;
  const debugControls = options.debugControls === true;
  let lastSnapshotSecond = -1;
  const triggerCombatAbility = (ability: Extract<AbilityId, 'emp' | 'plasma' | 'overdrive'>): CommandResult => {
    if (!combatState || combatState.result !== 'ACTIVE') return { ok: false, reason: 'COMBAT IS OVER' };
    if (ability === 'overdrive') {
      const result = activateAbility(combatState, ability, undefined, { unitInvincibilityEnabled });
      emitSnapshot(true);
      return result;
    }
    const target = selectAutomaticSideViewAbilityTarget(combatState, ability);
    if (!target) return { ok: false, reason: 'NO VALID TARGET' };
    const result = activateAbility(combatState, ability, target, { unitInvincibilityEnabled });
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
      combatVfx.toggleAbsorption(new Vector3(mothershipGameplayRoot.position.x, GROUND_ABSORPTION_TARGET_Y, 0));
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
  const dropInfectedAssault = (): CommandResult => {
    infectedAssaultVfx.trigger(mothershipGameplayRoot.getAbsolutePosition());
    emitSnapshot(true);
    return { ok: true };
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
  const setInvincibilityEnabled = (enabled: boolean) => {
    invincibilityEnabled = enabled;
    emitSnapshot(true);
  };
  const setUnitInvincibilityEnabled = (enabled: boolean) => {
    unitInvincibilityEnabled = enabled;
    emitSnapshot(true);
  };
  const setPointDefenseDisabled = (disabled: boolean) => {
    pointDefenseDisabled = disabled;
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
      coordinateSystem: 'side-view world: x increases right, y increases up, z increases away from camera; fighters use true 3D coordinates',
      mapId: map.id,
      paused,
      elapsedSeconds: round(combatState.elapsedSeconds, 3),
      survivalRemainingSeconds: round(sideViewBattleTimeRemaining(combatState), 3),
      extractionStatus: combatState.extractionStatus,
      extractionProgress: round(combatState.mothership.extractionProgress, 4),
      result: combatState.result,
      endReason: combatState.endReason,
      cinematic: cinematic ? { kind: cinematic.kind, progress: round(cinematic.elapsed / cinematic.duration, 4) } : null,
      mothershipDestruction: mothershipDestructionVfx.getSnapshot(),
      infectedAssault: infectedAssaultVfx.getSnapshot(),
      fleeingCrowds: fleeingCrowdVisuals.getSnapshot(),
      absorptionVfx: combatVfx.getAbsorptionSnapshot(),
      invincibilityEnabled,
      unitInvincibilityEnabled,
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
      camera: {
        x: round(camera.position.x, 3),
        y: round(camera.position.y, 3),
        z: round(camera.position.z, 3),
        targetX: round(camera.getTarget().x, 3),
        targetY: round(camera.getTarget().y, 3),
        targetZ: round(camera.getTarget().z, 3),
      },
      rendering: {
        sceneAutoClear: scene.autoClear,
        sceneAutoClearDepthAndStencil: scene.autoClearDepthAndStencil,
        postProcessAutoClear: combatVfx.getPostProcessAutoClear(),
      },
      ship: {
        x: round(combatState.mothership.position.x, 3),
        z: round(combatState.mothership.position.z, 3),
        worldX: round(mothershipGameplayRoot.getAbsolutePosition().x, 3),
        worldY: round(mothershipGameplayRoot.getAbsolutePosition().y, 3),
        worldZ: round(mothershipGameplayRoot.getAbsolutePosition().z, 3),
        combatAltitude: BALANCE.mothership.baseAltitude,
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
      enemies: combatState.enemies.map((enemy) => {
        const center = fighterCombatCenter(combatState);
        return {
          id: enemy.id,
          x: round(enemy.position.x, 3),
          y: round(enemy.position.y, 3),
          z: round(enemy.position.z, 3),
          vx: round(enemy.velocity.x, 3),
          vy: round(enemy.velocity.y, 3),
          vz: round(enemy.velocity.z, 3),
          altitude: round(enemy.position.y, 3),
          relativeDistance3D: round(Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y, enemy.position.z - center.z), 3),
          keepOutMetric: round(fighterKeepOutMetric(enemy.position, center), 3),
          keepOutCorrected: enemy.keepOutCorrected,
          flightMode: enemy.flightMode,
          health: round(enemy.health, 2),
        };
      }),
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
    movementVelocity = 0;
    cinematic = { kind, elapsed: 0, duration: kind === 'CRASH' ? CINEMATIC_CRASH_DURATION : CINEMATIC_EVASION_DURATION, origin: mothershipGameplayRoot.position.clone(), direction: movementInputs.keyboard < 0 || movementInputs.pointer < 0 ? -1 : 1 };
    if (kind === 'CRASH' && combatState && combatState.result === 'ACTIVE') {
      combatState.mothership.shield = 0;
      applyMothershipProjectileDamage(combatState, combatState.mothership.hull + 100, 'sam', { x: -0.6, y: -0.4, z: -1 }, `crash-hit-${combatState.nextEntityId++}`);
      combatState.result = 'FAILED';
      combatState.endReason = 'MOTHERSHIP_DISABLED';
    }
    if (kind === 'CRASH') {
      combatVfx.dispose();
      mothershipDestructionVfx.start({
        position: mothershipGameplayRoot.position.clone(),
        rotation: mothershipGameplayRoot.rotation.clone(),
      });
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    const key = normalizeBattleKey(event);
    if (key === 'arrowleft' || key === 'arrowright' || key === 'a' || key === 'd') {
      event.preventDefault();
      pressedKeys.add(key);
      syncKeyboardMovement();
    }
    if (debugControls && key === '1') {
      event.preventDefault();
      triggerCombatHit('SHIELD');
    }
    if (debugControls && key === '2') {
      event.preventDefault();
      triggerCombatHit('HULL');
    }
    if (key === 'n') {
      event.preventDefault();
      triggerCombatAbility('emp');
    }
    if (key === 'm') {
      event.preventDefault();
      triggerCombatAbility('plasma');
    }
    if (key === '.') {
      event.preventDefault();
      triggerCombatAbility('overdrive');
    }
    if (key === ',') {
      event.preventDefault();
      triggerBeam();
    }
    if (key === '/') {
      event.preventDefault();
      dropInfectedAssault();
    }
    if (debugControls && key === 'q') { event.preventDefault(); startCinematic('EVASION'); }
    if (debugControls && key === 'c') { event.preventDefault(); startCinematic('CRASH'); }
    if (key === 'x' && combatState) { event.preventDefault(); beginExtraction(); }
    if (key === 'escape') { paused = !paused; emitSnapshot(true); }
  };
  const keyUp = (event: KeyboardEvent) => {
    pressedKeys.delete(normalizeBattleKey(event));
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
      if (cinematic.kind === 'CRASH') {
        const destructionPose = mothershipDestructionVfx.sync(deltaSeconds);
        if (destructionPose) {
          mothershipGameplayRoot.position.copyFrom(destructionPose.position);
          mothershipGameplayRoot.rotation.copyFrom(destructionPose.rotation);
        }
        cinematic.elapsed = mothershipDestructionVfx.getSnapshot().elapsedSeconds;
      } else {
        updateMothershipEvasionCinematic(mothershipGameplayRoot, cinematic, deltaSeconds);
      }
      const cinematicComplete = cinematic.kind === 'CRASH'
        ? mothershipDestructionVfx.isComplete()
        : cinematic.elapsed >= cinematic.duration;
      if (cinematicComplete) {
        const finishedKind = cinematic.kind;
        if (finishedKind === 'EVASION') {
          cinematic = null;
          mothershipGameplayRoot.rotation.set(0, 0, 0);
        }
        if (finishedKind === 'CRASH' && !completedCombat) {
          completedCombat = true;
          if (combatState) {
            combatState.result = 'FAILED';
            options.onCombatComplete?.(combatState);
          }
        }
      }
    }
    const movement = Scalar.Clamp(movementInputs.keyboard + movementInputs.pointer, -1, 1);
    const targetVelocity = movement * MOTHERSHIP_SIDE_VIEW_MAX_SPEED;
    if (cinematic) movementVelocity = 0;
    else {
      movementVelocity = moveTowards(
        movementVelocity,
        targetVelocity,
        (targetVelocity === 0 ? MOTHERSHIP_SIDE_VIEW_DECELERATION : MOTHERSHIP_SIDE_VIEW_ACCELERATION) * deltaSeconds,
      );
    }
    const visibleWidth = getVisibleWidth(camera, engine);
    const cameraTravel = Math.max(0, visibleWidth * map.camera.travelScreensFromStart);
    const mothershipTravel = Math.max(52, cameraTravel + visibleWidth * 0.38);
    if (!cinematic) {
      mothershipGameplayRoot.position.x = Scalar.Clamp(mothershipGameplayRoot.position.x + movementVelocity * deltaSeconds, -mothershipTravel, mothershipTravel);
      const movementRatio = movementVelocity / MOTHERSHIP_SIDE_VIEW_MAX_SPEED;
      mothershipGameplayRoot.rotation.y = moveTowards(
        mothershipGameplayRoot.rotation.y,
        movementRatio * MOTHERSHIP_DIRECTION_TURN_RADIANS,
        (MOTHERSHIP_DIRECTION_TURN_RADIANS * deltaSeconds) / MOTHERSHIP_TILT_DURATION_SECONDS,
      );
      mothershipGameplayRoot.rotation.z = moveTowards(
        mothershipGameplayRoot.rotation.z,
        -movementRatio * MOTHERSHIP_BANK_RADIANS,
        (MOTHERSHIP_BANK_RADIANS * deltaSeconds) / MOTHERSHIP_TILT_DURATION_SECONDS,
      );
    }
    if (combatState && !cinematic) {
      combatState.mothership.position.x = mothershipGameplayRoot.position.x;
      combatState.mothership.position.z = 0;
      fleeingCrowdVisuals.sync(combatState, elapsed, true);
      const hullBeforeStep = invincibilityEnabled ? combatState.mothership.hull : null;
      if (invincibilityEnabled && gameplayProfile) combatState.survivalUnlockSeconds += deltaSeconds;
      tickCombat(combatState, deltaSeconds, { unitInvincibilityEnabled, disablePointDefense: pointDefenseDisabled });
      if (gameplayProfile) tickSideViewBattle(combatState, gameplayProfile, deltaSeconds, unitInvincibilityEnabled);
      if (invincibilityEnabled && hullBeforeStep !== null) {
        combatState.mothership.hull = hullBeforeStep;
        if (combatState.result === 'FAILED' && combatState.endReason === 'MOTHERSHIP_DISABLED') {
          combatState.result = 'ACTIVE';
          combatState.endReason = null;
        }
      }
      mothershipGameplayRoot.position.x = combatState.mothership.position.x;
      combatState.mothership.velocity.x = movementVelocity;
      combatState.mothership.velocity.z = 0;
      entityVisuals.sync(combatState, deltaSeconds);
      combatVfx.syncCombatState(combatState);
      absorbableRegions.sync(combatState);
      fleeingCrowdVisuals.sync(combatState, elapsed, false);
      cohortVisuals.sync(combatState, elapsed);
      if (combatState.result !== 'ACTIVE' && !completedCombat) {
        if (combatState.endReason === 'MOTHERSHIP_DISABLED') startCinematic('CRASH');
        else {
          completedCombat = true;
          options.onCombatComplete?.(combatState);
        }
      }
    }
    if (cinematic?.kind !== 'CRASH') {
      const desiredCameraX = Scalar.Clamp(mothershipGameplayRoot.position.x, -cameraTravel, cameraTravel);
      cameraX = Scalar.Lerp(cameraX, desiredCameraX, 1 - Math.pow(0.0005, deltaSeconds));
    }
    camera.position.x = cameraX;
    camera.setTarget(new Vector3(cameraX, CAMERA_Y, 0));
    applyBackgroundLayerPositions();
    cloudTextureOffset = (cloudTextureOffset + deltaSeconds * CLOUD_DRIFT_SPEED) % 1;
    for (const { layer, plane } of backgroundPlanes) {
      if (layer.key !== 'clouds' || !(plane?.material instanceof StandardMaterial)) continue;
      const texture = plane.material.diffuseTexture;
      if (texture instanceof Texture) texture.uOffset = cloudTextureOffset;
    }
    combatVfx.update(deltaSeconds, elapsed);
    infectedAssaultVfx.update(deltaSeconds);
    emitSnapshot();
  };
  const update = () => {
    if (!automationStepping) simulateStep(Math.min(engine.getDeltaTime() / 1000, 0.05));
    if (cinematic?.kind === 'CRASH' && mothershipPurpleGlow) mothershipPurpleGlow.intensity = 0.08;
    else updateMothershipPurpleGlow(mothershipPurpleGlow, elapsed);
  };
  const advanceTime = (milliseconds: number) => {
    automationStepping = true;
    const steps = Math.max(1, Math.round(Math.max(0, milliseconds) / (1000 / 60)));
    for (let index = 0; index < steps; index += 1) simulateStep(1 / 60);
    scene.render();
    emitSnapshot(true);
  };
  if (combatState) {
    absorbableRegions.sync(combatState);
    fleeingCrowdVisuals.sync(combatState, elapsed, false);
    cohortVisuals.sync(combatState, elapsed);
    entityVisuals.sync(combatState, 0);
    combatVfx.syncCombatState(combatState);
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
    getBackgroundLayerY,
    setBackgroundLayerY,
    setGroundUnitGroupPosition,
    resetGroundUnitPositions,
    setCollisionOverlayVisible,
    setCollisionOverlayScale,
    resetCollisionOverlayScale,
    triggerAbility: triggerCombatAbility,
    toggleAbsorption: triggerBeam,
    dropInfectedAssault,
    beginExtraction,
    abortMission,
    setMovementInput,
    setInvincibilityEnabled,
    setUnitInvincibilityEnabled,
    setPointDefenseDisabled,
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
      fleeingCrowdVisuals.dispose();
      cohortVisuals.dispose();
      entityVisuals.dispose();
      combatVfx.dispose();
      infectedAssaultVfx.dispose();
      mothershipDestructionVfx.dispose();
      mothershipPurpleGlow?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function createMothershipPurpleGlow(scene: Scene, visualRoot: TransformNode): GlowLayer | null {
  const purpleMeshes = visualRoot.getChildMeshes(false).filter((mesh): mesh is Mesh => (
    mesh instanceof Mesh
    && (mesh.name.startsWith('mothership-reactor-') || mesh.name.startsWith('mothership-underside-emitter-'))
    && (mesh.material?.name === 'mothership-violet-material' || mesh.material?.name === 'mothership-soft-violet-material')
  ));
  if (purpleMeshes.length === 0) return null;

  const glowLayer = new GlowLayer('MothershipPurpleGlowLayer', scene, {
    mainTextureRatio: 0.5,
    mainTextureFixedSize: 1024,
  });
  glowLayer.blurKernelSize = 48;
  glowLayer.intensity = MOTHERSHIP_GLOW_MIN_INTENSITY;
  glowLayer.setExcludedByDefault(true);
  purpleMeshes.forEach((mesh) => glowLayer.addIncludedOnlyMesh(mesh));
  return glowLayer;
}

function updateMothershipPurpleGlow(glowLayer: GlowLayer | null, elapsed: number): void {
  if (!glowLayer) return;
  const cycleSeconds = MOTHERSHIP_GLOW_RISE_SECONDS + MOTHERSHIP_GLOW_HOLD_SECONDS + MOTHERSHIP_GLOW_FALL_SECONDS;
  const phase = elapsed % cycleSeconds;
  if (phase < MOTHERSHIP_GLOW_SLOW_RISE_SECONDS) {
    const progress = phase / MOTHERSHIP_GLOW_SLOW_RISE_SECONDS;
    glowLayer.intensity = MOTHERSHIP_GLOW_MIN_INTENSITY
      + (0.8 - MOTHERSHIP_GLOW_MIN_INTENSITY) * easeInCubic(progress);
    return;
  }
  if (phase < MOTHERSHIP_GLOW_RISE_SECONDS) {
    const progress = (phase - MOTHERSHIP_GLOW_SLOW_RISE_SECONDS) / (MOTHERSHIP_GLOW_RISE_SECONDS - MOTHERSHIP_GLOW_SLOW_RISE_SECONDS);
    glowLayer.intensity = 0.8 + (MOTHERSHIP_GLOW_MAX_INTENSITY - 0.8) * easeOutCubic(progress);
    return;
  }
  if (phase < MOTHERSHIP_GLOW_RISE_SECONDS + MOTHERSHIP_GLOW_HOLD_SECONDS) {
    glowLayer.intensity = MOTHERSHIP_GLOW_MAX_INTENSITY;
    return;
  }
  const progress = (phase - MOTHERSHIP_GLOW_RISE_SECONDS - MOTHERSHIP_GLOW_HOLD_SECONDS) / MOTHERSHIP_GLOW_FALL_SECONDS;
  glowLayer.intensity = MOTHERSHIP_GLOW_MAX_INTENSITY
    - (MOTHERSHIP_GLOW_MAX_INTENSITY - MOTHERSHIP_GLOW_MIN_INTENSITY) * easeOutCubic(progress);
}

function easeInCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped ** 3;
}

function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** 3;
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function updateMothershipEvasionCinematic(root: TransformNode, cinematic: MothershipCinematic, dt: number): void {
  cinematic.elapsed = Math.min(cinematic.duration, cinematic.elapsed + dt);
  const progress = cinematic.elapsed / cinematic.duration;
  const eased = Math.sin(progress * Math.PI);
  root.position.x = cinematic.origin.x + cinematic.direction * eased * 8;
  root.position.y = cinematic.origin.y + eased * 2.2;
  root.position.z = cinematic.origin.z + Math.sin(progress * Math.PI * 2) * 1.2;
  root.rotation.z = cinematic.direction * eased * 0.42;
  root.rotation.y = cinematic.direction * eased * 0.24;
}

function emptyBattleSnapshot(mapId: string, paused: boolean, shipX: number, elapsedSeconds: number): BattleRuntimeSnapshot {
  return {
    coordinateSystem: 'side-view world: x increases right, y increases up, z increases away from camera; fighters use true 3D coordinates',
    mapId,
    paused,
    elapsedSeconds: round(elapsedSeconds, 3),
    survivalRemainingSeconds: 0,
    extractionStatus: 'LOCKED',
    extractionProgress: 0,
    result: 'ACTIVE',
    endReason: null,
    cinematic: null,
    mothershipDestruction: { active: false, phase: 'IDLE', elapsedSeconds: 0, durationSeconds: MOTHERSHIP_DESTRUCTION_TIMING.durationSeconds, altitude: 0, fireCount: 0, flameFallbackActive: false, triggeredExplosions: 0, activeExplosions: 0, smokeCount: 0, debrisCount: 0, impactTriggered: false },
    infectedAssault: { active: false, activeWaves: 0, fallingCount: 0, groundImpactCount: 0, totalDrops: 0 },
    fleeingCrowds: [],
    absorptionVfx: { phase: 'OFF', active: false, elapsedSeconds: 0, outerLayerCount: 3, shaftCount: 12, sourceHalfWidth: 4.2, groundHalfWidth: 6.5, meshCount: 24 },
    invincibilityEnabled: true,
    unitInvincibilityEnabled: true,
    effectiveAutoScanRange: 0,
    profile: { id: null, version: null, enemyPressureMultiplier: 1, groundPressureMultiplier: 1, facilityCount: 0, groundDefenderCount: 0, requiredOccupationNodeCount: 0 },
    camera: { x: round(shipX, 3), y: CAMERA_Y, z: CAMERA_Z, targetX: round(shipX, 3), targetY: CAMERA_Y, targetZ: 0 },
    rendering: { sceneAutoClear: true, sceneAutoClearDepthAndStencil: true, postProcessAutoClear: true },
    ship: { x: round(shipX, 3), z: 0, worldX: round(shipX, 3), worldY: 0, worldZ: 0, combatAltitude: BALANCE.mothership.baseAltitude, hull: 0, maxHull: 0, shield: 0, maxShield: 0, energy: 0, maxEnergy: 0 },
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
    assault: unavailable(0, 0),
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
  layers: Array<{ layer: BattleBackgroundLayer; root: TransformNode; plane: AbstractMesh | null }>,
  map: BattleMapDefinition,
  scene: Scene,
): void {
  for (const { layer, plane } of layers) {
    if (!plane) continue;
    const planeScaleX = getBackgroundPlaneScaleX(layer.key);
    const url = mapBackgroundUrl(map, layer.key);
    plane.scaling.x = planeScaleX;
    plane.scaling.y = layer.key === 'near' ? NEAR_LAYER_SCALE : 1;
    plane.position.y = layer.key === 'near' ? -(NEAR_LAYER_PLANE_HEIGHT * (1 - NEAR_LAYER_SCALE)) / 2 : 0;
    plane.alphaIndex = getBackgroundAlphaIndex(layer.key);
    plane.isVisible = true;
    plane.setEnabled(true);
    plane.isPickable = false;
    plane.renderingGroupId = layer.renderingGroupId;
    if (layer.key === 'foregroundAtmosphere') plane.visibility = 0;
    const textureScaleX = layer.key === 'ground' ? planeScaleX : layer.key === 'near' ? 1 / NEAR_LAYER_SCALE : 1;
    if (url) assignBackgroundMaterial(plane, url, scene, layer.key === 'foregroundAtmosphere', getBackgroundTextureRepeat(layer.key, map) * textureScaleX);
  }
}

function getBackgroundPlaneScaleX(key: keyof BattleMapDefinition['backgrounds']): number {
  return key === 'ground' ? 2 : 1;
}

function getBackgroundAlphaIndex(key: keyof BattleMapDefinition['backgrounds']): number {
  return key === 'ground' ? 1 : 0;
}

function getBackgroundTextureRepeat(key: keyof BattleMapDefinition['backgrounds'], map: BattleMapDefinition): number {
  if (map.id === 'river-day' || map.id === 'desert-day') return 1;
  return key === 'sky' || key === 'clouds' ? 1 : BACKGROUND_REPEAT;
}

function getGroundLayerUiLift(layer: BattleBackgroundLayer, camera: UniversalCamera, engine: Engine): number {
  if (layer.key !== 'near' && layer.key !== 'ground') return 0;
  const distance = Math.abs(layer.z - camera.position.z);
  const visibleHeight = 2 * distance * Math.tan(camera.fov / 2);
  return GROUND_LAYER_UI_LIFT_PIXELS * visibleHeight / Math.max(1, engine.getRenderHeight());
}

function clampBackgroundLayerY(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Scalar.Clamp(value, -80, 80) * 100) / 100;
}

function setGameplayRenderingGroup(...roots: TransformNode[]): void {
  for (const root of roots) {
    for (const mesh of root.getChildMeshes()) mesh.renderingGroupId = 3;
  }
}

function hideDebugPrototypes(scene: Scene): void {
  for (const mesh of scene.meshes) {
    if (/^(FighterPrototype|DronePrototype|GroundTurretPrototype|GroundBarrelPrototype|GroundSamPrototype)/.test(mesh.name)) mesh.setEnabled(false);
  }
}

function restoreMothershipRuntimeHierarchy(scene: Scene): { gameplayRoot: TransformNode; visualRoot: TransformNode } {
  const airRoot = getOrCreateNode(scene, 'AirBattleRoot');
  const gameplayRoot = getOrCreateNode(scene, 'MothershipGameplayRoot');
  const visualRoot = getOrCreateNode(scene, 'MothershipVisualRoot');
  gameplayRoot.parent = airRoot;
  gameplayRoot.position.y = MOTHERSHIP_Y;
  visualRoot.parent = gameplayRoot;

  const modelRoot = scene.getTransformNodeByName('MothershipModelRoot');
  if (modelRoot) modelRoot.parent = visualRoot;
  for (const mesh of scene.meshes) {
    if (mesh.name.startsWith('mothership-') && !mesh.parent) mesh.parent = visualRoot;
  }

  const weaponSockets = getOrCreateNode(scene, 'WeaponSockets');
  weaponSockets.parent = visualRoot;
  for (const name of ['WeaponSocketLeft', 'WeaponSocketRight']) getOrCreateNode(scene, name).parent = weaponSockets;

  const droneSockets = getOrCreateNode(scene, 'DroneSpawnSockets');
  droneSockets.parent = visualRoot;
  for (const name of ['DroneSpawnSocketLeft', 'DroneSpawnSocketCenter', 'DroneSpawnSocketRight']) getOrCreateNode(scene, name).parent = droneSockets;
  getOrCreateNode(scene, 'MothershipVfxSockets').parent = visualRoot;

  return { gameplayRoot, visualRoot };
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
  mesh.material = material;
}

function getVisibleWidth(camera: UniversalCamera, engine: Engine): number {
  const height = Math.max(1, engine.getRenderHeight());
  const aspect = engine.getRenderWidth() / height;
  const visibleHeight = 2 * Math.abs(camera.position.z) * Math.tan(camera.fov / 2);
  return visibleHeight * aspect;
}
