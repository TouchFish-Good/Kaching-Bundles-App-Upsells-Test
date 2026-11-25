import type { Context, Hono } from 'hono';
import { requireShoplineSession, type AuthContext } from '../auth/session';
import type { Env } from '../env';
import { D1SubscriptionRepository, type Entitlement } from '../db/subscriptions';
import { PartnerSubscriptionClient, selectUltraMonthlyUsdSku, PartnerSubscriptionError } from '../services/subscriptions';
import { hasSubscriptionAccess } from './subscription-access';
import { processSubscriptionOperations } from '../jobs/subscription-operations';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
function partner(env: Env): PartnerSubscriptionClient {
  return new PartnerSubscriptionClient(env.SHOPLINE_PARTNER_ACCESS_TOKEN);
}
async function auth(c: Context<{ Bindings: Env; Variables: { auth: AuthContext } }>): Promise<AuthContext | Response> {
  const session = await requireShoplineSession(c.req.raw, c.env);
  if (!(session instanceof Response)) c.set('auth', session);
  return session;
}
function plan() {
  return { spuKey: 'ultra', currency: 'USD', price: 9.99, periodDays: 30, label: 'USD 9.99 / month (every 30 days)' };
}

export function subscriptionResponse(entitlement: Entitlement | null) {
  const access = hasSubscriptionAccess(entitlement);
  return {
    entitlement: entitlement ? {
      state: entitlement.state, featureKeys: entitlement.featureKeys, activeSubscriptionId: entitlement.activeSubscriptionId,
      activeSpuKey: entitlement.activeSpuKey, validFrom: entitlement.validFrom, validUntil: entitlement.validUntil,
      nextValidFrom: entitlement.nextValidFrom, nextValidUntil: entitlement.nextValidUntil,
      nextDisplayFrom: entitlement.nextDisplayFrom ?? null, nextDisplayUntil: entitlement.nextDisplayUntil ?? null,
      graceUntil: entitlement.graceUntil, autoRecurring: entitlement.autoRecurring, absenceConfirmations: entitlement.absenceConfirmations,
      lastVerifiedAt: entitlement.lastVerifiedAt, version: entitlement.version,
    } : null,
    access, planPageRequired: !access, plan: plan(),
  };
}

export async function scheduleSubscriptionReconciliation(c: Context<{ Bindings: Env; Variables: { auth: AuthContext } }>, handle: string): Promise<void> {
  const repository = new D1SubscriptionRepository(c.env.DB);
  const now = c.env.now?.() ?? Date.now();
  const operationKey = `subscription-read:${c.env.SHOPLINE_APP_KEY}:${handle}:${Math.floor(now / 5_000)}`;
  try {
    await repository.enqueueReconcileOnce({ operationKey, appKey: c.env.SHOPLINE_APP_KEY, handle, nextAttemptAt: now });
    c.executionCtx.waitUntil(processSubscriptionOperations(c.env, now, { operationKey, handle, sourceEventId: operationKey }));
  } catch { /* Cached entitlement remains usable when reconciliation cannot be queued. */ }
}

function outTradeNo(handle: string): string {
  return `qb-${handle}-${Date.now().toString(36)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function returnUrl(c: Context, trade: string, handle: string): string {
  const configured = c.env.SHOPLINE_APP_URL?.trim();
  const origin = configured || new URL(c.req.url).origin;
  const url = new URL('/api/quantity-breaks/subscription/callback', origin);
  url.searchParams.set('redirect', '1');
  url.searchParams.set('out_trade_no', trade);
  // Restore the verified embedded app context after the native payment page returns.
  url.searchParams.set('appkey', c.env.SHOPLINE_APP_KEY);
  url.searchParams.set('handle', handle);
  url.searchParams.set('shop', handle);
  url.searchParams.set('host', `${handle}.myshopline.com`);
  url.searchParams.set('embedded', '1');
  url.searchParams.set('isFromAppListPage', '1');
  return url.toString();
}

function statusIsPaid(status: string): boolean {
  return ['paid', 'success', 'successful', '200', 'completed'].includes(status.trim().toLowerCase());
}

type CheckoutStage = 'sku_lookup' | 'sku_selection' | 'order_persist' | 'payment_link';
async function rejectTrialCheckout(c: Context): Promise<Response | null> {
  if (!c.req.header('Content-Type')?.includes('application/json')) return null;
  const body = await c.req.json<unknown>().catch(() => null);
  if (body && typeof body === 'object' && (body as { intent?: unknown }).intent === 'trial') {
    return c.json({ error: 'Trials are started from the SHOPLINE native subscription page.', code: 'TRIAL_NOT_SUPPORTED' }, 400);
  }
  return null;
}

function checkoutFailure(stage: CheckoutStage): string {
  return ({
    sku_lookup: 'SKU_LOOKUP_FAILED',
    sku_selection: 'ULTRA_SKU_INVALID',
    order_persist: 'ORDER_PERSIST_FAILED',
    payment_link: 'PAYMENT_LINK_FAILED',
  })[stage];
}

export function registerSubscriptionRoutes(app: App): void {
  app.get('/api/quantity-breaks/subscription', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const repository = new D1SubscriptionRepository(c.env.DB);
    const entitlement = await repository.readEntitlement(c.env.SHOPLINE_APP_KEY, session.handle);
    await scheduleSubscriptionReconciliation(c, session.handle);
    return c.json(subscriptionResponse(entitlement));
  });

  app.post('/api/quantity-breaks/subscription/checkout', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const trialRejection = await rejectTrialCheckout(c);
    if (trialRejection) return trialRejection;
    const repository = new D1SubscriptionRepository(c.env.DB);
    const requestId = `checkout_${crypto.randomUUID()}`;
    let stage: CheckoutStage = 'sku_lookup';
    try {
      const products = await partner(c.env).listProducts(c.env.SHOPLINE_APP_KEY, ['ultra']);
      stage = 'sku_selection';
      const selected = selectUltraMonthlyUsdSku(products);
      const trade = outTradeNo(session.handle);
      stage = 'order_persist';
      const created = await repository.createOrderOnce({ outTradeNo: trade, appKey: c.env.SHOPLINE_APP_KEY, handle: session.handle, spuKey: 'ultra', skuId: selected.skuId, status: 'pending' });
      if (!created) throw new Error('Unable to create a unique subscription order.');
      stage = 'payment_link';
      const payment = await partner(c.env).createPayment({ appKey: c.env.SHOPLINE_APP_KEY, handle: session.handle, spuKey: 'ultra', skuId: selected.skuId, outTradeNo: trade, returnUrl: returnUrl(c, trade, session.handle), currency: 'USD' });
      return c.json({ checkoutUrl: payment.url, outTradeNo: trade, plan: plan() });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'subscription_checkout_failed', requestId, stage, handle: session.handle,
        error: error instanceof Error ? error.message.slice(0, 256) : 'Unknown error',
        upstreamDiagnostic: error instanceof PartnerSubscriptionError ? error.diagnostic : null,
      }));
      return c.json({
        error: 'Unable to create the SHOPLINE payment link. Please try again.',
        code: checkoutFailure(stage),
        requestId,
        diagnostics: {
          stage,
          upstreamStatus: error instanceof PartnerSubscriptionError ? error.status : null,
        },
      }, 502);
    }
  });

  app.get('/api/quantity-breaks/subscription/callback', async (c) => {
    const trade = c.req.query('out_trade_no') || c.req.query('outTradeNo');
    const handle = c.req.query('handle');
    if (!trade || !/^[A-Za-z0-9_-]{8,256}$/.test(trade)) return c.json({ error: 'A valid subscription order is required.' }, 400);
    const repository = new D1SubscriptionRepository(c.env.DB);
    const order = await repository.readOrder(trade);
    if (!order || (handle && handle !== order.handle) || order.appKey !== c.env.SHOPLINE_APP_KEY) return c.json({ error: 'Subscription order not found.' }, 404);
    try {
      const status = await partner(c.env).getChargeStatus(c.env.SHOPLINE_APP_KEY, trade);
      const updated = await repository.updateOrderStatus(trade, status.status, status.subscriptionId);
      if (statusIsPaid(status.status)) {
        const operationKey = `subscription-reconcile:${order.appKey}:${order.handle}:payment:${trade}`;
        await repository.enqueueReconcileOnce({ operationKey, appKey: order.appKey, handle: order.handle, nextAttemptAt: Date.now() });
        c.executionCtx.waitUntil(processSubscriptionOperations(c.env, undefined, {
          operationKey,
          handle: order.handle,
          subscriptionId: updated?.subscriptionId ?? status.subscriptionId,
          paymentPending: true,
          sourceEventId: operationKey,
        }));
      }
      const result = { ok: true, status: status.status, outTradeNo: trade, subscriptionId: updated?.subscriptionId ?? null, state: statusIsPaid(status.status) ? 'review_pending' : 'pending' };
      if (c.req.header('Accept')?.includes('text/html') || c.req.query('redirect') === '1') {
        const target = new URL('/quantity-breaks/plan', c.req.url);
        target.searchParams.set('payment', statusIsPaid(status.status) ? 'review_pending' : status.status);
        target.searchParams.set('appkey', c.env.SHOPLINE_APP_KEY);
        target.searchParams.set('handle', order.handle);
        target.searchParams.set('shop', order.handle);
        target.searchParams.set('host', `${order.handle}.myshopline.com`);
        target.searchParams.set('embedded', '1');
        target.searchParams.set('isFromAppListPage', '1');
        return c.redirect(target.toString(), 303);
      }
      return c.json(result);
    } catch (error) {
      return c.json({ error: error instanceof PartnerSubscriptionError ? error.message : 'Subscription payment status is unavailable.' }, 502);
    }
  });
}
