import { describe, expect, it } from 'vitest';
import { createNewCampaign } from './campaignRules';
import { applyOccupationGarrison } from './missionRules';

describe('occupation garrison allocation', () => {
  it('assigns only selected garrison candidates and returns the rest to reserve', () => {
    const campaign = createNewCampaign(9151);
    const pending = {
      id: 'debrief-occupation',
      cityId: 'seoul',
      missionType: 'OCCUPATION' as const,
      outcome: 'SUCCESS' as const,
      cargoRecovered: { captives: 0, biomass: 0, alloy: 0, intel: 0, coreCharge: 0 },
      absorbedByKind: { ORGANIC: 0, POWER: 0, VEHICLE: 0, MACHINERY: 0, DATA: 0, RELIC: 0 },
      recoveredCohortIds: [],
      lostCohortIds: [],
      garrisonCandidateIds: ['cohort-1', 'cohort-2'],
      cityControlBefore: 'BREACHED' as const,
      cityControlAfterCombat: 'BREACHED' as const,
      destruction: 0,
      globalThreatDelta: 0,
      createdAtMinutes: 3,
    };
    const state = {
      ...campaign,
      cohorts: {
        'cohort-1': { id: 'cohort-1', type: 'ASSAULT' as const, strength: 90, cohesion: 80, control: 95, experience: 2, status: 'RESERVE' as const, assignedCityId: null, createdAtBattle: 1 },
        'cohort-2': { id: 'cohort-2', type: 'ASSAULT' as const, strength: 85, cohesion: 76, control: 88, experience: 2, status: 'RESERVE' as const, assignedCityId: null, createdAtBattle: 1 },
      },
    };

    const next = applyOccupationGarrison(state, pending, ['cohort-1']);

    expect(next.cohorts['cohort-1']).toMatchObject({ status: 'GARRISON', assignedCityId: 'seoul' });
    expect(next.cohorts['cohort-2']).toMatchObject({ status: 'RESERVE', assignedCityId: null });
    expect(next.cities.seoul.conquest).toMatchObject({ controlState: 'OCCUPIED', garrisonCohortIds: ['cohort-1'] });
  });
});
