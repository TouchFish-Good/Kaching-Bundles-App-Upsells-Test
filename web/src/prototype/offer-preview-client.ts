import { useEffect, useRef, useState } from "react";
import type { OfferModuleConfig } from "../../../shared/offer-core.mjs";
import { normalizeStorefrontLocale } from "./storefront-locales";
export type OfferPrice = {
  amountMinor: number;
  currencyCode: string;
  currencyDecimals: number;
};
export type OfferPreviewVariant = {
  id: string;
  title?: string;
  available: boolean;
  availability?: "available" | "sold_out" | "unknown";
  unavailableReason?: string;
  options?: Array<{ name: string; value: string }>;
  price: OfferPrice | null;
  imageUrl?: string | null;
};
export type OfferPreviewProduct = {
  id: string;
  title: string;
  identityVerified: boolean;
  available: boolean;
  imageUrl?: string | null;
  availability?: "available" | "sold_out" | "unknown";
  variants: OfferPreviewVariant[];
  unavailableReason?: string;
  reason?: string;
};
export type OfferPreviewState = {
  state: "loading" | "ready" | "unavailable";
  products: OfferPreviewProduct[];
  retryAt?: number;
  error?: string;
};
export type OfferPreviewContext = {
  marketId?: string;
  currencyCode?: string;
  countryCode?: string;
  locale?: string;
};
export class OfferPreviewError extends Error {
  constructor(
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
export async function loadOfferPreview(
  selection: Array<{ productId: string; variantIds: string[] }>,
  revision: string,
  context: OfferPreviewContext,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<OfferPreviewProduct[]> {
  const response = await fetcher("/api/quantity-breaks/offer-preview", {
    method: "POST",
    credentials: "same-origin",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selection, revision, ...context }),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 429) {
    const raw = response.headers.get("Retry-After");
    const header =
      raw && /^\d+$/.test(raw)
        ? Number(raw)
        : raw
          ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
          : 0;
    throw new OfferPreviewError(
      "Preview temporarily unavailable",
      Math.min(3600, Math.max(1, header || Number(body?.retryAfter) || 1)),
    );
  }
  if (!response.ok)
    throw new OfferPreviewError(body?.error || "Preview unavailable");
  const locale = normalizeStorefrontLocale(context.locale) ?? "en";
  if (
    body?.version !== 2 ||
    body.revision !== revision ||
    body.locale !== locale ||
    (context.marketId && body.marketId !== context.marketId) ||
    (context.currencyCode && body.currencyCode !== context.currencyCode) ||
    !Array.isArray(body.products)
  )
    throw new OfferPreviewError("Stale preview context");
  const allowed = new Map(
    selection.map((item) => [item.productId, new Set(item.variantIds)]),
  );
  return body.products
    .filter(
      (p: OfferPreviewProduct) =>
        typeof p.id === "string" &&
        allowed.has(p.id) &&
        p.identityVerified === true &&
        Array.isArray(p.variants),
    )
    .map((p: OfferPreviewProduct) => ({
      ...p,
      variants: p.variants.filter(
        (v) => typeof v.id === "string" && allowed.get(p.id)!.has(v.id),
      ),
    }));
}
export function useOfferPreview(
  gifts: OfferModuleConfig | undefined,
  bundles: OfferModuleConfig | undefined,
  context: OfferPreviewContext,
  fetcher: typeof fetch,
): OfferPreviewState {
  const demand = [gifts, bundles]
    .filter((m) => m?.enabled)
    .flatMap((m) => m!.items);
  const requested = new Map<string, Set<string>>();
  for (const rule of demand) {
    const ids = requested.get(rule.productId) ?? new Set<string>();
    rule.allowedVariantIds.forEach(id => ids.add(id));
    requested.set(rule.productId, ids);
  }
  const selectionsKey = [...requested].sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, ids]) => [productId, [...ids].sort()] as const);
  const key = demand.length ? JSON.stringify([selectionsKey, context.marketId ?? "", context.currencyCode ?? "", context.countryCode ?? "", normalizeStorefrontLocale(context.locale) ?? "en"]) : "";
  const contextKey = JSON.stringify([context.marketId ?? "", context.currencyCode ?? "", context.countryCode ?? "", normalizeStorefrontLocale(context.locale) ?? "en"]);
  // Deliberately scoped to this mounted editor and authenticated fetcher.
  const cache = useRef<{ contextKey: string; fetcher: typeof fetch; products: Map<string, { product: OfferPreviewProduct; expiresAt: number }> }>({ contextKey, fetcher, products: new Map() });
  if (cache.current.contextKey !== contextKey || cache.current.fetcher !== fetcher)
    cache.current = { contextKey, fetcher, products: new Map() };
  const visibleProducts = () => selectionsKey.flatMap(([id, ids]) => {
    const cached = cache.current.products.get(id);
    if (!cached || cached.expiresAt <= Date.now()) return [];
    return [{ ...cached.product, variants: cached.product.variants.filter(v => ids.includes(v.id)) }];
  });
  const sequence = useRef(0);
  const retryUntil = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    fetcher?: typeof fetch;
    value: OfferPreviewState;
  }>({ key: "", value: { state: "unavailable", products: [] } });
  useEffect(() => {
    if (!key) return;
    const activeCache = cache.current;
    const controller = new AbortController();
    const revision = `draft-${++sequence.current}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (controller.signal.aborted || cache.current !== activeCache) return;
      clearTimeout(timer);
      if (Date.now() < retryUntil.current) {
        setResult({
          key,
          fetcher,
          value: {
            state: "unavailable",
            products: visibleProducts(),
            retryAt: retryUntil.current,
          },
        });
        timer = setTimeout(run, retryUntil.current - Date.now());
        return;
      }
      for (const [id, entry] of activeCache.products)
        if (entry.expiresAt <= Date.now()) activeCache.products.delete(id);
      const cachedAtStart = new Map(activeCache.products);
      const items = new Map<string, Set<string>>();
      for (const [productId, ids] of selectionsKey) {
        const cached = activeCache.products.get(productId);
        const known = cached && cached.expiresAt > Date.now() ? new Set(cached.product.variants.map(v => v.id)) : new Set<string>();
        const missing = ids.filter(id => !known.has(id));
        if (missing.length) items.set(productId, new Set(missing));
      }
      const selections = [...items].flatMap(([productId, ids]) => {
        const all = [...ids];
        return Array.from({ length: Math.ceil(all.length / 100) }, (_, i) => ({
          productId,
          variantIds: all.slice(i * 100, (i + 1) * 100),
        }));
      });
      const batches: (typeof selections)[] = [];
      for (const selection of selections) {
        const last = batches.at(-1);
        if (
          !last ||
          last.length >= 20 ||
          last.some((s) => s.productId === selection.productId) ||
          last.reduce((n, s) => n + s.variantIds.length, 0) +
            selection.variantIds.length >
            200
        )
          batches.push([selection]);
        else last.push(selection);
      }
      setResult({ key, fetcher, value: { state: batches.length ? "loading" : "ready", products: visibleProducts() } });
      try {
        const products = new Map<string, OfferPreviewProduct>();
        for (const batch of batches)
          for (const product of await loadOfferPreview(
            batch,
            revision,
            context,
            fetcher,
            controller.signal,
          )) {
            const old = products.get(product.id);
            products.set(
              product.id,
              old
                ? {
                    ...product,
                    available: old.available || product.available,
                    variants: [...old.variants, ...product.variants],
                  }
                : product,
            );
          }
        if (!controller.signal.aborted && cache.current === activeCache) {
          for (const product of products.values()) {
            const previous = activeCache.products.get(product.id);
            const old = previous && previous.expiresAt > Date.now() ? previous.product : undefined;
            const variants = new Map(old?.variants.map(v => [v.id, v]));
            product.variants.forEach(v => variants.set(v.id, v));
            activeCache.products.set(product.id, {
              product: { ...product, available: Boolean(old?.available || product.available), variants: [...variants.values()] },
              // Extending a product must not extend the life of its old prices.
              expiresAt: Math.min(old ? previous!.expiresAt : Infinity, Date.now() + 5 * 60_000),
            });
          }
          // Only recover variants known before this request. A genuinely omitted
          // API variant must not create an unbounded immediate retry loop.
          const lostCachedVariant = selectionsKey.some(([id, ids]) => {
            const before = cachedAtStart.get(id);
            const after = activeCache.products.get(id);
            const known = new Set(after?.product.variants.map(v => v.id));
            return before?.product.variants.some(v => ids.includes(v.id) && !known.has(v.id));
          });
          setResult({ key, fetcher, value: { state: lostCachedVariant ? "loading" : "ready", products: visibleProducts() } });
          const expiration = Math.min(...selectionsKey.flatMap(([id]) => {
            const entry = activeCache.products.get(id);
            return entry ? [entry.expiresAt] : [];
          }));
          if (lostCachedVariant) timer = setTimeout(run, 1);
          else if (Number.isFinite(expiration))
            timer = setTimeout(run, Math.max(1, expiration - Date.now()));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const seconds =
          error instanceof OfferPreviewError ? error.retryAfter : undefined;
        setResult({
          key,
          fetcher,
          value: {
            state: "unavailable",
            products: visibleProducts(),
            error: String(error),
            retryAt: seconds ? Date.now() + seconds * 1000 : undefined,
          },
        });
        if (seconds) {
          retryUntil.current = Date.now() + seconds * 1000;
          timer = setTimeout(run, seconds * 1000);
        }
      }
    };
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, fetcher]);
  return result.key === key && result.fetcher === fetcher && cache.current.fetcher === fetcher && cache.current.contextKey === contextKey
    ? { ...result.value, products: key ? visibleProducts() : [] }
    : { state: key ? "loading" : "unavailable", products: key ? visibleProducts() : [] };
}
