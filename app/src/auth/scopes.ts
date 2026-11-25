export const REQUIRED_SHOPLINE_SCOPES = [
  'read_products',
  'write_products',
  'read_discounts',
  'write_discounts',
  'read_store_information',
  'read_markets',
  'read_translation',
  'read_orders',
] as const;

function missingScopes(scopes: string[]): string[] {
  return REQUIRED_SHOPLINE_SCOPES.filter((scope) => !scopes.includes(scope));
}

function parseScopes(value: string): string[] {
  return value.split(',').map((scope) => scope.trim()).filter(Boolean);
}

export function resolveShoplineScopes(raw?: string): string[] {
  if (raw === undefined) return [...REQUIRED_SHOPLINE_SCOPES];
  const scopes = parseScopes(raw);
  const missing = missingScopes(scopes);
  if (missing.length) throw new Error(`SHOPLINE SCOPES missing required permissions: ${missing.join(', ')}`);
  return scopes;
}

export function assertAuthorizedSessionScopes(scope?: string): void {
  const missing = missingScopes(parseScopes(scope || ''));
  if (missing.length) throw new Error(`SHOPLINE session missing required permissions: ${missing.join(', ')}`);
}
