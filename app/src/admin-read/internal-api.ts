import express, { Request, Response } from 'express';
import { AdminRegistry } from './registry';
import { verifyRequest } from './signature';

function page(req: Request) {
  const limit = Number(req.query.limit || 25);
  const offset = Number(req.query.offset || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) return null;
  return { limit, offset };
}

export function createInternalRouter(registry: AdminRegistry, secret: string) {
  const router = express.Router();
  const seen = new Map<string, number>();
  router.use((req, res, next) => {
    const now = Date.now();
    for (const [nonce, at] of seen) if (now - at > 60000) seen.delete(nonce);
    const nonces = new Set(seen.keys());
    const nonce = req.header('x-admin-nonce') || '';
    const valid = verifyRequest(secret, req.method, req.originalUrl, {
      timestamp: req.header('x-admin-timestamp'), nonce, signature: req.header('x-admin-signature'),
    }, now, nonces);
    if (!valid) { res.status(401).json({ error: { code: 'UNAUTHORIZED' } }); return; }
    seen.set(nonce, now);
    next();
  });

  const wrap = (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) => handler(req, res).catch(() => res.status(503).json({ error: { code: 'SOURCE_UNAVAILABLE' } }));

  router.get('/overview', wrap(async (_req, res) => {
    const asOf = new Date().toISOString();
    const errors = await registry.listErrors({ limit: 1, offset: 0, from: new Date(Date.now() - 86400000).toISOString() });
    res.json({ data: {
      installedStoreCount: { value: await registry.countInstalled(), asOf, sourceStatus: 'current' },
      activeBundleCount: { value: null, asOf: null, sourceStatus: 'unavailable' },
      errorCount: { value: errors.total, asOf, sourceStatus: 'current' },
    } });
  }));

  router.get('/stores', wrap(async (req, res) => {
    const pagination = page(req);
    if (!pagination) { res.status(422).json({ error: { code: 'INVALID_PAGINATION' } }); return; }
    const status = String(req.query.status || 'all');
    if (!['all', 'installed', 'uninstalled'].includes(status)) { res.status(422).json({ error: { code: 'INVALID_STATUS' } }); return; }
    const query = String(req.query.query || '').trim();
    if (query.length > 100) { res.status(422).json({ error: { code: 'INVALID_QUERY' } }); return; }
    res.json({ data: await registry.listStores({ ...pagination, query, status }) });
  }));

  router.get('/stores/:storeId', wrap(async (req, res) => {
    const store = await registry.getStore(req.params.storeId);
    if (!store) { res.status(404).json({ error: { code: 'NOT_FOUND' } }); return; }
    res.json({ data: store });
  }));

  router.get('/stores/:storeId/bundles', wrap(async (req, res) => {
    const store = await registry.getStore(req.params.storeId);
    if (!store) { res.status(404).json({ error: { code: 'NOT_FOUND' } }); return; }
    res.status(503).json({ error: { code: 'SOURCE_UNAVAILABLE', source: 'bundles' } });
  }));

  router.get('/bundles', (_req, res) => res.status(503).json({ error: { code: 'SOURCE_UNAVAILABLE', source: 'bundles' } }));

  router.get('/events/errors', wrap(async (req, res) => {
    const pagination = page(req);
    if (!pagination) { res.status(422).json({ error: { code: 'INVALID_PAGINATION' } }); return; }
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    if ([from, to].some((value) => value && Number.isNaN(Date.parse(value)))) {
      res.status(422).json({ error: { code: 'INVALID_DATE' } }); return;
    }
    res.json({ data: await registry.listErrors({ ...pagination, storeId, from, to }) });
  }));

  return router;
}
