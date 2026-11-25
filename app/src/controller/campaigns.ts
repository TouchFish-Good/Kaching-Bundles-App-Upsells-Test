import type { Request, Response } from 'express';
import type { CampaignRepository } from '../service/campaign/repository';
import { CampaignConflictError, CampaignValidationError } from '../service/campaign/repository';
import type { CampaignDraft } from '../service/campaign/model';
import { buildDiscountRule, createAutomaticDiscount, deleteAutomaticDiscount, updateAutomaticDiscount, DiscountRejectedError } from '../service/campaign/discount-adapter';
import { pauseCampaign, publishCampaign } from '../service/campaign/publish';
import type { CollectionDependencies } from '../service/campaign/publish';
import { loadMarkets } from '../service/markets';
import { verifyCampaignProducts } from '../service/campaign/product-catalog';
import { validateCampaign } from '../service/campaign/validate';
import { resolveCollectionMembers } from '../service/campaign/collection-members';
import { refreshPublishedCollectionConflicts } from '../service/campaign/collection-conflicts';

type CampaignStore = CampaignRepository;
const DEFAULT_PRODUCT_DISCOUNT_FUNCTION_ID = '754292a155d740809a5437a3f8c59231';
type PublicationDependencies = {
  publicationEnabled?: boolean;
  functionId?: string;
  getShopCurrencyCode?: (handle: string, accessToken: string) => Promise<string>;
  createDiscount?: typeof createAutomaticDiscount;
  updateDiscount?: typeof updateAutomaticDiscount;
  deleteDiscount?: typeof deleteAutomaticDiscount;
  verifyProducts?: typeof verifyCampaignProducts;
  collection?: CollectionDependencies;
};

export function createCampaignsController(repository: CampaignStore, dependencies: PublicationDependencies = {}) {
  return async (request: Request, response: Response) => {
    const session = response.locals.shopline?.session;
    if (!session?.handle || !session?.accessToken) {
      response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
      return;
    }
    const requestId = response.locals.quantityBreaksRequestId as string | undefined;
    let phase = 'request';
    try {
      const shop = session.handle;
      const id = request.params.id;
      if (request.method === 'GET') {
        const withPublication = async (campaign: Awaited<ReturnType<typeof repository.get>>) => {
          if (!campaign) return undefined;
          const withConflict = campaign.scope.kind === 'collections'
            ? { ...campaign, collectionConflict: await repository.getCollectionConflict(shop, campaign.id) }
            : campaign;
          const publication = await repository.getPublication(shop, campaign.id);
          return publication.discountId ? { ...withConflict, platformDiscountId: publication.discountId } : withConflict;
        };
        if (id) {
          const campaign = await withPublication(await repository.get(shop, id));
          response.status(campaign ? 200 : 404).json(campaign ? { campaign } : { error: 'Campaign not found.' });
        } else response.json({ campaigns: await Promise.all((await repository.list(shop)).map((campaign) => withPublication(campaign))) });
        return;
      }
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      if (!body || typeof body !== 'object') throw new CampaignValidationError('JSON body is required.');
      if (request.method === 'POST' && request.path?.endsWith('/end')) {
        if (!id || !Number.isInteger(body.expectedRevision)) throw new CampaignValidationError('Campaign ID and expectedRevision are required.');
        const current = await repository.get(shop, id);
        if (!current) throw new CampaignConflictError('Campaign not found.');
        const publication = await repository.getPublication(shop, id);
        const ended = current.status === 'active' && publication.state === 'active' && publication.discountId
          ? await pauseCampaign(repository, session, id, body.expectedRevision, { functionId: dependencies.functionId ?? process.env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID ?? DEFAULT_PRODUCT_DISCOUNT_FUNCTION_ID, remove: dependencies.deleteDiscount, collection: dependencies.collection, requestId }).then((paused) => repository.end(shop, id, paused.revision))
          : await repository.end(shop, id, body.expectedRevision);
        response.status(200).json({ campaign: ended });
        return;
      }
      if (request.method === 'POST' && request.path?.endsWith('/status')) {
        if (!id || !Number.isInteger(body.expectedRevision) || !['active', 'paused'].includes(body.status)) throw new CampaignValidationError('Campaign ID, expectedRevision, and active or paused status are required.');
        const publicationSetting = process.env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED;
        if (body.status === 'active' && !(dependencies.publicationEnabled ?? publicationSetting !== 'false')) {
          response.status(409).json({ error: 'SHOPLINE Quantity Breaks publication is disabled on this server.' });
          return;
        }
        if (body.status === 'active') {
          const candidate = await repository.get(shop, id);
          if (!candidate) throw new CampaignConflictError('Campaign not found.');
          if (candidate.revision !== body.expectedRevision) throw new CampaignConflictError('Campaign revision is stale.');
          if (candidate.scope.kind === 'all') throw new CampaignConflictError('Only specified products or collections can be published.');
          if (candidate.scope.kind === 'products') {
            phase = 'product_verification';
            await (dependencies.verifyProducts || verifyCampaignProducts)(session, candidate.scope.productIds || []);
          }
        }
        let campaign;
        if (body.status === 'active') {
          phase = 'currency_lookup';
          if (requestId) console.info('Campaign publication trace', { requestId, stage: 'currency_lookup_start' });
          const shopCurrencyCode = await (dependencies.getShopCurrencyCode || (async (handle, token) => (await loadMarkets(handle, token, undefined, requestId)).shopCurrencyCode))(shop, session.accessToken);
          if (requestId) console.info('Campaign publication trace', { requestId, stage: 'currency_lookup_complete' });
          phase = 'publication';
          campaign = await publishCampaign(repository, session, id, body.expectedRevision, {
            functionId: dependencies.functionId ?? process.env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID ?? DEFAULT_PRODUCT_DISCOUNT_FUNCTION_ID,
            shopCurrencyCode,
            create: dependencies.createDiscount,
            collection: dependencies.collection,
            requestId,
          });
        } else {
          phase = 'pause';
          campaign = await pauseCampaign(repository, session, id, body.expectedRevision, {
            functionId: dependencies.functionId ?? process.env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID ?? DEFAULT_PRODUCT_DISCOUNT_FUNCTION_ID,
            remove: dependencies.deleteDiscount, collection: dependencies.collection, requestId,
          });
        }
        response.status(200).json({ campaign });
        return;
      }
      if (request.method === 'DELETE') {
        if (!id || !Number.isInteger(body.expectedRevision)) throw new CampaignValidationError('Campaign ID and expectedRevision are required.');
        const deleted = await repository.delete(shop, id, body.expectedRevision);
        response.status(deleted ? 200 : 404).json(deleted ? { deleted: true } : { error: 'Campaign not found.' });
        return;
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        const campaign = body.campaign as CampaignDraft;
        if (!campaign || (id && id !== campaign.id) || !Number.isInteger(body.expectedRevision)) throw new CampaignValidationError('Campaign and expectedRevision are required.');
        const current = await repository.get(shop, campaign.id);
        if (request.method === 'POST' && (current || body.expectedRevision !== 0)) throw new CampaignConflictError('New campaign requires a new ID and revision zero.');
        if (request.method === 'PUT' && !current) throw new CampaignConflictError('Campaign not found.');
        if (!current && campaign.status !== 'draft') throw new CampaignConflictError('New campaigns must be saved as Draft before publication.');
        if (current && current.revision !== body.expectedRevision) throw new CampaignConflictError('Campaign revision is stale.');
        const publication = current ? await repository.getPublication(shop, campaign.id) : { state: 'idle' as const, discountId: null };
        if (current && ['publishing', 'updating', 'unpublishing', 'needs_reconciliation'].includes(publication.state)) throw new CampaignConflictError('Publication needs reconciliation before editing.');
        const candidate: CampaignDraft = { ...campaign, status: current?.status ?? campaign.status,
          scope: campaign.scope.kind === 'collections' && current?.scope.kind === 'collections' && JSON.stringify(current.scope.collectionIds) === JSON.stringify(campaign.scope.collectionIds)
            ? { ...campaign.scope, resolvedProductIds: current.scope.resolvedProductIds } : campaign.scope };
        if (current && publication.discountId && publication.state === 'active' && (current.scope.kind === 'collections' || candidate.scope.kind === 'collections') && (current.scope.kind !== candidate.scope.kind || JSON.stringify(current.scope.collectionIds) !== JSON.stringify(candidate.scope.collectionIds))) throw new CampaignConflictError('Changing published collection scope requires a separate verified collection-variable update.');
        const errors = validateCampaign(candidate);
        if (errors.length) throw new CampaignValidationError(errors.join(' '));
        if (current && (current.status === 'active' || current.status === 'scheduled') && (!publication.discountId || publication.state !== 'active')) throw new CampaignConflictError('Published discount needs reconciliation before update.');
        if (current && publication.discountId && publication.state === 'active') {
          if (current.status === 'active' && (Date.parse(candidate.startsAt!) > Date.now() || candidate.endsAt && Date.parse(candidate.endsAt) <= Date.now())) throw new CampaignConflictError('Active campaign schedule must include the current time.');
          if (current.status === 'scheduled' && Date.parse(candidate.startsAt!) <= Date.now()) throw new CampaignConflictError('Scheduled campaign start must remain in the future.');
          const saved = await repository.withShopPublicationLock(shop, async (assertLockHeld) => {
            const latest = await repository.get(shop, campaign.id);
            const latestPublication = await repository.getPublication(shop, campaign.id);
            if (!latest || latest.revision !== body.expectedRevision || latestPublication.discountId !== publication.discountId || latestPublication.state !== 'active') throw new CampaignConflictError('Campaign changed before platform update.');
            if (candidate.scope.kind === 'products') await (dependencies.verifyProducts || verifyCampaignProducts)(session, candidate.scope.productIds || []);
            if (candidate.scope.kind === 'collections') {
              await refreshPublishedCollectionConflicts(repository, session, dependencies.collection?.resolve, requestId);
              const resolve = dependencies.collection?.resolve || ((shopSession: typeof session, ids: string[], trace?: string) => resolveCollectionMembers(shopSession, ids, undefined, trace));
              const members = await resolve(session, candidate.scope.collectionIds || [], requestId);
              if (!members.length) throw new CampaignConflictError('Collection membership verification found no current products.');
              candidate.scope = { ...candidate.scope, resolvedProductIds: members };
            }
            const shopCurrencyCode = await (dependencies.getShopCurrencyCode || (async (handle, token) => (await loadMarkets(handle, token, undefined, requestId)).shopCurrencyCode))(shop, session.accessToken);
            buildDiscountRule(candidate, shopCurrencyCode);
            await repository.beginUpdate(shop, candidate, body.expectedRevision, publication.discountId!);
            phase = 'platform_update';
            try {
              const confirmedId = await (dependencies.updateDiscount || updateAutomaticDiscount)(session, publication.discountId!, candidate, shopCurrencyCode, dependencies.functionId ?? process.env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID ?? DEFAULT_PRODUCT_DISCOUNT_FUNCTION_ID, undefined, requestId);
              if (confirmedId !== publication.discountId) throw new Error('SHOPLINE update returned a different discount ID; result is uncertain.');
              await assertLockHeld();
              return await repository.finishUpdate(shop, campaign.id, body.expectedRevision, publication.discountId!);
            } catch (error) {
              const uncertain = !(error instanceof DiscountRejectedError);
              await repository.markUpdateFailure(shop, campaign.id, uncertain);
              if (uncertain) throw new Error(`Update needs reconciliation before retry: ${(error as Error).message}`);
              throw error;
            }
          });
          response.status(200).json({ campaign: saved });
          return;
        }
        const saved = await repository.save(shop, candidate, body.expectedRevision);
        response.status(request.method === 'POST' ? 201 : 200).json({ campaign: saved });
        return;
      }
      response.status(405).json({ error: 'Method not allowed.' });
    } catch (error) {
      const message = (error as Error).message;
      if (requestId && request.method === 'POST' && request.path?.endsWith('/status')) {
        const upstreamStatus = /^(?:SHOPLINE Admin API \S+|SHOPLINE Admin GraphQL) returned (\d{3})\.$/.exec(message)?.[1];
        console.error('Campaign publication trace', { requestId, stage: 'failed', phase, ...(upstreamStatus ? { upstreamStatus: Number(upstreamStatus) } : {}) });
      }
      response.status(error instanceof SyntaxError || error instanceof CampaignValidationError ? 400 : error instanceof CampaignConflictError || /reconciliation/i.test(message) ? 409 : 502).json({ error: message });
    }
  };
}
