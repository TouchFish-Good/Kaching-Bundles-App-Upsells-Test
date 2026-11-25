# Task5 native theme fixture evidence

> 本页为Task4/5当时的实际本地证据。Task6期间用户新增要求：捆绑固定1件、商家/买家均无数量控件、原生checkbox选择，赠品不显示重复Included状态。Task7待实施并重新截图，本页旧图不证明新增要求已通过。

All evidence is local to the isolated test checkout. No merchant endpoint or real cart was written. The dedicated fixture server ran on `127.0.0.1:5285`; it was stopped after capture. Browser plugin/CUA were unavailable, so the existing Playwright runtime and installed Chromium headless-shell1248 were used without installation.

`before-os{3,2.1}-{1440,390,320}.png` uses the actual ce738ec JavaScript/CSS. Matching `after-...` files use the current theme JavaScript/CSS. OS2.1 markup is rendered from the actual publishable Handlebars template using documented helper fixtures; OS3 markup simulates the template's native DOM contract. These screenshots do **not** prove native SHOPLINE template compilation, metafield permissions or real shop availability/prices.

`browser-evidence.json` records both generations at all three viewports: no page/console errors or horizontal viewport overflow, two immutable gifts, two selected bundles, total $60 = main $40 + gifts $0 + bundles $20. Each simulated Add action submitted exactly one flat five-line POST containing eight units, with the exact official hidden properties. Synthetic bottle illustrations and products are fixture data.

`dynamic-independent-blocks-390.png` records two blocks with independent bundle selections. Removing/reinserting the first node preserved its selected rule and second variant; resizing also preserved it. `container-400.png`, `container-600.png` and `container-700.png` measured the actual offer container and rendered one, two and three columns. `carousel-os3-390.png` verifies one horizontal row; keyboard and native Chromium touch input each moved it98px.

Visual inspection included OS3 desktop, OS2.1 mobile, the supplied [reference header](../../reference/screenshots/gifts-bundles-section-toggle-reference.png), baseline captures and the carousel. Existing typography, white bordered cards and section hierarchy were retained. The supplied reference is an admin toggle row, not an expanded storefront card reference; no equivalence to an unseen Shopify storefront is claimed. Native shopper controls are sibling selection, quantity and variant controls; gifts have no cancel control.

Source/verification details and the reproducible local fixture harness remain in `.superpowers/sdd/2026-11-25-test-gifts-bundles-implementation/task-5-report.md` and `task-5-qa.mjs`. The complete theme suite had123/124 passing; its single existing default-gap10px/8px assertion was reproduced against ce738ec. Later affected checks passed50/50, including17 offer regressions. Selected bundle buttons use localized Included copy; receipt retains role in data attributes while showing Product/variant/quantity/prices without protocol prefixes. Actual merchant runtime, Function identity/capability and checkout still require authorized test deployment and integration.
