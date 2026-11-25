export type PreviewPrice = { countryCode: string; amountMinor: number; currencyCode: string };

type Entry = { controller: AbortController; promise: Promise<PreviewPrice>; consumers: number };

export function createPreviewPriceClient(fetcher: typeof fetch, options: { now?: () => number; interval?: number } = {}) {
  const now = options.now ?? Date.now;
  const interval = options.interval ?? 500;
  const cache = new Map<string, { price: PreviewPrice; expiresAt: number }>();
  const pending = new Map<string, Entry>();
  let tail: Promise<unknown> = Promise.resolve();
  let nextAt = 0;
  return {
    load(variantId: string, country: string, signal?: AbortSignal): Promise<PreviewPrice> {
      if (signal?.aborted) return Promise.reject(signal.reason);
      const key = `${variantId}:${country}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return Promise.resolve(cached.price);
      cache.delete(key);
      let entry = pending.get(key);
      if (!entry || entry.controller.signal.aborted) {
        const controller = new AbortController();
        const created: Entry = { controller, consumers: 0, promise: Promise.resolve(null as unknown as PreviewPrice) };
        created.promise = tail.catch(() => {}).then(async () => {
          controller.signal.throwIfAborted();
          const delay = Math.max(0, nextAt - now());
          if (delay) await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
            const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, delay);
            controller.signal.addEventListener('abort', abort, { once: true });
          });
          controller.signal.throwIfAborted();
          nextAt = now() + interval;
          const response = await fetcher(`/api/quantity-breaks/variants/${encodeURIComponent(variantId)}/market-prices?country_codes=${country}`, { credentials: 'same-origin', signal: controller.signal });
          if (!response.ok) throw new Error('Market price unavailable');
          const data = await response.json() as { prices?: PreviewPrice[] };
          const price = data.prices?.find(item => item.countryCode === country && Number.isSafeInteger(item.amountMinor) && item.amountMinor >= 0 && /^[A-Z]{3}$/.test(item.currencyCode));
          if (!price) throw new Error('Market price unavailable');
          controller.signal.throwIfAborted();
          cache.set(key, { price, expiresAt: now() + 60_000 });
          if (cache.size > 200) cache.delete(cache.keys().next().value!);
          return price;
        }).finally(() => { if (pending.get(key) === created) pending.delete(key); });
        pending.set(key, created);
        tail = created.promise.catch(() => {});
        entry = created;
      }
      const current = entry;
      current.consumers++;
      return new Promise((resolve, reject) => {
        let finished = false;
        const finish = (value?: PreviewPrice, failure?: unknown) => {
          if (finished) return;
          finished = true;
          signal?.removeEventListener('abort', abort);
          current.consumers--;
          if (failure) reject(failure); else resolve(value!);
        };
        const abort = () => {
          finish(undefined, signal!.reason);
          if (!current.consumers) current.controller.abort();
        };
        signal?.addEventListener('abort', abort, { once: true });
        current.promise.then(value => finish(value), error => finish(undefined, error));
      });
    },
  };
}
