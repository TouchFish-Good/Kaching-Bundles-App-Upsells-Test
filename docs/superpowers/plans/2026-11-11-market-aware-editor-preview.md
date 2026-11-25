# Market-Aware Editor Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discount editor preview language selector with a market selector that drives storefront copy, currency, and market-correct preview pricing.

**Architecture:** Extend the existing authenticated markets endpoint with market presentation metadata and add an authenticated Worker product-market-price proxy. Keep market selection ephemeral in `CampaignEditor`; pass a normalized preview-pricing input to `StorefrontWidget`, which remains responsible for showing tier calculations. A focused frontend helper resolves market-specific fixed discount amounts without persisting preview state.

**Tech Stack:** React 18, TypeScript, Vite SSR tests, Hono, Cloudflare Workers, Vitest, SHOPLINE Admin REST API v20260901.

**Spec:** `docs/superpowers/specs/2026-11-11-market-preview-design.md`

## Global Constraints

- Only the discount editor `.editorPreview` changes; the translation page retains its language selector.
- The primary market is the initial editor preview selection; fallback order is enabled market, then first market.
- Use `web_presence.default_locale` for preview copy and `market_price.currency_code` for price formatting.
- Apply one product-level market price to every preview variant, as confirmed by the merchant.
- All preview calculations operate on safe integer minor units.
- Fixed discount types need `marketOverrides[marketId].mode === 'specified_amount'`; never reinterpret a shop-currency amount as market currency.
- All Worker store Admin requests must use `shoplineAdminHeaders()`.
- Use the supplied `/markets/{productId}/price.json` contract. A failed or malformed response must be visible as unavailable, not silently fall back to shop pricing.
- Do not add or modify `:focus` or `:focus-visible` CSS rules.
- Do not commit or push until the reviewed local change set receives the project-required Git approval.

## Review Focus

- A market without `primary: true` selects the first enabled market rather than leaving preview locale or price undefined. Covered in Task 2.
- A market with more than ten regions is sent to SHOPLINE in deterministic batches of at most ten country codes. Covered in Task 1.
- A malformed price amount, duplicate country code, unsupported currency, or non-2-letter country is rejected before it can reach pricing UI. Covered in Task 1.
- Every fixed discount mode uses a `specified_amount` override in the selected market, and `auto_convert` cannot show a numerically plausible but wrong discount. Covered in Task 2.
- Switching product or market cannot let an earlier asynchronous price response overwrite the latest selected market. Covered in Task 3.

---

### Task 1: Normalize Market Metadata and Proxy Product Market Prices

**Files:**
- Modify: `worker/src/routes/catalog.ts`
- Modify: `worker/test/routes-contract.test.ts`

**Interfaces:**
- Produces `GET /api/quantity-breaks/markets` rows with `primary: boolean`, `defaultLocale: string | null`, and `regionCodes: string[]` in addition to existing fields.
- Produces `GET /api/quantity-breaks/products/:id/market-prices?country_codes=JP,US` with `{ prices: Array<{ countryCode: string; amountMinor: number; currencyCode: string }> }`.
- Consumes a product ID matching `validId()` and a comma-separated list of one to one hundred unique uppercase ISO alpha-2 country codes.

- [ ] **Step 1: Write the failing Worker route tests**

Add tests to `worker/test/routes-contract.test.ts` that stub SHOPLINE calls and assert:

```ts
expect(await markets.json()).resolves.toEqual({
  markets: [{
    id: 'jp', name: 'Japan', enabled: true, currencyCode: 'JPY',
    regionCurrencyCodes: ['JPY'], specifiedAmountSupported: true,
    primary: false, defaultLocale: 'ja', regionCodes: ['JP'],
  }],
  shopCurrencyCode: 'USD',
});

const prices = await worker.fetch(new Request(
  'https://app.vswwy.cn/api/quantity-breaks/products/product-1/market-prices?country_codes=JP,US',
  { headers },
), testEnv, createExecutionContext());
expect(await prices.json()).resolves.toEqual({
  prices: [
    { countryCode: 'JP', amountMinor: 906687400, currencyCode: 'JPY' },
    { countryCode: 'US', amountMinor: 5739000, currencyCode: 'USD' },
  ],
});
```

Also add cases for eleven requested country codes (two upstream calls of ten and one), invalid query values returning `400`, malformed `amount` returning `502`, and a request asserting the existing Admin request helper supplies `Authorization`, `Accept`, `Content-Type`, and `User-Agent` headers.

- [ ] **Step 2: Run the focused Worker test to verify it fails**

Run: `cd worker && npm test -- routes-contract.test.ts`

Expected: FAIL because market metadata and `/market-prices` route do not exist.

- [ ] **Step 3: Extend the market response normalizer**

In `worker/src/routes/catalog.ts`, add a local record guard and make `market(raw)` preserve existing normalized fields and add validated values:

```ts
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const webPresence = record(source.web_presence) ? source.web_presence : {};
const defaultLocale = typeof webPresence.default_locale === 'string' && webPresence.default_locale.trim()
  ? webPresence.default_locale.trim()
  : null;
const regionCodes = uniqueRegions.map((region) => region.code);
return { id, name, enabled, currencyCode, regionCurrencyCodes, specifiedAmountSupported,
  primary: source.primary === true, defaultLocale, regionCodes };
```

Retain region objects long enough to derive both `regionCodes` and `regionCurrencyCodes`; do not derive a country code from a currency code.

- [ ] **Step 4: Add the authenticated price proxy**

Add the route before the general product-list route. Parse and validate `country_codes`, split valid deduplicated codes into chunks of ten, then use the existing `admin(session, path)` helper:

```ts
const response = await admin(session,
  `/markets/${encodeURIComponent(productId)}/price.json?country_codes=${encodeURIComponent(chunk.join(','))}`,
);
```

Normalize only entries whose `country_code`, `market_price.amount`, and `market_price.currency_code` meet the interface contract. Convert `amount` with `Number()` only after testing it is a decimal integer and `Number.isSafeInteger()`. Return all normalized entries ordered by the caller's country-code order.

- [ ] **Step 5: Run focused Worker tests to verify green**

Run: `cd worker && npm test -- routes-contract.test.ts`

Expected: PASS, including the expanded market shape, batched price requests, invalid input, malformed response, and header assertions.

### Task 2: Add Pure Market Preview Selection and Pricing Resolution

**Files:**
- Create: `web/src/prototype/market-preview.ts`
- Modify: `web/src/prototype/market-config.ts`
- Modify: `web/src/prototype/money.ts`
- Modify: `web/test/market-config.test.mjs`
- Modify: `web/test/money.test.mjs`

**Interfaces:**
- Produces `StoreMarket` with `primary`, `defaultLocale`, and `regionCodes` fields.
- Produces `selectPreviewMarket(markets: StoreMarket[]): StoreMarket | undefined`.
- Produces `resolveMarketPreviewTier(tier: Tier, marketId: string): { status: 'ready'; tier: Tier } | { status: 'unavailable' }`.
- Produces `formatMinorMoney(amountMinor: number, currencyCode: string, locale: string): string`.

- [ ] **Step 1: Write failing pure-function tests**

Add tests that assert primary selection, enabled fallback, and the exact four fixed type calculations after resolving a JPY market override:

```js
const tier = {
  quantity: 2, label: 'Two', discountPercent: 0, discountType: 'fixed_amount',
  discountValue: 100, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 800 } },
};
assert.deepEqual(resolveMarketPreviewTier(tier, 'jp'), {
  status: 'ready', tier: { ...tier, discountValue: 800 },
});
assert.deepEqual(resolveMarketPreviewTier({ ...tier, marketOverrides: { jp: { mode: 'auto_convert' } } }, 'jp'), { status: 'unavailable' });
assert.equal(formatMinorMoney(906687400, 'JPY', 'ja'), '￥906,687,400');
```

Cover `fixed_price`, `bundle_fixed_amount`, `bundle_fixed_price`, percentage, and `none`; percentage and `none` remain ready without a market override.

- [ ] **Step 2: Run focused web tests to verify they fail**

Run: `cd web && node --test test/market-config.test.mjs test/money.test.mjs`

Expected: FAIL because the market-preview helpers and minor-unit formatter do not exist.

- [ ] **Step 3: Define market preview types and helpers**

Extend `StoreMarket` in `market-config.ts` and implement `market-preview.ts`:

```ts
const fixedTypes = new Set(['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price']);

export function resolveMarketPreviewTier(tier: Tier, marketId: string) {
  if (!fixedTypes.has(tier.discountType ?? 'percentage')) return { status: 'ready', tier } as const;
  const override = tier.marketOverrides?.[marketId];
  if (!override || override.mode !== 'specified_amount') return { status: 'unavailable' } as const;
  return { status: 'ready', tier: { ...tier, discountValue: override.amountMinor } } as const;
}
```

`selectPreviewMarket()` must prefer `primary && enabled`, then `enabled`, then the first supplied market. `formatMinorMoney()` must validate safe non-negative minor units, divide by `10 ** minorUnits(currencyCode)`, and format with `Intl.NumberFormat(locale, { style: 'currency', currency })`.

- [ ] **Step 4: Run focused web tests to verify green**

Run: `cd web && node --test test/market-config.test.mjs test/money.test.mjs test/tier-pricing.test.mjs`

Expected: PASS, proving the new helpers do not change base tier pricing semantics.

### Task 3: Replace the Editor Language Control and Feed Market Prices to the Widget

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/StorefrontWidget.tsx`
- Modify: `web/src/prototype/campaign-editor-messages.ts`
- Modify: `web/test/editor-storefront-language-preview.test.mjs`
- Modify: `web/test/editor-preview-product.test.mjs`
- Modify: `web/test/widget-layout.test.mjs`

**Interfaces:**
- Consumes Task 1's market and price endpoints plus Task 2's `selectPreviewMarket`, `resolveMarketPreviewTier`, and `formatMinorMoney`.
- Extends `StorefrontWidget` with optional `previewPricing?: { state: 'loading' | 'ready' | 'unavailable'; amountMinor?: number; currencyCode?: string }` and `previewMarketId?: string`.
- Produces a preview toolbar control marked `data-preview-control="market"`; `data-preview-control="language"` no longer exists in `CampaignEditor`.

- [ ] **Step 1: Write failing editor and widget behavior tests**

Replace the editor storefront-language test with an integration test that returns a primary US market and Japanese market, then asserts:

```js
assert.equal(document.querySelector('[data-preview-control="market"] select').value, 'us');
assert.equal(document.querySelector('[data-preview-control="language"]'), null);
assert.match(document.body.textContent, /Add 2 to cart.*\$57,390\.00/);

selector.value = 'jp';
selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await waitForPriceRequest();
assert.match(document.body.textContent, /カートに追加/);
assert.match(document.body.textContent, /￥906,687,400/);
```

Add a stale-response test: select US, switch to Japan before the US promise resolves, resolve US last, and assert the JPY value remains rendered. Add static-rendering tests for every fixed discount type using `previewMarketId="jp"` and a `specified_amount` override, plus an unavailable auto-convert assertion.

- [ ] **Step 2: Run focused web tests to verify they fail**

Run: `cd web && node --test test/editor-storefront-language-preview.test.mjs test/editor-preview-product.test.mjs test/widget-layout.test.mjs`

Expected: FAIL because the editor still renders a language selector and the widget cannot consume market pricing.

- [ ] **Step 3: Replace preview language state with preview market state**

In `CampaignEditor.tsx` remove the editor-only `/store-languages` request and `previewLocale` selector state. Reuse the already loaded `markets` state, initialize the selected ID with `selectPreviewMarket(markets.data?.markets ?? [])`, and derive locale from the selected market's `defaultLocale` using the existing storefront locale normalizer.

Fetch price only when both `previewProduct.id` and selected market `regionCodes` exist. Use an `AbortController` plus request identity guard before updating state so stale responses cannot overwrite the most recent selection. Reset `previewTranslations` when the derived locale changes, then read saved translations for that derived locale.

- [ ] **Step 4: Render the specified-market control and complete localized states**

Replace the language control with a `<label data-preview-control="market">` select showing market name and currency. Add `specifiedMarket`, `marketPriceLoading`, `marketPriceUnavailable`, and `marketConversionUnavailable` keys in every supported admin language within `campaign-editor-messages.ts`.

Preserve current toolbar order: device, market, product. A disabled market remains visible but disabled in the selector. Market, price, and translation errors must use visible text and retry only the relevant request.

- [ ] **Step 5: Apply market price and market fixed override in `StorefrontWidget`**

When `previewPricing.state === 'ready'`, use `amountMinor` as every selected and candidate variant's base minor-unit price. Route every tier through `resolveMarketPreviewTier()` before `calculateTierPricing()`. Use `formatMinorMoney()` for tier price, summary, savings badge, item price, original price, and button variables.

For `loading` or `unavailable`, show the localized status and do not render price totals or an enabled add-to-cart action. When a fixed tier has no specified market amount, show `marketConversionUnavailable` rather than calculating with the shop amount.

- [ ] **Step 6: Run focused editor and widget tests to verify green**

Run: `cd web && node --test test/editor-storefront-language-preview.test.mjs test/editor-preview-product.test.mjs test/widget-layout.test.mjs`

Expected: PASS, including primary selection, locale switching, stale response protection, market price display, all fixed override modes, and unavailable calculation behavior.

### Task 4: Regression Verification and Visual Evidence

**Files:**
- Modify: `docs/APP_PROGRESS.md` only after the listed checks and screenshots have been performed.

**Interfaces:**
- Consumes the Worker price endpoint, editor UI, and preview pricing behavior from Tasks 1-3.
- Produces verified local evidence without claiming live SHOPLINE price acceptance until an authenticated merchant test has run.

- [ ] **Step 1: Run complete automated checks**

Run:

```bash
cd worker && npm test && npm run typecheck && npm run build
cd ../web && npm run test:prototype && npm run build
git diff --check
```

Expected: all new market-preview tests pass; report any pre-existing failures separately by test name rather than attributing them to this feature.

- [ ] **Step 2: Perform local visual verification**

Start the local application against mock endpoints that return US and Japan markets. Capture desktop and 390px screenshots showing:

```text
Primary United States -> English copy + USD product market price
Japan                -> Japanese copy + JPY product market price
Specified amount     -> each fixed discount type uses the Japan amount
Unavailable price    -> no misleading shop-currency total or add-to-cart action
```

Save screenshots under `reference/screenshots/` with descriptive market-preview filenames. Check toolbar text does not overlap at both widths and product names still ellipsize inside `previewProductValue`.

- [ ] **Step 3: Update evidence and prepare the local review**

Update `docs/APP_PROGRESS.md` only with commands and screenshots actually completed. Inspect `git status --short`, all tracked and untracked files, `git diff --check`, and a staged secret scan before asking the user whether to push. Do not stage, commit, push, or deploy until the project-required approval for the reviewed change set.
