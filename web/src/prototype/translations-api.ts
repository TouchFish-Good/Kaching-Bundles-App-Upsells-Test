import type { StorefrontTranslations } from "./storefront-copy";

type Fetcher = typeof fetch;
export class TranslationApiError extends Error {
  constructor(readonly status: number, readonly endpoint: string, message: string) { super(message); }
}

async function requestTranslations(locale: string, options: RequestInit, fetcher: Fetcher): Promise<StorefrontTranslations> {
  const response = await fetcher(`/api/quantity-breaks/translations/${encodeURIComponent(locale)}`, { credentials: "same-origin", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new TranslationApiError(response.status, `/api/quantity-breaks/translations/${locale}`, body.error ?? `Translation request failed (${response.status}).`);
  if (!body.translations || typeof body.translations !== "object" || Array.isArray(body.translations)) throw new TranslationApiError(response.status, `/api/quantity-breaks/translations/${locale}`, "Translation response is invalid.");
  return body.translations;
}

export function readTranslations(locale: string, fetcher: Fetcher = fetch): Promise<StorefrontTranslations> {
  return requestTranslations(locale, {}, fetcher);
}

export function writeTranslations(locale: string, copy: StorefrontTranslations, fetcher: Fetcher = fetch): Promise<StorefrontTranslations> {
  return requestTranslations(locale, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(copy) }, fetcher);
}
