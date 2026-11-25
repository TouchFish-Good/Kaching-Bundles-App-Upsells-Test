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
  price: OfferPrice | null;
  imageUrl?: string | null;
};
export type OfferPreviewProduct = {
  id: string;
  title: string;
  identityVerified: boolean;
  available: boolean;
  imageUrl?: string | null;
  variants: OfferPreviewVariant[];
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
  const key = demand.length ? JSON.stringify([gifts, bundles, context]) : "";
  const sequence = useRef(0);
  const retryUntil = useRef(0);
  const [result, setResult] = useState<{
    key: string;
    value: OfferPreviewState;
  }>({ key: "", value: { state: "unavailable", products: [] } });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const revision = `draft-${++sequence.current}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const items = new Map<string, Set<string>>();
    for (const rule of demand) {
      const ids = items.get(rule.productId) ?? new Set<string>();
      rule.allowedVariantIds.forEach((id) => ids.add(id));
      items.set(rule.productId, ids);
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
    const run = async () => {
      if (Date.now() < retryUntil.current) {
        setResult({
          key,
          value: {
            state: "unavailable",
            products: [],
            retryAt: retryUntil.current,
          },
        });
        timer = setTimeout(run, retryUntil.current - Date.now());
        return;
      }
      setResult({ key, value: { state: "loading", products: [] } });
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
        if (!controller.signal.aborted)
          setResult({
            key,
            value: { state: "ready", products: [...products.values()] },
          });
      } catch (error) {
        if (controller.signal.aborted) return;
        const seconds =
          error instanceof OfferPreviewError ? error.retryAfter : undefined;
        setResult({
          key,
          value: {
            state: "unavailable",
            products: [],
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
  return result.key === key
    ? result.value
    : { state: key ? "loading" : "unavailable", products: [] };
}
