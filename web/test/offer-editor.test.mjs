import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
await i18n.use(initReactI18next).init({
  lng: "en",
  resources: {
    en: {
      translation: JSON.parse(
        await readFile(
          new URL("../src/locales/en.json", import.meta.url),
          "utf8",
        ),
      ),
    },
  },
  interpolation: { escapeValue: false },
});
import { test } from "node:test";
import React, { act } from "react";
import { createServer } from "vite";
import { JSDOM, VirtualConsole } from "jsdom";
import { defaultOfferModule } from "../../shared/offer-core.mjs";
const rule = (id, quantity = 2) => ({
  ruleId: id,
  displayOrder: 0,
  productId: id,
  allowedVariantIds: [id + "s", id + "l"],
  quantity: 1,
  label: "Gift",
  labelPosition: "corner",
  showImage: true,
  discountType: "fixed_price",
  discountValue: 0,
  trigger: { type: "quantity", operator: "gte", quantity },
});
const moduleFor = (kind, items) => ({
  ...defaultOfferModule(kind),
  enabled: true,
  items: items.map((r, i) => ({ ...r, displayOrder: i })),
});
const products = ["a", "b", "c"].map((id) => ({
  id,
  title: "Product " + id,
  identityVerified: true,
  available: true,
  variants: ["s", "l"].map((s, i) => ({
    id: id + s,
    title: s,
    available: true,
    price: {
      amountMinor: 1000 + i * 1000,
      currencyCode: "USD",
      currencyDecimals: 2,
    },
  })),
}));
const base = {
  device: "desktop",
  accent: "#171717",
  locale: "en",
  previewOnly: true,
  compact: true,
  notify: () => {},
  tiers: [
    { tierId: "t2", quantity: 2, label: "Two", discountPercent: 0 },
    {
      tierId: "t4",
      quantity: 4,
      label: "Four",
      discountPercent: 0,
      recommended: true,
    },
  ],
  config: {
    allowMixed: true,
    showSelectors: false,
    selectorStyle: "Dropdown",
    imageTileSize: 48,
    imageTileRadius: 6,
    showImageColorValue: true,
    widgetFontSize: 14,
    showStock: false,
    showPricing: true,
  },
};
async function harness(run) {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error.message));
  virtualConsole.sendTo(console);
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    virtualConsole,
  });
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "ResizeObserver",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  // ReactDOM detects input-event support at import time; install the DOM first.
  const { createRoot } = await import("react-dom/client");
  const { Simulate } = await import("react-dom/test-utils");
  const root = createRoot(document.getElementById("root"));
  try {
    await run({
      vite,
      root,
      render: async (C, p) => act(() => root.render(React.createElement(C, p))),
      click: async (el) => act(() => el.click()),
      change: async (el, value) =>
        act(() => {
          const proto =
            el.tagName === "SELECT"
              ? window.HTMLSelectElement.prototype
              : el.tagName === "TEXTAREA"
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
          if (el.tagName === "SELECT")
            el.dispatchEvent(new window.Event("change", { bubbles: true }));
          else Simulate.change(el, { target: { value } });
        }),
    });
  } finally {
    await act(() => root.unmount());
    Object.assign(globalThis, old);
    dom.window.close();
    await vite.close();
    assert.deepEqual(jsdomErrors, [], "unexpected jsdom exceptions must fail the DOM harness");
  }
}
test("editor preview automatically includes both gifts at four and only A at two without gift cancellation", () =>
  harness(async ({ vite, render, click }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    await render(StorefrontWidget, {
      ...base,
      gifts: moduleFor("gifts", [rule("a", 2), rule("b", 3)]),
      offerPreview: { state: "ready", products },
    });
    assert.ok(
      document.querySelector('[data-offer-kind="gifts"]'),
      "gift offer preview must render",
    );
    assert.equal(
      document.querySelectorAll(
        '[data-offer-kind="gifts"] [data-included="true"]',
      ).length,
      2,
    );
    assert.equal(
      document.querySelector(
        '[data-offer-kind="gifts"] input[type="checkbox"]',
      ),
      null,
    );
    assert.doesNotMatch(document.querySelector('[data-offer-kind="gifts"]').textContent,/Included/);
    await click(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Two"),
      ),
    );
    assert.equal(
      document.querySelectorAll(
        '[data-offer-kind="gifts"] [data-included="true"]',
      ).length,
      1,
    );
  }));
test("bundle choices support multiple cancel, variant totals and explicit empty localized title", () =>
  harness(async ({ vite, render, click, change }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    const bundles = {
      ...moduleFor("bundles", [
        { ...rule("a"), discountType: "percentage", discountValue: 5000 },
        { ...rule("b"), discountType: "percentage", discountValue: 5000 },
      ]),
      selectionMode: "multiple",
    };
    await render(StorefrontWidget, {
      ...base,
      bundles,
      translations: { "widget.bundles.title": "" },
      offerPreview: { state: "ready", products },
    });
    const area = document.querySelector('[data-offer-kind="bundles"]');
    assert.ok(area);
    assert.equal(area.querySelector("h3"), null);
    const checkboxes = () => [
      ...area.querySelectorAll('input[type="checkbox"]'),
    ];
    await click(checkboxes()[0]);
    await click(checkboxes()[1]);
    assert.equal(area.querySelectorAll('[data-included="true"]').length, 2);
    assert.match(
      document.querySelector("[data-offer-summary]").textContent,
      /10\.00/,
    );
    await change(area.querySelector("select"), "al");
    assert.match(
      document.querySelector("[data-offer-summary]").textContent,
      /15\.00/,
    );
    await click(checkboxes()[1]);
    assert.equal(area.querySelectorAll('[data-included="true"]').length, 1);
  }));
test("missing trusted price and unknown availability cannot include gifts", () =>
  harness(async ({ vite, render }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    await render(StorefrontWidget, {
      ...base,
      gifts: moduleFor("gifts", [rule("a")]),
      offerPreview: {
        state: "ready",
        products: [
          {
            ...products[0],
            variants: products[0].variants.map((v) => ({
              ...v,
              available: undefined,
              price: null,
            })),
          },
        ],
      },
    });
    assert.equal(
      document.querySelectorAll(
        '[data-offer-kind="gifts"] [data-included="true"]',
      ).length,
      0,
    );
    assert.match(
      document.querySelector('[data-offer-kind="gifts"]').textContent,
      /unavailable/i,
    );
  }));
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 25)));
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
function pickerProducts() {
  return products.map((p) => ({
    ...p,
    optionNames: ["Size"],
    variants: p.variants.map((v) => ({
      ...v,
      price: v.price.amountMinor / 100,
      compareAtPrice: null,
      inventory: 100,
      options: [{ name: "Size", value: v.title }],
      imageUrl: null,
      inventoryPolicy: "continue",
    })),
  }));
}
test("independent sibling switches retain config when off and roundtrip the original save bar", () =>
  harness(async ({ vite, render, click, root }) => {
    const { CampaignEditor } = await vite.ssrLoadModule(
      "/src/prototype/CampaignEditor.tsx",
    );
    const { campaignToServer, serverToCampaign } = await vite.ssrLoadModule(
      "/src/prototype/campaign-adapter.ts",
    );
    const calls = [];
    let saved;
    const fetcher = async (url, opts = {}) => {
      calls.push(String(url));
      if (String(url).includes("/markets"))
        return json({ shopCurrencyCode: "USD", markets: [] });
      if (String(url).includes("/products"))
        return json({
          products: pickerProducts(),
          missingIds: [],
          nextPageInfo: null,
        });
      if (String(url).includes("/coverage"))
        return json({ state: "clear", conflicts: [] });
      if (String(url).includes("/offer-preview")) {
        const body = JSON.parse(opts.body);
        return json({ version: 2, ...body, products });
      }
      return json({ translations: {} });
    };
    const campaign = {
      id: "draft",
      name: "Draft",
      discountName: "Savings",
      status: "Draft",
      scope: { kind: "products", productIds: ["main"], excludedProductIds: [] },
      tiers: base.tiers,
      startsAt: "2026-11-25T00:00:00.000Z",
      neverExpires: true,
      gifts: moduleFor("gifts", [rule("a")]),
      bundles: { ...moduleFor("bundles", [rule("b")]), enabled: false },
    };
    const props = {
      campaign,
      campaigns: [],
      fetcher,
      notify: () => {},
      onCancel: () => {},
      onSave: async (v) => {
        saved = v;
      },
    };
    await render(CampaignEditor, props);
    await settle();
    const panel = (kind) =>
      document.querySelector(`[data-offer-panel="${kind}"]`);
    const sw = (kind) => panel(kind).querySelector('[role="switch"]');
    assert.equal(
      sw("gifts").parentElement,
      panel("gifts").querySelector("[aria-expanded]").parentElement,
      "switch and expansion are siblings",
    );
    await click(panel("gifts").querySelector("[aria-expanded]"));
    await settle();
    assert.ok(panel("gifts").querySelector("fieldset"));
    await click(sw("gifts"));
    assert.equal(sw("bundles").getAttribute("aria-checked"), "false");
    assert.equal(panel("gifts").querySelector("fieldset"), null);
    await click(sw("gifts"));
    await settle();
    assert.ok(
      panel("gifts").querySelector("fieldset"),
      "re-enable restores expanded contents",
    );
    await click(sw("bundles"));
    assert.equal(sw("gifts").getAttribute("aria-checked"), "true");
    await click(sw("gifts"));
    const bar = document.querySelector('[class*="editorSaveBar"]');
    assert.ok(bar);
    await click(bar.querySelector("button:last-child"));
    await settle();
    assert.ok(saved);
    assert.equal(saved.gifts.enabled, false);
    assert.deepEqual(saved.gifts.items, campaign.gifts.items);
    assert.equal(saved.bundles.enabled, true);
    // The real adapter retains both configs, including a disabled module.
    const adapter = await vite.ssrLoadModule(
      "/src/prototype/campaign-adapter.ts",
    );
    const toServer = adapter.toCampaignDraft;
    const fromServer = adapter.toAdminCampaign;
    assert.equal(typeof toServer, "function");
    const dto = toServer(saved);
    const back = fromServer({
      ...dto,
      revision: 1,
      updatedAt: "2026-11-25T00:00:00.000Z",
    });
    assert.deepEqual(back.gifts, saved.gifts);
    assert.deepEqual(back.bundles, saved.bundles);
    await act(() =>
      root.render(
        React.createElement(CampaignEditor, {
          ...props,
          key: "reload",
          campaign: back,
        }),
      ),
    );
    await settle();
    assert.equal(sw("gifts").getAttribute("aria-checked"), "false");
    assert.equal(sw("bundles").getAttribute("aria-checked"), "true");
  }));
test("legacy editor issues no offer-preview requests while both modules are disabled", () =>
  harness(async ({ vite, render }) => {
    const { CampaignEditor } = await vite.ssrLoadModule(
      "/src/prototype/CampaignEditor.tsx",
    );
    const calls = [];
    await render(CampaignEditor, {
      campaign: null,
      campaigns: [],
      onSave: async () => {},
      onCancel: () => {},
      notify: () => {},
      fetcher: async (url) => {
        calls.push(String(url));
        return json(
          String(url).includes("/markets")
            ? { shopCurrencyCode: "USD", markets: [] }
            : {
                products: [],
                missingIds: [],
                nextPageInfo: null,
                translations: {},
              },
        );
      },
    });
    await settle();
    assert.equal(
      calls.some((url) => url.includes("/offer-preview")),
      false,
    );
  }));
test("single mode chooses one explicitly selected fixed-one rule by actual saving", () =>
  harness(async ({ vite, render, click, change }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    const config = moduleFor("bundles", [
      { ...rule("a"), discountType: "percentage", discountValue: 5000 },
      { ...rule("b"), discountType: "fixed_amount", discountValue: 800 },
    ]);
    const props = {
      ...base,
      bundles: { ...config, selectionMode: "multiple" },
      offerPreview: { state: "ready", products },
    };
    await render(StorefrontWidget, props);
    for (const checkbox of document.querySelectorAll(
      '[data-offer-kind="bundles"] input[type="checkbox"]',
    ))
      await click(checkbox);
    await render(StorefrontWidget, {
      ...props,
      bundles: { ...config, selectionMode: "single" },
    });
    assert.equal(document.querySelectorAll('[data-included="true"]').length, 1);
    assert.equal(
      document
        .querySelector('[data-included="true"]')
        .getAttribute("data-rule-id"),
      "b",
    );
    assert.equal(document.querySelector('[data-rule-id="b"] input[type="number"]'), null);
    assert.match(document.querySelector("[data-offer-summary]").textContent, /2\.00/);
  }));
test("grid and carousel honor independent devices, keep choices and support keyboard scrolling", () =>
  harness(async ({ vite, render, click }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    const bundles = {
      ...moduleFor("bundles", [rule("a"), rule("b")]),
      selectionMode: "multiple",
    };
    bundles.style.desktop.layout.mode = "carousel";
    const props = {
      ...base,
      bundles,
      offerPreview: { state: "ready", products },
    };
    await render(StorefrontWidget, props);
    await click(
      document.querySelector(
        '[data-offer-kind="bundles"] input[type="checkbox"]',
      ),
    );
    assert.equal(
      document.querySelector('[data-offer-kind="bundles"]').dataset.layout,
      "carousel",
    );
    const region = document.querySelector(
      '[data-offer-kind="bundles"] [role="region"]',
    );
    let scroll;
    region.scrollBy = (v) => {
      scroll = v;
    };
    await act(() =>
      region.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
        }),
      ),
    );
    assert.ok(scroll.left > 0);
    await render(StorefrontWidget, { ...props, device: "mobile" });
    assert.equal(
      document.querySelector('[data-offer-kind="bundles"]').dataset.layout,
      "grid",
    );
    assert.equal(
      document.querySelector('[data-offer-kind="bundles"]').dataset.columns,
      "1",
    );
    assert.equal(document.querySelectorAll('[data-included="true"]').length, 1);
  }));
test("locked gift unlocks a qualifying tier and includes all reached gift rules", () =>
  harness(async ({ vite, render, click }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    await render(StorefrontWidget, {
      ...base,
      tiers: base.tiers.map((t) => ({ ...t, recommended: t.quantity === 2 })),
      gifts: moduleFor("gifts", [rule("a", 2), rule("b", 3)]),
      offerPreview: { state: "ready", products },
    });
    const locked = document.querySelector('[data-rule-id="b"] button');
    assert.match(locked.textContent, /Unlock/);
    await click(locked);
    assert.ok(
      document.querySelector('[data-offer-kind="gifts"]'),
      "gift offer preview must render",
    );
    assert.equal(
      document.querySelectorAll(
        '[data-offer-kind="gifts"] [data-included="true"]',
      ).length,
      2,
    );
  }));
test("preview rejects stale revision, context and forged identities while preserving large string IDs", () =>
  harness(async ({ vite }) => {
    const { loadOfferPreview, OfferPreviewError } = await vite.ssrLoadModule(
      "/src/prototype/offer-preview-client.ts",
    );
    const id = "900719925474099312345";
    const selection = [{ productId: "a", variantIds: [id] }];
    const context = {
      marketId: "primary",
      currencyCode: "USD",
      locale: "zh-CN",
    };
    const dto = {
      version: 2,
      revision: "r2",
      locale: "zh-Hans",
      marketId: "primary",
      currencyCode: "USD",
      products: [
        { ...products[0], variants: [{ ...products[0].variants[0], id }] },
      ],
    };
    const result = await loadOfferPreview(selection, "r2", context, async () =>
      json(dto),
    );
    assert.equal(result[0].variants[0].id, id);
    for (const patch of [
      { revision: "r1" },
      { locale: "fr" },
      { marketId: "other" },
      { currencyCode: "EUR" },
    ])
      await assert.rejects(
        loadOfferPreview(selection, "r2", context, async () =>
          json({ ...dto, ...patch }),
        ),
        /Stale/,
      );
    assert.deepEqual(
      await loadOfferPreview(selection, "r2", context, async () =>
        json({
          ...dto,
          products: [{ ...products[0], identityVerified: false }],
        }),
      ),
      [],
    );
    await assert.rejects(
      loadOfferPreview(selection, "r2", context, async () =>
        json({ retryAfter: 2 }, 429, { "Retry-After": "7" }),
      ),
      (e) => e instanceof OfferPreviewError && e.retryAfter === 7,
    );
  }));
test("hook discards late responses after config/locale changes and respects Retry-After before retrying", () =>
  harness(async ({ vite, render }) => {
    const { useOfferPreview } = await vite.ssrLoadModule(
      "/src/prototype/offer-preview-client.ts",
    );
    let state;
    function Probe(props) {
      state = useOfferPreview(
        props.gifts,
        undefined,
        props.context,
        props.fetcher,
      );
      return React.createElement("div", null, state.state);
    }
    const pending = [];
    let calls = 0;
    const fetcher = async (_url, opts) => {
      calls++;
      const body = JSON.parse(opts.body);
      if (calls === 1)
        return new Promise((resolve) =>
          pending.push(() => resolve(json({ version: 2, ...body, products }))),
        );
      if (calls === 2)
        return json({ retryAfter: 1 }, 429, { "Retry-After": "1" });
      return json({ version: 2, ...body, products: [products[1]] });
    };
    const config = moduleFor("gifts", [rule("a")]);
    await render(Probe, { gifts: config, context: { locale: "en" }, fetcher });
    await render(Probe, {
      gifts: moduleFor("gifts", [rule("b")]),
      context: { locale: "fr" },
      fetcher,
    });
    await settle();
    assert.equal(calls, 2);
    assert.equal(state.state, "unavailable");
    await act(async () => {
      pending[0]();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(state.state, "unavailable");
    await act(() => new Promise((r) => setTimeout(r, 300)));
    assert.equal(calls, 2, "must not retry before one second");
    await act(() => new Promise((r) => setTimeout(r, 800)));
    assert.equal(calls, 3);
    assert.equal(state.products[0].id, "b");
  }));
test("translation page edits both localized titles, preserves locale drafts, and saves explicit empty heading", () =>
  harness(async ({ vite, render, change, click }) => {
    const { Translations } = await vite.ssrLoadModule(
      "/src/prototype/Translations.tsx",
    );
    const saves = [];
    const fetcher = async (url, options = {}) => {
      if (String(url).includes("store-languages"))
        return json({ languages: ["en", "fr"], defaultLanguage: "en" });
      if (String(url).includes("/translations/")) {
        if (options.method === "PUT") {
          const body = JSON.parse(options.body);
          saves.push([String(url), body]);
          return json({ translations: body });
        }
        return json({
          translations: {
            "widget.gifts.title": String(url).endsWith("/fr")
              ? "Cadeaux"
              : "🎁 Free gifts with your order",
            "widget.bundles.title": "Frequently Bought Together",
          },
        });
      }
      return json({
        products: pickerProducts(),
        missingIds: [],
        nextPageInfo: null,
      });
    };
    await render(Translations, {
      shopId: "offer-title-test",
      fetcher,
      notify: () => {},
    });
    await settle();
    await settle();
    const gift = () =>
      [...document.querySelectorAll("textarea")].find((el) =>
        el.getAttribute("aria-label").includes("🎁 Free gifts"),
      );
    const bundle = () =>
      [...document.querySelectorAll("textarea")].find((el) =>
        el.getAttribute("aria-label").includes("Frequently Bought"),
      );
    assert.ok(gift());
    assert.ok(bundle());
    await change(gift(), "");
    await change(bundle(), "Pairs with your ritual");
    const language = document.querySelector(
      '[data-preview-control="language"] select',
    );
    await change(language, "fr");
    assert.equal(
      gift().value,
      "",
      "unsaved locale draft retained until SaveBar action",
    );
    await click(
      document.querySelector('[class*="translationSaveBar"] button:last-child'),
    );
    await settle();
    await settle();
    assert.equal(gift().value, "Cadeaux");
    await change(gift(), "Vos cadeaux");
    await change(language, "en");
    await click(
      document.querySelector('[class*="translationSaveBar"] button:last-child'),
    );
    await settle();
    assert.equal(gift().value, "");
    assert.equal(bundle().value, "Pairs with your ritual");
    assert.ok(
      document.querySelector('[data-offer-kind="gifts"]'),
      "translation preview shows gift module",
    );
    assert.equal(document.querySelector('[data-offer-kind="gifts"] h3'), null);
    assert.equal(
      document.querySelector('[data-offer-kind="bundles"] h3').textContent,
      "Pairs with your ritual",
    );
    assert.equal(saves[0][1]["widget.gifts.title"], "");
    assert.equal(saves[0][1]["widget.bundles.title"], "Pairs with your ritual");
  }));
test("429 cooldown survives draft changes so editing cannot retry before Retry-After", () =>
  harness(async ({ vite, render }) => {
    const { useOfferPreview } = await vite.ssrLoadModule(
      "/src/prototype/offer-preview-client.ts",
    );
    let state;
    let calls = 0;
    function Probe(p) {
      state = useOfferPreview(p.gifts, undefined, { locale: "en" }, p.fetcher);
      return React.createElement("div", null, state.state);
    }
    const fetcher = async (_url, opts) => {
      calls++;
      return calls === 1
        ? json({ retryAfter: 1 }, 429, { "Retry-After": "1" })
        : json({ version: 2, ...JSON.parse(opts.body), products });
    };
    await render(Probe, { gifts: moduleFor("gifts", [rule("a")]), fetcher });
    await settle();
    await render(Probe, { gifts: moduleFor("gifts", [rule("b")]), fetcher });
    await settle();
    assert.equal(calls, 1, "configuration edits must respect active cooldown");
    assert.equal(state.state, "unavailable");
  }));
test("unsafe aggregate accessory money fails unavailable without crashing or a free quote", () =>
  harness(async ({ vite, render }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    const expensive = {
      ...products[0],
      variants: products[0].variants.map((v) => ({
        ...v,
        price: { ...v.price, amountMinor: Number.MAX_SAFE_INTEGER },
      })),
    };
    await render(StorefrontWidget, {
      ...base,
      gifts: moduleFor("gifts", [{ ...rule("a"), quantity: 2 }]),
      offerPreview: { state: "ready", products: [expensive] },
    });
    assert.equal(
      document.querySelector('[data-rule-id="a"]').dataset.included,
      "false",
    );
    assert.match(
      document.querySelector('[data-rule-id="a"]').textContent,
      /unavailable/i,
    );
  }));
test("offer picker retains paged choices and merchants edit real variant whitelists and device styles", () =>
  harness(async ({ vite, render, click, change }) => {
    const { OfferModulePanel } = await vite.ssrLoadModule(
      "/src/prototype/OfferModulePanel.tsx",
    );
    let current = defaultOfferModule("bundles");
    current.enabled = true;
    const requests = [];
    const fetcher = async (url) => {
      requests.push(String(url));
      const u = new URL(url, "http://localhost");
      if (u.searchParams.has("ids"))
        return json({
          products: pickerProducts().filter((p) =>
            u.searchParams.get("ids").split(",").includes(p.id),
          ),
          missingIds: [],
        });
      return json({
        products: [pickerProducts()[u.searchParams.has("page_info") ? 1 : 0]],
        nextPageInfo: u.searchParams.has("page_info") ? null : "page-two",
      });
    };
    function Form() {
      const [value, setValue] = React.useState(current);
      current = value;
      return React.createElement(OfferModulePanel, {
        kind: "bundles",
        value,
        onChange: setValue,
        tiers: base.tiers,
        locale: "en",
        fetcher,
        currencyCode: "USD",
        onDraftError: () => {},
      });
    }
    await render(Form, {});
    await click(document.querySelector("[aria-expanded]"));
    await settle();
    await click(
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Add products",
      ),
    );
    await settle();
    await click(
      document.querySelector('[role="dialog"] input[type="checkbox"]'),
    );
    await click(
      [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === "Next",
      ),
    );
    await settle();
    await click(
      document.querySelector('[role="dialog"] input[type="checkbox"]'),
    );
    await click(
      [...document.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent === "Select 2 items",
      ),
    );
    await settle();
    assert.equal(current.items.length, 2);
    assert.deepEqual(
      current.items.map((r) => r.allowedVariantIds),
      [
        ["as", "al"],
        ["bs", "bl"],
      ],
    );
    const variant = document.querySelector(
      'fieldset fieldset input[type="checkbox"]',
    );
    await click(variant);
    assert.deepEqual(current.items[0].allowedVariantIds, ["al"]);
    await click([...document.querySelectorAll('[role="tab"]')].find(button => button.textContent === "Style"));
    const style = document.querySelector('[data-offer-panel] [role="tabpanel"]');
    await click(
      [...style.querySelectorAll("button")].find(
        (b) => b.textContent === "Mobile",
      ),
    );
    const layout = [...style.querySelectorAll("label")]
      .find((l) => l.textContent.includes("Layout"))
      .querySelector("select");
    await change(layout, "carousel");
    assert.equal(current.style.mobile.layout.mode, "carousel");
    assert.equal(current.style.desktop.layout.mode, "grid");
    assert.equal(
      requests.some((u) => u.includes("page_info=page-two")),
      true,
    );
  }));
test("every supported admin locale supplies localized offer labels", () =>
  harness(async ({ vite }) => {
    const { offerText } = await vite.ssrLoadModule(
      "/src/prototype/offer-messages.ts",
    );
    const { APP_LOCALES } = await vite.ssrLoadModule(
      "/src/prototype/admin-locale.ts",
    );
    for (const locale of APP_LOCALES) {
      assert.ok(offerText(locale, "allEligible"));
      assert.ok(offerText(locale, "variants"));
      if (locale !== "en")
        assert.notEqual(
          offerText(locale, "allEligible"),
          offerText("en", "allEligible"),
          locale,
        );
    }
  }));
test("shopper preview uses storefront option copy and lists gifts plus selected bundles in the cart receipt", () =>
  harness(async ({ vite, render, click }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule(
      "/src/prototype/StorefrontWidget.tsx",
    );
    await render(StorefrontWidget, {
      ...base,
      translations: { "widget.choose_option": "Choisir une option" },
      gifts: moduleFor("gifts", [rule("a")]),
      bundles: moduleFor("bundles", [rule("b")]),
      offerPreview: { state: "ready", products },
    });
    await click(
      document.querySelector(
        '[data-offer-kind="bundles"] input[type="checkbox"]',
      ),
    );
    const gift = document.querySelector('[data-offer-kind="gifts"]');
    assert.match(gift.textContent, /Choisir une option/);
    assert.doesNotMatch(gift.textContent, /Allowed variants/);
    const receipt = document.querySelector("[data-offer-receipt]");
    assert.ok(receipt);
    assert.match(receipt.textContent, /Gifts.*Product a.*s.*1/);
    assert.match(receipt.textContent, /Bundled products.*Product b.*s.*1/);
  }));
test("campaign editor device controls preserve selected bundles and variants", () =>
  harness(async ({ vite, render, click, change }) => {
    const { CampaignEditor } = await vite.ssrLoadModule(
      "/src/prototype/CampaignEditor.tsx",
    );
    const main = { ...pickerProducts()[0], id: "main", title: "Main serum" };
    const fetcher = async (url, opts = {}) => {
      if (String(url).includes("/markets"))
        return json({
          shopCurrencyCode: "USD",
          markets: [
            {
              id: "primary",
              name: "Primary",
              enabled: true,
              primary: true,
              currencyCode: "USD",
              regionCodes: ["US"],
              defaultLocale: "en",
            },
          ],
        });
      if (String(url).includes("/products"))
        return json({
          products: String(url).includes("ids=")
            ? [main, ...pickerProducts()]
            : [main],
          missingIds: [],
          nextPageInfo: null,
        });
      if (String(url).includes("offer-preview"))
        return json({ version: 2, ...JSON.parse(opts.body), products });
      if (String(url).includes("market-prices"))
        return json({
          prices: [
            { countryCode: "US", amountMinor: 1000, currencyCode: "USD" },
          ],
        });
      return json({ translations: {} });
    };
    const campaign = {
      id: "device",
      name: "Draft",
      discountName: "Sale",
      scope: { kind: "products", productIds: ["main"], excludedProductIds: [] },
      status: "Draft",
      tiers: base.tiers,
      startsAt: "2026-11-25T00:00:00.000Z",
      neverExpires: true,
      bundles: moduleFor("bundles", [rule("b")]),
    };
    await render(CampaignEditor, {
      campaign,
      campaigns: [],
      fetcher,
      notify: () => {},
      onSave: async () => {},
      onCancel: () => {},
    });
    await settle();
    await settle();
    await click(
      document.querySelector(
        '[data-offer-kind="bundles"] input[type="checkbox"]',
      ),
    );
    await change(
      document.querySelector('[data-offer-kind="bundles"] select'),
      "bl",
    );
    await click(
      document.querySelector(
        '[data-preview-control="device"] button:last-child',
      ),
    );
    assert.equal(
      document.querySelector(
        '[data-offer-kind="bundles"] input[type="checkbox"]',
      ).checked,
      true,
    );
    assert.equal(
      document.querySelector('[data-offer-kind="bundles"] select').value,
      "bl",
    );
  }));

test("large persisted gift quantities fail unavailable before expanding unit controls", () =>
  harness(async ({ vite, render }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    for (const quantity of [4294967296, 1000000, Number.MAX_SAFE_INTEGER, 0, -1, 1.5]) {
      const gifts = moduleFor("gifts", [{ ...rule("a"), quantity }]);
      await render(StorefrontWidget, { ...base, gifts, offerPreview: { state: "ready", products } });
      const card = document.querySelector('[data-rule-id="a"]');
      assert.equal(card.dataset.included, "false");
      assert.match(card.textContent, /unavailable/i);
      assert.equal(card.querySelectorAll("select").length, 0);
      assert.equal(gifts.items[0].quantity, quantity, "preview must preserve merchant configuration");
    }
  }));

test("historical bundle quantity renders one variant slot and no shopper quantity input", () =>
  harness(async ({ vite, render, click }) => {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    for(const quantity of [3,4294967296]){
      await render(StorefrontWidget, {...base,bundles:moduleFor("bundles",[{...rule("a"),quantity}]),offerPreview:{state:"ready",products}});
      const card=()=>document.querySelector('[data-rule-id="a"]');
      if(!card().querySelector('input[type="checkbox"]').checked)await click(card().querySelector('input[type="checkbox"]'));
      assert.equal(card().dataset.included,"true");assert.equal(card().querySelector('input[type="number"]'),null);assert.equal(card().querySelectorAll('select').length,1);
    }
  }));

test("locked bundle native checkbox unlocks and selects once while unready remains disabled", () =>
  harness(async ({vite,render,click})=>{
    const {StorefrontWidget}=await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const props={...base,tiers:base.tiers.map(t=>({...t,recommended:t.quantity===2})),bundles:moduleFor("bundles",[rule("a",3)]),offerPreview:{state:"ready",products}};
    await render(StorefrontWidget,props);
    const card=()=>document.querySelector('[data-rule-id="a"]'),input=()=>card().querySelector('input[type="checkbox"]');
    assert.ok(input());assert.equal(input().checked,false);assert.equal(input().disabled,false);assert.match(input().getAttribute('aria-label'),/Product a/);assert.equal(card().querySelector('button'),null);
    await click(input().closest('label'));assert.equal(input().checked,true);assert.equal(card().dataset.included,'true');
    await click(input());assert.equal(input().checked,false);
    await render(StorefrontWidget,{...props,offerPreview:{state:'loading',products:[]}});assert.equal(input().disabled,true);
  }));

test("merchant bundle controls retain main threshold and variants but quantity editor is gift-only",()=>
 harness(async({vite,render,click})=>{
 const {OfferModulePanel}=await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');
 for(const kind of ['bundles','gifts']){
 await render(OfferModulePanel,{key:kind,kind,value:moduleFor(kind,[rule('a')]),onChange:()=>{},tiers:base.tiers,locale:'en',fetcher:async()=>json({products:pickerProducts(),missingIds:[],nextPageInfo:null}),currencyCode:'USD',onDraftError:()=>{}});
 await click(document.querySelector('[aria-expanded]'));await settle();
 const quantityLabels=[...document.querySelectorAll('[data-offer-panel] label')].filter(l=>l.firstChild?.textContent==='Quantity');
 assert.equal(quantityLabels.length,kind==='gifts'?1:0);assert.ok([...document.querySelectorAll('label')].some(l=>l.textContent.includes('Main product quantity')));
 }
 }));

test("picker deselection clears removed drafts and keeps retained rule errors", () =>
  harness(async ({ vite, render, click, change }) => {
    const { OfferModulePanel } = await vite.ssrLoadModule("/src/prototype/OfferModulePanel.tsx");
    let current;
    const fetcher = async () => json({ products: pickerProducts(), missingIds: [], nextPageInfo: null });
    function Form() {
      const [value, setValue] = React.useState(moduleFor("bundles", [
        { ...rule("a"), discountType: "percentage" },
        { ...rule("b"), discountType: "percentage" },
      ]));
      const [error, setError] = React.useState("");
      current = value;
      return React.createElement(React.Fragment, null,
        React.createElement(OfferModulePanel, { kind: "bundles", value, onChange: setValue,
          tiers: base.tiers, locale: "en", fetcher, currencyCode: "USD", onDraftError: setError }),
        React.createElement("output", { id: "draft-error" }, error));
    }
    await render(Form, {});
    await click(document.querySelector("[aria-expanded]"));
    await settle();
    const drafts = () => document.querySelectorAll('[data-offer-panel] input[inputmode="decimal"]');
    const choose = async (index, count) => {
      await click([...document.querySelectorAll("button")].find(b => b.textContent === "Add products"));
      await settle();
      await click(document.querySelectorAll('[role="dialog"] input[type="checkbox"]')[index]);
      await click([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === `Select ${count} item${count === 1 ? "" : "s"}`));
      await settle();
    };
    await change(drafts()[0], "invalid-a");
    assert.ok(document.querySelector("#draft-error").textContent);
    await choose(0, 1);
    assert.deepEqual(current.items.map(r => r.productId), ["b"]);
    assert.equal(document.querySelector("#draft-error").textContent, "", "removed invalid rule must not block save");
    await choose(0, 2);
    assert.ok([...drafts()].every(input => input.value !== "invalid-a"));
    await change(drafts()[0], "invalid-b");
    await change(drafts()[1], "invalid-a-again");
    await choose(0, 1);
    assert.deepEqual(current.items.map(r => r.productId), ["b"]);
    assert.ok(document.querySelector("#draft-error").textContent, "retained invalid rule must still block save");
    await change(drafts()[0], "10");
    assert.equal(document.querySelector("#draft-error").textContent, "");
  }));

test("unsafe aggregate quote exposes no partial accessory quantity or cart lines", () =>
  harness(async ({ vite, render }) => {
    const { useOfferSelection } = await vite.ssrLoadModule("/src/prototype/offer-selection.ts");
    let selection;
    const expensive = products.slice(0, 2).map(product => ({
      ...product,
      variants: product.variants.map(variant => ({
        ...variant,
        price: { ...variant.price, amountMinor: Number.MAX_SAFE_INTEGER },
      })),
    }));
    function Probe() {
      selection = useOfferSelection({
        gifts: moduleFor("gifts", [rule("a"), rule("b")]),
        preview: { state: "ready", products: expensive },
        tiers: base.tiers,
        mainQuantity: 4,
        currencyCode: "USD",
      });
      return null;
    }
    await render(Probe, {});
    assert.equal(selection.safe, false);
    assert.equal(selection.quantity, 0);
    assert.deepEqual(selection.lines, []);
    assert.equal(selection.original, 0);
    assert.equal(selection.discounted, 0);
  }));

test('every enabled accessory Product is excluded from React main eligibility and unlock',()=>harness(async({vite,render,click})=>{
 const {StorefrontWidget}=await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
 const gifts=moduleFor('gifts',[rule('a'),rule('b',3)]),bundles=moduleFor('bundles',[rule('c')]);
 const props={...base,campaignProduct:{...products[0],variants:products[0].variants.map(v=>({...v,price:10}))},gifts,bundles,offerPreview:{state:'ready',products}};
 await render(StorefrontWidget,props);assert.equal(document.querySelectorAll('[data-included="true"]').length,0);
 assert.equal(document.querySelectorAll('[data-offer-kind="gifts"] button:not(:disabled)').length,0);
 assert.equal(document.querySelector('[data-offer-kind="bundles"] input[type="checkbox"]').disabled,true);
 await render(StorefrontWidget,{...props,gifts:{...gifts,enabled:false}});const input=document.querySelector('[data-offer-kind="bundles"] input[type="checkbox"]');assert.equal(input.disabled,false);await click(input);assert.equal(input.checked,true);
}));

test('rechecking a previously chosen locked bundle unlocks and retains that explicit choice',()=>harness(async({vite,render,click})=>{
 const {StorefrontWidget}=await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
 await render(StorefrontWidget,{...base,bundles:moduleFor('bundles',[rule('a',3)]),offerPreview:{state:'ready',products}});
 const input=()=>document.querySelector('[data-rule-id="a"] input[type="checkbox"]');await click(input());assert.equal(input().checked,true);
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Two')));assert.equal(input().checked,false);
 await click(input());assert.equal(input().checked,true);
}));


test('visual and disabled draft edits preserve canonical enabled price demand',()=>harness(async({vite,render})=>{
 const {useOfferPreview}=await vite.ssrLoadModule('/src/prototype/offer-preview-client.ts');let calls=0,state;
 function Probe(p){state=useOfferPreview(p.gifts,p.bundles,p.context,p.fetcher);return null;}
 const fetcher=async(_,opts)=>{calls++;return json({version:2,...JSON.parse(opts.body),products});};
 const gifts=moduleFor('gifts',[rule('a'),rule('b')]),bundles={...moduleFor('bundles',[rule('c')]),enabled:false};
 const props={gifts,bundles,context:{marketId:'primary',currencyCode:'USD',countryCode:'US',locale:'en'},fetcher};
 await render(Probe,props);await settle();assert.equal(calls,1);
 const styled=structuredClone(gifts);styled.style.desktop.layout.columns=3;styled.items[0].label='Visual only';styled.items.reverse();styled.items[0].allowedVariantIds.reverse();
 await render(Probe,{...props,gifts:styled,bundles:{...bundles,items:[]}});await settle();assert.equal(calls,1,'visual/reorder/disabled drafts must reuse prices');assert.equal(state.state,'ready');
 await render(Probe,{...props,context:{...props.context,countryCode:'CA'}});await settle();assert.equal(calls,2);
 await render(Probe,{...props,gifts:moduleFor('gifts',[rule('c')])});await settle();assert.equal(calls,3);
}));

test('accessory Product has full main tier prices in React preview',()=>harness(async({vite,render})=>{
 const {StorefrontWidget}=await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
 const props={...base,tiers:base.tiers.map(t=>({...t,discountPercent:50})),campaignProduct:{...pickerProducts()[0],variants:pickerProducts()[0].variants.map(v=>({...v,price:10}))},gifts:moduleFor('gifts',[rule('a')]),offerPreview:{state:'ready',products}};
 await render(StorefrontWidget,props);assert.match(document.querySelector('[data-offer-summary]').textContent,/\$40\.00/);assert.doesNotMatch(document.querySelector('[data-offer-summary]').textContent,/\$20\.00/);
}));

test('bundle market amounts reuse authenticated markets and Settings Style tabs',()=>harness(async({vite,render,click,change})=>{
 const {OfferModulePanel}=await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');let current=moduleFor('bundles',[{...rule('a'),discountType:'fixed_amount',discountValue:100}]),draftError='';
 const market={id:'jp',name:'Japan',enabled:true,currencyCode:'JPY',regionCurrencyCodes:['JPY'],specifiedAmountSupported:true};
 const mixed={...market,id:'mixed',name:'Mixed',currencyCode:null,regionCurrencyCodes:['USD','CAD'],specifiedAmountSupported:false};
 function Form(){const [value,setValue]=React.useState(current);current=value;return React.createElement(OfferModulePanel,{kind:'bundles',value,onChange:setValue,tiers:base.tiers,locale:'en',currencyCode:'USD',fetcher,markets:{state:'ready',data:{shopCurrencyCode:'USD',markets:[market,mixed]}},onRetryMarkets:()=>{},onDraftError:e=>{draftError=e;}});}
 const fetcher=async()=>json({products:pickerProducts(),missingIds:[]});await render(Form,{});await click(document.querySelector('[aria-expanded]'));await settle();
 assert.equal(document.querySelectorAll('[role="tab"]').length,2);assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent,'Settings');
 const mode=document.querySelector('[data-offer-market="jp"] select');assert.ok(mode,'merchant market mode is available');assert.equal(document.querySelector('[data-offer-market="mixed"] select').disabled,true);
 await change(mode,'specified_amount');const amount=document.querySelector('[data-offer-market="jp"] input');await change(amount,'123');assert.deepEqual(current.items[0].marketOverrides.jp,{mode:'specified_amount',currencyCode:'JPY',amountMinor:123});
 await change(amount,'123.5');assert.ok(draftError);assert.equal(current.items[0].marketOverrides.jp.amountMinor,123);
 await change(amount,'9007199254740992');assert.ok(draftError);await change(amount,'200');assert.equal(draftError,'');
 await click([...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Style'));assert.equal(document.querySelector('[data-offer-market]'),null);assert.ok(document.querySelector('[role="tabpanel"] label'));
 await click([...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Settings'));assert.equal(document.querySelector('[data-offer-market="jp"] input').value,'200');
 const discount=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent==='Discount').querySelector('select');await change(discount,'fixed_price');assert.equal(current.items[0].marketOverrides,undefined);
}));

test('React carousel buttons follow actual scroll boundaries and nested keys remain native',()=>harness(async({vite,render})=>{
 const {StorefrontWidget}=await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');const bundles=moduleFor('bundles',[rule('a'),rule('b'),rule('c')]);bundles.style.desktop.layout.mode='carousel';
 await render(StorefrontWidget,{...base,bundles,offerPreview:{state:'ready',products}});const track=document.querySelector('[data-offer-kind="bundles"] [role="region"]');
 Object.defineProperties(track,{clientWidth:{value:300},scrollWidth:{value:900},scrollLeft:{value:0,writable:true}});await act(()=>track.dispatchEvent(new window.Event('scroll',{bubbles:true})));
 const buttons=document.querySelectorAll('[data-offer-kind="bundles"] button');assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
 track.scrollLeft=600;await act(()=>track.dispatchEvent(new window.Event('scroll',{bubbles:true})));assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
 const select=track.querySelector('select'),e=new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});select.dispatchEvent(e);assert.equal(e.defaultPrevented,false);
}));

test('market draft errors stay isolated and removed rules clear only owned errors',()=>harness(async({vite,render,click,change})=>{
 const {OfferModulePanel}=await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');let current=moduleFor('bundles',['a','b'].map(id=>({...rule(id),discountType:'fixed_price',discountValue:100}))),error='';
 const markets={state:'ready',data:{shopCurrencyCode:'USD',markets:['jp','ca'].map(id=>({id,name:id,enabled:true,currencyCode:id==='jp'?'JPY':'CAD',regionCurrencyCodes:[],specifiedAmountSupported:true}))}};
 const fetcher=async()=>json({products:pickerProducts(),missingIds:[]});function Form(){const [value,setValue]=React.useState(current);current=value;return React.createElement(OfferModulePanel,{kind:'bundles',value,onChange:setValue,tiers:base.tiers,locale:'en',fetcher,currencyCode:'USD',markets,onDraftError:e=>error=e});}
 await render(Form,{});await click(document.querySelector('[aria-expanded]'));await settle();
 const rules=()=>[...document.querySelectorAll('[data-offer-panel] fieldset')].filter(el=>el.querySelector('[data-offer-market]'));
 const mode=(i,id)=>rules()[i].querySelector(`[data-offer-market="${id}"] select`),amount=(i,id)=>rules()[i].querySelector(`[data-offer-market="${id}"] input`);
 await change(mode(0,'jp'),'specified_amount');await change(amount(0,'jp'),'1.1');await change(mode(0,'ca'),'specified_amount');await change(amount(0,'ca'),'2.25');assert.ok(error,'valid CA cannot clear invalid JP');
 await change(mode(1,'jp'),'specified_amount');await change(amount(1,'jp'),'3.5');
 await click(rules()[0].querySelector('button'));assert.equal(current.items.length,1);assert.ok(error,'removing A retains B market error');
 await change(amount(0,'jp'),'300');assert.equal(error,'');assert.equal(current.items[0].marketOverrides.jp.amountMinor,300);
 await change(mode(0,'ca'),'specified_amount');assert.ok(error,'empty specified draft blocks saving');await change(mode(0,'ca'),'auto_convert');assert.equal(error,'');
}));
