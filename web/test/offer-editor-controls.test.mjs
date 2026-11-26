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
async function harness(run) {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
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

const tiers = [
  { tierId: 'gid:bar:one', quantity: 1, label: 'One', discountPercent: 0 },
  { tierId: 'gid:bar:two', quantity: 2, label: 'Two', discountPercent: 0 },
  { tierId: 'gid:bar:four', quantity: 4, label: 'Four', discountPercent: 0 },
];
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

test('Custom immediately exposes matching tier checkboxes and preserves historical quantity until explicit edit', () => harness(async ({ vite, render, change, click }) => {
  const { OfferTriggerEditor } = await vite.ssrLoadModule('/src/prototype/OfferTriggerEditor.tsx');
  for (const [operator, quantity, checked] of [
    ['gte', 2, [false, true, true]], ['gt', 2, [false, false, true]], ['eq', 2, [false, true, false]], ['eq', 3, [false, false, false]],
  ]) {
    let current = { type: 'quantity', operator, quantity };
    let writes = 0;
    function Form() {
      const [value, setValue] = React.useState(current); current = value;
      return React.createElement(OfferTriggerEditor, { value, onChange: next => { writes++; setValue(next); }, tiers, locale: 'en' });
    }
    await render(Form, { key: operator + quantity });
    assert.equal(writes, 0, 'mount must not rewrite persisted historical triggers');
    assert.equal(document.querySelectorAll('select').length, 1, 'Custom has no nested quantity/type selector');
    assert.equal(document.querySelector('input[type="number"]'), null);
    assert.deepEqual([...document.querySelectorAll('input[type="checkbox"]')].map(el => el.checked), checked);
    await change(document.querySelector('[data-offer-trigger]'), 'custom');
    assert.equal(current.type, 'tiers');
    assert.deepEqual(current.tierIds, checked.map((selected, i) => selected ? tiers[i].tierId : null).filter(Boolean));
    await click(document.querySelector('input[type="checkbox"]'));
    assert.equal(current.tierIds.includes('gid:bar:one'), true);
  }
}));

test('editing historical Custom checkboxes persists tier IDs and keeps Custom expanded', () => harness(async ({ vite, render, click }) => {
  const { OfferTriggerEditor } = await vite.ssrLoadModule('/src/prototype/OfferTriggerEditor.tsx');
  let current = { type: 'quantity', operator: 'eq', quantity: 2 };
  function Form() {
    const [value, setValue] = React.useState(current); current = value;
    return React.createElement(OfferTriggerEditor, { value, onChange: setValue, tiers, locale: 'en' });
  }
  await render(Form, {});
  await click([...document.querySelectorAll('input[type="checkbox"]')][2]);
  assert.deepEqual(current, { type: 'tiers', tierIds: ['gid:bar:two', 'gid:bar:four'] });
  assert.equal(document.querySelector('[data-offer-trigger]').value, 'custom');
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 3);
}));

test('trigger presets preserve tier identifiers containing colons and Custom remains open after checkbox changes', () => harness(async ({ vite, render, change, click }) => {
  const { OfferTriggerEditor } = await vite.ssrLoadModule('/src/prototype/OfferTriggerEditor.tsx');
  let current = { type: 'tiers', tierIds: ['gid:bar:two'] };
  function Form() {
    const [value, setValue] = React.useState(current); current = value;
    return React.createElement(OfferTriggerEditor, { value, onChange: setValue, tiers, locale: 'en' });
  }
  await render(Form, {});
  await change(document.querySelector('[data-offer-trigger]'), 'from:gid:bar:two');
  assert.deepEqual(current, { type: 'tiers', tierIds: ['gid:bar:two', 'gid:bar:four'] });
  await change(document.querySelector('[data-offer-trigger]'), 'only:gid:bar:four');
  assert.deepEqual(current, { type: 'tiers', tierIds: ['gid:bar:four'] });
  await change(document.querySelector('[data-offer-trigger]'), 'custom');
  await click(document.querySelector('input[type="checkbox"]'));
  assert.equal(document.querySelector('[data-offer-trigger]').value, 'custom');
  assert.deepEqual(current.tierIds, ['gid:bar:four', 'gid:bar:one']);
}));

test('style device buttons live in module header, edit devices independently and hide with Settings or collapse', () => harness(async ({ vite, render, click, change }) => {
  const { OfferModulePanel } = await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');
  const shared = (await vite.ssrLoadModule('/src/pages/quantity-breaks.module.css')).default;
  let current = defaultOfferModule('gifts');
  const fetcher = async () => new Response(JSON.stringify({ products: [], missingIds: [] }));
  function Form() {
    const [value, setValue] = React.useState(current); current = value;
    return React.createElement(OfferModulePanel, { kind: 'gifts', value, onChange: setValue, tiers, locale: 'en', fetcher, currencyCode: 'USD', onDraftError: () => {} });
  }
  await render(Form, {});
  const header = () => document.querySelector('[data-offer-panel] > header');
  assert.equal(header().querySelector('[role="group"]'), null);
  await click(document.querySelector('[aria-expanded]'));
  await click(document.querySelector('[role="tab"][id$="style-tab"]'));
  const group = header().querySelector('[role="group"]');
  assert.ok(group, 'device switch belongs in module header');
  assert.ok(group.classList.contains(shared.styleDeviceToggle));
  assert.equal(group.nextElementSibling.getAttribute('role'), 'switch');
  assert.equal(group.querySelector('button').textContent, 'PC');
  assert.equal(document.querySelector('[role="tabpanel"] [role="group"]'), null);
  const desktopSize = current.style.desktop.typography?.sectionTitle?.sizePx ?? 16;
  await click([...group.querySelectorAll('button')][1]);
  await change(document.querySelector('[aria-label="Section title size"]'), '23');
  assert.equal(current.style.mobile.typography.sectionTitle.sizePx, 23);
  assert.equal(current.style.desktop.typography?.sectionTitle?.sizePx ?? 16, desktopSize);
  await click(document.querySelector('[role="tab"][id$="settings-tab"]'));
  assert.equal(header().querySelector('[role="group"]'), null);
  await click(document.querySelector('[role="tab"][id$="style-tab"]'));
  await click(document.querySelector('[aria-expanded]'));
  assert.equal(header().querySelector('[role="group"]'), null);
}));

test('new products default to configured tiers at quantity two or higher', () => harness(async ({ vite, render, click }) => {
  const { OfferModulePanel } = await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');
  let current = defaultOfferModule('gifts');
  const product = { id: 'new-product', title: 'New product', imageUrl: null, variants: [{ id: 'variant', title: 'Default', price: 100, compareAtPrice: null, options: [], imageUrl: null, inventory: 10, inventoryPolicy: 'deny', available: true }] };
  const fetcher = async () => new Response(JSON.stringify({ products: [product], missingIds: [], nextPageInfo: null }));
  function Form() {
    const [value, setValue] = React.useState(current); current = value;
    return React.createElement(OfferModulePanel, { kind: 'gifts', value, onChange: setValue, tiers, locale: 'en', fetcher, currencyCode: 'USD', onDraftError: () => {} });
  }
  await render(Form, {});
  await click(document.querySelector('[aria-expanded]')); await settle();
  await click([...document.querySelectorAll('button')].find(el => el.textContent === 'Add products')); await settle();
  await click(document.querySelector('[role="dialog"] input[type="checkbox"]'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find(el => /Select 1/.test(el.textContent))); await settle();
  assert.deepEqual(current.items[0].trigger, { type: 'tiers', tierIds: ['gid:bar:two', 'gid:bar:four'] });
}));
