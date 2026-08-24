import type { CampaignState } from '../domain/types';

export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
  mapId: string;
}

/** Keep campaign-to-battle selection free of Babylon types. */
export function battleRequestFor(campaign: CampaignState, cityId: string, mapId = 'city-day'): BattleLaunchRequest {
  const mission = campaign.plannedMission?.cityId === cityId ? campaign.plannedMission : null;
  const request = { campaignId: campaign.campaignId, cityId, mapId: mission?.battleSetup.mapId ?? mapId };
  return mission?.id ? { ...request, missionId: mission.id } : request;
}
