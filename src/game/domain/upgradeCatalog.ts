import type { ResourceWallet } from './types';

export type UpgradeGroup = 'HARVEST' | 'WEAPON' | 'DEFENSE' | 'UTILITY' | 'ARMY' | 'ENERGY';

export interface UpgradeDefinition {
  id: string;
  label: string;
  group: UpgradeGroup;
  description: string;
  maxLevel: number;
  cost: (currentLevel: number) => ResourceWallet;
}

const scaledCost = (biomass: number, alloy: number, intel: number) => (level: number): ResourceWallet => ({
  biomass: biomass * (level + 1),
  alloy: alloy * (level + 1),
  intel: intel * (level + 1),
});

export const UPGRADE_DEFINITIONS = [
  { id: 'beam-capacity', label: 'BEAM CAPACITY', group: 'HARVEST', description: '+20% harvest rate per level', maxLevel: 3, cost: (level: number) => ({ biomass: 90 * (level + 1), alloy: 0, intel: level === 2 ? 4 : 0 }) },
  { id: 'beam-radius', label: 'BEAM RADIUS', group: 'HARVEST', description: '+1.0 capture radius per level', maxLevel: 3, cost: scaledCost(120, 0, 0) },
  { id: 'beam-efficiency', label: 'BEAM EFFICIENCY', group: 'HARVEST', description: '-10% beam heat gain per level', maxLevel: 3, cost: scaledCost(100, 70, 0) },
  { id: 'cargo-bay', label: 'CARGO BAY', group: 'HARVEST', description: '+10,000 cargo capacity per level', maxLevel: 3, cost: scaledCost(100, 120, 0) },
  { id: 'plasma-damage', label: 'PLASMA DAMAGE', group: 'WEAPON', description: '+15% strike and fighter damage per level', maxLevel: 3, cost: (level: number) => ({ biomass: 0, alloy: 110 * (level + 1), intel: level === 2 ? 3 : 0 }) },
  { id: 'shield-capacity', label: 'SHIELD CAPACITY', group: 'DEFENSE', description: '+120 maximum shield per level', maxLevel: 3, cost: scaledCost(0, 100, 0) },
  { id: 'energy-core', label: 'ENERGY CORE', group: 'DEFENSE', description: '+120 energy and +4 regen per level', maxLevel: 3, cost: scaledCost(80, 80, 0) },
  { id: 'scanner-array', label: 'SCANNER ARRAY', group: 'UTILITY', description: '+6 scan range per level', maxLevel: 3, cost: scaledCost(0, 80, 6) },
  { id: 'signature-dampener', label: 'SIGNATURE DAMPENER', group: 'UTILITY', description: '-10% beam alert per level', maxLevel: 3, cost: scaledCost(0, 90, 5) },
  { id: 'selective-filter', label: 'SELECTIVE FILTER', group: 'HARVEST', description: '+12% mission yield per level', maxLevel: 3, cost: (level: number) => ({ biomass: 140 * (level + 1), alloy: 50 * (level + 1), intel: level * 2 }) },
  { id: 'neural-foundry', label: 'NEURAL FOUNDRY', group: 'ARMY', description: '+1 conversion capacity per level', maxLevel: 3, cost: scaledCost(180, 130, 2) },
  { id: 'command-bandwidth', label: 'COMMAND BANDWIDTH', group: 'ARMY', description: '+1 simultaneous command bandwidth per level', maxLevel: 3, cost: scaledCost(120, 160, 3) },
  { id: 'drop-capacity', label: 'DROP CAPACITY', group: 'ARMY', description: '+1 cohort drop capacity per level', maxLevel: 3, cost: scaledCost(160, 140, 2) },
  { id: 'cohort-conditioning', label: 'COHORT CONDITIONING', group: 'ARMY', description: '+8% base strength and movement, +10% assault damage per level', maxLevel: 3, cost: scaledCost(200, 160, 4) },
  { id: 'recovery-protocol', label: 'RECOVERY PROTOCOL', group: 'ARMY', description: '-12% cohort losses and +10% failed cargo recovery per level', maxLevel: 3, cost: scaledCost(170, 130, 4) },
  { id: 'core-reservoir', label: 'CORE RESERVOIR', group: 'ENERGY', description: '+20 maximum Core Charge per level', maxLevel: 3, cost: scaledCost(130, 180, 2) },
  { id: 'capacitor-rack', label: 'CAPACITOR RACK', group: 'ENERGY', description: '+1 Overcharge Cell capacity per level', maxLevel: 3, cost: scaledCost(120, 220, 4) },
  { id: 'emp-duration', label: 'EMP DISRUPTION', group: 'WEAPON', description: '+20% duration, +2% fighter disable chance, and +1 fighter cap per level', maxLevel: 3, cost: scaledCost(80, 190, 3) },
  { id: 'emergency-bio-conversion', label: 'EMERGENCY BIO-CONVERSION', group: 'ENERGY', description: '+4 emergency Core Charge grant per level', maxLevel: 3, cost: scaledCost(220, 100, 5) },
  { id: 'threat-forecast', label: 'THREAT FORECAST', group: 'UTILITY', description: '-15% projected alert pressure per level', maxLevel: 3, cost: scaledCost(100, 120, 8) },
  { id: 'air-defense-damage', label: 'AIR DEFENSE OUTPUT', group: 'WEAPON', description: '+20% air-defense laser damage per level', maxLevel: 3, cost: scaledCost(0, 140, 2) },
  { id: 'air-defense-cycle', label: 'AIR DEFENSE ACCELERATOR', group: 'WEAPON', description: '-10% air-defense firing interval per level', maxLevel: 3, cost: scaledCost(60, 180, 4) },
  { id: 'air-defense-multitarget', label: 'AIR DEFENSE MULTI-TRACK', group: 'WEAPON', description: '+1 fighter target per firing cycle per level', maxLevel: 3, cost: scaledCost(100, 240, 6) },
  { id: 'point-defense-accuracy', label: 'POINT DEFENSE ACCURACY', group: 'WEAPON', description: '+5 percentage points interception chance per level', maxLevel: 3, cost: scaledCost(0, 150, 4) },
  { id: 'point-defense-efficiency', label: 'POINT DEFENSE EFFICIENCY', group: 'WEAPON', description: '-1 energy per intercepted target per level', maxLevel: 3, cost: scaledCost(80, 160, 3) },
  { id: 'point-defense-multitarget', label: 'POINT DEFENSE MULTI-TRACK', group: 'WEAPON', description: '+1 missile target per firing cycle per level', maxLevel: 3, cost: scaledCost(120, 260, 7) },
] as const satisfies readonly UpgradeDefinition[];

export type UpgradeId = typeof UPGRADE_DEFINITIONS[number]['id'];
export type CatalogUpgradeDefinition = typeof UPGRADE_DEFINITIONS[number];

export const UPGRADE_BY_ID = new Map<UpgradeId, CatalogUpgradeDefinition>(
  UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, upgrade]),
);

export function isUpgradeId(id: string): id is UpgradeId {
  return UPGRADE_BY_ID.has(id as UpgradeId);
}
