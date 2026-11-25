import type { Context, Hono } from 'hono';
import type { AuthContext } from '../auth/session';
import { GdprWebhookError, verifyGdprWebhook } from '../auth/gdpr-webhook';
import { D1GdprDeletionTasks } from '../db/gdpr-deletion-tasks';
import type { Env } from '../env';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type GdprContext = Context<{ Bindings: Env; Variables: { auth: AuthContext } }>;

export function registerGdprRoutes(app: App): void {
  const receive = (topic: 'customers/redact' | 'merchants/redact') => async (context: GdprContext) => {
    try {
      const event = await verifyGdprWebhook(context.req.raw, context.env, topic);
      await new D1GdprDeletionTasks(context.env.DB, context.env.now).createVerified({ ...event, receivedAt: context.env.now?.() ?? Date.now() });
      return new Response(null, { status: 200 });
    } catch (error) {
      return context.json({ error: { code: error instanceof GdprWebhookError ? error.code : 'INVALID_WEBHOOK' } }, error instanceof GdprWebhookError && error.code === 'INVALID_SIGNATURE' ? 401 : 400);
    }
  };
  app.post('/api/webhooks/gdpr/customers-redact', receive('customers/redact'));
  app.post('/api/webhooks/gdpr/merchants-redact', receive('merchants/redact'));
}
