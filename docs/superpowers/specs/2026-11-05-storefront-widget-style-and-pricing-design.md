# Storefront Widget Style And Pricing Design

## Goal

Make the product-page Quantity Breaks widget apply every saved desktop and mobile appearance setting through root CSS custom properties at a fixed 750px boundary. Make tier text, market-specific pricing, per-item prices, summary amounts, and unavailable selections reflect the saved campaign and storefront state accurately.

## Scope

The work changes the campaign widget configuration consumer, the public campaign response, the theme App Block template, JavaScript, CSS, locale copy, and their tests. It does not change discount calculation in SHOPLINE checkout, campaign editing controls, or the campaign data schema for tiers and widget appearance.

## Appearance Contract

`campaign.widget` remains the desktop configuration and `campaign.widget.mobile` remains the mobile configuration. The theme script writes all saved layout, card, color, typography, and variant values as scoped properties on `.quantity-breaks-app-block`:

- desktop source properties use `--qb-desktop-*`;
- mobile source properties use `--qb-mobile-*`;
- active properties use `--qb-*` and are aliases, not independent state.

The stylesheet assigns the desktop aliases by default and reassigns the aliases from mobile source properties in `@media (max-width: 750px)`. This includes every persisted color, every persisted typography size and weight, card gap/radius, image controls, layout column count, list border treatment, and badge placement tokens. The theme script must not choose an entire device configuration only once at mount time.

Layout columns are fixed as follows: Stacked and List use one column, Horizontal uses three columns, and Grid uses two columns. A selected tier continues to expand only inside its own grid column.

## Market Resolution

The App Block emits the storefront's `localization.country.iso_code` as `data-country-code`. The public campaign request sends this value as a validated country-code query parameter.

The Worker resolves the current market by loading the store's Markets API result and matching the country code to `markets[].regions[].code`. It uses the resulting `market_id` to identify the exact `tier.marketOverrides[marketId]`. Store Admin requests use `shoplineAdminHeaders()` and market lookup results may be short-lived isolate-cached to avoid a request per product block mount.

When no enabled market matches the country code, or the market lookup is unavailable, the public payload does not claim a specified amount. The widget displays its existing localized `Calculated at checkout` fallback rather than an amount of zero.

## Pricing Rules

All frontend amounts are estimates and use integer minor units.

- A product row's original amount is its selected variant `price` multiplied by the selected quantity, not `compareAtPrice`.
- `Original` is the sum of all displayed product-row original amounts.
- `Bundle total` is the active tier's final total using the exact active-market override when it exists; otherwise it uses the campaign's shop-currency rule.
- `Estimated savings` is `Original - Bundle total`, clamped only by the existing discount calculation rules.
- Every tier card displays a localized `Original` amount and its tier total when its selections are valid.
- Every selected variant row displays its original price and estimated discounted price for the active tier.

Per-item discount modes derive a price for each selected slot directly. Bundle-level fixed amount and fixed price modes allocate the final minor-unit total across slots proportionally to their original prices, with deterministic residual allocation. The sum of rendered discounted slot values must equal the rendered bundle total exactly.

`showOriginalAndDiscountedPrice` is read from its actual top-level widget configuration location. When disabled, comparison/original values follow the existing visibility policy consistently in cards and variant lines.

## Tier Text And Availability

The public campaign response preserves non-empty `tier.label`, `tier.subtitle`, `tier.tag`, and `tier.recommended` in display order. The theme displays `tier.subtitle` whenever present and only falls back to `widget.tier_rule` when it is absent.

When a currently selected slot is unavailable or selected quantities exceed inventory:

- the matching `.qb-product-row` label appends localized ` (Sold out)`;
- `.qb-original`, `.qb-savings-amount`, and `.qb-total` are hidden;
- the add button is disabled and shows localized `Sold out`;
- no frontend money amount is fabricated for the invalid selection.

## Localization

Static and managed storefront copy retain `widget.sold_out`. A new `widget.add_to_cart_quantity` key is added for every supported storefront locale and is rendered as the sole add-button template: English is `Add {quantity} To Cart`. The old price-bearing `widget.add_to_cart` key is not used for the normal enabled-state button, preventing stale `{price}` placeholders from appearing in saved translations.

## Testing

Tests cover:

- complete desktop/mobile root-token injection and CSS switch at 750px, including two-column Grid;
- campaign subtitle persistence through the public response and theme rendering;
- country-code-to-market matching and exact specified-market amount selection;
- Original, savings, bundle total, tier original values, and per-slot discounted values for every discount mode;
- deterministic bundle-level distribution with a total equal to the displayed bundle total;
- unavailable selections' localized label, hidden amount elements, and disabled Sold out button;
- all static locale files providing the new quantity-only add-button key.

The Theme App Extension must be deployed together with the Worker and Web assets because its template, JavaScript, CSS, and locale files participate in the completed behavior.
