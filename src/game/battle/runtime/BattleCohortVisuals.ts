import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, type Scene } from '@babylonjs/core';
import type { CombatState } from '../../domain/types';

interface CohortVisual {
  root: TransformNode;
  bodies: Mesh[];
}

// Keep the assault drop's sprite tint tied to the same hue used by the
// deployed cohort bodies. Both visuals represent the same unit family.
export const COHORT_ACTIVE_COLOR = new Color3(0.46, 0.96, 0.82);

export class BattleCohortVisuals {
  private readonly root: TransformNode;
  private readonly visuals = new Map<string, CohortVisual>();
  private readonly activeMaterial: StandardMaterial;
  private readonly retreatMaterial: StandardMaterial;
  private readonly lostMaterial: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('BattleCohortVisualsRoot', scene);
    this.activeMaterial = this.material('battle-cohort-active', COHORT_ACTIVE_COLOR);
    this.retreatMaterial = this.material('battle-cohort-retreat', new Color3(0.98, 0.72, 0.28));
    this.lostMaterial = this.material('battle-cohort-lost', new Color3(0.42, 0.25, 0.28));
  }

  sync(state: Readonly<CombatState>, elapsedSeconds: number): void {
    const activeIds = new Set<string>();
    for (const cohort of state.deployedCohorts) {
      if (!cohort.deployed) continue;
      activeIds.add(cohort.cohortId);
      const visual = this.visuals.get(cohort.cohortId) ?? this.createVisual(cohort.cohortId);
      visual.root.position.x = cohort.position.x;
      visual.root.position.y = -4.05 + Math.sin(elapsedSeconds * 5 + cohort.position.x) * 0.08;
      visual.root.position.z = 1;
      const material = !cohort.recoverable || cohort.strength <= 0 ? this.lostMaterial : cohort.order === 'RETREAT' ? this.retreatMaterial : this.activeMaterial;
      visual.bodies.forEach((body, index) => {
        body.material = material;
        body.visibility = Math.max(0.18, cohort.strength / 100) * (index === 1 ? 1 : 0.78);
      });
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
    this.activeMaterial.dispose();
    this.retreatMaterial.dispose();
    this.lostMaterial.dispose();
    this.root.dispose();
  }

  private createVisual(id: string): CohortVisual {
    const root = new TransformNode(`battle-cohort-${id}`, this.scene);
    root.parent = this.root;
    const bodies = [-0.6, 0, 0.6].map((offset, index) => {
      const body = MeshBuilder.CreateCapsule(`${root.name}-unit-${index}`, { radius: 0.22, height: 1.15, tessellation: 8 }, this.scene);
      body.parent = root;
      body.position.x = offset;
      body.position.y = index === 1 ? 0.16 : 0;
      body.scaling.setAll(index === 1 ? 1.08 : 0.9);
      body.renderingGroupId = 3;
      body.isPickable = false;
      return body;
    });
    const visual = { root, bodies };
    this.visuals.set(id, visual);
    return visual;
  }

  private material(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color.scale(0.42);
    material.emissiveColor = color;
    material.disableLighting = true;
    return material;
  }
}
