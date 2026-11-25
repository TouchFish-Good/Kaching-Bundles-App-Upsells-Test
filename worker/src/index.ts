import { Hono } from 'hono';
import { beginOAuth, beginOAuthFromAppEntry, finishOAuth } from './auth/oauth';
import { verifyWebhook } from './auth/webhook';
import { D1SessionStore } from './db/sessions';
import { recordAdminError } from './db/admin-diagnostics';
import { D1ApplicationRequestEvents } from './db/application-request-events';
import { D1CampaignDiagnostics } from './db/campaign-diagnostics';
import type { Env } from './env';
import type { AuthContext } from './auth/session';
import { registerCampaignRoutes } from './routes/campaigns';
import { registerStorefrontRoutes } from './routes/storefront';
import { registerTranslationRoutes } from './routes/translations';
import { registerCatalogRoutes } from './routes/catalog';
import { registerInternalAdminRoutes } from './routes/internal-admin';
import { registerFeedbackRoutes } from './routes/feedback';
import { registerFeedbackAdminRoutes } from './routes/feedback-admin';
import { refreshCollectionConflicts } from './jobs/collection-conflicts';
import { D1SubscriptionRepository } from './db/subscriptions';
import { registerSubscriptionRoutes } from './routes/subscription';
import { registerBootstrapRoutes } from './routes/bootstrap';
import { processSubscriptionOperations } from './jobs/subscription-operations';
import { reconcileSubscriptionsDaily } from './jobs/subscription-reconciliation';
import { refreshSubscriptionSnapshots } from './jobs/subscription-snapshots';
import { processCampaignOperations } from './jobs/campaign-operations';
import { processGdprDeletionTasks } from './jobs/gdpr-deletion-tasks';
import { registerObservabilityRoutes } from './routes/observability';
import { registerGdprRoutes } from './routes/gdpr';
import { traceIdFromRequest, withTraceHeaders } from './observability/trace';

export const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();

app.use('*', async (c, next) => {
  const startedAt = c.env.now?.() ?? Date.now();
  const traceId = traceIdFromRequest(c.req.raw);
  let failure: unknown;
  try { await next(); }
  catch (error) { failure = error; c.res = c.json({ error: 'Internal server error' }, 500); }
  const response = withTraceHeaders(c.res, traceId);
  c.res = response;
  const url = new URL(c.req.url);
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/observability/errors') return;
  const events = new D1ApplicationRequestEvents(c.env.DB, () => c.env.now?.() ?? Date.now());
  const durationMs = Math.max(0, (c.env.now?.() ?? Date.now()) - startedAt);
  const recordDiagnostics = async () => {
    try {
    const session = c.get('auth');
    const store = session ? await c.env.DB.prepare(`SELECT COALESCE(
      (SELECT store_id FROM shopline_sessions WHERE handle = ? AND installed = 1),
      (SELECT store_id FROM admin_stores WHERE handle = ? AND status = 'installed')
    ) AS store_id`).bind(session.handle, session.handle).first<{ store_id: string | null }>() : null;
    await events.recordRequest({ traceId, route: url.pathname, method: c.req.method, httpStatus: response.status, durationMs, shopHandle: session?.handle, storeId: store?.store_id ?? undefined });
    if (failure || response.status >= 500) await events.recordError({
      source: 'worker', operation: failure ? 'worker_exception' : 'worker_http_failure', code: failure ? 'UNHANDLED_EXCEPTION' : `HTTP_${response.status}`,
      severity: 'error', traceId, route: url.pathname, method: c.req.method, httpStatus: response.status,
      message: failure instanceof Error ? failure.message : undefined,
    });
    } catch { /* Observability must not alter the application response. */ }
  };
  // Request summaries and errors keep their existing scope and retention, but
  // diagnostic D1 writes must not hold up the merchant's response.
  let execution: Pick<ExecutionContext, 'waitUntil'> | undefined;
  try { execution = c.executionCtx; } catch { /* Direct Hono invocations have no Worker context. */ }
  const diagnostics = recordDiagnostics();
  if (execution) execution.waitUntil(diagnostics);
  else await diagnostics;
});

app.get('/health', (c) => c.json({ ok: true, service: 'shopline-quantity-breaks' }));
app.get('/api/auth', (c) => beginOAuth(c.req.raw, c.env));
app.get('/api/auth/callback', (c) => finishOAuth(c.req.raw, c.env));
app.get('/api/auth/callback/', (c) => finishOAuth(c.req.raw, c.env));
app.post('/api/webhooks', async (c) => {
  try {
    const webhook = await verifyWebhook(c.req.raw, c.env);
    const payload = webhook.body as { operate?: unknown; store_id?: unknown; timestamp?: unknown };
    if (webhook.topic === 'apps/installed_uninstalled' && payload.operate === 'UNINSTALL') {
      const storeId = String(payload.store_id ?? '');
      const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Number(payload.timestamp);
      if (!/^\d+$/.test(storeId) || !Number.isFinite(timestamp)) throw new Error('Invalid uninstall event');
      await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).recordUninstalled({
        handle: webhook.handle, storeId, webhookId: webhook.webhookId, topic: webhook.topic, occurredAt: new Date(timestamp).toISOString(),
      });
    } else if (['appsubscription/create', 'appsubscription/expiration', 'appsubscription/paid'].includes(webhook.topic)) {
      const appKey = typeof (webhook.body as { appkey?: unknown }).appkey === 'string' ? (webhook.body as { appkey: string }).appkey : '';
      if (appKey !== c.env.SHOPLINE_APP_KEY) throw new Error('Invalid subscription webhook app key');
      const installed = await c.env.DB.prepare('SELECT handle FROM shopline_sessions WHERE handle = ? AND installed = 1').bind(webhook.handle).first<{ handle: string }>();
      if (!installed) throw new Error('Subscription webhook shop is not installed');
      const event = await c.env.DB.prepare(`INSERT INTO webhook_events (webhook_id, shop_handle, topic, received_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(webhook_id) DO NOTHING`)
        .bind(webhook.webhookId, webhook.handle, webhook.topic, new Date().toISOString()).run();
      if ((event.meta.changes ?? 0) !== 1) return c.json({ ok: true, duplicate: true });
      const body = webhook.body as Record<string, unknown>;
      const outTradeNo = typeof body.out_trade_no === 'string' ? body.out_trade_no : typeof body.outTradeNo === 'string' ? body.outTradeNo : typeof body.order_no === 'string' ? body.order_no : null;
      const subscriptionId = typeof body.sub_id === 'string' ? body.sub_id : typeof body.subscription_id === 'string' ? body.subscription_id : null;
      if (outTradeNo) {
        const status = typeof body.status === 'string' ? body.status : webhook.topic.endsWith('/paid') ? 'paid' : webhook.topic.endsWith('/expiration') ? 'expired' : 'pending';
        const repository = new D1SubscriptionRepository(c.env.DB);
        const order = await repository.readOrder(outTradeNo);
        if (order && order.appKey === c.env.SHOPLINE_APP_KEY && order.handle === webhook.handle) await repository.updateOrderStatus(outTradeNo, status, subscriptionId);
      }
      const operationKey = `subscription-reconcile:${c.env.SHOPLINE_APP_KEY}:${webhook.handle}:${webhook.webhookId}`;
      await new D1SubscriptionRepository(c.env.DB).enqueueReconcileOnce({
        operationKey,
        appKey: c.env.SHOPLINE_APP_KEY,
        handle: webhook.handle,
        nextAttemptAt: Date.now(),
      });
      c.executionCtx.waitUntil((async () => {
        await processSubscriptionOperations(c.env, undefined, {
          operationKey,
          handle: webhook.handle,
          subscriptionId,
          paymentPending: webhook.topic.endsWith('/create') || webhook.topic.endsWith('/paid'),
          sourceEventId: operationKey,
        });
        await processSubscriptionOperations(c.env);
      })());
    } else {
      await c.env.DB.prepare(`INSERT INTO webhook_events (webhook_id, shop_handle, topic, received_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(webhook_id) DO NOTHING`)
        .bind(webhook.webhookId, webhook.handle, webhook.topic, new Date().toISOString()).run();
    }
    return c.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook.';
    try { await recordAdminError(c.env.DB, { kind: 'webhook', code: 'WEBHOOK_PROCESSING_FAILED', at: new Date().toISOString() }); }
    catch { /* Diagnostics must never alter the signed webhook response. */ }
    return c.json({ error: message }, /signature|hmac/i.test(message) ? 401 : 400);
  }
});

registerGdprRoutes(app);

registerCampaignRoutes(app);
registerTranslationRoutes(app);
registerStorefrontRoutes(app);
registerCatalogRoutes(app);
registerFeedbackRoutes(app);
registerInternalAdminRoutes(app);
registerFeedbackAdminRoutes(app);
registerSubscriptionRoutes(app);
registerBootstrapRoutes(app);
registerObservabilityRoutes(app);

app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  // An expired asset URL must never turn into an OAuth/SPA HTML response.
  if (pathname.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(pathname)) {
    const asset = await c.env.ASSETS?.fetch(c.req.raw);
    if (!asset || asset.status === 404 || (asset.status >= 300 && asset.status < 400)
      || asset.headers.get('Content-Type')?.includes('text/html')) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return asset;
  }
  const oauthRedirect = await beginOAuthFromAppEntry(c.req.raw, c.env);
  if (oauthRedirect) return oauthRedirect;
  if (!c.env.ASSETS) return new Response('<!doctype html><html><body></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  const page = asset.ok ? asset : await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw));
  if (page.status === 404) return new Response('Not found', { status: 404 });
  const response = new Response(page.body, page);
  if (response.headers.get('Content-Type')?.includes('text/html')) response.headers.set('Cache-Control', 'no-store');
  return response;
});

const worker = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  async scheduled(event: ScheduledController, env: Env) {
    const now = env.now?.() ?? Date.now();
    if (event.cron !== '0 3 * * *') {
      // Bounded maintenance runs off the request path, before other jobs need writes.
      try {
        const subscriptions = new D1SubscriptionRepository(env.DB, () => now);
        const history = await subscriptions.purgeOperationHistory(now);
        const recovered = await subscriptions.recoverStalledOperations(now);
        if (history.deleted || history.compacted || recovered) {
          console.info(JSON.stringify({ event: 'subscription_operation_maintenance', ...history, recovered }));
        }
      } catch (error) {
        console.error(JSON.stringify({
          event: 'subscription_operation_maintenance_failed',
          code: error instanceof Error && error.message.includes('Exceeded maximum DB size') ? 'D1_STORAGE_FULL' : 'D1_MAINTENANCE_FAILED',
        }));
      }
      await new D1CampaignDiagnostics(env.DB, () => now).purgeExpired(now);
      await new D1ApplicationRequestEvents(env.DB, () => now).purgeExpired(now);
      await processGdprDeletionTasks(env, now);
      await processSubscriptionOperations(env, now);
      await processCampaignOperations(env, now);
      try { await refreshSubscriptionSnapshots(env, now); }
      catch { console.error(JSON.stringify({ event: 'subscription_display_refresh_failed' })); }
      return;
    }
    await refreshCollectionConflicts(env);
    await reconcileSubscriptionsDaily(env, now);
    await processSubscriptionOperations(env, now);
    await processCampaignOperations(env, now);
  },
} satisfies ExportedHandler<Env>;

export default worker;
