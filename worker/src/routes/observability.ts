import type { Context, Hono } from 'hono';
import { requireShoplineSession, type AuthContext } from '../auth/session';
import { D1ApplicationRequestEvents } from '../db/application-request-events';
import type { Env } from '../env';
import { traceIdFromRequest } from '../observability/trace';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type Report = { type: 'runtime' | 'unhandled_rejection' | 'request_failure'; pagePath: string; requestPath?: string; requestMethod?: string; status?: number; code?: string; message?: string; relatedTraceId?: string };

function report(value: unknown): Report | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!['runtime', 'unhandled_rejection', 'request_failure'].includes(String(input.type)) || typeof input.pagePath !== 'string' || input.pagePath.length > 200) return null;
  if (typeof input.requestPath === 'string' && input.requestPath.length > 200) return null;
  if (typeof input.requestMethod === 'string' && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(input.requestMethod)) return null;
  if (input.status !== undefined && (!Number.isInteger(input.status) || (input.status as number) < 100 || (input.status as number) > 599)) return null;
  if (typeof input.code === 'string' && input.code.length > 80) return null;
  if (typeof input.message === 'string' && input.message.length > 500) return null;
  return input as Report;
}

export function registerObservabilityRoutes(app: App): void {
  app.post('/api/observability/errors', async (c: Context<{ Bindings: Env; Variables: { auth: AuthContext } }>) => {
    const session = await requireShoplineSession(c.req.raw, c.env);
    if (session instanceof Response) return session;
    c.set('auth', session);
    const raw = await c.req.text();
    if (raw.length > 2048) return c.json({ error: 'Invalid report' }, 422);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return c.json({ error: 'Invalid report' }, 422); }
    const input = report(value);
    if (!input) return c.json({ error: 'Invalid report' }, 422);
    const store = await c.env.DB.prepare("SELECT store_id FROM admin_stores WHERE handle = ? AND status = 'installed'").bind(session.handle).first<{ store_id: string }>();
    if (!store) return c.json({ error: 'Unauthorized' }, 401);
    try {
      await new D1ApplicationRequestEvents(c.env.DB, () => c.env.now?.() ?? Date.now()).recordError({
        source: 'browser', operation: input.type, code: input.code ?? input.type.toUpperCase(), severity: 'error', traceId: traceIdFromRequest(c.req.raw), storeId: store.store_id,
        route: input.requestPath ?? input.pagePath, method: input.requestMethod, httpStatus: input.status, message: input.message, relatedTraceId: input.relatedTraceId,
      });
    } catch { /* Browser error reporting is best effort. */ }
    return new Response(null, { status: 204 });
  });
}
