# Market-Aware Editor Preview Design

## Goal

Replace the quantity-break editor preview's storefront-language selector with a
market selector. The preview must use the selected market's default storefront
locale and product market price so merchants can inspect the price that applies
to that market before saving a campaign.

## Scope

- The change applies to the discount editor's `.editorPreview` only.
- The translation page keeps its storefront-language selector and behavior.
- The preview market selector lists all markets returned by SHOPLINE.
- The market marked `primary: true` is selected initially. If no enabled
  primary market exists, select the first enabled market, then the first market.
- A selected market resolves preview copy from `web_presence.default_locale`.
- A selected market's product price applies to every selected preview variant.

## Market Data

The existing authenticated Worker endpoint `GET /api/quantity-breaks/markets`
remains the single browser-facing market source. Its normalized response gains:

- `primary`: whether SHOPLINE marks the market as primary.
- `defaultLocale`: `web_presence.default_locale`, when supplied.
- `regionCodes`: unique uppercase ISO 3166-1 alpha-2 values from `regions`.

Existing `id`, `name`, `enabled`, `currencyCode`, `regionCurrencyCodes`, and
`specifiedAmountSupported` fields remain unchanged so the campaign amount
editor continues to work.

The Worker keeps calling SHOPLINE with `shoplineAdminHeaders()` and the active
store session. The browser never receives an Admin access token.

## Market Prices

The Worker adds an authenticated preview-price endpoint accepting a product ID
and validated market ISO country codes. It calls the supplied production
contract:

```
GET /markets/{productId}/price.json?country_codes=JP,US
```

SHOPLINE limits `country_codes` to ten values. The Worker deduplicates and
splits longer market region lists into groups of ten, then merges successful
`market_prices` entries by country code. Each response entry must contain a
non-negative integer `market_price.amount` string and a three-letter
`market_price.currency_code`; malformed entries are rejected.

The bundled `v20260901` REST OAS describes
`/markets/{product_id}/price/range.json`, not the supplied `price.json` path.
This implementation intentionally uses the supplied, observed `price.json`
contract. A non-success or malformed response becomes an explicit preview
price error and is not silently replaced with a shop-currency amount.

The editor selects the first returned price whose country belongs to the
selected market. If a market has no usable country or no returned price, the
preview exposes an unavailable-price state.

## Preview Calculation

`amount` is an integer in the market currency's minor unit and stays an
integer through all calculations. Formatting uses the market price currency
and the selected market locale.

The returned market price is the base price for every selected preview variant.
This is a product-level preview rule confirmed by the merchant; it does not
claim that SHOPLINE returns per-variant market prices.

For each tier:

- Percentage discounts calculate from the market base price.
- `fixed_amount`, `fixed_price`, `bundle_fixed_amount`, and
  `bundle_fixed_price` use the selected market's
  `marketOverrides[marketId]` amount only when its mode is
  `specified_amount`.
- If a fixed tier uses `auto_convert`, the preview cannot derive the
  platform's current converted discount from this API. It renders an explicit
  unavailable calculation state rather than treating a shop-currency minor
  amount as the market currency.
- If the selected market has no `specified_amount` override for a fixed tier,
  the same unavailable calculation state applies.

This preserves the existing campaign data model: no selected preview market or
market price is persisted with the campaign.

## UI States

The preview toolbar order is PC/Mobile, Specified market, and Specified product.
The market control is disabled while markets load. It displays a retryable
error if markets cannot load. The price view loads when both a product and a
market are selected, and changes atomically when either changes. Until it has
a valid market price, monetary amounts and the add-to-cart action are not
presented as market-correct.

## Tests

- Worker route tests cover market metadata normalization, market price request
  validation, ten-country batching, response normalization, and required
  SHOPLINE headers.
- Editor tests cover initial primary market selection, locale synchronization,
  product-market price loading, and unavailable-price rendering.
- Pricing tests cover the four fixed discount types using a selected-market
  `specified_amount` override and reject `auto_convert` for market preview.
- Existing desktop/mobile preview and translation-page language tests remain
  unchanged except for their editor-specific selector expectations.
