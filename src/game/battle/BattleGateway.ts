import type { CampaignState } from '../domain/types';

export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
  mapId: string;
}

/** Keep campaign-to-battle selection free of Babylon types. */
export function battleRequestFor(campaign: CampaignState, cityId: string, mapId = 'city-day'): BattleLaunchRequest {
  const request = { campaignId: campaign.campaignId, cityId, mapId };
  return campaign.plannedMission?.id ? { ...request, missionId: campaign.plannedMission.id } : request;
}
