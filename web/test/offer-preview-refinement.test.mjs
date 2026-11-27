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
import { effectiveOfferColumns, defaultOfferModule } from "../../shared/offer-core.mjs";
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

function previewProps(module,kind){return {device:'desktop',locale:'en',translations:{},tiers:base.tiers,onUnlock:()=>{},mainTotal:1000,mainReady:true,currencyCode:'USD',selection:{safe:true,quoteReady:true,discounted:0,mainQualifies:true,select:()=>{},selectVariant:()=>{},groups:[{kind,module,cards:module.items.map(r=>({rule:r,product:products.find(p=>p.id===r.productId),included:true,eligible:true,ready:true,selected:[products[0].variants[0]],options:products[0].variants,count:r.quantity,original:r.quantity*1000,savings:r.quantity*1000,potentialSavings:r.quantity*1000,checked:true,selectable:true}))}]}};}
test('gift savings-only presentation honors switch and omits card and receipt quantities',()=>harness(async({vite,render})=>{
 const{OfferPreview:StorefrontWidget,OfferReceipt}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');const gifts=moduleFor('gifts',[{...rule('a'),quantity:2}]);const props={...previewProps(gifts,'gifts')};
 await render(StorefrontWidget,props);const card=()=>document.querySelector('[data-rule-id="a"]');assert.ok(card().querySelector('[class*="price"]')===null,'gifts must hide prices');assert.ok(card().querySelector('del')===null);assert.match(card().querySelector('[data-offer-savings]').textContent,/20.00/);assert.doesNotMatch(card().textContent,/×/);await render(OfferReceipt,{selection:props.selection,locale:'en',currencyCode:'USD'});assert.doesNotMatch(document.querySelector('[data-offer-receipt]').textContent,/×/);assert.match(document.querySelector('[data-offer-receipt-amount]').textContent,/20.00/);
 await render(StorefrontWidget,previewProps({...gifts,items:gifts.items.map(r=>({...r,showSavings:false}))},'gifts'));assert.equal(card().querySelector('[data-offer-savings]'),null);
}));
test('device-specific price and selected border values reach preview',()=>harness(async({vite,render})=>{
 const{OfferPreview:StorefrontWidget,OfferReceipt}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');const bundles=moduleFor('bundles',[rule('a')]);bundles.style.desktop={...bundles.style.desktop,card:{radiusPx:19},colors:{price:'#112233',comparePrice:'#223344',savings:'#334455',variant:'#445566',selectedBorder:'#556677'},typography:{price:{sizePx:21,weight:700},variant:{sizePx:17,weight:500}}};await render(StorefrontWidget,{...previewProps(bundles,'bundles')});const group=document.querySelector('[data-offer-kind="bundles"]');for(const[name,value]of Object.entries({'card-radius':'19px','price-color':'#112233','compare-price-color':'#223344','savings-color':'#334455','variant-color':'#445566','selected-border':'#556677','price-size':'21px','price-weight':'700','variant-size':'17px'}))assert.equal(group.style.getPropertyValue('--offer-'+name),value,name);
}));
test('carousel arrows sit beside card track and hide at boundaries',()=>harness(async({vite,render})=>{
 const{OfferPreview:StorefrontWidget,OfferReceipt}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');const gifts=moduleFor('gifts',[rule('a'),rule('b'),rule('c')]);gifts.style.desktop={...gifts.style.desktop,layout:{...gifts.style.desktop.layout,mode:'carousel'}};await render(StorefrontWidget,{...previewProps(gifts,'gifts')});const group=document.querySelector('[data-offer-kind="gifts"]'),track=group.querySelector('[role="region"]'),previous=group.querySelector('button[aria-label^="Previous"]'),next=group.querySelector('button[aria-label^="Next"]');assert.equal(previous.hidden,true);assert.equal(next.hidden,true);assert.equal(previous.closest('[class*="groupHeading"]'),null);assert.equal(previous.parentElement.parentElement,track.parentElement);Object.defineProperties(track,{clientWidth:{value:200,configurable:true},scrollWidth:{value:600,configurable:true}});track.scrollLeft=0;await act(()=>track.dispatchEvent(new window.Event('scroll',{bubbles:true})));assert.equal(previous.hidden,true);assert.equal(next.hidden,false);track.scrollLeft=400;await act(()=>track.dispatchEvent(new window.Event('scroll',{bubbles:true})));assert.equal(previous.hidden,false);assert.equal(next.hidden,true);
}));

test('effective columns select horizontal offer structure only when one card fits',()=>harness(async({vite,render})=>{
 const {OfferPreview}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');
 for(const kind of ['gifts','bundles']){
  const module=moduleFor(kind,[rule('a')]);module.style.desktop.layout={...module.style.desktop.layout,columns:3,cardLayout:'horizontal'};
  for(const width of [400,180]){
   window.HTMLElement.prototype.getBoundingClientRect=()=>({width,height:200,left:0,right:width,top:0,bottom:200});
   await render(OfferPreview,{...previewProps(module,kind),key:kind+width});
   const group=document.querySelector('[data-offer-kind]'),card=group.querySelector('article');
   assert.equal(group.dataset.columns,width===400?'3':'1');
   assert.equal(card.dataset.offerOrientation,width===400?'vertical':'horizontal');
   if(kind==='bundles'){
    const prices=card.querySelector('[data-offer-price-row]');assert.ok(prices);
    assert.ok(prices.querySelector('[data-offer-discounted]'));
    assert.ok(prices.querySelector('[data-offer-savings]'));
    assert.equal(prices.lastElementChild.tagName,'DEL');
    assert.equal(card.querySelector('input[type="checkbox"]').dataset.visuallyHidden,width===400?'true':'false');
    if(width===180)assert.equal(prices.firstElementChild.type,'checkbox');
   }
  }
 }
}));
test('multi-column bundle card toggles with pointer and keyboard but leaves select native',()=>harness(async({vite,render,click,change})=>{
 const{OfferPreview}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:400,height:200,left:0,right:400,top:0,bottom:200});
 const module=moduleFor('bundles',[rule('a')]);module.style.desktop.layout={...module.style.desktop.layout,columns:3,cardLayout:'horizontal'};
 const props=previewProps(module,'bundles');let selections=0,variantChanges=0;
 function Form(){const[checked,setChecked]=React.useState(false);const selection={...props.selection,select:(_module,_rule,value)=>{selections++;setChecked(value)},selectVariant:()=>{variantChanges++},groups:props.selection.groups.map(group=>({...group,cards:group.cards.map(card=>({...card,checked,included:checked}))}))};return React.createElement(OfferPreview,{...props,selection});}
 await render(Form,{});const card=()=>document.querySelector('article');
 await click(card());assert.equal(card().dataset.included,'true');assert.equal(selections,1);assert.equal(card().dataset.selectionFocused,'true');assert.ok(document.activeElement===card().querySelector('input[type="checkbox"]'));
 await click(card().querySelector('select'));assert.equal(selections,1);
 await change(card().querySelector('select'),'al');assert.equal(variantChanges,1);assert.equal(selections,1);
 const checkbox=()=>card().querySelector('input[type="checkbox"]');
 await act(()=>checkbox().dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.equal(card().dataset.included,'false');assert.equal(selections,2);
 await click(checkbox());assert.equal(card().dataset.included,'true');assert.equal(selections,3);
 await act(()=>card().querySelector('select').dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',bubbles:true})));assert.equal(selections,3);
 assert.equal(card().getAttribute('role'),'group');
}));

test('multi-column simulated choices retain selection feedback without quote and respect locked disabled cards',()=>harness(async({vite,render,click})=>{
 const{OfferPreview}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:400,height:200,left:0,right:400,top:0,bottom:200});
 const module=moduleFor('bundles',[rule('a')]);module.style.desktop.layout={...module.style.desktop.layout,columns:3,cardLayout:'horizontal'};const props=previewProps(module,'bundles');let selections=0;
 function Form({locked=false,disabled=false}){const[checked,setChecked]=React.useState(false);return React.createElement(OfferPreview,{...props,selection:{...props.selection,select:(_m,_r,v)=>{selections++;setChecked(v)},groups:props.selection.groups.map(g=>({...g,cards:g.cards.map(c=>({...c,ready:false,included:false,checked,eligible:!locked,selectable:!disabled}))}))}});}
 await render(Form,{});let card=document.querySelector('article');await click(card);card=document.querySelector('article');assert.equal(card.dataset.checked,'true');assert.equal(card.dataset.included,'false');assert.match(card.className,/included/);assert.equal(selections,1);
 for(const mode of [{locked:true},{disabled:true}]){await render(Form,{...mode,key:JSON.stringify(mode)});await click(document.querySelector('article'));assert.equal(selections,1);assert.equal(document.querySelector('article input').disabled,true);}
}));

test('single-column bundle prices and selectors span the actual styled card, with image confined to its title row',()=>harness(async({vite,render})=>{
 const {OfferPreview}=await vite.ssrLoadModule('/src/prototype/OfferPreview.tsx');
 const classes=(await vite.ssrLoadModule('/src/prototype/offers.module.css')).default;
 const css=await readFile(new URL('../src/prototype/offers.module.css',import.meta.url),'utf8');
 const sheet=document.createElement('style');sheet.textContent=css.replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g,(match,key)=>classes[key]?'.'+classes[key]:match);document.head.append(sheet);
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:320,height:200,left:0,right:320,top:0,bottom:200});
 const module=moduleFor('bundles',[rule('a')]);module.style.desktop.layout={...module.style.desktop.layout,columns:1};
 await render(OfferPreview,previewProps(module,'bundles'));
 const card=document.querySelector('article'),style=element=>window.getComputedStyle(element);
 assert.equal(style(card.querySelector('[data-offer-price-row]')).gridColumn,'1 / -1');
 assert.equal(style(card.querySelector('select').parentElement).gridColumn,'1 / -1');
 assert.equal(style(card.querySelector('[class*="imageBlank"]')).gridRow,'2');
}));
