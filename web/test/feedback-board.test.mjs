import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { initReactI18next } from 'react-i18next';
import zhHans from '../src/locales/zh-Hans.json' assert { type: 'json' };
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

await i18next.use(initReactI18next).init({ lng: 'zh-Hans', resources: { 'zh-Hans': { translation: zhHans } } });

function setControlledValue(element, value, dom) {
  const prototype = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
}

test('feedback timestamps retain second precision in China Standard Time', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { formatFeedbackTimestamp } = await vite.ssrLoadModule('/src/prototype/feedback-api.ts');

    assert.equal(formatFeedbackTimestamp('2026-10-29T00:00:00.000Z'), '2026/10/29 08:00:00');
  } finally {
    await vite.close();
  }
});

test('renders official replies and anonymous text comments without attachment controls', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, {
      detail: { id: '1', authorLabel: 'merchant', isMine: false, title: 'Title', content: 'Body', status: 'pending', voteCount: 1, commentCount: 1, voted: false, createdAt: 'now', updatedAt: 'now', canWithdraw: false, comments: [{ id: 'c', authorLabel: '匿名用户', content: 'Comment', createdAt: 'now' }], replies: [{ id: 'r', authorLabel: '多件折扣', isOfficial: true, content: 'Reply', createdAt: 'now' }] },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {},
    }));
    assert.match(html, /匿名用户/);
    assert.match(html, /多件优惠/);
    assert.doesNotMatch(html, /上传附件|5MB|\.jpeg/);
  } finally {
    await vite.close();
  }
});

test('merchant board exposes a real suggestion dialog with only title, content, cancel, and submit', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackBoard, {
      fetcher: async () => new Response(JSON.stringify({ data: { items: [] } })),
      notify: () => {},
      initialSuggestionDialogOpen: true,
    }));

    assert.match(html, />建议<\/button>/);
    assert.match(html, /提交建议/);
    assert.match(html, /<label[^>]*>标题/);
    assert.match(html, /<label[^>]*>内容/);
    assert.match(html, />取消<\/button>/);
    assert.match(html, />发布<\/button>/);
    assert.doesNotMatch(html, /上传附件|5MB|\.jpeg/);
  } finally {
    await vite.close();
  }
});

test('merchant board renders public status buttons with server-provided counts instead of a status select', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackBoard, {
      fetcher: async () => new Response(JSON.stringify({ data: { items: [], counts: { all: 12, pending: 4, approved: 2, in_progress: 3, released: 2, rejected: 1 } } })),
      notify: () => {},
    }));

    assert.match(html, /全部/);
    assert.match(html, /开发中/);
    assert.match(html, /我的建议/);
    assert.doesNotMatch(html, /🙈待审核/);
    assert.doesNotMatch(html, /FEEDBACK HUB/);
    assert.doesNotMatch(html, /<select[^>]*name="status"/);
    assert.match(html, /aria-pressed="true"/);
  } finally {
    await vite.close();
  }
});

test('pending filter appears immediately after My suggestions only while that view is active', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackStatusFilters } = await vite.ssrLoadModule('/src/prototype/FeedbackStatusFilters.tsx');
    const counts = { all: 12, pending: 4, approved: 2, in_progress: 3, released: 2, rejected: 1 };
    const html = renderToStaticMarkup(React.createElement(FeedbackStatusFilters, {
      value: 'all', counts, mine: true, mineCount: 5, onChange: () => {}, onMineChange: () => {},
    }));
    const mineAt = html.indexOf('aria-label="我的建议"');
    const pendingAt = html.indexOf('aria-label="待审核"');
    assert.ok(mineAt >= 0 && pendingAt > mineAt, html);
    assert.ok(html.indexOf('已拒绝') < mineAt, html);
  } finally {
    await vite.close();
  }
});

test('feedback card labels render as regular status chips without SVG ribbons', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const root = createRoot(document.getElementById('root'));
    const fetcher = async () => new Response(JSON.stringify({ data: { items: [{ id: 'one', authorLabel: 'merchant', isMine: true, title: 'Card title', excerpt: 'Card excerpt', status: 'in_progress', voteCount: 1, commentCount: 0, voted: false, createdAt: '2026-10-29T00:00:00.000Z', hasOfficialReply: true }], counts: { all: 1, pending: 0, approved: 0, in_progress: 1, released: 0, rejected: 0 }, mineCount: 1, page: 1, pageSize: 9, total: 1, totalPages: 1 } }));
    await act(async () => root.render(React.createElement(FeedbackBoard, { fetcher, notify: () => {} })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    assert.match(document.body.textContent, /开发中/);
    assert.match(document.body.textContent, /官方已回复/);
    assert.match(document.body.textContent, /我的建议/);
    assert.equal(document.querySelector('.feedbackCardTop svg'), null, document.body.innerHTML);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('feedback cards use responsive CSS columns so cards keep their natural heights', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.feedbackList\s*\{[^}]*column-count:\s*4;[^}]*column-gap:\s*14px;[^}]*\}/);
  assert.match(css, /\.feedbackCard\s*\{[^}]*display:\s*inline-block;[^}]*width:\s*100%;[^}]*break-inside:\s*avoid;[^}]*\}/);
  assert.match(css, /@media \(max-width:\s*1500px\)\s*\{[^]*?\.feedbackList\s*\{[^}]*column-count:\s*3;/);
  assert.match(css, /@media \(max-width:\s*767px\)\s*\{[^]*?\.feedbackList\s*\{[^}]*column-count:\s*2;/);
});

test('official replies use the localized app name and configured avatar', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: { campaignTitle: 'Quantity breaks' } } } });
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const dialog = React.createElement(FeedbackDetailDialog, {
      detail: { id: '1', authorLabel: 'merchant', isMine: false, title: 'Title', content: 'Body', status: 'approved', voteCount: 1, commentCount: 0, voted: false, createdAt: 'now', updatedAt: 'now', canWithdraw: false, comments: [], replies: [{ id: 'r', authorLabel: '多件折扣', isOfficial: true, content: 'Reply', createdAt: 'now' }] },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {},
    });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, dialog));
    assert.match(html, /<img[^>]+src="https:\/\/img\.myshopline\.com\/image\/devcenter\/8888\/91404ae5d921457299c4416c4706b292\.png"/);
    assert.match(html, /Quantity breaks/);
    assert.match(html, /feedbackOfficialAvatar/);
  } finally {
    await vite.close();
  }
});

test('every shared app locale includes the fixed feedback copy', async () => {
  const files = (await readdir(new URL('../src/locales/', import.meta.url))).filter((file) => file.endsWith('.json') && file !== 'zh-hans-cn.json');
  const required = ['feedbackTitle', 'feedbackAddSuggestion', 'feedbackStatusAll', 'feedbackStatusPending', 'feedbackStatusApproved', 'feedbackStatusInProgress', 'feedbackStatusReleased', 'feedbackStatusRejected', 'feedbackOfficialReply', 'feedbackSubmitComment', 'feedbackLoading', 'feedbackSearchPlaceholder'];

  for (const file of files) {
    const messages = JSON.parse(await readFile(new URL(`../src/locales/${file}`, import.meta.url), 'utf8'));
    for (const key of required) assert.equal(typeof messages[key], 'string', `${file} is missing ${key}`);
  }
});

test('non-English locales translate every fixed feedback UI string instead of reusing English defaults', async () => {
  const english = JSON.parse(await readFile(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  const files = (await readdir(new URL('../src/locales/', import.meta.url))).filter((file) => file.endsWith('.json') && !['en.json', 'zh-hans-cn.json'].includes(file));
  const required = Object.keys(english).filter((key) => key.startsWith('feedback'));
  // A few French UI terms are spelled identically in English and French.
  const identicalTranslations = { 'fr.json': new Set(['feedbackListLabel', 'feedbackDiscussion']) };

  for (const file of files) {
    const messages = JSON.parse(await readFile(new URL(`../src/locales/${file}`, import.meta.url), 'utf8'));
    for (const key of required) {
      if (identicalTranslations[file]?.has(key)) continue;
      assert.notEqual(messages[key], english[key], `${file} reuses English ${key}`);
    }
  }
});

test('feedback cards use distinct low-saturation backgrounds for every status', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  for (const status of ['pending', 'approved', 'in_progress', 'released', 'rejected']) {
    assert.match(css, new RegExp(`\\.feedbackCard${status}\\s*\\{[^}]*background:`));
  }
});

test('feedback card status labels use their own semantic foreground and background colors', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  for (const status of ['pending', 'approved', 'in_progress', 'released', 'rejected']) {
    assert.match(css, new RegExp(`\\.feedbackCardTop \\.feedbackStatus${status}\\s*\\{[^}]*color:[^;]+;[^}]*background:[^;]+;`));
  }
});

test('official-reply card labels use the official gradient instead of the in-progress status color', async () => {
  const source = await readFile(new URL('../src/prototype/FeedbackBoard.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(source, /styles\.feedbackOfficialReply/);
  assert.match(css, /\.feedbackCardTop \.feedbackOfficialReply\s*\{[^}]*color:\s*#fff[^;]*;[^}]*background:\s*linear-gradient\(135deg,\s*rgb\(61,\s*32,\s*253\),\s*rgb\(87,\s*32,\s*220\),\s*rgb\(40,\s*12,\s*145\)\)/);
});

test('feedback board loads ten suggestions at a time with an intersection-observed infinite scroll sentinel', async () => {
  const source = await readFile(new URL('../src/prototype/FeedbackBoard.tsx', import.meta.url), 'utf8');
  assert.match(source, /const pageSize = 10;/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /feedbackLoadMore/);
  assert.doesNotMatch(source, /styles\.feedbackPagination/);
});

test('every next-page request immediately shows loading text and masonry placeholder cards', async () => {
  const source = await readFile(new URL('../src/prototype/FeedbackBoard.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(source, /loadingMoreRef\.current = true;\s*setIsLoadingMore\(true\);\s*setPage/);
  assert.match(source, /isLoadingMore && <FeedbackLoadMoreCards \/>/);
  assert.match(source, /function FeedbackLoadMoreCards\(\)/);
  assert.match(css, /\.feedbackLoadMoreCard\s*\{[^}]*animation:/);
});

test('suggestion dialog exposes the approved anonymous publishing choice', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackBoard, {
      fetcher: async () => new Response(JSON.stringify({ data: { items: [], counts: { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 } } })),
      notify: () => {},
      initialSuggestionDialogOpen: true,
    }));

    assert.match(html, /匿名发布/);
    assert.match(html, /name="isAnonymous"/);
  } finally {
    await vite.close();
  }
});

test('suggestion dialog starts disabled and exposes CJK-safe code point counters', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackBoard, {
      fetcher: async () => new Response(JSON.stringify({ data: { items: [] } })),
      notify: () => {},
      initialSuggestionDialogOpen: true,
    }));

    assert.match(html, /0\/100/);
    assert.match(html, /0\/1000/);
    assert.match(html, /aria-label="关闭"/);
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled[^>]*>发布<\/button>/);
  } finally {
    await vite.close();
  }
});

test('suggestion dialog preserves a completed CJK composition and enables submit only after both fields are present', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, FormData: globalThis.FormData, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { SubmitFeedbackDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(SubmitFeedbackDialog, { onClose: () => {}, onSubmit: async () => {} })));
    const title = document.getElementById('feedback-title');
    const content = document.getElementById('feedback-content');
    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent === '发布');
    assert.ok(title && content && submit, document.body.innerHTML);
    assert.equal(submit.disabled, true);
    await act(async () => Simulate.compositionStart(title));
    await act(async () => Simulate.change(title, { target: { value: '多件优惠' } }));
    await act(async () => Simulate.compositionEnd(title, { target: { value: '多件优惠' } }));
    await act(async () => Simulate.change(title, { target: { value: '多件优惠' } }));
    await act(async () => Simulate.change(content, { target: { value: '希望增加组合规则' } }));
    assert.match(document.body.textContent, /4\/100/);
    assert.equal(submit.disabled, false);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('detail dialog uses the server withdrawal permission and displays the comment total', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const detail = {
      id: 'feedback-1', authorLabel: 'merchant', isMine: false, title: 'Title', content: 'Body', status: 'pending', voteCount: 9, commentCount: 2,
      voted: false, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', canWithdraw: true, comments: [], replies: [],
    };
    const allowed = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, { detail, onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {} }));
    const forbidden = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, { detail: { ...detail, canWithdraw: false }, onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {} }));
    assert.match(allowed, /2 条评论/);
    assert.match(allowed, /提交评论/);
    assert.match(allowed, /撤销建议/);
    assert.match(allowed, /2026\/10\/29 08:00:00/);
    assert.doesNotMatch(forbidden, /撤销建议/);
  } finally {
    await vite.close();
  }
});

test('detail dialog keeps pending withdrawal in the composer action row and uses the 400-character comment counter', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, {
      detail: {
        id: 'feedback-1', authorLabel: 'merchant', isMine: true, title: 'Title', content: 'Body', status: 'pending', voteCount: 9, commentCount: 0,
        voted: false, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', canWithdraw: true, comments: [], replies: [],
      },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {},
    }));
    assert.match(html, /0\/400/);
    assert.match(html, /<form[^>]*>[^]*匿名发布[^]*撤销建议[^]*提交评论[^]*<\/form>/);
    assert.match(html, /lucide-thumbs-up/);
    assert.match(html, /feedbackMuted[^>]*>还没有讨论，欢迎留下你的想法/);
  } finally {
    await vite.close();
  }
});

test('suggestion dialog allows 1000 characters of content', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { SubmitFeedbackDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(SubmitFeedbackDialog, { onClose: () => {}, onSubmit: async () => {} }));
    assert.match(html, /0\/1000/);
  } finally {
    await vite.close();
  }
});

test('detail dialog places suggestion content before author metadata and comment content before its metadata', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, {
      detail: {
        id: 'feedback-1', authorLabel: 'merchant', isMine: false, title: 'Title', content: 'Suggestion body', status: 'approved', voteCount: 9, commentCount: 1,
        voted: false, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', canWithdraw: false,
        comments: [{ id: 'comment-1', authorLabel: '匿名用户', content: 'Comment body', createdAt: '2026-10-29T00:00:01.000Z' }], replies: [],
      },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => {},
    }));
    assert.ok(html.indexOf('Suggestion body') < html.indexOf('<strong>merchant</strong>'), html);
    assert.ok(html.indexOf('Comment body') < html.indexOf('<strong>匿名用户</strong>'), html);
    assert.match(html, /feedbackCommentDivider[^]*1 条评论/);
  } finally {
    await vite.close();
  }
});

test('withdrawal requires confirmation before the request is sent', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, FormData: globalThis.FormData, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const root = createRoot(document.getElementById('root'));
    let withdrawals = 0;
    await act(async () => root.render(React.createElement(FeedbackDetailDialog, {
      detail: { id: 'feedback-1', authorLabel: 'merchant', isMine: true, title: 'Title', content: 'Body', status: 'pending', voteCount: 0, commentCount: 0, voted: false, createdAt: 'now', updatedAt: 'now', canWithdraw: true, comments: [], replies: [] },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async () => {}, onWithdraw: async () => { withdrawals += 1; },
    })));
    const withdraw = [...document.querySelectorAll('button')].find((button) => button.textContent === '撤销建议');
    assert.ok(withdraw, document.body.innerHTML);
    await act(async () => withdraw.click());
    assert.equal(withdrawals, 0);
    assert.match(document.body.textContent, /是否要撤销这条建议/);
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === '确认撤销');
    assert.ok(confirm, document.body.innerHTML);
    await act(async () => confirm.click());
    assert.equal(withdrawals, 1);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('anonymous publishing controls do not render a handle visibility hint', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { SubmitFeedbackDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const { FeedbackSubmitPreviewDialog } = await vite.ssrLoadModule('/src/prototype/feedback-preview.tsx');
    const production = renderToStaticMarkup(React.createElement(SubmitFeedbackDialog, { onClose: () => {}, onSubmit: async () => {} }));
    const preview = renderToStaticMarkup(React.createElement(FeedbackSubmitPreviewDialog, { open: true, onCancel: () => {}, onSubmit: () => {} }));
    assert.doesNotMatch(production, /勾选后不会显示店铺 handle/);
    assert.doesNotMatch(preview, /勾选后不会显示店铺 handle/);
  } finally {
    await vite.close();
  }
});

test('comment composer resets after its asynchronous submission completes', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, FormData: globalThis.FormData, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const root = createRoot(document.getElementById('root'));
    let received;
    await act(async () => root.render(React.createElement(FeedbackDetailDialog, {
      detail: { id: 'feedback-1', authorLabel: 'merchant', isMine: true, title: 'Title', content: 'Body', status: 'pending', voteCount: 0, commentCount: 0, voted: false, createdAt: 'now', updatedAt: 'now', canWithdraw: true, comments: [], replies: [] },
      onClose: () => {}, onVote: async () => {}, onCommentSubmit: async (comment) => { await Promise.resolve(); received = comment; }, onWithdraw: async () => {},
    })));
    const form = document.querySelector('form');
    assert.ok(form, document.body.innerHTML);
    const textarea = form.querySelector('textarea');
    await act(async () => { setControlledValue(textarea, 'A comment', dom); Simulate.change(textarea); });
    await act(async () => Simulate.submit(form));
    assert.deepEqual(received, { content: 'A comment', isAnonymous: false });
    assert.equal(textarea.value, '');
    assert.doesNotMatch(document.body.textContent, /Cannot read properties of null/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('comment composer disables blank submission and retains the draft when submission fails', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, FormData: globalThis.FormData, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(FeedbackDetailDialog, {
      detail: { id: 'feedback-1', authorLabel: 'merchant', isMine: false, title: 'Title', content: 'Body', status: 'approved', voteCount: 0, commentCount: 0, voted: false, createdAt: 'now', updatedAt: 'now', canWithdraw: false, comments: [], replies: [] },
      onClose: () => {}, onVote: async () => {}, onWithdraw: async () => {}, onCommentSubmit: async () => { throw new Error('无法提交评论'); },
    })));
    const form = document.querySelector('form');
    const textarea = document.getElementById('feedback-comment');
    const submit = [...document.querySelectorAll('button')].find((button) => button.textContent === '提交评论');
    assert.ok(form && textarea && submit, document.body.innerHTML);
    assert.equal(submit.disabled, true);
    await act(async () => { setControlledValue(textarea, '保留我的评论', dom); Simulate.change(textarea); });
    assert.equal(submit.disabled, false);
    await act(async () => Simulate.submit(form));
    assert.equal(textarea.value, '保留我的评论');
    assert.match(document.body.textContent, /无法提交评论/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('list vote button posts a vote and updates the displayed count', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const requests = [];
  const fetcher = async (path, options = {}) => {
    requests.push({ path, method: options.method ?? 'GET' });
    if (path === '/api/quantity-breaks/feedback?sort=newest&page=1&pageSize=10') return new Response(JSON.stringify({ data: { items: [{ id: 'one', authorLabel: 'merchant', isMine: true, title: '复制活动', excerpt: '...', status: 'pending', voteCount: 12, commentCount: 2, voted: false, createdAt: '2026-10-29T00:00:00.000Z', hasOfficialReply: false }], counts: { all: 1, pending: 1, approved: 0, in_progress: 0, released: 0, rejected: 0 }, page: 1, pageSize: 10, total: 1, totalPages: 1 } }));
    if (path === '/api/quantity-breaks/feedback/one/vote') return new Response(JSON.stringify({ data: { vote: { voted: true, voteCount: 13 } } }));
    throw new Error(`Unexpected request: ${path}`);
  };
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(FeedbackBoard, { fetcher, notify: () => {} })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    assert.match(document.body.textContent, /评论 2/);
    assert.match(document.body.textContent, /2026\/10\/29 08:00:00/);
    assert.match(document.body.textContent, /appideasbox@gmail\.com/);
    assert.equal(document.getElementById('feedback-list-title'), null);
    const vote = [...document.querySelectorAll('button')].find((button) => button.textContent === '投票 12');
    assert.ok(vote, document.body.innerHTML);
    await act(async () => { vote.click(); });
    assert.deepEqual(requests, [
      { path: '/api/quantity-breaks/feedback?sort=newest&page=1&pageSize=10', method: 'GET' },
      { path: '/api/quantity-breaks/feedback/one/vote', method: 'POST' },
    ]);
    assert.match(document.body.textContent, /已投票 13/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('clicking a card footer outside the vote control opens its detail', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const requests = [];
  const fetcher = async (path, options = {}) => {
    requests.push({ path, method: options.method ?? 'GET' });
    if (path === '/api/quantity-breaks/feedback?sort=newest&page=1&pageSize=10') return new Response(JSON.stringify({ data: { items: [{ id: 'one', authorLabel: 'merchant', isMine: false, title: '复制活动', excerpt: '正文摘要', status: 'pending', voteCount: 12, commentCount: 2, voted: false, createdAt: '2026-10-29T00:00:00.000Z', hasOfficialReply: false }], counts: { all: 1, pending: 1, approved: 0, in_progress: 0, released: 0, rejected: 0 }, page: 1, pageSize: 10, total: 1, totalPages: 1 } }));
    if (path === '/api/quantity-breaks/feedback/one') return new Response(JSON.stringify({ data: { feedback: { id: 'one', authorLabel: 'merchant', isMine: false, title: '复制活动', content: '完整正文', status: 'pending', voteCount: 12, commentCount: 2, voted: false, createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', canWithdraw: false, comments: [], replies: [] } } }));
    throw new Error(`Unexpected request: ${path}`);
  };
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(FeedbackBoard, { fetcher, notify: () => {} })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
    const discussion = [...document.querySelectorAll('span')].find((element) => element.textContent?.includes('评论 2'));
    assert.ok(discussion, document.body.innerHTML);
    await act(async () => { discussion.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(requests, [
      { path: '/api/quantity-breaks/feedback?sort=newest&page=1&pageSize=10', method: 'GET' },
      { path: '/api/quantity-breaks/feedback/one', method: 'GET' },
    ]);
    assert.match(document.body.textContent, /完整正文/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('feedback API includes pagination and my-suggestions filter in the list request', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { readFeedback } = await vite.ssrLoadModule('/src/prototype/feedback-api.ts');
    let path = '';
    await readFeedback(async (value) => {
      path = value;
      return new Response(JSON.stringify({ data: { items: [], counts: { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 }, page: 2, pageSize: 9, total: 18, totalPages: 2 } }));
    }, { sort: 'newest', mine: true, page: 2, pageSize: 9 });
    assert.equal(path, '/api/quantity-breaks/feedback?sort=newest&mine=1&page=2&pageSize=9');
  } finally {
    await vite.close();
  }
});

test('feedback board places the language selector beside the suggestion action and keeps the contact copy below the intro', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const html = renderToStaticMarkup(React.createElement(FeedbackBoard, { fetcher: async () => new Response(JSON.stringify({ data: { items: [], counts: { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 }, mineCount: 0, page: 1, pageSize: 9, total: 0, totalPages: 1 } })), notify: () => {}, languageControl: React.createElement('label', { 'data-language-control': true }, '应用语言') }));
    assert.match(html, /data-language-control/);
    assert.match(html, /分享你的想法，和其他商家一起决定下一步。[^]*有问题可随时联系/);
  } finally {
    await vite.close();
  }
});

test('feedback board switches back to all statuses when my suggestions is selected', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/feedback' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { FeedbackBoard } = await vite.ssrLoadModule('/src/prototype/FeedbackBoard.tsx');
    const requests = [];
    const fetcher = async (path) => { requests.push(path); return new Response(JSON.stringify({ data: { items: [], counts: { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 }, mineCount: 0, page: 1, pageSize: 9, total: 0, totalPages: 1 } })); };
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(FeedbackBoard, { fetcher, notify: () => {}, languageControl: null })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const mine = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('我的建议'));
    assert.ok(mine);
    await act(async () => mine.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    assert.ok(requests.some((path) => path.includes('mine=1') && !path.includes('status=')), requests.join('\n'));
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
