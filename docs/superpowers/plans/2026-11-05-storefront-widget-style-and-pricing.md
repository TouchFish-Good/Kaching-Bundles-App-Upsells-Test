# Storefront Widget Style And Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the storefront Quantity Breaks widget apply independent desktop/mobile styling and accurately render campaign text, market-specific prices, per-item prices, and unavailable states.

**Architecture:** The App Block sends the active storefront country to the Worker, which resolves it to a SHOPLINE market ID. Theme JavaScript writes both desktop and mobile values to the App Block root while CSS activates aliases at 750px. Pure minor-unit helpers supply every tier, item-row, and summary amount.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers/D1, SLine, browser JavaScript, CSS custom properties, Node test runner, Vitest, SHOPLINE Admin REST API.

**Spec:** `docs/superpowers/specs/2026-11-05-storefront-widget-style-and-pricing-design.md`

## Global Constraints

- PC/M breakpoint is exactly `750px`; JavaScript must not select a single device configuration at mount time.
- All saved layout, color, font size, and font weight values are root custom properties on `.quantity-breaks-app-block`.
- Horizontal has three columns and Grid has two columns for both device configurations.
- Worker Admin API calls use `shoplineAdminHeaders()`.
- Display calculations use integer minor units and identify specified amounts by market ID, never currency inference.
- An unknown or unavailable market uses localized `Calculated at checkout`, never `0`.
- Do not add or modify focus pseudo-class CSS.
- Add quantity-only button copy to all 36 static App Block locale files.
- The completed release deploys the Theme App Extension as well as Worker/Web assets.

## Review Focus

- Same-currency markets resolve through their region country code; Task 2 adds this test.
- A country with no enabled market preserves the checkout fallback; Task 2 adds this test.
- Bundle total allocation preserves the exact minor-unit total; Task 3 adds this test.
- Repeated SKU inventory overflow follows the same unavailable UI as a globally unavailable variant; Task 4 adds this test.
- CSS at 750px activates mobile root tokens without rerunning JavaScript; Task 1 adds this test.

---

## File Structure

- `theme-app-extension/blocks/app-block.html`: emits active country code.
- `theme-app-extension/public/app-block.js`: writes style tokens, requests country-aware campaign data, calculates prices, and renders availability.
- `theme-app-extension/public/app-block.css`: activates desktop/mobile aliases and consumes layout/price tokens.
- `theme-app-extension/i18n/*.json`: supplies the quantity-only add-button key.
- `worker/src/services/storefront-market.ts`: maps country code to an enabled market ID using the installed store session.
- `worker/src/routes/storefront.ts`: validates country code and exposes a resolved market ID in the public campaign response.
- `worker/test/routes-contract.test.ts`: verifies the public endpoint's market resolution behavior.
- `tests/theme-app-extension/widget-mount.test.mjs`: verifies mounted DOM and root token behavior.
- `tests/theme-app-extension/app-block.test.mjs`: verifies pure monetary helpers.
- `tests/theme-app-extension/structure.test.mjs`: verifies static CSS and locale contracts.

### Task 1: Responsive Root Style Tokens

**Files:**
- Modify: `theme-app-extension/public/app-block.js:224-255`
- Modify: `theme-app-extension/public/app-block.css:5-85`
- Modify: `tests/theme-app-extension/widget-mount.test.mjs:26-43`
- Modify: `tests/theme-app-extension/structure.test.mjs:36-52`

**Interfaces:**
- Consumes: desktop `campaign.widget` and optional `campaign.widget.mobile`.
- Produces: `applyWidgetTokens(block, desktop, mobile)` with `--qb-desktop-*` and `--qb-mobile-*` source tokens.
- Produces: active `--qb-*` aliases selected by CSS at 750px.

- [ ] **Step 1: Write the failing token tests**

```js
assert.equal(block.style.getPropertyValue('--qb-desktop-tier-columns'), '3');
assert.equal(block.style.getPropertyValue('--qb-mobile-tier-columns'), '2');
assert.equal(block.style.getPropertyValue('--qb-desktop-tier-title-size'), '16px');
assert.equal(block.style.getPropertyValue('--qb-mobile-tier-title-size'), '13px');
assert.match(css, /@media \(max-width:\s*750px\)[\s\S]*--qb-tier-columns:var\(--qb-mobile-tier-columns\)/);
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs`

Expected: FAIL because mount-time `matchMedia` emits only one style set and Grid is four columns.

- [ ] **Step 3: Implement complete device token emission**

```js
function setDeviceToken(block, device, name, value) {
  block.style.setProperty(`--qb-${device}-${name}`, String(value));
}

function applyWidgetTokens(block, desktop, mobile) {
  for (const [name, value] of widgetTokenEntries(desktop)) setDeviceToken(block, 'desktop', name, value);
  for (const [name, value] of widgetTokenEntries(mobile || desktop)) setDeviceToken(block, 'mobile', name, value);
}
```

Implement `widgetTokenEntries` with card gap/radius, image controls, layout columns, list border treatment, badge-position values, every color key, `bodyPx`, and every typography size/weight. Map Horizontal to `3`, Grid to `2`, and Stacked/List to `1`. In CSS, make all actual `--qb-*` values aliases of desktop tokens by default, then aliases of mobile tokens inside `@media (max-width: 750px)`. Replace the fixed Grid rule with `repeat(var(--qb-tier-columns), minmax(0, 1fr))`.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs`

Expected: PASS with both source sets present and the two-column Grid contract.

- [ ] **Step 5: Commit the task**

```bash
git add theme-app-extension/public/app-block.js theme-app-extension/public/app-block.css tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs
git commit -m "fix(theme): apply widget styles through responsive root tokens"
```

### Task 2: Country-Aware Market Resolution And Tier Text

**Files:**
- Create: `worker/src/services/storefront-market.ts`
- Modify: `worker/src/routes/storefront.ts:1-61`
- Modify: `theme-app-extension/blocks/app-block.html:3-11`
- Modify: `theme-app-extension/public/app-block.js:196-255`
- Modify: `worker/test/routes-contract.test.ts`
- Modify: `tests/theme-app-extension/widget-mount.test.mjs`

**Interfaces:**
- Consumes: `shopHandle: string`, `countryCode: string | undefined`, and `Env`.
- Produces: `resolveStorefrontMarketId(shopHandle, countryCode, env): Promise<string | undefined>`.
- Produces: optional public response field `campaign.marketId`, consumed only for `tier.marketOverrides[campaign.marketId]`.

- [ ] **Step 1: Write failing Worker and theme tests**

```ts
expect(body.campaign.marketId).toBe('market-fr');
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/markets.json'), expect.objectContaining({
  headers: expect.objectContaining({ Accept: 'application/json', 'User-Agent': 'SHOPLINE-Quantity-Breaks-App/1.0' }),
}));
```

```js
assert.match(String(calls[0].url), /countryCode=FR/);
assert.equal(block.querySelector('[data-tier-id="trio"] small').textContent, 'Save on every item');
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd worker && npm test -- test/routes-contract.test.ts`

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs`

Expected: FAIL because the current public request has no country parameter or returned market ID, and no test confirms a saved subtitle reaches the theme.

- [ ] **Step 3: Implement exact country-to-market resolution**

Implement `storefront-market.ts` with a two-letter-uppercase validator, an isolate-local TTL cache keyed by shop handle, and a `/markets.json?limit=100` request. Obtain the installed store token with `withFreshAccessToken(shopHandle, env)`, then send the request with `shoplineAdminHeaders(session.accessToken)`. Parse only an enabled market with a valid `market_id` (or `id`) whose `regions[].code` exactly equals the normalized country code; return `undefined` for a missing mapping, unavailable mapping, malformed payload, or market lookup failure. Cache only successfully parsed market lists, not failures.

In `storefront.ts`, validate the optional country parameter, call `resolveStorefrontMarketId(shop, countryCode, c.env)`, and append `marketId` only when it resolves. A market lookup failure must not change public campaign availability or rate limiting; it only omits `marketId` so the theme uses its checkout fallback.

Add `data-country-code="{{ localization.country.iso_code }}"` to the SLine App Block. Read it only when it matches `/^[A-Z]{2}$/`, append it to the public request URL, and use the returned market ID to select exactly one tier override. Preserve `tier.subtitle` as the first choice before the `widget.tier_rule` fallback.

- [ ] **Step 4: Verify the tests pass**

Run: `cd worker && npm test -- test/routes-contract.test.ts`

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs`

Expected: PASS; France resolves `market-fr`, an enabled country with no market leaves `marketId` absent and shows the checkout fallback, no same-currency fallback is selected, and saved subtitle text renders.

- [ ] **Step 5: Commit the task**

```bash
git add worker/src/services/storefront-market.ts worker/src/routes/storefront.ts worker/test/routes-contract.test.ts theme-app-extension/blocks/app-block.html theme-app-extension/public/app-block.js tests/theme-app-extension/widget-mount.test.mjs
git commit -m "fix(storefront): resolve active market and preserve tier copy"
```

### Task 3: Canonical Display Pricing And Per-Item Allocation

**Files:**
- Modify: `theme-app-extension/public/app-block.js:141-163,342-405`
- Modify: `theme-app-extension/public/app-block.css:61-82`
- Modify: `tests/theme-app-extension/app-block.test.mjs:112-125`
- Modify: `tests/theme-app-extension/widget-mount.test.mjs:44-64`

**Interfaces:**
- Consumes: a tier, ordered selected variants, and optional resolved market override.
- Produces: `calculateDisplayPricing(tier, selections, variants, marketOverride?)` returning `{ originalMinor, discountedMinor, savingsMinor, lineDiscountedMinor } | null`.
- Produces: `.qb-tier-original`, original and discounted variant values, and summary amounts from the same result.

- [ ] **Step 1: Write failing minor-unit pricing tests**

```js
const result = theme.calculateDisplayPricing(
  { discountType: 'bundle_fixed_price', discountValue: 1001 },
  ['a', 'b'], [{ id: 'a', price: 10.00 }, { id: 'b', price: 7.00 }],
);
assert.equal(result.originalMinor, 1700);
assert.equal(result.discountedMinor, 1001);
assert.equal(result.lineDiscountedMinor.reduce((sum, value) => sum + value, 0), 1001);
```

```js
const result = theme.calculateDisplayPricing(tier, ['a', 'b'], variants, { mode: 'specified_amount', amountMinor: 400, currencyCode: 'EUR' });
assert.equal(result.discountedMinor, 900);
```

Add mounted DOM assertions for a localized tier `Original` label, an Original equal to product-row sums, savings equal to Original minus total, and both values in the active variant price element.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs`

Expected: FAIL because the existing helper uses `compareAtPrice`, has no exact market override amount, and allocates no per-slot discounted amount.

- [ ] **Step 3: Implement the canonical pricing helper**

Use selected variant `price` as every row's original minor amount. Calculate percentage, fixed amount, and fixed price per slot. For bundle fixed amount/price, compute the target total and allocate it proportionally using floor division with stable slot-order remainder distribution:

```js
const base = values.map((value) => Math.floor(targetMinor * value / originalMinor));
let remainder = targetMinor - base.reduce((sum, value) => sum + value, 0);
for (let index = 0; remainder > 0; index += 1, remainder -= 1) base[index] += 1;
```

Use `marketOverride.amountMinor` only for a resolved exact specified-market override. Return `null` when the required override cannot be resolved so the existing checkout fallback renders. Render `.qb-tier-original` with `widget.original`; render selected variant original in `del` and allocated discounted price as the primary value. Read `showOriginalAndDiscountedPrice` from its top-level configuration property.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs`

Expected: PASS for six discount modes, exact bundle allocation totals, specified-market amounts, tier Original, summary arithmetic, and variant discount prices.

- [ ] **Step 5: Commit the task**

```bash
git add theme-app-extension/public/app-block.js theme-app-extension/public/app-block.css tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs
git commit -m "fix(theme): calculate consistent tier and variant display prices"
```

### Task 4: Unavailable State And Quantity-Only Localized Button

**Files:**
- Modify: `theme-app-extension/public/app-block.js:257-420`
- Modify: `theme-app-extension/public/app-block.css:74-85`
- Modify: `theme-app-extension/i18n/*.json` (all 36 storefront locale files)
- Modify: `worker/src/db/translations.ts:1-8`
- Modify: `tests/theme-app-extension/widget-mount.test.mjs`
- Modify: `tests/theme-app-extension/structure.test.mjs`

**Interfaces:**
- Consumes: `validateSelections(visibleSelections(...))` and `copy(key, fallback, variables)`.
- Produces: `widget.add_to_cart_quantity` for valid selections and `widget.sold_out` for unavailable selections.
- Produces: `hidden` amount elements for `unavailable` and `insufficient_stock` validation results.

- [ ] **Step 1: Write failing unavailable-state and locale tests**

```js
assert.match(block.querySelector('[data-product-row]').textContent, /\(已售罄\)/);
assert.equal(block.querySelector('.qb-original').hidden, true);
assert.equal(block.querySelector('.qb-savings-amount').hidden, true);
assert.equal(block.querySelector('.qb-total').hidden, true);
assert.equal(block.querySelector('[data-add-bundle]').textContent, '已售罄');
assert.equal(block.querySelector('[data-add-bundle]').disabled, true);
```

Extend the static locale test to require that all 36 `app_block.widget` objects contain `add_to_cart_quantity` with a `{quantity}` placeholder.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs`

Expected: FAIL because unavailable totals remain visible and no quantity-only locale key exists.

- [ ] **Step 3: Implement unavailable rendering and button copy**

Set `unavailable` when validation returns `unavailable` or `insufficient_stock`. Append ` (${copy('widget.sold_out', 'Sold out')})` to each invalid product-row label. Set `hidden = unavailable` on `.qb-original`, `.qb-savings-amount`, and `.qb-total`. Render the button with:

```js
button.textContent = unavailable
  ? copy('widget.sold_out', 'Sold out')
  : copy('widget.add_to_cart_quantity', 'Add {quantity} To Cart', { quantity });
button.disabled = unavailable || Boolean(validity.reason);
```

Allow only `quantity` as the placeholder for `widget.add_to_cart_quantity` in the Worker translation contract. Add translated quantity-only values to every static locale file; English is exactly `Add {quantity} To Cart`.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs`

Expected: PASS for localized unavailable labels, hidden amount elements, disabled Sold out button, and all locale contracts.

- [ ] **Step 5: Commit the task**

```bash
git add theme-app-extension/public/app-block.js theme-app-extension/public/app-block.css theme-app-extension/i18n worker/src/db/translations.ts tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs
git commit -m "fix(theme): localize unavailable bundles and quantity button copy"
```

### Task 5: End-To-End Verification And Delivery Review

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Test: `tests/theme-app-extension/*.test.mjs`
- Test: `worker/test/routes-contract.test.ts`
- Test: `web/test/widget-layout.test.mjs`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: recorded verification status and release-ready test evidence.

- [ ] **Step 1: Record the verification scope in application progress**

Add a dated `2026-11-05` entry that names the 750px token switch, exact market amount lookup, pricing display, unavailable state, and locale copy. Mark the entry verified only after the commands and screenshots in this task complete.

- [ ] **Step 2: Run all automated checks**

```bash
node --test tests/theme-app-extension/*.test.mjs
cd worker && npm test
cd ../web && node --test test/widget-layout.test.mjs
cd ../web && npm run build
cd .. && git diff --check
```

Expected: each command exits `0`, the production build succeeds, and the diff check prints no errors.

- [ ] **Step 3: Perform visual verification at both target widths**

Open a local test product containing the App Block and retain one 1440px screenshot and one 390px screenshot. Verify the mobile token switch at 750px, Horizontal three columns, Grid two columns, saved subtitle, specified-market amount, tier/item original and discounted prices, and localized unavailable state.

- [ ] **Step 4: Review all changed files before release**

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Inspect every changed and untracked file. Confirm no unrelated files, focus pseudo-class changes, or secrets are in the reviewed set.

- [ ] **Step 5: Commit verification metadata and request release approval**

```bash
git add docs/APP_PROGRESS.md
git commit -m "docs: record storefront widget verification"
```

Summarize affected files, commits, automated results, and screenshot locations. Ask exactly: `本次代码/文档已在本地更新，是否推送到 GitHub？` Do not push or deploy until the user approves that reviewed change set.
