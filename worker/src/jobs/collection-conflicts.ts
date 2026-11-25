import { campaignsConflict, type Campaign } from '../domain/campaign';
import { withFreshAccessToken } from '../auth/session';
import { D1CampaignRepository } from '../db/campaigns';
import type { Env } from '../env';
import { fetchStoreId, resolveCollectionMembers, writeCollectionVariables } from '../services/collection-publication';

export async function refreshCollectionConflicts(env: Env, now = new Date(env.now?.() ?? Date.now())): Promise<{ scanned: number; refreshed: number; failed: number }> {
  const repository = new D1CampaignRepository(env.DB, env.now ?? Date.now);
  const shops = await repository.listShopsWithActiveCollections();
  let scanned = 0;
  let refreshed = 0;
  let failed = 0;
  for (const handle of shops) {
    const allCampaigns = await repository.list(handle);
    const campaigns = allCampaigns.filter((campaign) => campaign.status === 'active' && campaign.scope.kind === 'collections');
    const active: Campaign[] = [];
    for (const campaign of campaigns) {
      if ((await repository.getPublication(handle, campaign.id)).state === 'active') active.push(campaign);
    }
    let session;
    try { session = await withFreshAccessToken(handle, env); }
    catch {
      failed += active.length;
      await Promise.all(active.map((campaign) => repository.setCollectionConflict(handle, campaign.id, 'unknown', [])));
      continue;
    }
    const refreshedCampaigns: Campaign[] = [];
    for (const campaign of active) {
      scanned += 1;
      try {
        const members = await resolveCollectionMembers(session, campaign.scope.collectionIds || []);
        await repository.updateCollectionSnapshot(handle, campaign.id, campaign.revision, members);
        refreshedCampaigns.push({ ...campaign, scope: { ...campaign.scope, resolvedProductIds: members } });
        refreshed += 1;
      } catch {
        failed += 1;
        await repository.setCollectionConflict(handle, campaign.id, 'unknown', []);
      }
    }
    if (refreshedCampaigns.length) {
      let owner: string | null = null;
      try {
        owner = await repository.acquireShopLock(handle);
        await writeCollectionVariables(session, await fetchStoreId(session), await repository.listRequiredCollectionIds(handle));
      }
      catch {
        failed += refreshedCampaigns.length;
        await Promise.all(refreshedCampaigns.map((campaign) => repository.setCollectionConflict(handle, campaign.id, 'unknown', [])));
        continue;
      } finally {
        if (owner) await repository.releaseShopLock(handle, owner);
      }
    }
    for (const campaign of refreshedCampaigns) {
      // Use the same rules as publication: product scopes take priority over
      // collection scopes; collection conflicts are based on collection IDs.
      const conflicts = active.filter((other) => other.id !== campaign.id && campaignsConflict(campaign, other)).map((other) => other.id);
      await repository.setCollectionConflict(handle, campaign.id, conflicts.length ? 'conflict' : 'clear', conflicts, now.toISOString());
    }
  }
  return { scanned, refreshed, failed };
}
