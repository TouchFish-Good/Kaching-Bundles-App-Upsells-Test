import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

test("app home replaces the template route with Quantity Breaks", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", ssr: { noExternal: ["@shoplinedev/appbridge", "@shoplineos/app-bridge"] } });
  try {
    const { default: Home } = await vite.ssrLoadModule("/src/pages/index.tsx");
    const { getRoutes } = await vite.ssrLoadModule("/src/Routes.tsx");
    const homeRoute = getRoutes({ "./pages/index.tsx": { default: Home } }).find((route) => route.path === "/");
    assert.ok(homeRoute);
    const element = homeRoute.component();
    assert.equal(element.type.name, "Navigate");
    assert.equal(element.props.to, "/quantity-breaks");
    assert.equal(element.props.replace, true);
  } finally {
    await vite.close();
  }
});

test("standalone frontend serves its home route without a backend proxy", async () => {
  const original = process.env.BACKEND_PORT;
  delete process.env.BACKEND_PORT;
  try {
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" });
    assert.ok(loaded);
    assert.equal(Object.keys(loaded.config.server.proxy).some((pattern) => new RegExp(pattern).test("/")), false);
    assert.equal(Object.keys(loaded.config.server.proxy).some((pattern) => new RegExp(pattern).test("/api/quantity-breaks/campaigns")), true);
  } finally {
    if (original === undefined) delete process.env.BACKEND_PORT;
    else process.env.BACKEND_PORT = original;
  }
});

test("root entry chooses Quantity Breaks before loading template routes", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { resolveEntryHref, resolveEntryPath } = await vite.ssrLoadModule("/src/entry-route.ts");
    assert.equal(resolveEntryPath("/"), "/quantity-breaks");
    assert.equal(resolveEntryPath("/", "?path=%2Fquantity-breaks%2Ftranslations"), "/quantity-breaks/translations");
    assert.equal(resolveEntryPath("/", "?path=%252Fquantity-breaks%252Ftranslations"), "/quantity-breaks/translations");
    assert.equal(resolveEntryPath("/", "?path=https%3A%2F%2Fexample.com%2Felsewhere"), "/quantity-breaks");
    assert.equal(resolveEntryPath("/quantity-breaks/campaigns/new"), "/quantity-breaks/campaigns/new");
    assert.equal(
      resolveEntryPath("/admin/apps/6af69be1b1449d792ba337efdc0e7939d19ba90b/product-discount-customizations/66a964153c3c4b42a6713162369e0df9/7773701781885291182"),
      "/product-discount-customizations/66a964153c3c4b42a6713162369e0df9/7773701781885291182",
    );
    assert.equal(
      resolveEntryHref("/admin/apps/app/product-discount-customizations/function/discount", "?shop=buchaqian.myshopline.com&embedded=1", "#details"),
      "/product-discount-customizations/function/discount?shop=buchaqian.myshopline.com&embedded=1#details",
    );
    assert.equal(resolveEntryPath("/exit-iframe"), "/exit-iframe");
    for (const [search, expected] of [
      ['?path=/', '/quantity-breaks'],
      ['?path=%2F', '/quantity-breaks'],
      ['?path=%2Fquantity-breaks%2Ftranslations', '/quantity-breaks/translations'],
      ['?path=/quantity-breaks/translations', '/quantity-breaks/translations'],
      ['?path=%2Fquantity-breaks%2Ffeedback', '/quantity-breaks/feedback'],
      ['?path=%252Fquantity-breaks%252Ftranslations', '/quantity-breaks/translations'],
    ]) {
      const rewritten = new URL(resolveEntryHref('/', search, '#section'), 'https://app.example');
      assert.equal(rewritten.pathname, expected);
      assert.equal(rewritten.search, search);
      assert.equal(rewritten.hash, '#section');
    }
  } finally {
    await vite.close();
  }
});

test('production build keeps workspace CSS in the entry stylesheet', async () => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' });
  assert.ok(loaded);
  assert.equal(loaded.config.build?.cssCodeSplit, false);
  assert.deepEqual(loaded.config.build?.rollupOptions?.output?.manualChunks, {
    'quantity-breaks-workspace': ['./src/pages/quantity-breaks.tsx'],
  });
});

test('the primary embedded workspace is available without a runtime route import', async () => {
  const source = await readFile(new URL('../src/index.tsx', import.meta.url), 'utf8');

  assert.match(source, /import QuantityBreaksPrototype from "\.\/pages\/quantity-breaks"/);
  assert.doesNotMatch(source, /import\("\.\/pages\/quantity-breaks"\)/);
  assert.match(source, /markStaticBootstrapReady\(\);/);
});
