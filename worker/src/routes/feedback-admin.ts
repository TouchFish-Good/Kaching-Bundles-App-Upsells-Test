import type { Context, Hono } from 'hono';

import type { AuthContext } from '../auth/session';
import { authorizeInternalRequest } from '../auth/internal-request';
import { D1FeedbackRepository } from '../db/feedback';
import { FeedbackValidationError, isFeedbackStatus } from '../domain/feedback';
import { currentTime, type Env } from '../env';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type AdminContext = Context<{ Bindings: Env; Variables: { auth: AuthContext } }>;

export function registerFeedbackAdminRoutes(app: App): void {
  app.patch('/internal/admin/v1/feedback/:id/status', async (c: AdminContext) => {
    if (!(await authorizeInternalRequest(c.req.raw, c.env))) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const id = c.req.param('id');
    if (!id || !/^[A-Za-z0-9-]{1,128}$/.test(id)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    try {
      const body = await c.req.json<Record<string, unknown>>();
      if (!isFeedbackStatus(body.status)) return c.json({ error: { code: 'INVALID_STATUS' } }, 422);
      if (body.hideFromMerchants !== undefined && typeof body.hideFromMerchants !== 'boolean') return c.json({ error: { code: 'INVALID_DISPLAY_MODE' } }, 422);
      if (body.hideFromMerchants === true && body.status !== 'rejected') return c.json({ error: { code: 'INVALID_DISPLAY_MODE' } }, 422);
      const feedback = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).updateStatus({ requestId: id, status: body.status, hideFromMerchants: body.hideFromMerchants, note: body.note });
      return feedback ? c.json({ data: { feedback } }) : c.json({ error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      if (error instanceof FeedbackValidationError) return c.json({ error: { code: 'INVALID_STATUS_NOTE' } }, 422);
      return c.json({ error: { code: 'SOURCE_UNAVAILABLE' } }, 503);
    }
  });

  app.post('/internal/admin/v1/feedback/:id/replies', async (c: AdminContext) => {
    if (!(await authorizeInternalRequest(c.req.raw, c.env))) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const id = c.req.param('id');
    if (!id || !/^[A-Za-z0-9-]{1,128}$/.test(id)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const reply = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).createOfficialReply(id, body.content);
      return reply ? c.json({ data: { reply } }, 201) : c.json({ error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      if (error instanceof FeedbackValidationError) return c.json({ error: { code: 'INVALID_REPLY' } }, 422);
      return c.json({ error: { code: 'SOURCE_UNAVAILABLE' } }, 503);
    }
  });

  app.delete('/internal/admin/v1/feedback/:id/comments/:commentId', async (c: AdminContext) => {
    if (!(await authorizeInternalRequest(c.req.raw, c.env))) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    const id = c.req.param('id');
    const commentId = c.req.param('commentId');
    if (!id || !commentId || !/^[A-Za-z0-9-]{1,128}$/.test(id) || !/^[A-Za-z0-9-]{1,128}$/.test(commentId)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    try {
      const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
      if (!body || Array.isArray(body)) return c.json({ error: { code: 'INVALID_DELETE_REASON' } }, 422);
      const deleted = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).deleteComment({ requestId: id, commentId, reason: body.reason });
      return deleted ? c.json({ data: { commentId, deleted: true } }) : c.json({ error: { code: 'NOT_FOUND' } }, 404);
    } catch (error) {
      if (error instanceof FeedbackValidationError) return c.json({ error: { code: 'INVALID_DELETE_REASON' } }, 422);
      return c.json({ error: { code: 'SOURCE_UNAVAILABLE' } }, 503);
    }
  });
}
