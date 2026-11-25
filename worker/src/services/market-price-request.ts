import { shoplineAdminHeaders } from './shopline-admin-request-headers';

type Session = { handle: string; accessToken: string };
type Lane = { tail: Promise<unknown>; nextAt: number; pending: number; touchedAt: number };

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

// Per-isolate protection for read-only preview prices. Other REST callers and
// other Worker isolates still share SHOPLINE's bucket; 429 remains authoritative.
export function createMarketPriceRequest(fetcher: typeof fetch = (...args) => fetch(...args)) {
  const lanes = new Map<string, Lane>();
  return async (session: Session, path: string, signal?: AbortSignal): Promise<Response> => {
    const now = Date.now();
    for (const [key, lane] of lanes) if (!lane.pending && lane.nextAt < now && now - lane.touchedAt > 120_000) lanes.delete(key);
    let lane = lanes.get(session.handle);
    if (!lane) {
      if (lanes.size >= 128) return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
      lane = { tail: Promise.resolve(), nextAt: 0, pending: 0, touchedAt: now };
      lanes.set(session.handle, lane);
    }
    if (lane.pending >= 32) return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
    const current = lane;
    current.pending++;
    const task = current.tail.catch(() => {}).then(async () => {
      for (let attempt = 0; ; attempt++) {
        await pause(Math.max(0, current.nextAt - Date.now()), signal);
        signal?.throwIfAborted();
        current.nextAt = Date.now() + 500;
        const controller = new AbortController();
        const abort = () => controller.abort(signal!.reason);
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => controller.abort(new DOMException('SHOPLINE market price request timed out.', 'TimeoutError')), 8000);
        let response: Response;
        try {
          response = await fetcher(`https://${session.handle}.myshopline.com/admin/openapi/v20260901${path}`, { headers: shoplineAdminHeaders(session.accessToken), signal: controller.signal });
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        }
        if (response.status !== 429) return response;
        const header = response.headers.get('Retry-After');
        const seconds = header?.trim() ? Number(header) : NaN;
        const dateDelay = header ? Date.parse(header) - Date.now() : NaN;
        const delay = Math.max(500, Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Number.isFinite(dateDelay) ? dateDelay : 1000 * 2 ** attempt + Math.random() * 250);
        current.nextAt = Math.max(current.nextAt, Date.now() + delay);
        if (attempt >= 2 || delay > 10_000) {
          const headers = new Headers(response.headers);
          headers.set('Retry-After', String(Math.ceil(delay / 1000)));
          return new Response(response.body, { status: 429, headers });
        }
        await response.body?.cancel();
      }
    });
    current.tail = task;
    try { return await task; }
    finally { current.pending--; current.touchedAt = Date.now(); }
  };
}

export const requestMarketPrice = createMarketPriceRequest();
