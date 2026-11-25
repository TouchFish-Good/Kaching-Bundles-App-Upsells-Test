import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function quantityBreaksTrace(request: Request, response: Response, next: NextFunction) {
  if (request.path === '/store-languages') { next(); return; }
  const requestId = randomUUID();
  const startedAt = Date.now();
  let finished = false;
  response.locals.quantityBreaksRequestId = requestId;
  response.setHeader('X-Quantity-Breaks-Request-Id', requestId);
  console.info('Quantity Breaks API trace', { requestId, stage: 'ingress', method: request.method, endpoint: request.path });
  response.once('finish', () => {
    finished = true;
    console.info('Quantity Breaks API trace', { requestId, stage: 'completed', status: response.statusCode, durationMs: Date.now() - startedAt });
  });
  response.once('close', () => {
    if (!finished) console.warn('Quantity Breaks API trace', { requestId, stage: 'connection_closed', durationMs: Date.now() - startedAt });
  });
  next();
}
