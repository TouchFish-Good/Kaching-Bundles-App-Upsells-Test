import type { Context, Hono } from 'hono';

import { authorizeInternalRequest } from '../auth/internal-request';
import { D1FeedbackRepository } from '../db/feedback';
import { D1SessionStore } from '../db/sessions';
import { D1CampaignRepository } from '../db/campaigns';
import { D1CampaignDiagnostics } from '../db/campaign-diagnostics';
import { D1GdprDeletionTasks, type GdprDeletionKind, type GdprDeletionState, type GdprDeletionTask } from '../db/gdpr-deletion-tasks';
import { isFeedbackStatus, type FeedbackDisplayStatus, type FeedbackStatus } from '../domain/feedback';
import { currentTime, type Env } from '../env';
import type { AuthContext } from '../auth/session';
import { registerInstallationWebhook } from '../services/webhooks';
import { deleteAutomaticDiscount, DiscountRejectedError, DiscountUncertainError, pauseAutomaticDiscount } from '../services/discounts';
import { fetchShopCurrency, fetchStoreId, ShoplineAdminApiError, writeCollectionVariables } from '../services/collection-publication';
import { refreshScopeHandleSnapshots } from '../services/scope-handle-snapshots';
import { isTraceId, traceIdFromRequest } from '../observability/trace';
import { type Campaign } from '../domain/campaign';
import { resolveCampaignMarketMetadata } from '../services/storefront-market';
import { changeCampaignStatus, reconcileCampaign } from './campaigns';
import { storeSubscriptionSummary, storeSubscriptionFilterStates, storeSubscriptionStateSql } from '../domain/store-subscription';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type AdminContext = Context<{ Bindings: Env; Variables: { auth: AuthContext } }>;
type FeedbackListFilters = {
  status?: FeedbackStatus;
  display?: Extract<FeedbackDisplayStatus, 'rejected_hidden' | 'withdrawn'> | 'visible';
  query?: string;
  store?: string;
  from?: string;
  to?: string;
  sort: 'newest' | 'comments' | 'votes';
  replied?: boolean;
  limit: number;
  offset: number;
};

const subscriptionColumns = `e.state AS entitlement_state, e.active_spu_key AS entitlement_plan,
  e.valid_until AS entitlement_valid_until, e.grace_until AS entitlement_grace_until,
  e.last_verified_at AS entitlement_last_verified_at, e.active_subscription_id AS entitlement_subscription_id,
  e.next_display_from AS entitlement_next_display_from, e.next_display_until AS entitlement_next_display_until,
  p.subscription_json, p.last_verified_at AS subscription_verified_at`;
const subscriptionJoins = `LEFT JOIN quantity_breaks_entitlements e ON e.shop_handle = s.handle AND e.app_key = ?
  LEFT JOIN quantity_breaks_subscription_snapshots p ON p.shop_handle = s.handle AND p.app_key = ?`;

function pagination(c: AdminContext): { limit: number; offset: number } | null {
  const limit = Number(c.req.query('limit') ?? '25');
  const offset = Number(c.req.query('offset') ?? '0');
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 && Number.isInteger(offset) && offset >= 0 && offset <= 100000 ? { limit, offset } : null;
}

function feedbackFilters(c: AdminContext): FeedbackListFilters | { error: string } {
  const page = pagination(c);
  const status = c.req.query('status');
  const display = c.req.query('display');
  const query = (c.req.query('query') ?? '').trim();
  const store = (c.req.query('store') ?? '').trim();
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sort = c.req.query('sort') ?? 'newest';
  const replied = c.req.query('replied');
  if (!page) return { error: 'INVALID_PAGINATION' };
  if (status !== undefined && !isFeedbackStatus(status)) return { error: 'INVALID_STATUS' };
  if (display !== undefined && !['visible', 'rejected_hidden', 'withdrawn'].includes(display)) return { error: 'INVALID_DISPLAY' };
  if (query.length > 100) return { error: 'INVALID_QUERY' };
  if (store.length > 100) return { error: 'INVALID_STORE' };
  if ((from !== undefined && Number.isNaN(Date.parse(from))) || (to !== undefined && Number.isNaN(Date.parse(to)))) return { error: 'INVALID_DATE' };
  if (from && to && Date.parse(from) > Date.parse(to)) return { error: 'INVALID_DATE' };
  if (!['newest', 'comments', 'votes'].includes(sort) || (replied !== undefined && replied !== '1')) return { error: 'INVALID_FILTER' };
  return { status, display: display as Extract<FeedbackDisplayStatus, 'rejected_hidden' | 'withdrawn'> | 'visible' | undefined, query: query || undefined, store: store || undefined, from, to, sort: sort as 'newest' | 'comments' | 'votes', ...(replied === '1' ? { replied: true } : {}), ...page };
}

function route(handler: (c: AdminContext) => Promise<Response>): (c: AdminContext) => Promise<Response> {
  return async (c) => {
    if (!(await authorizeInternalRequest(c.req.raw, c.env))) return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    try { return await handler(c); }
    catch { return c.json({ error: { code: 'SOURCE_UNAVAILABLE' } }, 503); }
  };
}

function developerDiscountDisplay(tier: Campaign['tiers'][number]): { discountTypeDisplay: string; discountValueDisplay?: string } {
  switch (tier.discountType) {
    case 'none':
      return { discountTypeDisplay: '原价' };
    case 'percentage':
      return { discountTypeDisplay: '百分比折扣', discountValueDisplay: `${(tier.discountValue ?? 0) / 100}%` };
    case 'fixed_amount':
      return { discountTypeDisplay: '每件固定减免', discountValueDisplay: String(tier.discountValue ?? 0) };
    case 'fixed_price':
      return { discountTypeDisplay: '每件固定价格', discountValueDisplay: String(tier.discountValue ?? 0) };
    case 'bundle_fixed_amount':
      return { discountTypeDisplay: '整单固定减免', discountValueDisplay: String(tier.discountValue ?? 0) };
    case 'bundle_fixed_price':
      return { discountTypeDisplay: '整单固定价格', discountValueDisplay: String(tier.discountValue ?? 0) };
  }
}

function campaignProjection(campaign: Campaign, publication?: Awaited<ReturnType<D1CampaignRepository['getPublication']>>): Record<string, unknown> {
  const platformDiscountState = !publication || campaign.status === 'draft' || campaign.status === 'ended' || (!publication.discountId && publication.state !== 'removed')
    ? null
    : publication.state === 'removed' ? 'removed'
      : publication.state === 'paused' ? 'paused'
        : publication.state === 'active' ? 'active' : null;
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    revision: campaign.revision,
    scope: campaign.scope,
    tiers: campaign.tiers.map((tier) => ({
      tierId: tier.tierId,
      displayOrder: tier.displayOrder,
      quantity: tier.quantity,
      discountType: tier.discountType,
      ...(tier.discountValue === undefined ? {} : { discountValue: tier.discountValue }),
      ...developerDiscountDisplay(tier),
      ...(tier.recommended === undefined ? {} : { recommended: tier.recommended }),
      ...(tier.label === undefined ? {} : { label: tier.label }),
      ...(tier.subtitle === undefined ? {} : { subtitle: tier.subtitle }),
      ...(tier.tag === undefined ? {} : { tag: tier.tag }),
    })),
    startsAt: campaign.startsAt ?? null,
    endsAt: campaign.endsAt ?? null,
    pauseReason: campaign.pauseReason ?? null,
    platformDiscountState,
    activationPending: Boolean(publication && ['publishing', 'activating', 'needs_reconciliation'].includes(publication.state)),
    updatedAt: campaign.updatedAt,
  };
}

async function campaignDetailProjection(campaign: Campaign, publication: Awaited<ReturnType<D1CampaignRepository['getPublication']>>, session: AuthContext, env: Env): Promise<Record<string, unknown>> {
  const marketIds = [...new Set(campaign.tiers.flatMap((tier) => Object.keys(tier.marketOverrides ?? {})))];
  const [marketMetadata, shopCurrencyCode] = await Promise.all([
    resolveCampaignMarketMetadata(session, marketIds, env).catch(() => []),
    fetchShopCurrency(session).catch(() => null),
  ]);
  const markets = new Map(marketMetadata.map((market) => [market.marketId, market]));
  return {
    ...campaignProjection(campaign, publication),
    discountName: campaign.discountName?.trim() || campaign.name,
    combinesWith: campaign.combinesWith,
    shopCurrencyCode,
    tiers: campaign.tiers.map((tier) => ({
      ...tier,
      ...developerDiscountDisplay(tier),
      marketOverrides: Object.entries(tier.marketOverrides ?? {}).map(([marketId, override]) => ({
        marketId,
        marketName: markets.get(marketId)?.marketName ?? null,
        mode: override.mode,
        ...(override.mode === 'specified_amount' ? { currencyCode: override.currencyCode, amountMinor: override.amountMinor } : {}),
      })),
    })),
  };
}

async function installedStoreSession(c: AdminContext, storeId: string): Promise<AuthContext | null> {
  const store = await c.env.DB.prepare("SELECT handle FROM admin_stores WHERE store_id = ? AND status = 'installed'").bind(storeId).first<{ handle: string }>();
  if (!store) return null;
  const session = await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).get(store.handle);
  return session?.installed ? session : null;
}

async function pauseBody(c: AdminContext): Promise<{ expectedRevision: number; reason: string | null }> {
  const input = await c.req.json<unknown>();
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_BODY');
  const value = input as Record<string, unknown>;
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 1 || reason.length > 300) throw new Error('INVALID_BODY');
  return { expectedRevision: value.expectedRevision as number, reason: reason || null };
}

function diagnosticFilters(c: AdminContext): { traceId?: string; storeId?: string; campaignId?: string; eventType?: 'shopline_api' | 'worker_error' | 'campaign_pause' | 'campaign_platform_delete' | 'campaign_read'; outcome?: 'success' | 'failure' | 'uncertain'; from?: string; to?: string; limit: number; offset: number } | null {
  const page = pagination(c);
  const traceId = c.req.query('traceId');
  const storeId = c.req.query('storeId');
  const campaignId = c.req.query('campaignId');
  const eventType = c.req.query('eventType');
  const outcome = c.req.query('outcome');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!page || (traceId && !isTraceId(traceId)) || (storeId && !/^\d{1,128}$/.test(storeId)) ||
    (campaignId && !/^[A-Za-z0-9-]{1,128}$/.test(campaignId)) ||
    (eventType && !['shopline_api', 'worker_error', 'campaign_pause', 'campaign_platform_delete', 'campaign_read'].includes(eventType)) ||
    (outcome && !['success', 'failure', 'uncertain'].includes(outcome)) ||
    (from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to))) ||
    (from && to && Date.parse(from) > Date.parse(to))) return null;
  return {
    ...(traceId ? { traceId } : {}),
    ...(storeId ? { storeId } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(eventType ? { eventType: eventType as 'shopline_api' | 'worker_error' | 'campaign_pause' | 'campaign_platform_delete' | 'campaign_read' } : {}),
    ...(outcome ? { outcome: outcome as 'success' | 'failure' | 'uncertain' } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...page,
  };
}

function gdprTaskProjection(task: GdprDeletionTask): Record<string, unknown> {
  const handle = task.kind === 'merchant_redact'
    ? task.handleSnapshot
    : task.state === 'completed' || !task.shopDomain ? null : task.shopDomain.replace(/\.myshopline\.com$/i, '');
  return {
    webhookId: task.webhookId, kind: task.kind, storeId: task.storeId, handle,
    customerDigest: task.customerIdDigest, state: task.state, receivedAt: task.receivedAt, deadlineAt: task.deadlineAt,
    completedAt: task.completedAt, attempts: task.attempts, nextAttemptAt: task.nextAttemptAt, lastErrorCode: task.lastErrorCode,
  };
}

export function registerInternalAdminRoutes(app: App): void {
  app.get('/internal/admin-read/v1/gdpr-tasks', route(async (c) => {
    const page = pagination(c);
    const kind = c.req.query('kind');
    const state = c.req.query('state');
    const storeId = c.req.query('storeId');
    if (!page || (kind !== undefined && !['customer_redact', 'merchant_redact'].includes(kind)) ||
      (state !== undefined && !['pending', 'running', 'completed', 'retrying', 'failed'].includes(state)) ||
      (storeId !== undefined && !/^\d{1,128}$/.test(storeId))) return c.json({ error: { code: 'INVALID_FILTER' } }, 422);
    const result = await new D1GdprDeletionTasks(c.env.DB, () => currentTime(c.env)).list({
      kind: kind as GdprDeletionKind | undefined, state: state as GdprDeletionState | undefined, storeId, ...page,
    });
    return c.json({ data: { total: result.total, offset: page.offset, items: result.items.map(gdprTaskProjection) } });
  }));
  app.post('/internal/admin/v1/gdpr-tasks/:webhookId/retry', route(async (c) => {
    const webhookId = c.req.param('webhookId');
    if (!webhookId || !/^[A-Za-z0-9_-]{1,128}$/.test(webhookId)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const task = await new D1GdprDeletionTasks(c.env.DB, () => currentTime(c.env)).requestRetry(webhookId, currentTime(c.env));
    return task ? c.json({ data: gdprTaskProjection(task) }) : c.json({ error: { code: 'TASK_NOT_RETRYABLE' } }, 409);
  }));
  app.post('/internal/admin/v1/subscription-webhooks/reconcile', route(async (c) => {
    const page = pagination(c);
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    const sessions = await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).listInstalled(page);
    let failed = 0;
    let registeredTopics = 0;
    for (const session of sessions.sessions) {
      try {
        const result = await registerInstallationWebhook(session, c.env);
        registeredTopics += result.createdTopics.length;
      } catch {
        failed += 1;
      }
    }
    const nextOffset = page.offset + sessions.sessions.length;
    return c.json({ data: {
      processed: sessions.sessions.length,
      failed,
      registeredTopics,
      total: sessions.total,
      nextOffset: nextOffset < sessions.total ? nextOffset : null,
    } });
  }));

  app.get('/internal/admin-read/v1/overview', route(async (c) => {
    const asOf = new Date(currentTime(c.env)).toISOString();
    const [installed, activeCampaigns, errors] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT count(*) AS value FROM admin_stores WHERE status = 'installed'"),
      c.env.DB.prepare("SELECT count(*) AS value FROM quantity_breaks_campaigns c JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id JOIN admin_stores s ON s.handle = c.shop_handle AND s.status = 'installed' WHERE p.state = 'active' AND json_extract(c.campaign_json, '$.status') IN ('active', 'scheduled')"),
      c.env.DB.prepare('SELECT count(*) AS value FROM admin_error_events WHERE occurred_at >= ?').bind(new Date(currentTime(c.env) - 86_400_000).toISOString()),
    ]);
    return c.json({ data: { installedStoreCount: { value: Number((installed.results[0] as { value?: number })?.value ?? 0), asOf, sourceStatus: 'current' }, activeBundleCount: { value: Number((activeCampaigns.results[0] as { value?: number })?.value ?? 0), asOf, sourceStatus: 'current' }, errorCount: { value: Number((errors.results[0] as { value?: number })?.value ?? 0), asOf, sourceStatus: 'current' } } });
  }));

  app.get('/internal/admin-read/v1/stores', route(async (c) => {
    const page = pagination(c);
    const status = c.req.query('status') ?? 'all';
    const query = (c.req.query('query') ?? '').trim();
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    if (!['all', 'installed', 'uninstalled'].includes(status)) return c.json({ error: { code: 'INVALID_STATUS' } }, 422);
    if (query.length > 100) return c.json({ error: { code: 'INVALID_QUERY' } }, 422);
    const subscriptionStatus = c.req.query('subscriptionStatus') ?? 'all';
    if (!storeSubscriptionFilterStates.includes(subscriptionStatus as typeof storeSubscriptionFilterStates[number])) return c.json({ error: { code: 'INVALID_SUBSCRIPTION_STATUS' } }, 422);
    const now = currentTime(c.env);
    const clauses: string[] = [];
    const values: unknown[] = [c.env.SHOPLINE_APP_KEY, c.env.SHOPLINE_APP_KEY, now];
    if (status !== 'all') { clauses.push('s.status = ?'); values.push(status); }
    if (query) { clauses.push('(s.store_id LIKE ? OR s.handle LIKE ?)'); values.push(`%${query}%`, `%${query}%`); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const cte = `WITH store_rows AS (SELECT s.store_id, s.handle, s.scope, s.status, s.installed_at, s.updated_at,
      ${subscriptionColumns}, clock.subscription_now
      FROM admin_stores s ${subscriptionJoins}
      CROSS JOIN (SELECT ? AS subscription_now) clock${where}),
      filtered_stores AS (SELECT *, ${storeSubscriptionStateSql()} AS subscription_filter_state FROM store_rows)`;
    const subscriptionWhere = subscriptionStatus === 'all' ? ''
      : subscriptionStatus === 'unverified' ? ' WHERE subscription_filter_state IS NULL' : ' WHERE subscription_filter_state = ?';
    if (subscriptionStatus !== 'all' && subscriptionStatus !== 'unverified') values.push(subscriptionStatus);
    const count = await c.env.DB.prepare(`${cte} SELECT count(*) AS total FROM filtered_stores${subscriptionWhere}`).bind(...values).first<{ total: number }>();
    const rows = await c.env.DB.prepare(`${cte} SELECT * FROM filtered_stores${subscriptionWhere}
      ORDER BY updated_at DESC, store_id LIMIT ? OFFSET ?`).bind(...values, page.limit, page.offset).all<Record<string, string | number | null>>();
    return c.json({ data: { total: count?.total ?? 0, items: rows.results.map((row) => ({
      storeId: row.store_id, handle: row.handle, scope: row.scope, status: row.status, installedAt: row.installed_at, updatedAt: row.updated_at,
      subscription: storeSubscriptionSummary(row, now),
    })) } });
  }));

  app.get('/internal/admin-read/v1/stores/:storeId', route(async (c) => {
    const storeId = c.req.param('storeId');
    const store = await c.env.DB.prepare(`SELECT s.store_id, s.handle, s.scope, s.status, s.installed_at, s.updated_at, ${subscriptionColumns} FROM admin_stores s ${subscriptionJoins} WHERE s.store_id = ?`).bind(c.env.SHOPLINE_APP_KEY, c.env.SHOPLINE_APP_KEY, storeId).first<Record<string, string | number | null>>();
    if (!store) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const cycles = await c.env.DB.prepare('SELECT installed_at, uninstalled_at FROM admin_installations WHERE store_id = ? ORDER BY id DESC').bind(storeId).all<{ installed_at: string; uninstalled_at: string | null }>();
    return c.json({ data: { storeId: store.store_id, handle: store.handle, scope: store.scope, status: store.status, installedAt: store.installed_at, updatedAt: store.updated_at, subscription: storeSubscriptionSummary(store, currentTime(c.env)), installations: cycles.results.map((cycle) => ({ installedAt: cycle.installed_at, uninstalledAt: cycle.uninstalled_at })) } });
  }));

  app.get('/internal/admin-read/v1/stores/:storeId/bundles', route(async (c) => c.json({ error: { code: 'SOURCE_UNAVAILABLE', source: 'bundles' } }, 503)));
  app.get('/internal/admin-read/v1/bundles', route(async (c) => c.json({ error: { code: 'SOURCE_UNAVAILABLE', source: 'bundles' } }, 503)));
  app.get('/internal/admin-read/v1/stores/:storeId/campaigns', route(async (c) => {
    const storeId = c.req.param('storeId');
    if (!storeId) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const store = await c.env.DB.prepare("SELECT handle FROM admin_stores WHERE store_id = ? AND status = 'installed'").bind(storeId).first<{ handle: string }>();
    if (!store) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const page = pagination(c);
    const query = (c.req.query('query') ?? '').trim().toLocaleLowerCase();
    const status = c.req.query('status');
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    if (query.length > 100) return c.json({ error: { code: 'INVALID_QUERY' } }, 422);
    if (status && !['draft', 'active', 'expired', 'scheduled', 'paused', 'ended'].includes(status)) return c.json({ error: { code: 'INVALID_STATUS' } }, 422);
    const repository = new D1CampaignRepository(c.env.DB);
    const result = await repository.listForAdmin({ storeId, query, status, ...page });
    return c.json({ data: { total: result.total, items: result.items.map(({ campaign, publication, storeId, shopHandle }) => ({ ...campaignProjection(campaign, publication), storeId, shopHandle })) } });
  }));

  app.get('/internal/admin-read/v1/campaigns', route(async (c) => {
    const page = pagination(c);
    const query = (c.req.query('query') ?? '').trim().toLocaleLowerCase();
    const status = c.req.query('status');
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    if (query.length > 100) return c.json({ error: { code: 'INVALID_QUERY' } }, 422);
    if (status && !['draft', 'active', 'expired', 'scheduled', 'paused', 'ended'].includes(status)) return c.json({ error: { code: 'INVALID_STATUS' } }, 422);
    const result = await new D1CampaignRepository(c.env.DB).listForAdmin({ query, status, ...page });
    return c.json({ data: { total: result.total, items: result.items.map(({ campaign, publication, storeId, shopHandle }) => ({ ...campaignProjection(campaign, publication), storeId, shopHandle })) } });
  }));

  app.get('/internal/admin-read/v1/stores/:storeId/campaigns/:id', route(async (c) => {
    const storeId = c.req.param('storeId');
    const campaignId = c.req.param('id');
    if (!storeId || !campaignId) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const session = await installedStoreSession(c, storeId);
    if (!session) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const repository = new D1CampaignRepository(c.env.DB, () => currentTime(c.env));
    let campaign = await repository.get(session.handle, campaignId);
    if (!campaign) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    let publication = await repository.getPublication(session.handle, campaignId);
    if (['publishing', 'activating', 'needs_reconciliation'].includes(publication.state)) {
      await reconcileCampaign(repository, session, c.env, campaignId);
      campaign = await repository.get(session.handle, campaignId);
      if (!campaign) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
      publication = await repository.getPublication(session.handle, campaignId);
    }
    return c.json({ data: { ...await campaignDetailProjection(campaign, publication, session, c.env), shopHandle: session.handle } });
  }));

  app.post('/internal/admin/v1/stores/:storeId/campaigns/:id/pause', route(async (c) => {
    let input: { expectedRevision: number; reason: string | null };
    try { input = await pauseBody(c); }
    catch { return c.json({ error: { code: 'INVALID_BODY' } }, 422); }
    const storeId = c.req.param('storeId');
    const campaignId = c.req.param('id');
    if (!storeId || !campaignId) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const session = await installedStoreSession(c, storeId);
    if (!session) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const repository = new D1CampaignRepository(c.env.DB, () => currentTime(c.env));
    const campaign = await repository.get(session.handle, campaignId);
    if (!campaign) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    if (!['active', 'scheduled'].includes(campaign.status)) return c.json({ error: { code: 'CAMPAIGN_NOT_PAUSABLE' } }, 409);
    const publication = await repository.getPublication(session.handle, campaign.id);
    let lease;
    try { lease = await repository.beginPublication(session.handle, campaign.id, input.expectedRevision, 'pause'); }
    catch { return c.json({ error: { code: 'STALE_OR_CONFLICT' } }, 409); }
    const diagnostics = new D1CampaignDiagnostics(c.env.DB, () => currentTime(c.env));
    const traceId = traceIdFromRequest(c.req.raw);
    const upstreamPath = `/sales/discount_automatic_app/${encodeURIComponent(publication.discountId ?? '')}.json`;
    try {
      if (!publication.discountId) throw new DiscountUncertainError('Campaign publication is missing its platform discount.', { upstreamStatus: 0, upstreamRequestId: null });
      const currency = await fetchShopCurrency(session);
      const pause = await pauseAutomaticDiscount(session, publication.discountId, lease.campaign, c.env, currency);
      if (campaign.scope.kind === 'collections') {
        await writeCollectionVariables(session, await fetchStoreId(session), await repository.listRequiredCollectionIds(session.handle, campaign.id));
      }
      const paused = pause.state === 'pausing'
        ? await repository.finishPausePending(session.handle, campaign.id, input.expectedRevision, publication.discountId, lease.owner, publication.nodeId)
        : await repository.finishPublication(session.handle, campaign.id, input.expectedRevision, 'pause', publication.discountId, lease.owner, publication.nodeId);
      await diagnostics.record({ traceId, workerName: 'shopline-quantity-breaks', storeId, shopHandle: session.handle, campaignId: campaign.id, eventType: 'campaign_pause', outcome: 'success', upstreamService: 'SHOPLINE', upstreamPath });
      return c.json({ data: { campaign: campaignProjection(paused, await repository.getPublication(session.handle, campaign.id)) } });
    } catch (error) {
      const rejected = error instanceof DiscountRejectedError;
      const uncertain = error instanceof DiscountUncertainError || !rejected;
      await repository.markPublicationFailure(session.handle, campaign.id, uncertain, 'pause', lease.owner);
      const metadata = error instanceof DiscountRejectedError || error instanceof DiscountUncertainError
        ? error.metadata
        : error instanceof ShoplineAdminApiError
          ? { upstreamStatus: error.status, upstreamRequestId: null }
          : { upstreamStatus: 0, upstreamRequestId: null };
      const failedPath = error instanceof ShoplineAdminApiError ? error.path : upstreamPath;
      await diagnostics.record({ traceId, workerName: 'shopline-quantity-breaks', storeId, shopHandle: session.handle, campaignId: campaign.id, eventType: 'campaign_pause', outcome: uncertain ? 'uncertain' : 'failure', upstreamService: 'SHOPLINE', upstreamPath: metadata.upstreamPath ?? failedPath, upstreamStatus: metadata.upstreamStatus || undefined, upstreamRequestId: metadata.upstreamRequestId ?? undefined, upstreamResponseCode: metadata.upstreamResponseCode, upstreamResponseMessage: metadata.upstreamResponseMessage, upstreamResponseBody: metadata.upstreamResponseBody, errorCode: uncertain ? 'UPSTREAM_OUTCOME_UNCERTAIN' : 'UPSTREAM_REJECTED' });
      return c.json({ error: { code: uncertain ? 'UPSTREAM_OUTCOME_UNCERTAIN' : 'UPSTREAM_REJECTED' } }, uncertain ? 503 : 502);
    }
  }));
  app.post('/internal/admin/v1/stores/:storeId/campaigns/:id/activate', route(async (c) => {
    let input: { expectedRevision: number; reason: string | null };
    try { input = await pauseBody(c); } catch { return c.json({ error: { code: 'INVALID_BODY' } }, 422); }
    const storeId = c.req.param('storeId');
    const campaignId = c.req.param('id');
    if (!storeId || !campaignId) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const session = await installedStoreSession(c, storeId);
    if (!session) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const repository = new D1CampaignRepository(c.env.DB, () => currentTime(c.env));
    const campaign = await repository.get(session.handle, campaignId);
    if (!campaign) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    if (campaign.revision !== input.expectedRevision) return c.json({ error: { code: 'STALE_OR_CONFLICT' } }, 409);
    if (campaign.status === 'draft' || campaign.status === 'active') return c.json({ error: { code: 'CAMPAIGN_NOT_ACTIVATABLE' } }, 409);
    // Reuse the merchant application's reconciliation, replacement, scope checks and publication flow.
    const result = await changeCampaignStatus(repository, session, c.env, campaignId, 'active', input.expectedRevision, undefined, c.executionCtx);
    if (!result.campaign) {
      if (result.conflict) return c.json({ error: { code: 'CAMPAIGN_SCOPE_CONFLICT' }, conflicts: [{
        campaignId: result.conflict.conflictingCampaignId, campaignName: result.conflict.conflictingCampaignName,
        scopeKind: result.conflict.overlap.type, overlap: result.conflict.overlap,
      }] }, 409);
      const status = result.outcome === 'conflict' ? 409 : result.outcome === 'failed' ? 502 : 503;
      return c.json({ error: { code: status === 409 ? 'STALE_OR_CONFLICT' : status === 502 ? 'UPSTREAM_REJECTED' : 'UPSTREAM_OUTCOME_UNCERTAIN' } }, status);
    }
    const nextId = (result.campaign as { id: string }).id;
    const activated = await repository.get(session.handle, nextId);
    if (!activated) return c.json({ error: { code: 'SOURCE_UNAVAILABLE' } }, 503);
    return c.json({ data: {
      outcome: result.outcome,
      campaign: { ...campaignProjection(activated, await repository.getPublication(session.handle, nextId)), shopHandle: session.handle, storeId },
    } });
  }));
  app.post('/internal/admin/v1/stores/:storeId/campaigns/:id/platform-delete', route(async (c) => {
    let input: { expectedRevision: number; reason: string | null };
    try { input = await pauseBody(c); } catch { return c.json({ error: { code: 'INVALID_BODY' } }, 422); }
    const storeId = c.req.param('storeId');
    const campaignId = c.req.param('id');
    if (!storeId || !campaignId) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const session = await installedStoreSession(c, storeId);
    if (!session) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const repository = new D1CampaignRepository(c.env.DB, () => currentTime(c.env));
    const campaign = await repository.get(session.handle, campaignId);
    if (!campaign) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const publication = await repository.getPublication(session.handle, campaignId);
    if (!publication.discountId) return c.json({ error: { code: 'CAMPAIGN_PLATFORM_DISCOUNT_MISSING' } }, 409);
    let lease;
    try { lease = await repository.beginPlatformDeletion(session.handle, campaignId, input.expectedRevision); }
    catch { return c.json({ error: { code: 'STALE_OR_CONFLICT' } }, 409); }
    const diagnostics = new D1CampaignDiagnostics(c.env.DB, () => currentTime(c.env));
    const traceId = traceIdFromRequest(c.req.raw);
    try {
      const upstream = await deleteAutomaticDiscount(session, publication.discountId, c.env, publication.nodeId);
      const deleted = await repository.finishPlatformDeletion(session.handle, campaignId, input.expectedRevision, lease.owner);
      await diagnostics.record({ traceId, workerName: 'shopline-quantity-breaks', storeId, shopHandle: session.handle, campaignId, eventType: 'campaign_platform_delete', outcome: 'success', upstreamService: 'SHOPLINE', upstreamPath: upstream.upstreamPath ?? '/admin/openapi/v20261201/sales/discount_apps', upstreamStatus: upstream.upstreamStatus, upstreamRequestId: upstream.upstreamRequestId ?? undefined });
      return c.json({ data: { campaign: campaignProjection(deleted, await repository.getPublication(session.handle, campaignId)) } });
    } catch (error) {
      const rejected = error instanceof DiscountRejectedError;
      const uncertain = error instanceof DiscountUncertainError || !rejected;
      await repository.markPlatformDeletionFailure(session.handle, campaignId, uncertain, lease.owner);
      const metadata = error instanceof DiscountRejectedError || error instanceof DiscountUncertainError ? error.metadata : { upstreamStatus: 0, upstreamRequestId: null };
      await diagnostics.record({ traceId, workerName: 'shopline-quantity-breaks', storeId, shopHandle: session.handle, campaignId, eventType: 'campaign_platform_delete', outcome: uncertain ? 'uncertain' : 'failure', upstreamService: 'SHOPLINE', upstreamPath: metadata.upstreamPath ?? '/admin/openapi/v20261201/sales/discount_apps', upstreamStatus: metadata.upstreamStatus || undefined, upstreamRequestId: metadata.upstreamRequestId ?? undefined, upstreamResponseCode: metadata.upstreamResponseCode, upstreamResponseMessage: metadata.upstreamResponseMessage, upstreamResponseBody: metadata.upstreamResponseBody, errorCode: uncertain ? 'UPSTREAM_OUTCOME_UNCERTAIN' : 'UPSTREAM_REJECTED' });
      return c.json({ error: { code: uncertain ? 'UPSTREAM_OUTCOME_UNCERTAIN' : 'UPSTREAM_REJECTED' } }, uncertain ? 503 : 502);
    }
  }));
  app.get('/internal/admin-read/v1/diagnostics', route(async (c) => {
    const filters = diagnosticFilters(c);
    if (!filters) return c.json({ error: { code: 'INVALID_FILTER' } }, 422);
    const result = await new D1CampaignDiagnostics(c.env.DB, () => currentTime(c.env)).list(filters);
    return c.json({ data: result });
  }));
  app.get('/internal/admin-read/v1/feedback', route(async (c) => {
    const filters = feedbackFilters(c);
    if ('error' in filters) return c.json({ error: { code: filters.error } }, 422);
    const result = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).listForOwner(filters);
    return c.json({ data: result });
  }));

  app.get('/internal/admin-read/v1/feedback-comments', route(async (c) => {
    const page = pagination(c);
    const query = (c.req.query('query') ?? '').trim();
    const store = (c.req.query('store') ?? '').trim();
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!page || query.length > 100 || store.length > 100 || (from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to))) || (from && to && Date.parse(from) > Date.parse(to))) return c.json({ error: { code: 'INVALID_FILTER' } }, 422);
    const result = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).listCommentsForOwner({ query: query || undefined, store: store || undefined, from, to, ...page });
    return c.json({ data: result });
  }));

  app.get('/internal/admin-read/v1/feedback/:id', route(async (c) => {
    const id = c.req.param('id');
    if (!id || !/^[A-Za-z0-9-]{1,128}$/.test(id)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const feedback = await new D1FeedbackRepository(c.env.DB, () => currentTime(c.env)).readDetailForOwner(id);
    return feedback ? c.json({ data: feedback }) : c.json({ error: { code: 'NOT_FOUND' } }, 404);
  }));

  app.get('/internal/admin-read/v1/events/errors', route(async (c) => {
    const page = pagination(c);
    const storeId = c.req.query('storeId');
    const source = c.req.query('source');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return c.json({ error: { code: 'INVALID_DATE' } }, 422);
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (storeId) { clauses.push('store_id = ?'); values.push(storeId); }
    if (source && !['worker', 'browser'].includes(source)) return c.json({ error: { code: 'INVALID_FILTER' } }, 422);
    if (source) { clauses.push('source = ?'); values.push(source); }
    if (from) { clauses.push('occurred_at >= ?'); values.push(from); }
    if (to) { clauses.push('occurred_at <= ?'); values.push(to); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM admin_error_events${where}`).bind(...values).first<{ total: number }>();
    const rows = await c.env.DB.prepare(`SELECT e.id, e.store_id, s.handle, e.kind, e.severity, e.code, e.trace_id, e.source, e.operation, e.route, e.method, e.http_status, e.message, e.fingerprint, e.related_trace_id, e.occurred_at FROM admin_error_events e LEFT JOIN admin_stores s ON s.store_id = e.store_id${where.replaceAll('store_id', 'e.store_id').replaceAll('source', 'e.source').replaceAll('occurred_at', 'e.occurred_at')} ORDER BY e.occurred_at DESC, e.id DESC LIMIT ? OFFSET ?`).bind(...values, page.limit, page.offset).all<Record<string, unknown>>();
    return c.json({ data: { total: count?.total ?? 0, items: rows.results.map((row) => ({ id: row.id, storeId: row.store_id, handle: row.handle, kind: row.kind, severity: row.severity, code: row.code, traceId: row.trace_id, source: row.source, operation: row.operation, route: row.route, method: row.method, httpStatus: row.http_status, message: row.message, fingerprint: row.fingerprint, relatedTraceId: row.related_trace_id, occurredAt: row.occurred_at })) } });
  }));

  app.get('/internal/admin-read/v1/diagnostics/requests', route(async (c) => {
    const page = pagination(c);
    const storeId = c.req.query('storeId');
    const traceId = c.req.query('traceId');
    const method = c.req.query('method');
    const outcome = c.req.query('outcome');
    const httpStatus = c.req.query('httpStatus');
    if (!page) return c.json({ error: { code: 'INVALID_PAGINATION' } }, 422);
    if ((storeId && !/^\d{1,128}$/.test(storeId)) || (traceId && !isTraceId(traceId)) ||
      (method && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) ||
      (outcome && !['success', 'client_error', 'server_error'].includes(outcome)) ||
      (httpStatus && (!/^\d{3}$/.test(httpStatus) || Number(httpStatus) < 100 || Number(httpStatus) > 599))) {
      return c.json({ error: { code: 'INVALID_FILTER' } }, 422);
    }
    const clauses: string[] = []; const values: unknown[] = [];
    if (storeId) { clauses.push('r.store_id = ?'); values.push(storeId); }
    if (traceId) { clauses.push('r.trace_id = ?'); values.push(traceId); }
    if (method) { clauses.push('r.method = ?'); values.push(method); }
    if (outcome) { clauses.push('r.outcome = ?'); values.push(outcome); }
    if (httpStatus) { clauses.push('r.http_status = ?'); values.push(Number(httpStatus)); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const count = await c.env.DB.prepare(`SELECT count(*) AS total FROM application_request_events r${where}`).bind(...values).first<{ total: number }>();
    const rows = await c.env.DB.prepare(`SELECT r.id, r.trace_id, r.store_id, COALESCE(r.shop_handle, s.handle) AS handle, r.route, r.method, r.http_status, r.duration_ms, r.outcome, r.occurred_at FROM application_request_events r LEFT JOIN admin_stores s ON s.store_id = r.store_id${where} ORDER BY r.occurred_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...values, page.limit, page.offset).all<Record<string, unknown>>();
    return c.json({ data: { total: count?.total ?? 0, items: rows.results.map((row) => ({ id: row.id, traceId: row.trace_id, storeId: row.store_id, handle: row.handle, route: row.route, method: row.method, httpStatus: row.http_status, durationMs: row.duration_ms, outcome: row.outcome, occurredAt: row.occurred_at })) } });
  }));
}
