import { CITY_BY_ID } from '../data/world';
import type { CampaignState } from '../domain/types';
import { battleMapIdForStage } from './gameplay/battleSetupRules';

export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
  mapId: string;
}

/** Keep campaign-to-battle selection free of Babylon types. */
export function battleRequestFor(campaign: CampaignState, cityId: string, mapId?: string): BattleLaunchRequest {
  const mission = campaign.plannedMission?.cityId === cityId ? campaign.plannedMission : null;
  const city = CITY_BY_ID[cityId];
  const nextStageMap = city ? battleMapIdForStage(city, campaign.completedBattles + 1) : 'city-day';
  const request = { campaignId: campaign.campaignId, cityId, mapId: mission?.battleSetup.mapId ?? mapId ?? nextStageMap };
  return mission?.id ? { ...request, missionId: mission.id } : request;
}
