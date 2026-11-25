import type { Request, Response } from 'express';
import { getCampaignProduct, getCampaignProducts, searchCampaignProducts } from '../service/campaign/product-catalog';
import { CampaignValidationError } from '../service/campaign/repository';

export async function campaignProductsController(request: Request, response: Response): Promise<void> {
  const session = response.locals.shopline?.session;
  if (!session?.handle || !session?.accessToken) {
    response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
    return;
  }
  const title = request.query.title;
  const pageInfo = request.query.page_info;
  const id = request.query.id;
  const ids = request.query.ids;
  const limit = request.query.limit;
  const requestId = response.locals.quantityBreaksRequestId as string | undefined;
  if ((title !== undefined && typeof title !== 'string') || (pageInfo !== undefined && typeof pageInfo !== 'string') || (id !== undefined && typeof id !== 'string') || (ids !== undefined && typeof ids !== 'string') || (limit !== undefined && typeof limit !== 'string')) {
    response.status(400).json({ error: 'Invalid product search parameters.' });
    return;
  }
  if (typeof id === 'string' && typeof ids === 'string') {
    response.status(400).json({ error: 'Use either id or ids, not both.' });
    return;
  }
  if (typeof ids === 'string' && (title !== undefined || pageInfo !== undefined || limit !== undefined)) {
    response.status(400).json({ error: 'ids cannot be combined with search parameters.' });
    return;
  }
  try {
    if (typeof ids === 'string') {
      const requested = ids.split(',').map((value) => value.trim());
      if (!requested.length || requested.length > 500 || requested.length !== new Set(requested).size || requested.some((value) => !/^[A-Za-z0-9_-]{1,64}$/.test(value))) {
        response.status(400).json({ error: 'Invalid product ids.' });
        return;
      }
      response.json(await getCampaignProducts(session, requested, undefined, requestId));
      return;
    }
    response.json(typeof id === 'string' ? { product: await getCampaignProduct(session, id, undefined, requestId) } : await searchCampaignProducts(session, typeof title === 'string' ? title : '', typeof pageInfo === 'string' ? pageInfo : undefined, undefined, requestId, limit === undefined ? 50 : Number(limit)));
  } catch (error) {
    response.status(error instanceof CampaignValidationError ? 400 : 502).json({ error: (error as Error).message });
  }
}
