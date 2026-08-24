import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';
import type { AbsorbableKind, AbsorbableStatus, CombatState } from '../../domain/types';

interface RegionVisual {
  root: TransformNode;
  pad: Mesh;
  core: Mesh;
  beacon: Mesh;
  baseScaleX: number;
  organic?: OrganicClusterVisualAdapter;
}

export interface OrganicClusterPresentation {
  targetId: string;
  x: number;
  initialPopulation: number;
  remainingPopulation: number;
  remainingRatio: number;
  status: AbsorbableStatus;
  discovered: boolean;
  active: boolean;
}

export interface OrganicClusterVisualAdapter {
  sync(presentation: OrganicClusterPresentation, elapsedSeconds: number): void;
  dispose(): void;
}

const COLOR_BY_KIND: Record<AbsorbableKind, Color3> = {
  ORGANIC: new Color3(0.25, 0.95, 0.66),
  VEHICLE: new Color3(0.98, 0.68, 0.25),
  MACHINERY: new Color3(0.78, 0.64, 0.95),
  POWER: new Color3(0.4, 0.8, 1),
  DATA: new Color3(0.35, 0.95, 1),
  RELIC: new Color3(1, 0.46, 0.74),
};

export class BattleAbsorbableRegions {
  private readonly root: TransformNode;
  private readonly visuals = new Map<string, RegionVisual>();
  private readonly materials = new Map<AbsorbableKind, StandardMaterial>();
  private readonly hiddenMaterial: StandardMaterial;
  private readonly lockedMaterial: StandardMaterial;
  private readonly depletedMaterial: StandardMaterial;
  private readonly organicGui: AdvancedDynamicTexture;

  constructor(private readonly scene: Scene, private readonly language: 'ko' | 'en' = 'ko') {
    this.root = new TransformNode('BattleAbsorbableRegionsRoot', scene);
    this.organicGui = AdvancedDynamicTexture.CreateFullscreenUI('BattleOrganicClusterUi', true, scene);
    this.hiddenMaterial = this.material('battle-region-hidden', new Color3(0.2, 0.42, 0.45), 0.2);
    this.lockedMaterial = this.material('battle-region-locked', new Color3(1, 0.34, 0.2), 0.52);
    this.depletedMaterial = this.material('battle-region-depleted', new Color3(0.2, 0.25, 0.27), 0.16);
    for (const [kind, color] of Object.entries(COLOR_BY_KIND) as Array<[AbsorbableKind, Color3]>) {
      this.materials.set(kind, this.material(`battle-region-${kind.toLowerCase()}`, color, 0.56));
    }
  }

  sync(state: Readonly<CombatState>, elapsedSeconds: number): void {
    const activeIds = new Set<string>();
    for (const target of state.absorbableTargets) {
      activeIds.add(target.id);
      const visual = this.visuals.get(target.id) ?? this.createVisual(target.id, target.center.x, target.radius);
      const remainingRatio = target.remainingAmount / Math.max(1, target.initialAmount);
      const nearShip = Math.abs(target.center.x - state.mothership.position.x) <= target.radius + 3;
      const active = state.activeBeamTargetId === target.id;
      const pulse = 1 + Math.sin(elapsedSeconds * (active ? 7 : 3.2) + target.center.x * 0.03) * (active ? 0.12 : 0.04);
      visual.root.position.x = target.center.x;
      visual.pad.scaling.x = visual.baseScaleX * Math.max(0.18, remainingRatio) * pulse;
      visual.pad.scaling.y = pulse;
      visual.core.scaling.setAll((nearShip ? 1.15 : 0.88) * pulse);
      visual.beacon.scaling.y = target.discovered ? 1.5 + pulse * 0.7 : 0.62;
      visual.beacon.visibility = target.remainingAmount <= 0 ? 0 : target.discovered ? 0.62 : 0.16;
      const material = target.remainingAmount <= 0
        ? this.depletedMaterial
        : !target.discovered
          ? this.hiddenMaterial
          : target.status === 'LOCKED'
            ? this.lockedMaterial
            : this.materials.get(target.kind)!;
      visual.pad.material = material;
      visual.core.material = material;
      visual.pad.visibility = target.discovered ? active ? 0.95 : nearShip ? 0.78 : 0.52 : 0.12;
      visual.core.visibility = target.discovered ? active ? 1 : nearShip ? 0.82 : 0.5 : 0.1;
      if (target.kind === 'ORGANIC') {
        const organic = visual.organic ?? this.createOrganicVisual(target.id, visual.root);
        visual.organic = organic;
        visual.pad.visibility *= 0.26;
        visual.core.visibility = 0;
        organic.sync({
          targetId: target.id,
          x: target.center.x,
          initialPopulation: target.initialAmount,
          remainingPopulation: target.remainingAmount,
          remainingRatio,
          status: target.status,
          discovered: target.discovered,
          active,
        }, elapsedSeconds);
      } else if (visual.organic) {
        visual.organic.dispose();
        visual.organic = undefined;
      }
    }
    for (const [id, visual] of this.visuals) {
      if (activeIds.has(id)) continue;
      visual.organic?.dispose();
      visual.root.dispose(false, true);
      this.visuals.delete(id);
    }
  }

  dispose(): void {
    this.visuals.forEach((visual) => { visual.organic?.dispose(); visual.root.dispose(false, true); });
    this.visuals.clear();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.hiddenMaterial.dispose();
    this.lockedMaterial.dispose();
    this.depletedMaterial.dispose();
    this.organicGui.dispose();
    this.root.dispose();
  }

  private createVisual(id: string, x: number, radius: number): RegionVisual {
    const root = new TransformNode(`battle-region-${id}`, this.scene);
    root.parent = this.root;
    root.position = new Vector3(x, -5.25, 1.3);
    const pad = MeshBuilder.CreateDisc(`${root.name}-pad`, { radius: 1, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    pad.parent = root;
    pad.scaling.set(radius, Math.max(1.2, radius * 0.24), 1);
    pad.renderingGroupId = 3;
    pad.isPickable = false;
    const core = MeshBuilder.CreateDisc(`${root.name}-core`, { radius: 0.62, tessellation: 36, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    core.parent = root;
    core.position.z = -0.03;
    core.scaling.set(2.2, 0.58, 1);
    core.renderingGroupId = 3;
    core.isPickable = false;
    const beacon = MeshBuilder.CreatePlane(`${root.name}-beacon`, { width: 0.16, height: 4.8, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    beacon.parent = root;
    beacon.position.y = 2.4;
    beacon.material = this.hiddenMaterial;
    beacon.renderingGroupId = 3;
    beacon.isPickable = false;
    const visual = { root, pad, core, beacon, baseScaleX: radius };
    this.visuals.set(id, visual);
    return visual;
  }

  private createOrganicVisual(targetId: string, parent: TransformNode): OrganicClusterVisualAdapter {
    return new SimpleOrganicClusterVisual(this.scene, this.organicGui, parent, targetId, this.language);
  }

  private material(name: string, color: Color3, alpha: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.45);
    material.emissiveColor = color;
    material.alpha = alpha;
    material.alphaMode = Engine.ALPHA_ADD;
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    return material;
  }
}

class SimpleOrganicClusterVisual implements OrganicClusterVisualAdapter {
  private readonly root: TransformNode;
  private readonly blob: Mesh;
  private readonly ring: Mesh;
  private readonly label: TextBlock;
  private readonly blobMaterial: StandardMaterial;
  private readonly ringMaterial: StandardMaterial;
  private lastLabel = '';

  constructor(scene: Scene, gui: AdvancedDynamicTexture, parent: TransformNode, targetId: string, private readonly language: 'ko' | 'en') {
    this.root = new TransformNode(`battle-organic-cluster-${targetId}`, scene);
    this.root.parent = parent;
    this.root.position.set(0, 0.25, -0.16);
    this.blobMaterial = organicMaterial(`battle-organic-cluster-${targetId}-blob`, scene, new Color3(0.12, 0.96, 0.46), 0.92);
    this.ringMaterial = organicMaterial(`battle-organic-cluster-${targetId}-ring`, scene, new Color3(0.62, 1, 0.82), 0.92);
    this.blob = MeshBuilder.CreateSphere(`${this.root.name}-blob`, { diameter: 1, segments: 12 }, scene);
    this.blob.parent = this.root;
    this.blob.position.y = 0.2;
    this.blob.material = this.blobMaterial;
    this.blob.renderingGroupId = 3;
    this.blob.isPickable = false;
    this.ring = MeshBuilder.CreateDisc(`${this.root.name}-ring`, { radius: 1, tessellation: 30, sideOrientation: Mesh.DOUBLESIDE }, scene);
    this.ring.parent = this.root;
    this.ring.position.z = -0.02;
    this.ring.material = this.ringMaterial;
    this.ring.renderingGroupId = 3;
    this.ring.isPickable = false;
    this.label = new TextBlock(`${this.root.name}-label`);
    this.label.color = '#e4fff4';
    this.label.fontFamily = 'Space Mono, monospace';
    this.label.fontSize = 18;
    this.label.fontWeight = '700';
    this.label.outlineWidth = 3;
    this.label.outlineColor = '#06231d';
    this.label.height = '28px';
    this.label.width = '110px';
    this.label.paddingLeft = '6px';
    this.label.paddingRight = '6px';
    gui.addControl(this.label);
    this.label.linkWithMesh(this.blob);
    this.label.linkOffsetY = -38;
  }

  sync(presentation: OrganicClusterPresentation, elapsedSeconds: number): void {
    const activePulse = presentation.active ? 1 + Math.sin(elapsedSeconds * 8) * 0.08 : 1;
    const size = (0.5 + presentation.remainingRatio * 1.08) * activePulse;
    this.blob.scaling.set(size * 2.1, size * 0.54, size * 0.55);
    this.ring.scaling.set((0.72 + presentation.remainingRatio * 1.4) * activePulse, (0.24 + presentation.remainingRatio * 0.38) * activePulse, 1);
    this.blob.visibility = presentation.discovered ? presentation.remainingPopulation > 0 ? 0.76 : 0.18 : 0.08;
    this.ring.visibility = presentation.discovered ? presentation.active ? 0.96 : 0.64 : 0.1;
    this.label.isVisible = presentation.discovered;
    const label = presentation.remainingPopulation <= 0 ? '0' : formatPopulation(presentation.remainingPopulation, this.language);
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.label.text = label;
    }
    this.label.color = presentation.remainingPopulation <= 0 ? '#72918b' : '#e4fff4';
  }

  dispose(): void {
    this.root.dispose(false, true);
    this.label.dispose();
    this.blobMaterial.dispose();
    this.ringMaterial.dispose();
  }
}

function organicMaterial(name: string, scene: Scene, color: Color3, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color.scale(0.45);
  material.emissiveColor = color;
  material.alpha = alpha;
  material.alphaMode = Engine.ALPHA_ADD;
  material.disableLighting = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  return material;
}

function formatPopulation(value: number, language: 'ko' | 'en'): string {
  const amount = Math.max(0, Math.round(value));
  if (language === 'ko') {
    if (amount >= 10_000) return `${(amount / 10_000).toFixed(amount >= 100_000 ? 0 : 1)}만`;
    return amount.toLocaleString('ko-KR');
  }
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString('en-US');
}
