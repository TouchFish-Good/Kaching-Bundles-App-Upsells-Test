import type { Context, Hono } from 'hono';

import { requireShoplineSession, type AuthContext } from '../auth/session';
import { requireFeedbackRateLimit } from '../auth/rate-limit';
import { D1FeedbackRepository } from '../db/feedback';
import { D1SessionStore } from '../db/sessions';
import { type FeedbackStatus, isFeedbackStatus, FeedbackValidationError } from '../domain/feedback';
import { currentTime, type Env } from '../env';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type FeedbackContext = Context<{ Bindings: Env; Variables: { auth: AuthContext } }>;

function responseError(c: FeedbackContext, error: unknown): Response {
  if (error instanceof FeedbackValidationError) return c.json({ error: error.message }, 422);
  return c.json({ error: 'Feedback request could not be completed.' }, 500);
}


async function identity(c: FeedbackContext): Promise<{ storeId: string; handle: string } | Response> {
  const session = await requireShoplineSession(c.req.raw, c.env);
  if (session instanceof Response) return session;
  const store = await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).getActiveStoreIdentity(session.handle);
  return store ?? c.json({ error: 'Unauthorized' }, 401);
}

async function limited(c: FeedbackContext, storeId: string): Promise<Response | null> {
  return requireFeedbackRateLimit(c.env.DB, storeId, `${c.req.method}:${new URL(c.req.url).pathname}`, currentTime(c.env));
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9-]{1,128}$/.test(id);
}

export function registerFeedbackRoutes(app: App): void {
  app.get('/api/quantity-breaks/feedback', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    const status = c.req.query('status');
    const sort = c.req.query('sort');
    const mine = c.req.query('mine');
    const page = Number(c.req.query('page') ?? '1');
    const pageSize = Number(c.req.query('pageSize') ?? '9');
    const query = (c.req.query('query') ?? '').trim();
    if ((status && !isFeedbackStatus(status)) || (sort && sort !== 'newest' && sort !== 'votes') || (mine && mine !== '1') || !Number.isSafeInteger(page) || page < 1 || page > 100_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 30 || query.length > 100) return c.json({ error: 'Invalid feedback filters.' }, 422);
    const repository = new D1FeedbackRepository(c.env.DB, () => currentTime(c.env));
    const mineOnly = mine === '1';
    const [result, counts, ownCounts] = await Promise.all([
      repository.listForViewer(store.storeId, { status: status as FeedbackStatus | undefined, sort: sort as 'newest' | 'votes' | undefined, query: query || undefined, mine: mineOnly, page, pageSize }),
      repository.countForViewer(store.storeId, mineOnly),
      repository.countForViewer(store.storeId, true),
    ]);
    return c.json({ data: { items: result.items, counts, mineCount: ownCounts.all, page: result.page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) } });
  });

  app.post('/api/quantity-breaks/feedback', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const idempotencyKey = c.req.header('Idempotency-Key') ?? crypto.randomUUID();
      const feedback = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).createSuggestion({ storeId: store.storeId, handle: store.handle, isAnonymous: body.isAnonymous === true, title: body.title, content: body.content, idempotencyKey });
      return c.json({ data: { feedback } }, 201);
    } catch (error) { return responseError(c, error); }
  });

  app.get('/api/quantity-breaks/feedback/:id', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    const id = c.req.param('id');
    if (!validId(id)) return c.json({ error: 'Not found' }, 404);
    const feedback = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).readDetailForViewer(id, store.storeId);
    return feedback ? c.json({ data: { feedback } }) : c.json({ error: 'Not found' }, 404);
  });

  app.delete('/api/quantity-breaks/feedback/:id', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    const id = c.req.param('id');
    if (!validId(id)) return c.json({ error: 'Not found' }, 404);
    const withdrawn = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).withdrawSuggestion(id, store.storeId);
    return withdrawn ? c.json({ data: { withdrawn: true } }) : c.json({ error: 'Not found' }, 404);
  });

  app.post('/api/quantity-breaks/feedback/:id/vote', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    const id = c.req.param('id');
    if (!validId(id)) return c.json({ error: 'Not found' }, 404);
    const vote = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).toggleVote(id, store.storeId);
    return vote ? c.json({ data: { vote } }) : c.json({ error: 'Not found' }, 404);
  });

  app.post('/api/quantity-breaks/feedback/:id/comments', async (c) => {
    const store = await identity(c);
    if (store instanceof Response) return store;
    const denied = await limited(c, store.storeId);
    if (denied) return denied;
    const id = c.req.param('id');
    if (!validId(id)) return c.json({ error: 'Not found' }, 404);
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const comment = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).createComment({
        requestId: id,
        storeId: store.storeId,
        handle: store.handle,
        content: body.content,
        isAnonymous: body.isAnonymous === true,
      });
      if (!comment) return c.json({ error: 'Not found' }, 404);
      return c.json({ data: { comment } }, 201);
    } catch (error) {
      return responseError(c, error);
    }
  });
}
