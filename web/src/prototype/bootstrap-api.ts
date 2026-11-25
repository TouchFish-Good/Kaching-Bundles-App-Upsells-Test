import type { ServerCampaign } from './campaign-adapter';
import type { ShopIdentity } from './shop-identity-api';
import type { SubscriptionResponse } from './subscription-api';

export type BootstrapResponse = {
  subscription: SubscriptionResponse;
  shop?: ShopIdentity;
  campaigns?: ServerCampaign[];
};

export class BootstrapApiError extends Error {
  constructor(readonly status: number, readonly code: string | null, readonly traceId: string | null) {
    super('Application startup failed.');
  }
}

export async function readBootstrap(fetcher: typeof fetch = fetch, includeCampaigns = true, signal?: AbortSignal): Promise<BootstrapResponse> {
  const response = await fetcher(`/api/quantity-breaks/bootstrap?campaigns=${includeCampaigns ? '1' : '0'}`, {
    credentials: 'same-origin', signal,
  });
  const body = await response.json().catch(() => null) as (BootstrapResponse & { code?: string }) | null;
  const traceId = response.headers?.get('X-Trace-Id') ?? null;
  if (!response.ok || !body?.subscription || typeof body.subscription.access !== 'boolean') {
    throw new BootstrapApiError(response.ok ? 502 : response.status, body?.code ?? null, traceId);
  }
  if (body.subscription.access && (!body.shop?.storeId || (includeCampaigns && !Array.isArray(body.campaigns)))) {
    throw new BootstrapApiError(502, 'INVALID_RESPONSE', traceId);
  }
  return body;
}
