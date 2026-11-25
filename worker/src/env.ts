export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  DEVELOPER_ADMIN: Fetcher;
  ADMIN_INTERNAL_SECRET: string;
  SCOPES: string;
  SHOPLINE_APP_KEY: string;
  SHOPLINE_APP_SECRET: string;
  SHOPLINE_APP_URL: string;
  SHOPLINE_PARTNER_ACCESS_TOKEN: string;
  SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID: string;
  SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED: string;
  SHOPLINE_STORE_CURRENCY_CODE?: string;
  TOKEN_ENCRYPTION_KEY: string;
  now?: () => number;
};

export function currentTime(env: Pick<Env, 'now'>): number {
  return env.now?.() ?? Date.now();
}
