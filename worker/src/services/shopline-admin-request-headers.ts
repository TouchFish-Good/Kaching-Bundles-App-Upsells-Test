export const SHOPLINE_ADMIN_ACCEPT = 'application/json';
export const SHOPLINE_ADMIN_USER_AGENT = 'SHOPLINE-Quantity-Breaks-App/1.0';

/**
 * Required headers for every authenticated request to a store Admin REST or
 * Admin GraphQL endpoint. Platform security can reject requests without them.
 */
export function shoplineAdminHeaders(accessToken: string, initialHeaders?: HeadersInit): Headers {
  const headers = new Headers(initialHeaders);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Accept', SHOPLINE_ADMIN_ACCEPT);
  headers.set('User-Agent', SHOPLINE_ADMIN_USER_AGENT);
  return headers;
}

/** Retry-After seconds or HTTP date, bounded for callers that expose a retry delay. */
export function shoplineAdminRetryAfter(header: string | null): number {
  const value = header?.trim();
  const seconds = value && /^\d+$/.test(value) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : 1;
  return Number.isFinite(seconds) ? Math.max(1, Math.min(3600, Math.ceil(seconds))) : 1;
}
