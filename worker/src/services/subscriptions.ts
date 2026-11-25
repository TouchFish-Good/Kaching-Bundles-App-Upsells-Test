const PARTNER_API_ORIGIN = 'https://partner.myshopline.com';
const PARTNER_API_VERSION = 'v20260901';

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;
export type PartnerSubscriptionDiagnostic = {
  code: string | null;
  message: string | null;
};

export class PartnerSubscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly diagnostic: PartnerSubscriptionDiagnostic | null = null,
  ) { super(message); }
}

export type SubscriptionSku = {
  skuId: string;
  period: number | null;
  periodType: string | null;
  price: Record<string, number>;
};

export type SubscriptionProduct = {
  spuKey: string;
  skus: SubscriptionSku[];
};

export type CreatePaymentInput = {
  appKey: string;
  handle: string;
  spuKey: 'ultra';
  skuId: string;
  outTradeNo: string;
  returnUrl: string;
  currency: 'USD';
};

export type SubscriptionListInput = {
  appKey: string;
  handle: string;
  pageNum?: number;
  pageSize?: number;
  subIds?: string[];
};

export type SubscriptionRecord = {
  subId: string;
  status: string;
  type: string | null;
  spuKey: string | null;
  handle: string | null;
  startAt: number | null;
  endAt: number | null;
  autoRecurring: boolean | null;
  isTrial: boolean | null;
};

export type SubscriptionDetail = {
  featureKeys: string[];
};

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lowerString(value: unknown): string | null {
  return stringValue(value)?.toLowerCase() ?? null;
}

function firstValue(source: JsonObject, ...keys: string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function safePartnerDiagnostic(value: unknown): PartnerSubscriptionDiagnostic | null {
  const source = asObject(value);
  const candidates = [
    source,
    asObject(source.error),
    asObject(source.data),
    asObject(asObject(source.data).error),
    asObject(source.result),
    asObject(asObject(source.result).error),
  ];
  for (const candidate of candidates) {
    const firstError = Array.isArray(candidate.errors) ? asObject(candidate.errors[0]) : {};
    const codeValue = candidate.code ?? candidate.error_code ?? candidate.errorCode ?? firstError.code;
    const code = stringValue(codeValue) ?? (typeof codeValue === 'number' && Number.isFinite(codeValue) ? String(codeValue) : null);
    const message = stringValue(candidate.message) ?? stringValue(candidate.msg) ?? stringValue(candidate.error) ?? stringValue(candidate.errors) ?? stringValue(candidate.description) ?? stringValue(firstError.message) ?? stringValue(firstError.msg);
    if (code || message) return { code, message: message?.slice(0, 256) ?? null };
  }
  return null;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function priceValue(value: unknown): Record<string, number> {
  const source = typeof value === 'string'
    ? (() => { try { return JSON.parse(value); } catch { return {}; } })()
    : value;
  return Object.fromEntries(Object.entries(asObject(source)).flatMap(([currency, amount]) => {
    const normalizedCurrency = currency.trim().toUpperCase();
    const normalizedAmount = numberValue(amount);
    return /^[A-Z]{3}$/.test(normalizedCurrency) && normalizedAmount !== null ? [[normalizedCurrency, normalizedAmount]] : [];
  }));
}

function normalizeProduct(value: unknown): SubscriptionProduct | null {
  const raw = asObject(value);
  const spuKey = lowerString(firstValue(raw, 'spu_key', 'spuKey'));
  if (!spuKey) return null;
  const skuList = firstValue(raw, 'sku_list', 'skuList');
  const skus = Array.isArray(skuList) ? skuList.flatMap((sku): SubscriptionSku[] => {
    const source = asObject(sku);
    const skuId = stringValue(firstValue(source, 'sku_id', 'skuId'));
    if (!skuId) return [];
    return [{
      skuId,
      period: numberValue(firstValue(source, 'period', 'periodDays')),
      periodType: stringValue(firstValue(source, 'period_type', 'periodType'))?.toUpperCase() ?? null,
      price: priceValue(source.price),
    }];
  }) : [];
  return { spuKey, skus };
}

function normalizeSubscription(value: unknown): SubscriptionRecord | null {
  const raw = asObject(value);
  const subId = stringValue(firstValue(raw, 'sub_id', 'subId'));
  const status = lowerString(firstValue(raw, 'sub_status', 'status'));
  if (!subId || !status) return null;
  return {
    subId,
    status,
    type: lowerString(firstValue(raw, 'sub_type', 'subType')),
    spuKey: lowerString(firstValue(raw, 'spu_key', 'spuKey')),
    handle: stringValue(firstValue(raw, 'handle', 'shopHandle')),
    startAt: numberValue(firstValue(raw, 'start_at', 'startAt')),
    endAt: numberValue(firstValue(raw, 'end_at', 'endAt')),
    autoRecurring: typeof firstValue(raw, 'auto_recurring', 'autoRenewStatus') === 'boolean' ? firstValue(raw, 'auto_recurring', 'autoRenewStatus') as boolean : null,
    isTrial: typeof firstValue(raw, 'is_trial', 'trial') === 'boolean' ? firstValue(raw, 'is_trial', 'trial') as boolean : null,
  };
}

function toQuery(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  return query.toString();
}

export function selectUltraMonthlyUsdSku(products: SubscriptionProduct[]): { skuId: string; currency: 'USD' } {
  const matches = products.flatMap((product) => product.spuKey === 'ultra'
    ? product.skus.filter((sku) => sku.period === 30 && sku.periodType === 'DAY' && typeof sku.price.USD === 'number')
    : []);
  if (matches.length !== 1) throw new PartnerSubscriptionError('Expected exactly one USD 30-day Ultra SKU.');
  return { skuId: matches[0].skuId, currency: 'USD' };
}

export class PartnerSubscriptionClient {
  constructor(private readonly accessToken: string, private readonly fetcher: Fetcher = fetch) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonObject> {
    if (!this.accessToken) throw new PartnerSubscriptionError('SHOPLINE Partner access token is not configured.');
    const response = await this.fetcher.call(globalThis, `${PARTNER_API_ORIGIN}/${PARTNER_API_VERSION}/app_subscribe${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Shopline-Access-Token': this.accessToken, ...init.headers },
    });
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      const diagnostic = (() => { try { return safePartnerDiagnostic(JSON.parse(responseBody)); } catch { return null; } })();
      throw new PartnerSubscriptionError(`SHOPLINE Partner subscription API returned ${response.status}.`, response.status, diagnostic);
    }
    try {
      return asObject(await response.json());
    } catch {
      throw new PartnerSubscriptionError('SHOPLINE Partner subscription API returned invalid JSON.');
    }
  }

  async listProducts(appKey: string, spuKeys?: string[]): Promise<SubscriptionProduct[]> {
    const query = toQuery({ app_key: appKey, spu_keys: spuKeys?.length ? spuKeys.join(',') : undefined });
    const payload = await this.request(`/productList.json?${query}`);
    return Array.isArray(payload.product_list) ? payload.product_list.flatMap((product) => {
      const normalized = normalizeProduct(product);
      return normalized ? [normalized] : [];
    }) : [];
  }

  async createPayment(input: CreatePaymentInput): Promise<{ url: string }> {
    const payload = await this.request('/create_pay.json', {
      method: 'POST',
      body: JSON.stringify({
        app_key: input.appKey,
        handle: input.handle,
        application_charge: {
          spu_key: input.spuKey,
          sku_id: input.skuId,
          out_trade_no: input.outTradeNo,
          return_url: input.returnUrl,
          currency: input.currency,
        },
      }),
    });
    const url = stringValue(payload.url);
    if (!url) throw new PartnerSubscriptionError('SHOPLINE Partner subscription API did not return a payment URL.');
    return { url };
  }

  async getChargeStatus(appKey: string, outTradeNo: string): Promise<{ status: string; subscriptionId: string | null }> {
    const payload = await this.request(`/charges/status.json?${toQuery({ app_key: appKey, out_trade_no: outTradeNo })}`);
    const data = asObject(payload.data);
    const status = stringValue(data.status);
    if (!status) throw new PartnerSubscriptionError('SHOPLINE Partner subscription API did not return a charge status.');
    return { status, subscriptionId: stringValue(data.subscription_id) };
  }

  async listSubscriptions(input: SubscriptionListInput): Promise<{ subscriptions: SubscriptionRecord[]; lastPage: boolean }> {
    const payload = await this.request(`/list.json?${toQuery({
      app_key: input.appKey,
      handle: input.handle,
      service_type: 1,
      page_num: input.pageNum,
      page_size: input.pageSize,
      sub_ids: input.subIds?.length ? input.subIds.join(',') : undefined,
    })}`);
    const subscriptions = asObject(payload.subscriptions ?? payload.data);
    const list = subscriptions.data ?? subscriptions.list;
    return {
      subscriptions: Array.isArray(list) ? list.flatMap((subscription) => {
        const normalized = normalizeSubscription(subscription);
        return normalized ? [normalized] : [];
      }) : [],
      lastPage: subscriptions.last_page === true || subscriptions.lastPage === true,
    };
  }

  async getSubscriptionDetail(input: { appKey: string; handle: string; subId: string }): Promise<SubscriptionDetail> {
    const payload = await this.request(`/detail.json?${toQuery({ app_key: input.appKey, handle: input.handle, sub_id: input.subId })}`);
    const subscription = asObject(payload.subscription ?? payload.data);
    const values = subscription.feature_key_list ?? subscription.featureKeyList;
    const featureKeys = Array.isArray(values)
      ? values.flatMap((value) => stringValue(value) ? [stringValue(value)!] : [])
      : typeof values === 'string' ? values.split(',').map((value) => value.trim()).filter(Boolean) : [];
    return { featureKeys };
  }
}
