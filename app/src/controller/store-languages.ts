import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { loadStoreLanguages } from '../service/store-languages';

export function storeLanguagesTrace(request: Request, response: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let finished = false;
  response.locals.storeLanguagesRequestId = requestId;
  response.setHeader('X-Quantity-Breaks-Request-Id', requestId);
  console.info('Store languages trace', { requestId, stage: 'ingress', method: request.method });
  response.once('finish', () => {
    finished = true;
    console.info('Store languages trace', { requestId, stage: 'completed', status: response.statusCode, durationMs: Date.now() - startedAt });
  });
  response.once('close', () => {
    if (!finished) console.warn('Store languages trace', { requestId, stage: 'connection_closed', durationMs: Date.now() - startedAt });
  });
  next();
}

export async function storeLanguagesController(_request: Request, response: Response) {
  const requestId = response.locals.storeLanguagesRequestId as string | undefined;
  const session = response.locals.shopline?.session;
  if (!session?.handle || !session?.accessToken) {
    if (requestId) console.warn('Store languages trace', { requestId, stage: 'session_unavailable' });
    response.status(401).json({ error: 'Authenticated SHOPLINE session is required.' });
    return;
  }
  if (requestId) console.info('Store languages trace', { requestId, stage: 'authenticated' });
  try {
    const data = await loadStoreLanguages(session.handle, session.accessToken, undefined, requestId);
    if (requestId) console.info('Store languages trace', { requestId, stage: 'validated', languageCount: data.languages.length });
    response.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown store language error.';
    if (requestId) console.error('Store languages trace', {
      requestId, stage: 'failed', failure: /^SHOPLINE languages API returned \d{3}\.$/.test(message) ? 'UPSTREAM_HTTP' : 'NETWORK_OR_INVALID_RESPONSE',
    });
    response.status(502).json({ error: message });
  }
}
