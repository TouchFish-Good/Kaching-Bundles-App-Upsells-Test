import fetch from 'node-fetch';
import type { CampaignDraft } from './model';
import { validateCampaign } from './validate';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../admin-request-headers';
import { ADMIN_REST_VERSION } from '../admin-rest-version';

const ACTIVITY_VERSION = 'v20261201';
type Fetcher = typeof fetch;
type Session = { handle: string; accessToken: string };
export class DiscountRejectedError extends Error {}

function currencyDecimals(currencyCode: string): number {
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error('A valid currency code is required.');
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits;
  if (!Number.isInteger(digits) || digits < 0 || digits > 3) throw new Error(`Unsupported currency precision: ${currencyCode}.`);
  return digits;
}

export function buildDiscountRule(campaign: CampaignDraft, shopCurrencyCode: string) {
  const errors = validateCampaign(campaign);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    schemaVersion: 1,
    campaignId: campaign.id,
    storeCurrencyCode: shopCurrencyCode,
    storeCurrencyDecimals: currencyDecimals(shopCurrencyCode),
    scope: campaign.scope.kind === 'collections'
      ? { kind: 'collections', collectionIds: campaign.scope.collectionIds, excludedProductIds: campaign.scope.excludedProductIds }
      : campaign.scope,
    tiers: campaign.tiers.map((tier) => ({
      tierId: tier.tierId,
      quantity: tier.quantity,
      discountType: tier.discountType,
      ...(tier.discountType === 'none' ? {} : { discountValue: tier.discountValue }),
      marketOverrides: Object.fromEntries(Object.entries(tier.marketOverrides || {}).map(([marketId, override]) => [marketId,
        override.mode === 'auto_convert' ? override : { ...override, currencyDecimals: currencyDecimals(override.currencyCode) },
      ])),
    })),
  };
}

function discountInput(campaign: CampaignDraft, currency: string, functionId: string) {
  if (!functionId.trim()) throw new Error('SHOPLINE Product Discount Function ID is required.');
  const rule = buildDiscountRule(campaign, currency);
  return {
    title: campaign.name,
    function_id: functionId,
    combines_with_modes: {
      order_discount_code: campaign.combinesWith.orderDiscounts,
      order_automatic_discount: campaign.combinesWith.orderDiscounts,
      product_discount_code: campaign.combinesWith.productDiscounts,
      product_automatic_discount: campaign.combinesWith.productDiscounts,
      shipping_discount_code: campaign.combinesWith.shippingDiscounts,
      shipping_automatic_discount: campaign.combinesWith.shippingDiscounts,
    },
    metafields: [{ namespace: 'sale', key: 'quantity_breaks', type: 'json', value: JSON.stringify(rule), description: 'Quantity Breaks Function rule' }],
    starts_at: campaign.startsAt,
    ends_at: campaign.endsAt ?? null,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function request(session: Session, method: 'POST' | 'PUT' | 'DELETE', path: string, version: string, body: unknown, fetcher: Fetcher, requestId?: string): Promise<Record<string, unknown>> {
  if (!/^[a-zA-Z0-9-]+$/.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  const url = `https://${session.handle}.myshopline.com/admin/openapi/${version}${path}`;
  const headers = { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (requestId) console.info('SHOPLINE Admin REST discount trace', { requestId, stage: 'upstream_request', method, endpoint: path, version });
  if (requestId && method === 'POST' && process.env.NODE_ENV !== 'production' && process.env.SHOPLINE_LOG_FULL_CURL === '1') {
    const args = ['curl', '--request', method, url, ...Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]), ...(payload ? ['--data-raw', payload] : [])];
    console.info('SHOPLINE Admin REST discount trace', { requestId, stage: 'request_curl', curl: args.map((arg) => arg === 'curl' || arg === '--request' || arg === '-H' || arg === '--data-raw' ? arg : shellQuote(arg)).join(' ') });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const startedAt = Date.now();
  try {
    let response;
    try { response = await fetcher(url, { method, headers, body: payload, signal: controller.signal }); }
    catch (error) {
      if (requestId) console.error('SHOPLINE Admin REST discount trace', { requestId, stage: 'upstream_network_error', endpoint: path, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
      throw error;
    }
    if (requestId) {
      const rawTraceId = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((name) => response.headers?.get(name)).find(Boolean);
      const traceId = rawTraceId && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTraceId) ? rawTraceId : null;
      console.info('SHOPLINE Admin REST discount trace', { requestId, stage: 'upstream_response', endpoint: path, status: response.status, durationMs: Date.now() - startedAt, traceId });
    }
    const raw = await response.text();
    if (raw.length > 65536) throw new Error('SHOPLINE discount response is too large.');
    let data: Record<string, unknown>;
    try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
    catch { data = {}; }
    if (!response.ok) {
      const message = `SHOPLINE Function discount API returned ${response.status}.`;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message);
      throw new Error(message);
    }
    if (typeof data.errors === 'string' && data.errors) throw new Error(`SHOPLINE discount result is uncertain: ${data.errors}`);
    return data;
  } finally { clearTimeout(timeout); }
}

export async function createAutomaticDiscount(session: Session, campaign: CampaignDraft, currency: string, functionId: string, fetcher: Fetcher = fetch, requestId?: string): Promise<string> {
  const data = await request(session, 'POST', '/sales/discount_automatic_app.json', ADMIN_REST_VERSION, discountInput(campaign, currency, functionId), fetcher, requestId);
  const id = data.app_discount_id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('SHOPLINE did not return a valid discount ID. Publication is uncertain.');
  return id;
}

export async function updateAutomaticDiscount(session: Session, id: string, campaign: CampaignDraft, currency: string, functionId: string, fetcher: Fetcher = fetch, requestId?: string): Promise<string> {
  if (!id) throw new Error('SHOPLINE discount ID is required for update.');
  if (!/^[a-zA-Z0-9-]+$/.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  const input = discountInput(campaign, currency, functionId);
  const body = {
    query: 'mutation UpdateAutomaticAppDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) { discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) { automaticAppDiscount { discountId } userErrors { code message field } } }',
    variables: { id, automaticAppDiscount: {
      title: input.title, functionId: input.function_id,
      startsAt: input.starts_at, endsAt: input.ends_at,
      combinesWith: { orderDiscounts: input.combines_with_modes.order_automatic_discount, productDiscounts: input.combines_with_modes.product_automatic_discount ?? false, shippingDiscounts: input.combines_with_modes.shipping_automatic_discount },
      metafields: input.metafields,
    } },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const startedAt = Date.now();
  try {
    const response = await fetcher(`https://${session.handle}.myshopline.com/admin/graph/v20260901/graphql.json`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (requestId) console.info('SHOPLINE Admin GraphQL discount trace', { requestId, operation: 'discountAutomaticAppUpdate', status: response.status, durationMs: Date.now() - startedAt });
    if (!response.ok) {
      const message = `SHOPLINE Admin GraphQL returned ${response.status}.`;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message);
      throw new Error(message);
    }
    const raw = await response.text();
    if (raw.length > 65536) throw new Error('SHOPLINE update response is too large; result is uncertain.');
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw) as Record<string, unknown>; }
    catch { throw new Error('SHOPLINE update response is malformed; result is uncertain.'); }
    if (data.errors) throw new Error('SHOPLINE update returned GraphQL errors; result is uncertain.');
    const payload = (data.data as Record<string, unknown> | undefined)?.discountAutomaticAppUpdate as Record<string, unknown> | undefined;
    if (!payload || !Array.isArray(payload.userErrors)) throw new Error('SHOPLINE update response is incomplete; result is uncertain.');
    if (payload.userErrors.length) {
      const first = payload.userErrors[0] as Record<string, unknown>;
      throw new DiscountRejectedError(`SHOPLINE rejected discount update: ${typeof first.message === 'string' ? first.message : String(first.code ?? 'unknown error')}`);
    }
    const returnedId = (payload.automaticAppDiscount as Record<string, unknown> | undefined)?.discountId;
    if (returnedId !== id) throw new Error('SHOPLINE update did not confirm the same discount ID; result is uncertain.');
  } finally { clearTimeout(timeout); }
  return id;
}

export async function deleteAutomaticDiscount(session: Session, id: string, fetcher: Fetcher = fetch, requestId?: string, functionId?: string): Promise<void> {
  if (!id || !functionId) throw new Error('SHOPLINE Function ID and discount ID are required for deletion.');
  const path = `/sales/discount_apps/${encodeURIComponent(functionId)}/${encodeURIComponent(id)}.json`;
  const data = await request(session, 'DELETE', path, ACTIVITY_VERSION, undefined, fetcher, requestId);
  if (data.success !== true) throw new Error('SHOPLINE deletion did not confirm the discount ID.');
}
