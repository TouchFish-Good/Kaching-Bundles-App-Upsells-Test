import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { createServer } from 'vite';
import english from '../src/locales/en.json' with { type: 'json' };

test('translation SaveBar confirms discarding edits before restoring the draft and switching languages', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/translations' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } });
    const { I18nextProvider } = await vite.ssrLoadModule('react-i18next');
    const { Translations } = await vite.ssrLoadModule('/src/prototype/Translations.tsx');
    const fetcher = async (url) => url.includes('store-languages')
      ? { ok: true, json: async () => ({ defaultLanguage: 'en', languages: ['en', 'fr'] }) }
      : { ok: true, json: async () => ({ translations: {} }) };
    let root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Translations, { shopId: 'shop-1', notify: () => {}, fetcher }))); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    assert.equal(document.body.textContent.includes('Unsaved changes'), false);
    const field = document.querySelector('textarea');
    await act(() => { Simulate.change(field, { target: { value: 'Buy more today' } }); });
    assert.match(document.body.textContent, /Discard changes/);

    const selector = document.querySelector('select');
    await act(() => { Simulate.change(selector, { target: { value: 'fr' } }); });
    assert.equal(selector.value, 'en');
    assert.doesNotMatch(document.body.textContent, /Unsaved changes\s*Switch languages/);

    const discard = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Discard changes');
    await act(() => discard.click());
    assert.match(document.body.textContent, /Discard current changes\?/);
    assert.equal(selector.value, 'en');
    const confirm = [...document.querySelectorAll('button')].filter((button) => button.textContent === 'Discard changes').at(-1);
    await act(() => confirm.click());
    assert.equal(selector.value, 'fr');
    await act(() => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('translation page restores the selected locale after remounting', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/translations' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } });
    const { I18nextProvider } = await vite.ssrLoadModule('react-i18next');
    const { Translations } = await vite.ssrLoadModule('/src/prototype/Translations.tsx');
    const fetcher = async (url) => url.includes('store-languages')
      ? { ok: true, json: async () => ({ defaultLanguage: 'en', languages: ['en', 'ja'] }) }
      : { ok: true, json: async () => ({ translations: {} }) };
    let root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Translations, { shopId: 'shop-1', notify: () => {}, fetcher }))); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const selector = document.querySelector('select');
    await act(() => { Simulate.change(selector, { target: { value: 'ja' } }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(() => root.unmount());
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Translations, { shopId: 'shop-1', notify: () => {}, fetcher }))); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(document.querySelector('select').value, 'ja');
    await act(() => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('translation SaveBar is backed by the SHOPLINE App Bridge SaveBar', async () => {
  const source = await readFile(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ SaveBar \} from ['"]@shoplineos\/app-bridge['"]/);
  assert.match(source, /SaveBar\.create\(app\)/);
  assert.match(source, /saveBar\.show\(/);
  assert.match(source, /onCancel: handleDiscard/);
  assert.match(source, /const handleDiscard = useCallback\(\(\) => \{ discardAndSwitchRef\.current\(\); \}, \[\]\);/);
  assert.doesNotMatch(source, /exitConfirm/);
  assert.match(source, /saveBar\.hide\(\)/);
  assert.match(source, /!app && dirty/);
});
