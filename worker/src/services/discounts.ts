import type { AuthContext } from '../auth/session';
import type { Env } from '../env';
import { resolvedDiscountName, validateCampaign, type CampaignDraft } from '../domain/campaign';
import { diagnosticResponseBody } from '../observability/diagnostic-response';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';
import { hasEnabledOffers, offerSelections, trustedCurrencyDecimals } from './offer-config';
import { verifiedOfferReferences } from './offer-index';
export { hasEnabledOffers, offerSelections } from './offer-config';
import { normalizeOfferModules } from '../../../shared/offer-core.mjs';
import type { OfferModuleConfig } from '../../../shared/offer-core.mjs';

const ADMIN_VERSION = 'v20260901';
const FUNCTION_DISCOUNT_VERSION = 'v20261201';
const DEFAULT_FUNCTION_ID = '754292a155d740809a5437a3f8c59231';

export type ShoplineRequestMetadata = {
  upstreamStatus: number;
  upstreamRequestId: string | null;
  upstreamPath?: string;
  upstreamResponseCode?: string;
  upstreamResponseMessage?: string;
  upstreamResponseBody?: string;
  retryAfterMs?: number;
};
export type AutomaticDiscountState = {
  state: 'active' | 'paused' | 'missing';
  discountId: string | null;
  nodeId: string | null;
  metadata: ShoplineRequestMetadata;
  /** The app-owned rule is the only safe way to reconcile an unlinked create request. */
  campaignId?: string;
  endsAt?: string;
};

export type PublishedAutomaticDiscount = { discountId: string; nodeId: string };

export class DiscountRejectedError extends Error {
  constructor(message: string, readonly metadata: ShoplineRequestMetadata) { super(message); }
}

export class DiscountUncertainError extends Error {
  constructor(
    message: string,
    readonly metadata: ShoplineRequestMetadata = { upstreamStatus: 0, upstreamRequestId: null },
    readonly diagnosticCode?: string,
  ) { super(message); }
}

/** SHOPLINE accepted one create; subsequent requests must only verify its ID. */
export class DiscountCreationPendingError extends DiscountUncertainError {
  constructor(readonly discountId: string, metadata: ShoplineRequestMetadata) {
    super('SHOPLINE creation was not confirmed.', metadata, 'CREATE_CONFIRMATION_PENDING');
  }
}

class DiscountEmptyGraphQLResponseError extends DiscountUncertainError {}

function functionId(env: Env): string {
  return env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID?.trim() || DEFAULT_FUNCTION_ID;
}

function currencyDecimals(currencyCode: string): number {
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error('A valid currency code is required.');
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits;
  if (!Number.isInteger(digits) || digits === undefined || digits < 0 || digits > 3) throw new Error(`Unsupported currency precision: ${currencyCode}.`);
  return digits;
}

export function supportedOfferFunction(handle: string, env: Env): boolean {
  try {
    const capabilities = JSON.parse(env.SHOPLINE_OFFER_FUNCTION_CAPABILITIES ?? '{}')[handle];
    return capabilities?.protocol === 'gift-bundles-v1' && capabilities.functionId === functionId(env) && capabilities.skuIsVariantId === true && capabilities.lineTotalTargets === true;
  } catch { return false; }
}

async function assertOfferPublication(session: AuthContext, campaign: CampaignDraft, env: Env, currency: string): Promise<void> {
  if (!hasEnabledOffers(campaign)) return;
  if (!supportedOfferFunction(session.handle, env)) throw new Error('Verified gift/bundle Function capability is required for publication.');
  // Validate the complete projection before any upstream mutation.
  buildDiscountRule(campaign, currency);
  await verifiedOfferReferences(session, offerSelections(campaign));
}

function compactOffer(module: OfferModuleConfig): Record<string, unknown> {
  return { version: module.version, enabled: true, selectionMode: module.selectionMode, quantityMode: module.quantityMode, quotaScope: module.quotaScope,
    items: module.items.map(rule => ({ ruleId: rule.ruleId, displayOrder: rule.displayOrder, productId: rule.productId, allowedVariantIds: rule.allowedVariantIds, quantity: rule.quantity, discountType: rule.discountType, discountValue: rule.discountValue, trigger: rule.trigger,
      ...(rule.marketOverrides ? { marketOverrides: Object.fromEntries(Object.entries(rule.marketOverrides).map(([market, override]) => [market, override.mode === 'auto_convert' ? override : { ...override, currencyDecimals: trustedCurrencyDecimals(override.currencyCode) }])) } : {}),
    })),
  };
}

function assertCompatibleOfferMoney(campaign: CampaignDraft): void {
  const amounts = [...campaign.tiers.filter(tier => tier.discountType !== 'none'), ...[campaign.gifts, campaign.bundles].flatMap(module => module?.enabled ? module.items : [])];
  const markets = new Set(amounts.flatMap(amount => Object.keys(amount.marketOverrides ?? {})));
  for (const market of markets) {
    const modes = new Set(amounts.map(amount => {
      const override = amount.marketOverrides?.[market];
      return override?.mode === 'specified_amount' ? `${override.currencyCode}:${trustedCurrencyDecimals(override.currencyCode)}` : 'auto';
    }));
    if (modes.size > 1) throw new Error('Unsafe mixed currency/money modes in gift/bundle publication.');
  }
}

export function buildDiscountRule(campaign: CampaignDraft, currency: string): Record<string, unknown> {
  campaign = normalizeOfferModules(campaign);
  const errors = validateCampaign(campaign);
  if (errors.length) throw new Error(errors.join(' '));
  const enabled = hasEnabledOffers(campaign);
  const selections = enabled ? offerSelections(campaign) : [];
  if (enabled) {
    const ids = [campaign.gifts, campaign.bundles].flatMap(module => module?.enabled ? module.items.map(rule => rule.ruleId) : []);
    if (new Set(ids).size !== ids.length) throw new Error('Offer rule IDs must be unique across modules.');
    assertCompatibleOfferMoney(campaign);
    trustedCurrencyDecimals(currency);
  }
  const excludedProductIds = enabled ? [...new Set([...(campaign.scope.excludedProductIds ?? []), ...selections.map(selection => selection.productId)])] : campaign.scope.excludedProductIds;
  return {
    schemaVersion: enabled ? 2 : 1, campaignId: campaign.id, storeCurrencyCode: currency,
    storeCurrencyDecimals: currencyDecimals(currency),
    scope: campaign.scope.kind === 'products'
      ? { kind: 'products', productIds: campaign.scope.productIds, excludedProductIds }
      : campaign.scope.kind === 'collections'
        ? { kind: 'collections', collectionIds: campaign.scope.collectionIds, excludedProductIds }
        : { kind: 'all', excludedProductIds },
    ...(campaign.gifts?.enabled ? { gifts: compactOffer(campaign.gifts) } : {}),
    ...(campaign.bundles?.enabled ? { bundles: compactOffer(campaign.bundles) } : {}),
    tiers: campaign.tiers.map((tier) => ({
      tierId: tier.tierId, quantity: tier.quantity, discountType: tier.discountType, ...(tier.discountType === 'none' ? {} : { discountValue: tier.discountValue }),
      marketOverrides: Object.fromEntries(Object.entries(tier.marketOverrides || {}).map(([marketId, override]) => [marketId,
        override.mode === 'auto_convert' ? override : { ...override, currencyDecimals: currencyDecimals(override.currencyCode) },
      ])),
    })),
  };
}

function discountInput(
  campaign: CampaignDraft,
  env: Env,
  currency: string,
  endsAt: string | null = campaign.endsAt ?? null,
  startsAt = campaign.startsAt,
): Record<string, unknown> {
  const id = functionId(env);
  const rule = buildDiscountRule(campaign, currency);
  return {
    title: resolvedDiscountName(campaign), function_id: id,
    combines_with_modes: {
      order_discount_code: campaign.combinesWith.orderDiscounts,
      order_automatic_discount: campaign.combinesWith.orderDiscounts,
      product_discount_code: campaign.combinesWith.productDiscounts,
      product_automatic_discount: campaign.combinesWith.productDiscounts,
      shipping_discount_code: campaign.combinesWith.shippingDiscounts,
      shipping_automatic_discount: campaign.combinesWith.shippingDiscounts,
    },
    metafields: [{ namespace: 'sale', key: 'quantity_breaks', type: 'json', value: JSON.stringify(rule), description: 'Quantity Breaks Function rule' }],
    starts_at: startsAt, ends_at: endsAt,
  };
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function responseCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : undefined;
}

function responseMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const message = value.trim().slice(0, 512);
  return message && !/(?:authorization|cookie|access[_ -]?token|refresh[_ -]?token|bearer\s+\S+|password|secret)/i.test(message) ? message : undefined;
}

function responseSummary(payload: unknown): Pick<ShoplineRequestMetadata, 'upstreamResponseCode' | 'upstreamResponseMessage'> {
  const root = object(payload) ? payload : null;
  const error = root && object(root.error) ? root.error : null;
  const firstError = root && Array.isArray(root.errors) && object(root.errors[0]) ? root.errors[0] : null;
  for (const candidate of [error, firstError, root]) {
    if (!candidate) continue;
    const code = responseCode(candidate.code ?? candidate.error_code ?? candidate.errorCode);
    const message = responseMessage(candidate.message ?? candidate.error_description ?? candidate.errorDescription);
    if (code || message) return {
      ...(code ? { upstreamResponseCode: code } : {}), ...(message ? { upstreamResponseMessage: message } : {}),
    };
  }
  const errors = root?.errors;
  const message = responseMessage(errors);
  if (message) return { upstreamResponseMessage: message };
  return {};
}

function requestMetadata(response: Response, payload?: unknown, upstreamPath?: string): ShoplineRequestMetadata {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter.trim())
    ? Math.min(Number(retryAfter.trim()) * 1000, 60 * 60 * 1000)
    : retryAfter && Number.isFinite(Date.parse(retryAfter))
      ? Math.min(Math.max(0, Date.parse(retryAfter) - Date.now()), 60 * 60 * 1000)
      : undefined;
  const upstreamResponseBody = diagnosticResponseBody(payload);
  return {
    upstreamStatus: response.status,
    upstreamRequestId: response.headers.get('Traceid') ?? response.headers.get('x-shopline-request-id') ?? response.headers.get('x-shopline-api-request-id') ?? response.headers.get('x-request-id'),
    ...(upstreamPath ? { upstreamPath } : {}),
    ...responseSummary(payload),
    ...(upstreamResponseBody ? { upstreamResponseBody } : {}),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

function graphQLErrorCode(payload: unknown): string | undefined {
  if (!object(payload) || !Array.isArray(payload.errors) || !object(payload.errors[0]) || !object(payload.errors[0].extensions)) return undefined;
  const code = payload.errors[0].extensions.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/.test(code) ? code : undefined;
}

async function request(
  session: AuthContext,
  env: Env,
  version: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  apiSurface: 'api' | 'openapi' = 'openapi',
): Promise<{ data: Record<string, unknown>; metadata: ShoplineRequestMetadata }> {
  const response = await fetch(`https://${session.handle}.myshopline.com/admin/${apiSurface}/${version}${path}`, {
    method,
    headers: shoplineAdminHeaders(session.accessToken),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* malformed upstream errors are handled below */ }
  const metadata = requestMetadata(response, data, `/admin/${apiSurface}/${version}${path}`);
  if (!response.ok) {
    const message = response.status === 422 && /\bendAt\s+before\s+now\b/i.test(metadata.upstreamResponseMessage ?? '')
      ? '当前结束时间早于当前时间'
      : `SHOPLINE Function discount API returned ${response.status}.`;
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message, metadata);
    throw new DiscountUncertainError(message, metadata);
  }
  if (typeof data.errors === 'string' && data.errors) throw new DiscountUncertainError(`SHOPLINE discount result is uncertain: ${data.errors}`, metadata);
  return { data, metadata };
}

async function graphQL(session: AuthContext, operation: string, variables: Record<string, unknown>): Promise<{ data: Record<string, unknown>; metadata: ShoplineRequestMetadata }> {
  let response: Response;
  try {
    response = await fetch(`https://${session.handle}.myshopline.com/admin/graph/${ADMIN_VERSION}/graphql.json`, {
      method: 'POST',
      headers: shoplineAdminHeaders(session.accessToken),
      body: JSON.stringify({ query: operation, variables }),
    });
  } catch {
    throw new DiscountUncertainError('SHOPLINE GraphQL request outcome is uncertain.');
  }
  const raw = await response.text();
  let payload: unknown = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { /* malformed upstream errors are handled below */ }
  const metadata = requestMetadata(response, payload, `/admin/graph/${ADMIN_VERSION}/graphql.json`);
  if (response.status === 204 && !raw.trim()) {
    throw new DiscountEmptyGraphQLResponseError('SHOPLINE GraphQL returned no response body.', metadata, 'EMPTY_GRAPHQL_RESPONSE');
  }
  if (raw && !object(payload)) throw new DiscountUncertainError('SHOPLINE GraphQL response was malformed.', metadata);
  if (!response.ok) {
    const message = `SHOPLINE Function discount API returned ${response.status}.`;
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message, metadata);
    throw new DiscountUncertainError(message, metadata);
  }
  if (!object(payload) || !object(payload.data)) throw new DiscountUncertainError('SHOPLINE GraphQL response did not contain data.', metadata);
  if (Array.isArray(payload.errors) && payload.errors.length) {
    throw new DiscountUncertainError('SHOPLINE GraphQL returned errors.', metadata, graphQLErrorCode(payload));
  }
  return { data: payload.data, metadata };
}

function assertMutationAccepted(data: Record<string, unknown>, field: string, metadata: ShoplineRequestMetadata): void {
  const result = data[field];
  if (!object(result)) throw new DiscountUncertainError(`SHOPLINE ${field} response was incomplete.`, metadata);
  const errors = result.userErrors;
  if (!Array.isArray(errors)) throw new DiscountUncertainError(`SHOPLINE ${field} did not return userErrors.`, metadata);
  if (errors.length) throw new DiscountRejectedError(`SHOPLINE ${field} was rejected.`, { ...metadata, ...responseSummary({ errors }) });
}

function automaticDiscountNodeId(discountId: string): string {
  return `gid://shopline/DiscountAutomaticNode/${discountId}`;
}

function nodeIdFromDiscountApp(discountId: string, discountApp: Record<string, unknown>): string {
  const nodeId = discountApp.node_id;
  if (typeof nodeId === 'string' && /^gid:\/\/shopline\/DiscountAutomaticNode\/[^\s/]+$/.test(nodeId)) return nodeId;
  return automaticDiscountNodeId(discountId);
}

function nextDiscountAppsPage(data: Record<string, unknown>): string | null {
  const pageInfo = data.page_info;
  if (typeof pageInfo === 'string' && pageInfo.trim()) return pageInfo.trim();
  if (object(pageInfo)) {
    const next = pageInfo.next_page_info;
    if (typeof next === 'string' && next.trim()) return next.trim();
  }
  return null;
}

function campaignIdFromDiscountApp(discountApp: Record<string, unknown>): string | undefined {
  if (!Array.isArray(discountApp.metafields)) return undefined;
  for (const metafield of discountApp.metafields) {
    if (!object(metafield) || metafield.namespace !== 'sale' || metafield.key !== 'quantity_breaks' || typeof metafield.value !== 'string') continue;
    try {
      const rule = JSON.parse(metafield.value);
      if (object(rule) && typeof rule.campaignId === 'string' && rule.campaignId.trim()) return rule.campaignId;
    } catch { /* A non-JSON metafield cannot safely identify this campaign. */ }
  }
  return undefined;
}

function stateFromDiscountApp(discountId: string, discountApp: Record<string, unknown>, metadata: ShoplineRequestMetadata): AutomaticDiscountState {
  if (discountApp.app_discount_id !== discountId || typeof discountApp.status !== 'string') {
    throw new DiscountUncertainError('SHOPLINE Product Function discount state was incomplete.', metadata, 'INVALID_REST_DISCOUNT_APP');
  }
  const status = discountApp.status.trim().toLowerCase();
  const nodeId = nodeIdFromDiscountApp(discountId, discountApp);
  const campaignId = campaignIdFromDiscountApp(discountApp);
  const endsAt = typeof discountApp.ends_at === 'string' && Number.isFinite(Date.parse(discountApp.ends_at)) ? new Date(discountApp.ends_at).toISOString() : undefined;
  if (status === 'active' || status === 'scheduled') return { state: 'active', discountId, nodeId, metadata, ...(campaignId ? { campaignId } : {}) };
  if (status === 'inactive') return { state: 'paused', discountId, nodeId, metadata, ...(campaignId ? { campaignId } : {}), ...(endsAt ? { endsAt } : {}) };
  if (status === 'expired') return { state: 'paused', discountId, nodeId, metadata, ...(campaignId ? { campaignId } : {}), ...(endsAt ? { endsAt } : {}) };
  if (status === 'invalid' || status === 'deleted') {
    return { state: 'missing', discountId: null, nodeId: null, metadata };
  }
  throw new DiscountUncertainError(`SHOPLINE returned an unsupported Product Function discount status: ${discountApp.status}.`, metadata, 'UNSUPPORTED_REST_DISCOUNT_STATUS');
}

export async function readAutomaticDiscountState(session: AuthContext, discountId: string, env: Env, _knownNodeId?: string | null): Promise<AutomaticDiscountState> {
  if (!discountId.trim()) throw new Error('SHOPLINE discount ID is required.');
  const { states, metadata } = await collectAutomaticDiscountStates(session, env, discountId);
  return states.get(discountId) ?? { state: 'missing', discountId: null, nodeId: null, metadata };
}

export async function listAutomaticDiscountStates(session: AuthContext, env: Env): Promise<Map<string, AutomaticDiscountState>> {
  return (await collectAutomaticDiscountStates(session, env)).states;
}

async function collectAutomaticDiscountStates(session: AuthContext, env: Env, stopAfterDiscountId?: string): Promise<{ states: Map<string, AutomaticDiscountState>; metadata: ShoplineRequestMetadata }> {
  const pageSize = 100;
  let pageInfo: string | null = null;
  const visitedPages = new Set<string>();
  const states = new Map<string, AutomaticDiscountState>();
  for (;;) {
    const query = new URLSearchParams({ discount_type: 'automatic', function_id: functionId(env), limit: String(pageSize) });
    if (pageInfo) query.set('page_info', pageInfo);
    const { data, metadata } = await request(session, env, FUNCTION_DISCOUNT_VERSION, 'GET', `/sales/discount_app.json?${query.toString()}`, undefined, 'openapi');
    const discountApps = data.discount_apps;
    if (!Array.isArray(discountApps) || discountApps.some((item) => !object(item))) {
      throw new DiscountUncertainError('SHOPLINE Product Function discount list was incomplete.', metadata, 'INVALID_REST_DISCOUNT_APP_LIST');
    }
    for (const discountApp of discountApps) {
      if (typeof discountApp.app_discount_id !== 'string' || !discountApp.app_discount_id.trim()) {
        throw new DiscountUncertainError('SHOPLINE Product Function discount list contained an invalid activity ID.', metadata, 'INVALID_REST_DISCOUNT_APP_LIST');
      }
      const discountId = discountApp.app_discount_id;
      states.set(discountId, stateFromDiscountApp(discountId, discountApp, metadata));
    }
    if (stopAfterDiscountId && states.has(stopAfterDiscountId)) return { states, metadata };
    const nextPage = nextDiscountAppsPage(data);
    if (!nextPage) {
      if (discountApps.length >= pageSize) {
        throw new DiscountUncertainError('SHOPLINE Product Function discount pagination was incomplete.', metadata, 'INCOMPLETE_REST_DISCOUNT_APP_PAGINATION');
      }
      return { states, metadata };
    }
    if (visitedPages.has(nextPage)) {
      throw new DiscountUncertainError('SHOPLINE Product Function discount pagination repeated a cursor.', metadata, 'INVALID_REST_DISCOUNT_APP_PAGINATION');
    }
    visitedPages.add(nextPage);
    pageInfo = nextPage;
  }
}

export async function activateAutomaticDiscount(session: AuthContext, discountId: string, env: Env, knownNodeId?: string | null): Promise<string> {
  const current = await readAutomaticDiscountState(session, discountId, env, knownNodeId);
  if (current.state === 'missing' || !current.nodeId) throw new DiscountUncertainError('SHOPLINE activation target was not found.', current.metadata);
  const { data, metadata } = await graphQL(session, `mutation ActivateAutomaticDiscount($id: ID!) {
    discountAutomaticActivate(id: $id) {
      userErrors { field message }
    }
  }`, { id: current.nodeId });
  assertMutationAccepted(data, 'discountAutomaticActivate', metadata);
  const verified = await readAutomaticDiscountState(session, discountId, env, current.nodeId);
  if (verified.state !== 'active' || verified.discountId !== discountId) throw new DiscountUncertainError('SHOPLINE activation was not confirmed.', verified.metadata);
  return discountId;
}

export async function deactivateAutomaticDiscount(session: AuthContext, discountId: string, env: Env, knownNodeId?: string | null): Promise<string> {
  const current = await readAutomaticDiscountState(session, discountId, env, knownNodeId);
  if (current.state === 'missing' || !current.nodeId) throw new DiscountUncertainError('SHOPLINE deactivation target was not found.', current.metadata);
  try {
    const { data, metadata } = await graphQL(session, `mutation DeactivateAutomaticDiscount($id: ID!) {
      discountAutomaticDeactivate(id: $id) {
        userErrors { field message }
      }
    }`, { id: current.nodeId });
    assertMutationAccepted(data, 'discountAutomaticDeactivate', metadata);
  } catch (error) {
    if (!(error instanceof DiscountEmptyGraphQLResponseError)) throw error;
    const verified = await readAutomaticDiscountState(session, discountId, env, current.nodeId);
    if (verified.state === 'paused' && verified.discountId === discountId) return discountId;
    throw new DiscountUncertainError('SHOPLINE deactivation was not confirmed after an empty response.', verified.metadata, 'EMPTY_GRAPHQL_RESPONSE');
  }
  const verified = await readAutomaticDiscountState(session, discountId, env, current.nodeId);
  if (verified.state !== 'paused' || verified.discountId !== discountId) throw new DiscountUncertainError('SHOPLINE deactivation was not confirmed.', verified.metadata);
  return discountId;
}

export async function createAutomaticDiscount(session: AuthContext, campaign: CampaignDraft, env: Env, shopCurrencyCode = env.SHOPLINE_STORE_CURRENCY_CODE): Promise<PublishedAutomaticDiscount> {
  if (!shopCurrencyCode) throw new Error('Shop currency is unavailable. Publication is unavailable.');
  await assertOfferPublication(session, campaign, env, shopCurrencyCode);
  const { data } = await request(session, env, ADMIN_VERSION, 'POST', '/sales/discount_automatic_app.json', discountInput(campaign, env, shopCurrencyCode));
  const id = data.app_discount_id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('SHOPLINE did not return a valid discount ID. Publication is uncertain.');
  // The create is never retried. A list can briefly lag behind the accepted write.
  for (const delay of [0, 300, 900]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    let verified: AutomaticDiscountState;
    try {
      verified = await readAutomaticDiscountState(session, id, env);
    } catch (error) {
      // Respect throttling and do not turn a failed read into a rejected create.
      const metadata = error instanceof DiscountUncertainError || error instanceof DiscountRejectedError
        ? error.metadata : { upstreamStatus: 0, upstreamRequestId: null };
      throw new DiscountCreationPendingError(id, metadata);
    }
    if (verified.state === 'active' && verified.discountId === id && verified.nodeId) return { discountId: id, nodeId: verified.nodeId };
    if (delay === 900) throw new DiscountCreationPendingError(id, verified.metadata);
  }
  throw new Error('Creation confirmation did not run.');
}

export async function updateAutomaticDiscount(session: AuthContext, discountId: string, campaign: CampaignDraft, env: Env, shopCurrencyCode = env.SHOPLINE_STORE_CURRENCY_CODE, endsAt: string | null = campaign.endsAt ?? null): Promise<string> {
  if (!discountId.trim()) throw new Error('SHOPLINE discount ID is required for update.');
  if (!shopCurrencyCode) throw new Error('Shop currency is unavailable. Update is unavailable.');
  await assertOfferPublication(session, campaign, env, shopCurrencyCode);
  let data: Record<string, unknown>;
  try {
    ({ data } = await request(session, env, ADMIN_VERSION, 'PUT', `/sales/discount_automatic_app/${encodeURIComponent(discountId)}.json`, discountInput(campaign, env, shopCurrencyCode, endsAt)));
  } catch (error) {
    if (error instanceof DiscountRejectedError) throw error;
    if (error instanceof DiscountUncertainError) throw error;
    throw new DiscountUncertainError('SHOPLINE update outcome is uncertain.');
  }
  if (data.app_discount_id !== discountId) throw new DiscountUncertainError('SHOPLINE update did not confirm the discount ID.');
  return discountId;
}

export type AutomaticDiscountSchedule = { startsAt: string; endsAt: string | null };

export async function updateAutomaticDiscountSchedule(
  session: AuthContext,
  discountId: string,
  campaign: CampaignDraft,
  env: Env,
  shopCurrencyCode: string | undefined,
  schedule: AutomaticDiscountSchedule,
): Promise<string> {
  if (!discountId.trim()) throw new Error('SHOPLINE discount ID is required for update.');
  if (!shopCurrencyCode) throw new Error('Shop currency is unavailable. Update is unavailable.');
  await assertOfferPublication(session, campaign, env, shopCurrencyCode);
  let data: Record<string, unknown>;
  try {
    ({ data } = await request(
      session,
      env,
      ADMIN_VERSION,
      'PUT',
      `/sales/discount_automatic_app/${encodeURIComponent(discountId)}.json`,
      discountInput(campaign, env, shopCurrencyCode, schedule.endsAt, schedule.startsAt),
    ));
  } catch (error) {
    if (error instanceof DiscountRejectedError) throw error;
    if (error instanceof DiscountUncertainError) throw error;
    throw new DiscountUncertainError('SHOPLINE update outcome is uncertain.');
  }
  if (data.app_discount_id !== discountId) throw new DiscountUncertainError('SHOPLINE update did not confirm the discount ID.');
  return discountId;
}

async function updateAutomaticDiscountEndTime(session: AuthContext, discountId: string, env: Env, endsAt: string | null): Promise<string> {
  if (!discountId.trim()) throw new Error('SHOPLINE discount ID is required for update.');
  let data: Record<string, unknown>;
  try {
    ({ data } = await request(session, env, ADMIN_VERSION, 'PUT', `/sales/discount_automatic_app/${encodeURIComponent(discountId)}.json`, {
      function_id: functionId(env), ends_at: endsAt,
    }));
  } catch (error) {
    if (error instanceof DiscountRejectedError) throw error;
    if (error instanceof DiscountUncertainError) throw error;
    throw new DiscountUncertainError('SHOPLINE update outcome is uncertain.');
  }
  if (data.app_discount_id !== discountId) throw new DiscountUncertainError('SHOPLINE update did not confirm the discount ID.');
  return discountId;
}

export type PauseAutomaticDiscountResult = { state: 'paused' | 'pausing'; discountId: string; endsAt: string };

const PAUSE_DELAY_MS = 10_000;

export async function pauseAutomaticDiscount(
  session: AuthContext,
  discountId: string,
  campaign: CampaignDraft,
  env: Env,
  shopCurrencyCode = env.SHOPLINE_STORE_CURRENCY_CODE,
): Promise<PauseAutomaticDiscountResult> {
  const endsAt = new Date((env.now?.() ?? Date.now()) + PAUSE_DELAY_MS).toISOString();
  await updateAutomaticDiscount(session, discountId, campaign, env, shopCurrencyCode, endsAt);
  const verified = await readAutomaticDiscountState(session, discountId, env);
  if (verified.discountId !== discountId) throw new DiscountUncertainError('SHOPLINE pause was not confirmed.', verified.metadata);
  if (verified.state === 'paused') return { state: 'paused', discountId, endsAt };
  if (verified.state === 'active') return { state: 'pausing', discountId, endsAt };
  throw new DiscountUncertainError('SHOPLINE pause was not confirmed.', verified.metadata);
}

export async function resumeAutomaticDiscount(session: AuthContext, discountId: string, env: Env): Promise<string> {
  await updateAutomaticDiscountEndTime(session, discountId, env, null);
  const verified = await readAutomaticDiscountState(session, discountId, env);
  if (verified.state !== 'active' || verified.discountId !== discountId) throw new DiscountUncertainError('SHOPLINE resume was not confirmed.', verified.metadata);
  return discountId;
}

export async function cleanupExpiredAutomaticDiscount(session: AuthContext, discountId: string, env: Env, knownNodeId?: string | null, knownState?: AutomaticDiscountState): Promise<ShoplineRequestMetadata> {
  const current = knownState ?? await readAutomaticDiscountState(session, discountId, env, knownNodeId);
  if (current.state === 'missing') return current.metadata;
  if (current.state !== 'paused') throw new DiscountUncertainError('SHOPLINE expired discount cleanup was not confirmed.', current.metadata);
  return deleteKnownAutomaticDiscount(session, discountId, env, current);
}

async function deleteFunctionDiscountActivity(session: AuthContext, activityId: string, env: Env): Promise<ShoplineRequestMetadata> {
  const path = `/admin/openapi/${FUNCTION_DISCOUNT_VERSION}/sales/discount_apps/${encodeURIComponent(functionId(env))}/${encodeURIComponent(activityId)}.json`;
  let response: Response;
  try {
    response = await fetch(`https://${session.handle}.myshopline.com${path}`, {
      method: 'DELETE', headers: shoplineAdminHeaders(session.accessToken),
    });
  } catch {
    throw new DiscountUncertainError('SHOPLINE Function discount deletion outcome is uncertain.');
  }
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* malformed upstream errors are handled below */ }
  const metadata = requestMetadata(response, data, path);
  if (!response.ok) {
    const message = `SHOPLINE Function discount API returned ${response.status}.`;
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message, metadata);
    throw new DiscountUncertainError(message, metadata);
  }
  if (data.success === true || response.status === 204) return metadata;
  if (data.success === false || typeof data.errors === 'string') throw new DiscountRejectedError('SHOPLINE Function discount deletion was rejected.', metadata);
  throw new DiscountUncertainError('SHOPLINE Function discount deletion response was incomplete.', metadata);
}

async function deleteKnownAutomaticDiscount(session: AuthContext, activityId: string, env: Env, current: AutomaticDiscountState, beforeDelete?: () => Promise<void>): Promise<ShoplineRequestMetadata> {
  if (current.state === 'missing') return current.metadata;
  await beforeDelete?.();
  const deleted = await deleteFunctionDiscountActivity(session, activityId, env);
  const verified = await readAutomaticDiscountState(session, activityId, env, current.nodeId);
  if (verified.state !== 'missing') throw new DiscountUncertainError('SHOPLINE deletion was not confirmed.', verified.metadata);
  return deleted;
}

export async function deleteAutomaticDiscount(session: AuthContext, activityId: string, env: Env, knownNodeId?: string | null, beforeDelete?: () => Promise<void>): Promise<ShoplineRequestMetadata> {
  if (!activityId.trim()) throw new Error('SHOPLINE discount ID is required for deletion.');
  return deleteKnownAutomaticDiscount(session, activityId, env, await readAutomaticDiscountState(session, activityId, env, knownNodeId), beforeDelete);
}
