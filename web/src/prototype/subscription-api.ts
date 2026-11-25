export type SubscriptionEntitlementState = 'unknown' | 'trial' | 'active' | 'grace' | 'review_pending' | 'inactive';
export type SubscriptionResponse = {
  entitlement: { state: SubscriptionEntitlementState; activeSubscriptionId: string | null; validUntil: number | null; nextValidFrom?: number | null; nextValidUntil?: number | null; nextDisplayFrom?: number | null; nextDisplayUntil?: number | null; graceUntil: number | null; autoRecurring: boolean | null; absenceConfirmations: number } | null;
  access: boolean;
  planPageRequired: boolean;
  plan: { spuKey: string; currency: string; price: number; periodDays: number; label: string };
};

export class SubscriptionApiError extends Error {
  constructor(readonly status: number, readonly code: string | null, readonly requestId: string | null, message: string) { super(message); }
}
async function json<T>(response: Response): Promise<T> {
  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* Preserve a stable error for malformed upstream responses. */ }
  if (!response.ok) throw new SubscriptionApiError(response.status, typeof body.code === 'string' ? body.code : null, typeof body.requestId === 'string' ? body.requestId : null, typeof body.error === 'string' ? body.error : 'Subscription request failed.');
  return body as T;
}
export async function readSubscription(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<SubscriptionResponse> {
  const response = await fetcher('/api/quantity-breaks/subscription', { credentials: 'same-origin', signal });
  const body = await json<SubscriptionResponse>(response);
  if (!body || typeof body.access !== 'boolean' || (body.planPageRequired !== undefined && typeof body.planPageRequired !== 'boolean')) {
    throw new SubscriptionApiError(502, 'INVALID_RESPONSE', response.headers?.get('X-Trace-Id') ?? null, 'Subscription response is invalid.');
  }
  return body;
}

export async function startSubscriptionCheckout(fetcher: typeof fetch = fetch): Promise<{ checkoutUrl: string; outTradeNo: string }> {
  const result = await json<{ checkoutUrl?: unknown; outTradeNo?: unknown }>(await fetcher('/api/quantity-breaks/subscription/checkout', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intent: 'subscribe' }),
  }));
  if (typeof result.checkoutUrl !== 'string' || typeof result.outTradeNo !== 'string') throw new SubscriptionApiError(502, null, null, 'Subscription checkout response is invalid.');
  return { checkoutUrl: result.checkoutUrl, outTradeNo: result.outTradeNo };
}
