import { describe, expect, it } from 'vitest';
import { BUILDING_CATALOG, getBuildingDefinition, getTexturePath } from '../src/domain/buildingCatalog';

describe('building catalog', () => {
  it('contains four documented buildings', () => {
    expect(Object.keys(BUILDING_CATALOG)).toEqual(['building-001', 'building-002', 'building-003', 'building-004']);
  });

  it('resolves textures using the selected building ID', () => {
    expect(getTexturePath('building-003', 'front')).toBe('/assets/buildings/building-003/front.webp');
    expect(getBuildingDefinition('unknown').id).toBe('building-001');
  });
});
