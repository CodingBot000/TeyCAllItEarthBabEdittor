import { Color3, Engine, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Scene } from '@babylonjs/core';
import type { AbsorbableKind, CombatState } from '../../domain/types';

interface RegionVisual {
  root: TransformNode;
  pad: Mesh;
  core: Mesh;
  beacon: Mesh;
  baseScaleX: number;
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

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleAbsorbableRegionsRoot', scene);
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
    }
    for (const [id, visual] of this.visuals) {
      if (activeIds.has(id)) continue;
      visual.root.dispose(false, true);
      this.visuals.delete(id);
    }
  }

  dispose(): void {
    this.visuals.forEach((visual) => visual.root.dispose(false, true));
    this.visuals.clear();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
    this.hiddenMaterial.dispose();
    this.lockedMaterial.dispose();
    this.depletedMaterial.dispose();
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
