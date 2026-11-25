# Task 4 local visual evidence

All images are real Chromium screenshots of the existing React editor/widget using local synthetic catalog/price/session responses. No SHOPLINE integration, real cart write, deployment or merchant write is represented.

- Reference: `docs/reference/screenshots/gifts-bundles-section-toggle-reference.png`.
- Baseline before changes: `before-1440.png`, `before-390.png`, `before-320.png`.
- Final editor: `after-1440.png`, `after-1440-expanded.png`, `after-1440-offers.png`, `after-390.png`, `after-320.png`. The desktop editor retains its existing internally scrolling preview, so the additional offers capture exposes cards below the main tier controls.
- Reference comparison states: `header-on-collapsed.png`, `header-off.png`, `header-reopened.png`. White rounded border, left expansion chevron/icon/text, independently aligned dark switch. Turning off preserves configuration; reopening restores the same fields. Labels are the active admin locale; merchant controls and shopper gift inclusion are separate.
- Exact measured offer containers: `container-400.png` (1 column), `container-600.png` (2), `container-700.png` (3). Desktop requested default3; fallback uses actual width, minimum220px/card plus configured gaps. Mobile default1: `preview-mobile390.png`.
- `carousel-mobile390.png`: native horizontal scroll, keyboard and touch. `preview-unavailable.png`: missing trusted offer catalog leaves accessories unavailable. `translations-empty-title-1440.png`: empty gift heading and independently edited bundle heading.
- `browser-evidence.json`: page/console health, no page overflow at1440/390/320, exact container dimensions, included cards and total$94.
- `browser-interactions.json`: keyboard scroll412px/touch366px, selection retained across resize and editor device switch, module off/on and actual local save preserve quantity2. `realCartWrites:0` documents the exercised simulation, not monitoring of SHOPLINE.

Visual comparison: header structure/switch matches the supplied reference; existing app typography/tokens/layout are retained. New accessory cards have no supplied full-card reference, so screenshots verify local consistency/responsiveness rather than claim pixel equivalence to an unseen Shopify page. Synthetic skincare illustrations distinguish fixture Products; the baseline fixture initially had unavailable main market pricing, corrected for final valid-price simulation. Real SHOPLINE contextual pricing remains unverified.
