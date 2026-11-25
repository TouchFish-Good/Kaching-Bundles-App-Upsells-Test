import type { Request, Response } from 'express';
import { loadMarkets } from '../service/markets';

export async function marketsController(_request: Request, response: Response) {
  const session = response.locals.shopline?.session;
  if (!session?.handle || !session?.accessToken) {
    response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
    return;
  }
  try {
    response.json(await loadMarkets(session.handle, session.accessToken, undefined, response.locals.quantityBreaksRequestId));
  } catch (error) {
    response.status(502).json({ error: (error as Error).message });
  }
}
