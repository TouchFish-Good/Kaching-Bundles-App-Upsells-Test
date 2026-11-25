import type { Request, Response } from 'express';
import { getCampaignCollection, searchCampaignCollections, searchCollectionProducts } from '../service/campaign/collection-catalog';
import { CampaignValidationError } from '../service/campaign/repository';

export async function campaignCollectionsController(request: Request, response: Response): Promise<void> {
  const session = response.locals.shopline?.session;
  if (!session?.handle || !session?.accessToken) {
    response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
    return;
  }
  const requestId = response.locals.quantityBreaksRequestId as string | undefined;
  const { id } = request.params;
  const title = request.query.title;
  const pageInfo = request.query.page_info;
  const kind = request.query.kind;
  if ((title !== undefined && typeof title !== 'string') || (pageInfo !== undefined && typeof pageInfo !== 'string') || (!id && kind !== 'manual' && kind !== 'smart')) {
    response.status(400).json({ error: 'Invalid collection search parameters.' });
    return;
  }
  try {
    if (id && request.path.endsWith('/products')) response.json(await searchCollectionProducts(session, id, pageInfo as string | undefined, undefined, requestId));
    else if (id) response.json({ collection: await getCampaignCollection(session, id, undefined, requestId) });
    else response.json(await searchCampaignCollections(session, kind as 'manual' | 'smart', title as string | undefined, pageInfo as string | undefined, undefined, requestId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SHOPLINE collection request failed.';
    const status = error instanceof CampaignValidationError ? 400 : /returned 403/.test(message) ? 403 : 502;
    response.status(status).json({ error: message });
  }
}
