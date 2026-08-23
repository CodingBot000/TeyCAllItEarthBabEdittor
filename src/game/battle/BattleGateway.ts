import type { CampaignState } from '../domain/types';

export interface BattleLaunchRequest {
  campaignId: string;
  cityId: string;
  missionId?: string;
}

export interface BattleGateway {
  isAvailable(): boolean;
  launch(request: BattleLaunchRequest): Promise<void>;
}

/**
 * Phase one deliberately has no tactical renderer. Keeping this boundary
 * engine-neutral lets the new Babylon Editor battle scene replace this
 * implementation without making the map UI depend on Babylon types.
 */
export class UnavailableBattleGateway implements BattleGateway {
  public isAvailable(): boolean {
    return false;
  }

  public async launch(_request: BattleLaunchRequest): Promise<void> {
    throw new Error('Battle runtime is not available during phase one.');
  }
}

export function battleRequestFor(campaign: CampaignState, cityId: string): BattleLaunchRequest {
  return { campaignId: campaign.campaignId, cityId };
}
