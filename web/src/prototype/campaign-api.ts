import type { ServerCampaign } from './campaign-adapter';

type Fetcher = typeof fetch;
export type CampaignCatalogProduct = { id: string; title: string; imageUrl: string | null };
export class CampaignApiError extends Error {
  constructor(readonly status: number, message: string, readonly traceId?: string) { super(message); }
}

async function request<T>(url: string, options: RequestInit, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, { credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  const traceId = response.headers?.get('X-Trace-Id') ?? undefined;
  if (!response.ok) throw new CampaignApiError(response.status, body?.error || `Campaign request failed (${response.status}).`, traceId);
  if (!body) throw new CampaignApiError(502, 'Campaign response was invalid.', traceId);
  return body;
}

export async function readCampaigns(fetcher: Fetcher = fetch, options: { configurationOnly?: boolean; signal?: AbortSignal } = {}): Promise<ServerCampaign[]> {
  const result = await request<{ campaigns: ServerCampaign[] }>(`/api/quantity-breaks/campaigns${options.configurationOnly ? '?view=configuration' : ''}`, { signal: options.signal }, fetcher);
  if (!Array.isArray(result.campaigns)) throw new CampaignApiError(502, 'Campaign response was invalid.');
  return result.campaigns;
}

export async function readCampaign(id: string, fetcher: Fetcher = fetch): Promise<ServerCampaign> {
  return (await request<{ campaign: ServerCampaign }>(`/api/quantity-breaks/campaigns/${encodeURIComponent(id)}`, {}, fetcher)).campaign;
}

export async function readCampaignByPlatformDiscount(id: string, fetcher: Fetcher = fetch): Promise<ServerCampaign> {
  return (await request<{ campaign: ServerCampaign }>(`/api/quantity-breaks/campaigns/by-platform-discount/${encodeURIComponent(id)}`, {}, fetcher)).campaign;
}

export type CampaignCoverageCandidate = {
  id?: string;
  scope: { kind: 'products' | 'collections'; productIds?: string[]; collectionIds?: string[]; excludedProductIds: string[] };
  startsAt?: string;
  endsAt?: string;
  neverExpires?: boolean;
};
export type CampaignCoverage = {
  state: 'clear' | 'conflict' | 'unverified';
  conflicts: Array<{ campaignId: string; campaignName: string; itemId: string; itemName: string; type: 'products' | 'collections' }>;
};

export async function checkCampaignCoverage(candidate: CampaignCoverageCandidate, fetcher: Fetcher = fetch): Promise<CampaignCoverage> {
  return request<CampaignCoverage>('/api/quantity-breaks/campaigns/coverage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign: candidate }),
  }, fetcher);
}

export async function saveCampaign(draft: Omit<ServerCampaign, 'revision' | 'updatedAt'>, expectedRevision: number, fetcher: Fetcher = fetch): Promise<ServerCampaign> {
  const existing = expectedRevision > 0;
  return (await request<{ campaign: ServerCampaign }>(`/api/quantity-breaks/campaigns${existing ? `/${encodeURIComponent(draft.id)}` : ''}`, {
    method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign: draft, expectedRevision }),
  }, fetcher)).campaign;
}

export async function deleteCampaign(id: string, expectedRevision: number, fetcher: Fetcher = fetch): Promise<void> {
  await request(`/api/quantity-breaks/campaigns/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
  }, fetcher);
}

export type CampaignDeleteBatchResult = { id: string; outcome: 'queued' | 'requires_pause' | 'unverified' | 'failed'; message?: string };
export type CampaignOperationBatch = { id: string; state: 'queued' | 'running' | 'completed' | 'failed'; operations: Array<{ id: string; campaignId: string; state: 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'requires_pause'; lastError: string | null }> };

export async function deleteCampaigns(campaigns: Array<{ id: string; revision: number }>, fetcher: Fetcher = fetch): Promise<{ batch?: { id: string; state: string }; results: CampaignDeleteBatchResult[] }> {
  return request('/api/quantity-breaks/campaigns/batch-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaigns: campaigns.map((campaign) => ({ id: campaign.id, expectedRevision: campaign.revision })) }),
  }, fetcher);
}

export async function readCampaignOperationBatch(id: string, fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<CampaignOperationBatch> {
  const { batch } = await request<{ batch: CampaignOperationBatch }>(`/api/quantity-breaks/campaign-operations/${encodeURIComponent(id)}`, { signal }, fetcher);
  if (!batch || !Array.isArray(batch.operations)) throw new CampaignApiError(502, 'Campaign operation response was invalid.');
  return batch;
}

// A queued write is not a successful deletion. Only poll the read endpoint;
// never resubmit a write when its result is delayed or uncertain.
export async function waitForCampaignOperationBatch(id: string, fetcher: Fetcher = fetch, options: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number } = {}): Promise<CampaignOperationBatch | null> {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  let latest: CampaignOperationBatch | null = null;
  try {
    while (!controller.signal.aborted) {
      latest = await readCampaignOperationBatch(id, fetcher, controller.signal);
      if (latest.operations.length && latest.operations.every((operation) => ['succeeded', 'failed', 'requires_pause'].includes(operation.state))) return latest;
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, options.intervalMs ?? 1_000);
        controller.signal.addEventListener('abort', finish, { once: true });
        if (controller.signal.aborted) finish();
      });
    }
    options.signal?.throwIfAborted();
    return latest;
  } catch {
    options.signal?.throwIfAborted();
    // Losing the result read does not mean the queued deletion failed. Retain
    // confirmed successes and leave the remaining tasks explicitly unconfirmed.
    return latest;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function changeCampaignStatus(id: string, status: 'active' | 'paused', expectedRevision: number, fetcher: Fetcher = fetch): Promise<ServerCampaign> {
  return (await request<{ campaign: ServerCampaign }>(`/api/quantity-breaks/campaigns/${encodeURIComponent(id)}/status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, expectedRevision }),
  }, fetcher)).campaign;
}

export type CampaignStatusOutcome = 'activated' | 'activation_pending' | 'already_active' | 'paused' | 'pausing' | 'already_paused' | 'conflict' | 'unverified' | 'failed';
export type CampaignStatusResult = {
  id: string;
  outcome: CampaignStatusOutcome;
  campaign?: ServerCampaign;
  message?: string;
  conflict?: {
    campaignId: string;
    campaignName: string;
    conflictingCampaignId: string;
    conflictingCampaignName: string;
    overlap: { type: 'products' | 'collections'; ids: string[]; names: string[] };
  };
};

export async function changeCampaignStatuses(status: 'active' | 'paused', campaigns: Array<{ id: string; revision: number }>, fetcher: Fetcher = fetch): Promise<CampaignStatusResult[]> {
  return (await request<{ results: CampaignStatusResult[] }>('/api/quantity-breaks/campaigns/batch-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, campaigns: campaigns.map((campaign) => ({ id: campaign.id, expectedRevision: campaign.revision })) }),
  }, fetcher)).results;
}

export async function readCampaignProducts(ids: string[], fetcher: Fetcher = fetch): Promise<{ products: CampaignCatalogProduct[]; missingIds: string[] }> {
  const query = new URLSearchParams({ ids: ids.join(',') });
  return request<{ products: CampaignCatalogProduct[]; missingIds: string[] }>(`/api/quantity-breaks/products?${query}`, {}, fetcher);
}

export async function endCampaign(id: string, expectedRevision: number, fetcher: Fetcher = fetch): Promise<ServerCampaign> {
  return (await request<{ campaign: ServerCampaign }>(`/api/quantity-breaks/campaigns/${encodeURIComponent(id)}/end`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }),
  }, fetcher)).campaign;
}

export type CampaignProductTitle = { id: string; title: string };

export async function readCampaignProductTitles(ids: string[], fetcher: Fetcher = fetch): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) return {};
  const titles: Record<string, string> = {};
  for (let index = 0; index < uniqueIds.length; index += 500) {
    const response = await request<{ products?: CampaignProductTitle[] }>(`/api/quantity-breaks/products?ids=${encodeURIComponent(uniqueIds.slice(index, index + 500).join(','))}`, {}, fetcher);
    for (const product of response.products ?? []) titles[product.id] = product.title;
  }
  return titles;
}
