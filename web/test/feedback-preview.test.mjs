import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('feedback preview is isolated from merchant feedback routes', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { isFeedbackPreviewPath } = await vite.ssrLoadModule('/src/prototype/feedback-preview-page.tsx');
    assert.equal(isFeedbackPreviewPath('/preview/feedback-board'), true);
    assert.equal(isFeedbackPreviewPath('/quantity-breaks/feedback'), false);
  } finally {
    await vite.close();
  }
});

test('the filename router does not expose feedback preview outside its exact entry path', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/feedback-preview' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(App)));
    assert.doesNotMatch(document.body.textContent, /需求与建议/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('feedback preview dialog exposes the approved fields and responsive styles without feedback focus overrides', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackSubmitPreviewDialog } = await vite.ssrLoadModule('/src/prototype/feedback-preview.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackSubmitPreviewDialog, { open: true, onCancel: () => {}, onSubmit: () => {} }));
    assert.match(html, /<label[^>]*>标题/);
    assert.match(html, /<label[^>]*>内容/);
    assert.match(html, />取消<\/button>/);
    assert.match(html, />提交<\/button>/);
    assert.doesNotMatch(html, /提交成功/);
    const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 767px\)[^]*feedbackCard/);
    assert.doesNotMatch(css, /\.feedback[^\n]*:(?:focus|focus-visible)/);
    assert.doesNotMatch(css, /\.feedbackSearch input[^}]*outline:0/);
  } finally {
    await vite.close();
  }
});

test('feedback preview renders the approved list controls without nesting vote actions in detail links', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackPreviewPage } = await vite.ssrLoadModule('/src/prototype/feedback-preview.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackPreviewPage, {
      items: [{ id: 'one', title: '复制活动', excerpt: '...', status: 'pending', voteCount: 12, voted: false, createdAt: '2026-10-29', hasOfficialReply: true }],
      notifySuccess: () => {},
    }));
    assert.match(html, /需求与建议/);
    assert.match(html, />建议<\/button>/);
    assert.match(html, /待审核/);
    assert.match(html, /feedbackStatusAll/);
    assert.doesNotMatch(html, /id="feedback-list-title"|aria-labelledby="feedback-list-title"/);
    assert.doesNotMatch(html, /<select[^>]*name="status"/);
    assert.match(html, /投票 12/);
    assert.doesNotMatch(html, /<a[^>]*>(?:(?!<\/a>)[\s\S])*<button[^>]*>投票/);
  } finally {
    await vite.close();
  }
});

test('feedback styles use a responsive flex grid with four, three and two columns', async () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.feedbackList[^}]*display:\s*flex/);
  assert.match(css, /\.feedbackCard[^}]*flex:\s*0 0 25%/);
  assert.match(css, /@media \(max-width: 1500px\)[^]*\.feedbackCard[^}]*flex-basis:\s*33\.3333%/);
  assert.match(css, /@media \(max-width: 767px\)[^]*\.feedbackCard[^}]*flex-basis:\s*50%/);
  assert.match(css, /\.feedbackCard p\s*\{[^}]*-webkit-line-clamp:\s*2/);
});

test('feedback cards keep titles complete, clamp only body copy, and include the requested dense desktop layout', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.feedbackCard h3\s*\{[^}]*-webkit-line-clamp/);
  assert.match(css, /\.feedbackCard p\s*\{[^}]*-webkit-line-clamp:\s*2/);
  assert.match(css, /\.feedbackList[^}]*display:\s*flex/);
  assert.match(css, /\.feedbackDialogBackdrop[^}]*backdrop-filter:\s*blur/);
  assert.match(css, /\.feedbackVotePulse/);
});

test('feedback styles use status-coloured card borders and filters', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.feedbackCardapproved\s*\{[^}]*border-color/);
  assert.match(css, /\.feedbackCardin_progress\s*\{[^}]*border-color/);
  assert.match(css, /\.feedbackCardreleased\s*\{[^}]*border-color/);
  assert.match(css, /\.feedbackStatusFilterpending\s*\{[^}]*color/);
  assert.match(css, /\.feedbackStatusFilterapproved\s*\{[^}]*color/);
});
