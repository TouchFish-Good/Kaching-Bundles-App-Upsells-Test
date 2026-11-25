import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'vite';
import { JSDOM } from 'jsdom';

test('production document carries matching compiled styles without a separate CSS request', async () => {
  const result = await build({ build: { write: false }, logLevel: 'silent' });
  const output = result.output;
  const html = output.find((asset) => asset.fileName === 'index.html').source;
  const dom = new JSDOM(html);
  try {
    const style = dom.window.document.getElementById('quantity-breaks-production-styles');
    assert.ok(style, 'styles must arrive in the HTML document');
    assert.equal(dom.window.document.querySelector('link[rel="stylesheet"]'), null);
    for (const css of output.filter((asset) => asset.fileName.endsWith('.css'))) {
      assert.ok(style.textContent.includes(css.source), 'inline CSS must match the same build');
    }
    const rootClass = style.textContent.match(/\.(_appShell_[\w]+)\{/)[1];
    const root = dom.window.document.createElement('div');
    root.className = rootClass;
    dom.window.document.body.append(root);
    assert.equal(dom.window.getComputedStyle(root).display, 'grid');
    const head = dom.window.document.head.innerHTML;
    assert.ok(head.indexOf(style.id) < head.indexOf('type="module"'), 'styles must precede application scripts');
  } finally { dom.window.close(); }
});
