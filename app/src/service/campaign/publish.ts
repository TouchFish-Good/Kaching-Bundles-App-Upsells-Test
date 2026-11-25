import type { Campaign } from './model';
import { CampaignRepository } from './repository';
import { buildDiscountRule, createAutomaticDiscount, deleteAutomaticDiscount, DiscountRejectedError } from './discount-adapter';
import { getCampaignCollection } from './collection-catalog';
import { resolveCollectionMembers } from './collection-members';
import { writeCollectionVariables } from './collection-variables';
import { fetchShopIdentity } from '../../admin-read/shop-identity';
import { CampaignConflictError } from './repository';
import { refreshPublishedCollectionConflicts } from './collection-conflicts';

type Session = { handle: string; accessToken: string };
type PublishDependencies = {
  functionId: string;
  shopCurrencyCode: string;
  create?: typeof createAutomaticDiscount;
  requestId?: string;
  collection?: CollectionDependencies;
};
export type CollectionDependencies = {
  resolve?: (session: Session, ids: string[], requestId?: string) => Promise<string[]>;
  storeId?: (session: Session) => Promise<string>;
  write?: (session: Session, storeId: string, ids: string[], requestId?: string) => Promise<void>;
};
type PauseDependencies = { functionId?: string; remove?: typeof deleteAutomaticDiscount; requestId?: string; collection?: CollectionDependencies };

function configured(value: string, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is not configured. Publication is unavailable.`);
  return value;
}

export async function publishCampaign(repository: CampaignRepository, session: Session, id: string, expectedRevision: number, dependencies: PublishDependencies): Promise<Campaign> {
  const functionId = configured(dependencies.functionId, 'SHOPLINE Product Discount Function ID');
  const currency = configured(dependencies.shopCurrencyCode, 'Shop currency');
  const saved = await repository.get(session.handle, id);
  if (saved && saved.scope.kind === 'all') throw new Error('Only specified products or collections can be published.');
  return repository.withShopPublicationLock(session.handle, async () => {
    await refreshPublishedCollectionConflicts(repository, session, dependencies.collection?.resolve, dependencies.requestId);
    const current = await repository.get(session.handle, id);
    if (!current) throw new Error('Campaign not found.');
    const isCollection = current.scope.kind === 'collections';
    const collection = dependencies.collection || {};
    const resolve = collection.resolve || (async (shopSession: Session, ids: string[], requestId?: string) => {
      for (const collectionId of ids) await getCampaignCollection(shopSession, collectionId, undefined, requestId);
      return resolveCollectionMembers(shopSession, ids, undefined, requestId);
    });
    const resolved = isCollection ? await resolve(session, current.scope.collectionIds || [], dependencies.requestId) : undefined;
    if (isCollection && (!resolved || !resolved.length)) throw new CampaignConflictError('Collection membership verification found no current products.');
    const storeId = isCollection ? await (collection.storeId || (async (shopSession: Session) => (await fetchShopIdentity(shopSession.handle, shopSession.accessToken)).storeId))(session) : undefined;
    if (storeId && !/^[0-9]+$/.test(storeId)) throw new Error('A trusted numeric SHOPLINE store ID is required.');
    const ruleScope = isCollection ? { ...current.scope, resolvedProductIds: resolved } : current.scope;
    buildDiscountRule({ ...current, status: 'active', scope: ruleScope }, currency);
    const campaign = await repository.beginPublication(session.handle, id, expectedRevision, 'publish', resolved);
    let discountId: string | undefined;
    let discountAttempted = false;
    try {
      if (isCollection && storeId) {
        const requiredIds = await repository.listRequiredCollectionIds(session.handle);
        const write = collection.write || ((shopSession: Session, shopId: string, ids: string[], requestId?: string) => writeCollectionVariables(shopSession, shopId, ids, undefined, requestId));
        await write(session, storeId, requiredIds, dependencies.requestId);
      }
      discountAttempted = true;
      discountId = await (dependencies.create || createAutomaticDiscount)(session, { ...campaign, status: 'active' }, currency, functionId, undefined, dependencies.requestId);
      if (!discountId) throw new Error('Platform did not confirm a discount ID.');
      return await repository.finishPublication(session.handle, id, expectedRevision, 'publish', discountId);
    } catch (error) {
      const uncertain = !!discountId || discountAttempted && !(error instanceof DiscountRejectedError);
      await repository.markPublicationFailure(session.handle, id, uncertain, 'publish');
      if (uncertain) throw new Error(`Publication needs reconciliation before retry: ${(error as Error).message}`);
      throw error;
    }
  });
}

export async function pauseCampaign(repository: CampaignRepository, session: Session, id: string, expectedRevision: number, dependencies: PauseDependencies = {}): Promise<Campaign> {
  const functionId = configured(dependencies.functionId || '', 'SHOPLINE Product Discount Function ID');
  return repository.withShopPublicationLock(session.handle, async () => {
    const campaign = await repository.beginPublication(session.handle, id, expectedRevision, 'pause');
    const publication = await repository.getPublication(session.handle, id);
    if (!publication.discountId) throw new Error('Published discount ID is missing; pause needs reconciliation.');
    let removed = false;
    try {
      await (dependencies.remove || deleteAutomaticDiscount)(session, publication.discountId, undefined, dependencies.requestId, functionId);
      removed = true;
      if (campaign.scope.kind === 'collections') {
        const collection = dependencies.collection || {};
        const storeId = await (collection.storeId || (async (shopSession: Session) => (await fetchShopIdentity(shopSession.handle, shopSession.accessToken)).storeId))(session);
        const required = await repository.listRequiredCollectionIds(session.handle, id);
        const write = collection.write || ((shopSession: Session, shopId: string, ids: string[], requestId?: string) => writeCollectionVariables(shopSession, shopId, ids, undefined, requestId));
        await write(session, storeId, required, dependencies.requestId);
      }
      return await repository.finishPublication(session.handle, id, expectedRevision, 'pause', null);
    } catch (error) {
      const uncertain = removed || !(error instanceof DiscountRejectedError);
      await repository.markPublicationFailure(session.handle, id, uncertain, 'pause');
      if (uncertain) throw new Error(`Pause needs reconciliation before retry: ${(error as Error).message}`);
      throw error;
    }
  });
}
