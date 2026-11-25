import { withFreshAccessToken } from '../auth/session';
import type { Env } from '../env';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

type Entry = { expiresAt: number; pending: boolean; result: Promise<string[]> };
const caches = new WeakMap<D1Database, Map<string, Entry>>();
const MAX_CACHE = 256;
const MAX_PENDING = 16;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

type Lane = { tail: Promise<void>; nextAt: number; cooldownUntil: number; pending: number };
const lanes = new WeakMap<D1Database, Map<string, Lane>>();
async function collectionRequest(handle: string, url: string, headers: HeadersInit, signal: AbortSignal, env: Env): Promise<Response> {
  let storeLanes = lanes.get(env.DB);
  if (!storeLanes) { storeLanes = new Map(); lanes.set(env.DB, storeLanes); }
  const now = Date.now();
  for (const [key, lane] of storeLanes) if (!lane.pending && Math.max(lane.nextAt, lane.cooldownUntil) + 60_000 < now) storeLanes.delete(key);
  const key = `${env.SHOPLINE_APP_KEY}:${handle}`;
  let lane = storeLanes.get(key);
  if (!lane) {
    if (storeLanes.size >= 128) throw new Error('Collection lookup busy.');
    lane = { tail: Promise.resolve(), nextAt: 0, cooldownUntil: 0, pending: 0 };
    storeLanes.set(key, lane);
  }
  if (lane.pending >= MAX_PENDING || lane.cooldownUntil > now) throw new Error('Collection lookup busy.');
  const current = lane;
  current.pending++;
  const task = current.tail.then(async () => {
    signal.throwIfAborted();
    if (current.cooldownUntil > Date.now()) throw new Error('Collection lookup cooling down.');
    const delay = Math.max(0, current.nextAt - Date.now());
    if (delay) await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
      signal.addEventListener('abort', abort, { once: true });
    });
    signal.throwIfAborted();
    current.nextAt = Date.now() + 500;
    const response = await fetch(url, { headers, signal });
    if (response.status === 429) {
      const header = response.headers.get('Retry-After');
      const seconds = header?.trim() ? Number(header) : NaN;
      const retryDate = header ? Date.parse(header) : NaN;
      const wait = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Number.isFinite(retryDate) ? retryDate - Date.now() : 1000;
      current.cooldownUntil = Date.now() + Math.max(1000, Math.min(86_400_000, wait));
    }
    return response;
  });
  current.tail = task.then(() => {}, () => {});
  try { return await task; } finally { current.pending--; }
}

async function load(handle: string, productId: string, env: Env): Promise<string[]> {
  const session = await withFreshAccessToken(handle, env);
  // One deadline for the whole page sequence, never follow arbitrary URLs from Link.
  const signal = AbortSignal.timeout(5_000);
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 4; page++) {
    const url = new URL(`https://${handle}.myshopline.com/admin/openapi/v20260601/products/collects.json`);
    url.searchParams.set('product_id', productId);
    url.searchParams.set('limit', '250');
    if (cursor) url.searchParams.set('page_info', cursor);
    const response = await collectionRequest(handle, url.href, shoplineAdminHeaders(session.accessToken), signal, env);
    if (!response.ok) throw new Error('Current collection membership unavailable.');
    const payload = await response.json() as { collects?: Array<{ collection_id?: unknown; product_id?: unknown }> };
    if (!Array.isArray(payload.collects) || payload.collects.length > 250) throw new Error('Invalid collection membership.');
    for (const row of payload.collects) {
      if (!row || typeof row.collection_id !== 'string' || !ID.test(row.collection_id) || row.product_id !== productId) throw new Error('Invalid collection relationship.');
      ids.add(row.collection_id);
    }
    const link = (response.headers.get('Link') || '').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
    if (!/rel\s*=\s*["']?next\b/i.test(link)) return [...ids];
    const href = /<([^>]+)>[^<]*?rel\s*=\s*["']?next\b/i.exec(link)?.[1]?.replace(/^\\+|\\+$/g, '');
    cursor = href ? new URL(href, url).searchParams.get('page_info') : null;
    if (!cursor || cursor.length > 4096 || /\s/.test(cursor) || cursors.has(cursor)) throw new Error('Incomplete collection pagination.');
    cursors.add(cursor);
  }
  throw new Error('Collection membership exceeds display lookup limit.');
}

export async function resolveStorefrontCollections(handle: string, productId: string, env: Env): Promise<string[]> {
  let cache = caches.get(env.DB);
  if (!cache) { cache = new Map(); caches.set(env.DB, cache); }
  const now = env.now?.() ?? Date.now();
  const key = `${env.SHOPLINE_APP_KEY}:${handle}:${productId}`;
  for (const [key, entry] of cache) if (!entry.pending && entry.expiresAt <= now) cache.delete(key);
  const existing = cache.get(key);
  if (existing) return existing.result;
  if ([...cache.values()].filter(entry => entry.pending).length >= MAX_PENDING) throw new Error('Collection lookup busy.');
  if (cache.size >= MAX_CACHE) {
    const oldest = [...cache].find(([, entry]) => !entry.pending);
    if (oldest) cache.delete(oldest[0]);
    else throw new Error('Collection lookup busy.');
  }
  const entry: Entry = { expiresAt: now + 60_000, pending: true, result: Promise.resolve([]) };
  entry.result = load(handle, productId, env).then(ids => {
    entry.pending = false; entry.expiresAt = (env.now?.() ?? Date.now()) + 60_000; return ids;
  }, error => {
    entry.pending = false; entry.expiresAt = (env.now?.() ?? Date.now()) + 5_000; throw error;
  });
  cache.set(key, entry);
  return entry.result;
}
