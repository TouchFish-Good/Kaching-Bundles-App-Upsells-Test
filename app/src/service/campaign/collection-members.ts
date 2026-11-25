import fetch from 'node-fetch';
import { searchCollectionProducts } from './collection-catalog';
import { CampaignValidationError } from './repository';

type Session = { handle: string; accessToken: string };
type Fetcher = typeof fetch;

export async function resolveCollectionMembers(session: Session, collectionIds: string[], fetcher: Fetcher = fetch, requestId?: string): Promise<string[]> {
  if (!Array.isArray(collectionIds) || !collectionIds.length || collectionIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
    throw new CampaignValidationError('Valid SHOPLINE collection IDs are required.');
  }
  const members = new Set<string>();
  for (const id of new Set(collectionIds)) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 1000; page++) {
      const result = await searchCollectionProducts(session, id, cursor, fetcher, requestId);
      for (const product of result.products) members.add(product.id);
      if (!result.nextPageInfo) break;
      if (seen.has(result.nextPageInfo) || page === 999) throw new Error('SHOPLINE collection pagination did not finish.');
      seen.add(result.nextPageInfo);
      cursor = result.nextPageInfo;
    }
  }
  return [...members].sort();
}
