import type { CampaignRepository } from './repository';
import type { Campaign } from './model';
import { campaignsConflict } from './validate';
import { resolveCollectionMembers } from './collection-members';

type Session = { handle: string; accessToken: string };
type Resolver = (session: Session, ids: string[], requestId?: string) => Promise<string[]>;

export async function refreshPublishedCollectionConflicts(repository: CampaignRepository, session: Session, resolve: Resolver = (shopSession, ids, trace) => resolveCollectionMembers(shopSession, ids, undefined, trace), requestId?: string): Promise<void> {
  const campaigns = await repository.list(session.handle);
  const active: Campaign[] = [];
  for (const campaign of campaigns) {
    if (campaign.status === 'active' && (await repository.getPublication(session.handle, campaign.id)).state === 'active') active.push(campaign);
  }
  const collections = active.filter((campaign) => campaign.scope.kind === 'collections');
  const refreshed = new Map<string, string[]>();
  try {
    for (const campaign of collections) refreshed.set(campaign.id, await resolve(session, campaign.scope.collectionIds || [], requestId));
  } catch (error) {
    await Promise.all(collections.map((campaign) => repository.setCollectionConflict(session.handle, campaign.id, 'unknown', [])));
    throw error;
  }
  const current = active.map((campaign) => refreshed.has(campaign.id)
    ? { ...campaign, scope: { ...campaign.scope, resolvedProductIds: refreshed.get(campaign.id) } }
    : campaign);
  for (const campaign of collections) {
    await repository.updateCollectionSnapshot(session.handle, campaign.id, refreshed.get(campaign.id) || []);
    const item = current.find((candidate) => candidate.id === campaign.id)!;
    const conflicts = current.filter((candidate) => candidate.id !== item.id && campaignsConflict(item, candidate)).map((candidate) => candidate.id);
    await repository.setCollectionConflict(session.handle, campaign.id, conflicts.length ? 'conflict' : 'clear', conflicts);
  }
}

export async function scanShopsForCollectionConflicts(repository: CampaignRepository, loadSession: (handle: string) => Promise<Session>): Promise<void> {
  for (const handle of await repository.listShopsWithActiveCollections()) {
    try {
      await repository.withShopPublicationLock(handle, async () => {
        const session = await loadSession(handle);
        await refreshPublishedCollectionConflicts(repository, session);
      });
    } catch (error) {
      for (const campaign of await repository.list(handle)) {
        if (campaign.status === 'active' && campaign.scope.kind === 'collections') await repository.setCollectionConflict(handle, campaign.id, 'unknown', []);
      }
      console.error('SHOPLINE collection conflict scan failed', { handle, errorType: error instanceof Error ? error.name : 'Unknown' });
    }
  }
}

export function startCollectionConflictMonitor(repository: CampaignRepository, loadSession: (handle: string) => Promise<Session>): () => void {
  let running = false;
  const scan = async () => {
    if (running) return;
    running = true;
    try { await scanShopsForCollectionConflicts(repository, loadSession); }
    catch (error) { console.error('SHOPLINE collection conflict monitor failed', { errorType: error instanceof Error ? error.name : 'Unknown' }); }
    finally { running = false; }
  };
  void scan();
  const interval = setInterval(() => { void scan(); }, 5 * 60 * 1000);
  interval.unref();
  return () => clearInterval(interval);
}
