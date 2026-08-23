import type { CampaignState } from '../domain/types';

export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
  mapId: string;
}

export interface BattleGateway {
  isAvailable(): boolean;
  launch(request: BattleLaunchRequest): Promise<void>;
}

/**
 * Keep campaign-to-battle selection engine-neutral so the map UI does not
 * depend on Babylon types. The React adapter builds a request, while the
 * Babylon runtime owns scene lifecycle and rendering details.
 */
export class UnavailableBattleGateway implements BattleGateway {
  public isAvailable(): boolean {
    return false;
  }

  public async launch(_request: BattleLaunchRequest): Promise<void> {
    throw new Error('Battle runtime is not available during phase one.');
  }
}

export function battleRequestFor(campaign: CampaignState, cityId: string, mapId = 'city-day'): BattleLaunchRequest {
  return { campaignId: campaign.campaignId, cityId, mapId };
}
