import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

test('the production entry mirrors the campaign loading frame while React starts', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  const root = dom.window.document.getElementById('root');

  assert.ok(root);
  assert.equal(root.getAttribute('aria-live'), 'polite');
  const frame = root.querySelector('.app-bootstrap-shell--campaigns');
  assert.ok(frame);
  assert.ok(frame.querySelector('.app-bootstrap-shell__frame-header'));
  assert.equal(frame.querySelectorAll('.app-bootstrap-shell__frame-cards > span').length, 4);
  assert.equal(root.querySelector('.app-bootstrap-shell__table'), null);
  assert.equal(root.textContent?.includes('应用加载失败'), false);
  assert.equal(root.textContent?.includes('正在加载应用'), false);
  dom.window.close();
});

test('the static entry selects the translation loading frame from an encoded SHOPLINE path', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://app.vswwy.cn/?path=%2Fquantity-breaks%2Ftranslations',
    runScripts: 'dangerously',
  });
  const root = dom.window.document.getElementById('root');

  assert.ok(root?.querySelector('.app-bootstrap-shell--translations'));
  assert.ok(root?.querySelector('.app-bootstrap-shell__translation-editor'));
  assert.ok(root?.querySelector('.app-bootstrap-shell__translation-preview'));
  dom.window.close();
});

test('the static entry selects an editor loading frame from an encoded SHOPLINE path', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://app.vswwy.cn/?path=%2Fquantity-breaks%2Fnew',
    runScripts: 'dangerously',
  });
  const root = dom.window.document.getElementById('root');

  assert.ok(root?.querySelector('.app-bootstrap-shell--editor'));
  assert.ok(root?.querySelector('.app-bootstrap-shell__editor-form'));
  assert.ok(root?.querySelector('.app-bootstrap-shell__editor-preview'));
  dom.window.close();
});

test('the static entry selects a feedback loading frame from an encoded SHOPLINE path', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://app.vswwy.cn/?path=%2Fquantity-breaks%2Ffeedback',
    runScripts: 'dangerously',
  });
  const root = dom.window.document.getElementById('root');

  assert.ok(root?.querySelector('.app-bootstrap-shell--feedback'));
  assert.equal(root?.querySelectorAll('.app-bootstrap-shell__feedback-card').length, 3);
  dom.window.close();
});

test('a repeated document timeout holds the recovery marker until the app mounts', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://app.vswwy.cn/quantity-breaks',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.sessionStorage.setItem('quantity-breaks:bootstrap-recovery', '1');
      window.setTimeout = (callback) => {
        callback();
        return 1;
      };
    },
  });

  assert.equal(dom.window.sessionStorage.getItem('quantity-breaks:bootstrap-recovery'), '1');
  dom.window.__quantityBreaksBootstrapReady?.();
  assert.equal(dom.window.sessionStorage.getItem('quantity-breaks:bootstrap-recovery'), null);
  dom.window.close();
});
