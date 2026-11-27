import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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
    root: fileURLToPath(new URL("../", import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
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

const product = { id: 'gift', title: 'Gift product', variants: [{ id: 'v1', title: 'Blue', price: 100, options: [], available: true }] };
const fetcher = async () => new Response(JSON.stringify({ products: [product], missingIds: [], nextPageInfo: null }));
function panelProps(kind, current, setValue) { return { kind, value: current, onChange: setValue, tiers, locale: 'zh-Hans', fetcher, currencyCode: 'USD', onDraftError: () => {} }; }
function populated(kind) { return { ...defaultOfferModule(kind), items: [{ ruleId:'rule', productId:'gift', displayOrder:0, allowedVariantIds:['v1'], quantity:1, label:'Badge', labelPosition:'corner', showImage:true, discountType:'fixed_price', discountValue:0, trigger:{type:'tiers',tierIds:['gid:bar:two']} }] }; }
test('gift savings display defaults on and changes persist without affecting image settings', () => harness(async ({vite, render, click}) => {
 const { OfferModulePanel } = await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');
 let current = populated('gifts');
 function Form(){ const [value,setValue]=React.useState(current); current=value; return React.createElement(OfferModulePanel,panelProps('gifts',value,setValue)); }
 await render(Form,{}); await click(document.querySelector('[aria-expanded]')); await settle();
 const savings=[...document.querySelectorAll('label')].find(el=>el.textContent==='显示优惠金额')?.querySelector('input');
 const giftFields=[...document.querySelector('[data-offer-panel] fieldset').lastElementChild.children].map(el=>el.textContent.trim());
 assert.deepEqual(giftFields.slice(0,4).map(text=>text.replace(/\s+/g,'')), ['数量','显示图片显示优惠金额','标签','标签位置边框居中商品标签下面']);
 assert.ok(savings); assert.equal(savings.checked,true); await click(savings); assert.equal(current.items[0].showSavings,false); assert.equal(current.items[0].showImage,true);
 assert.ok(document.body.textContent.includes('边框居中'));
 assert.ok(!document.body.textContent.includes('所有达标赠品均自动纳入。'));
}));
test('offer typography and card radius persist independently for Mobile', () => harness(async ({vite,render,click,change})=>{
 const { OfferModulePanel }=await vite.ssrLoadModule('/src/prototype/OfferModulePanel.tsx');
 let current=populated('bundles');
 function Form(){const [value,setValue]=React.useState(current);current=value;return React.createElement(OfferModulePanel,panelProps('bundles',value,setValue));}
 await render(Form,{});await click(document.querySelector('[aria-expanded]'));await settle();
 assert.ok(document.body.textContent.includes('右上角'));
 const bundleFields=[...document.querySelector('[data-offer-panel] fieldset').lastElementChild.children].map(el=>el.textContent.trim());
 assert.equal(bundleFields[0], '标签'); assert.ok(bundleFields[1].includes('右上角')); assert.ok(bundleFields[2].includes('条件')); assert.equal(bundleFields[3], '显示图片');
 await click(document.querySelector('[id$="style-tab"]'));
 const device=document.querySelector('header [role="group"]');assert.deepEqual([...device.querySelectorAll('button')].map(el=>el.textContent),['PC','Mobile']);await click(device.querySelectorAll('button')[1]);
 const savings=document.querySelector('[data-offer-font="savings"] input');assert.ok(savings);await change(savings,'22');assert.equal(current.style.mobile.typography.savings.sizePx,22);assert.equal(current.style.desktop.typography?.savings,undefined);
 const radius=document.querySelector('[data-offer-card-radius]');assert.ok(radius);await change(radius,'17');assert.equal(current.style.mobile.card.radiusPx,17);
}));
