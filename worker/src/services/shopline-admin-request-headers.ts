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
