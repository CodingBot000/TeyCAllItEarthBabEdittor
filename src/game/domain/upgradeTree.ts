import type { CampaignState } from './types';
import type { UpgradeId } from './upgradeCatalog';

export type UpgradeBranchId = 'harvest' | 'weapon' | 'defense' | 'utility' | 'army' | 'energy';
export type UpgradeNodeState = 'LOCKED' | 'AVAILABLE' | 'OWNED' | 'MAXED';

export interface UpgradeRequirement {
  id: UpgradeId;
  level: number;
}

export interface UpgradeTreeNode {
  id: UpgradeId;
  branch: UpgradeBranchId;
  x: number;
  y: number;
  requirements: readonly UpgradeRequirement[];
}

export interface UpgradeTreeBranch {
  id: UpgradeBranchId;
  label: string;
  color: string;
  x: number;
  y: number;
}

export const UPGRADE_TREE_SIZE = { width: 2200, height: 1320 } as const;
export const UPGRADE_TREE_CORE = { x: 1100, y: 660 } as const;

export const UPGRADE_TREE_BRANCHES: readonly UpgradeTreeBranch[] = [
  { id: 'harvest', label: 'HARVEST', color: '#68e0b2', x: 820, y: 500 },
  { id: 'weapon', label: 'WEAPON', color: '#ff715b', x: 1380, y: 500 },
  { id: 'defense', label: 'DEFENSE', color: '#6db8ff', x: 1100, y: 390 },
  { id: 'utility', label: 'UTILITY', color: '#a58aff', x: 720, y: 820 },
  { id: 'army', label: 'ARMY', color: '#f3bb62', x: 1480, y: 820 },
  { id: 'energy', label: 'ENERGY', color: '#e879f9', x: 1100, y: 930 },
] as const;

export const UPGRADE_TREE_NODES: readonly UpgradeTreeNode[] = [
  { id: 'beam-capacity', branch: 'harvest', x: 560, y: 400, requirements: [] },
  { id: 'beam-radius', branch: 'harvest', x: 330, y: 270, requirements: [{ id: 'beam-capacity', level: 1 }] },
  { id: 'beam-efficiency', branch: 'harvest', x: 330, y: 520, requirements: [{ id: 'beam-capacity', level: 1 }] },
  { id: 'cargo-bay', branch: 'harvest', x: 110, y: 190, requirements: [{ id: 'beam-radius', level: 1 }] },
  { id: 'signature-dampener', branch: 'harvest', x: 110, y: 610, requirements: [{ id: 'beam-efficiency', level: 1 }] },
  { id: 'selective-filter', branch: 'harvest', x: 110, y: 400, requirements: [{ id: 'cargo-bay', level: 2 }, { id: 'signature-dampener', level: 2 }] },

  { id: 'plasma-damage', branch: 'weapon', x: 1640, y: 150, requirements: [] },
  { id: 'emp-duration', branch: 'weapon', x: 1640, y: 320, requirements: [] },
  { id: 'air-defense-damage', branch: 'weapon', x: 1640, y: 490, requirements: [] },
  { id: 'air-defense-cycle', branch: 'weapon', x: 1860, y: 490, requirements: [{ id: 'air-defense-damage', level: 1 }] },
  { id: 'air-defense-multitarget', branch: 'weapon', x: 2070, y: 490, requirements: [{ id: 'air-defense-cycle', level: 2 }] },
  { id: 'point-defense-accuracy', branch: 'weapon', x: 1640, y: 660, requirements: [] },
  { id: 'point-defense-efficiency', branch: 'weapon', x: 1860, y: 660, requirements: [{ id: 'point-defense-accuracy', level: 1 }] },
  { id: 'point-defense-multitarget', branch: 'weapon', x: 2070, y: 660, requirements: [{ id: 'point-defense-efficiency', level: 2 }] },

  { id: 'shield-capacity', branch: 'defense', x: 900, y: 130, requirements: [] },
  { id: 'energy-core', branch: 'defense', x: 1300, y: 130, requirements: [] },

  { id: 'scanner-array', branch: 'utility', x: 470, y: 880, requirements: [] },
  { id: 'threat-forecast', branch: 'utility', x: 230, y: 1030, requirements: [{ id: 'scanner-array', level: 1 }] },

  { id: 'neural-foundry', branch: 'army', x: 1690, y: 840, requirements: [] },
  { id: 'cohort-conditioning', branch: 'army', x: 1910, y: 800, requirements: [{ id: 'neural-foundry', level: 1 }] },
  { id: 'command-bandwidth', branch: 'army', x: 1690, y: 1010, requirements: [] },
  { id: 'drop-capacity', branch: 'army', x: 1910, y: 1050, requirements: [{ id: 'command-bandwidth', level: 1 }] },
  { id: 'recovery-protocol', branch: 'army', x: 2070, y: 925, requirements: [{ id: 'cohort-conditioning', level: 1 }, { id: 'drop-capacity', level: 1 }] },

  { id: 'core-reservoir', branch: 'energy', x: 1100, y: 1100, requirements: [] },
  { id: 'capacitor-rack', branch: 'energy', x: 850, y: 1230, requirements: [{ id: 'core-reservoir', level: 1 }] },
  { id: 'emergency-bio-conversion', branch: 'energy', x: 1350, y: 1230, requirements: [{ id: 'core-reservoir', level: 1 }] },
] as const;

export const UPGRADE_TREE_NODE_BY_ID = new Map(UPGRADE_TREE_NODES.map((node) => [node.id, node]));
export const UPGRADE_TREE_BRANCH_BY_ID = new Map(UPGRADE_TREE_BRANCHES.map((branch) => [branch.id, branch]));

export function requirementsMet(campaign: CampaignState, id: UpgradeId): boolean {
  const node = UPGRADE_TREE_NODE_BY_ID.get(id);
  return node ? node.requirements.every((requirement) => (campaign.upgrades[requirement.id] ?? 0) >= requirement.level) : false;
}

export function missingRequirements(campaign: CampaignState, id: UpgradeId): readonly UpgradeRequirement[] {
  const node = UPGRADE_TREE_NODE_BY_ID.get(id);
  return node?.requirements.filter((requirement) => (campaign.upgrades[requirement.id] ?? 0) < requirement.level) ?? [];
}

export function upgradeNodeState(campaign: CampaignState, id: UpgradeId, maxLevel: number): UpgradeNodeState {
  const level = campaign.upgrades[id] ?? 0;
  if (level >= maxLevel) return 'MAXED';
  if (level > 0) return 'OWNED';
  return requirementsMet(campaign, id) ? 'AVAILABLE' : 'LOCKED';
}
