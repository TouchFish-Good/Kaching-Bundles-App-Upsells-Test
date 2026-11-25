import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("translation API preserves server errors and sends only the selected locale copy", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { readTranslations, writeTranslations } = await vite.ssrLoadModule("/src/prototype/translations-api.ts");
    const calls = [];
    const fetcher = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ translations: { "widget.title": "Acheter plus" } }) };
    };
    assert.deepEqual(await readTranslations("fr", fetcher), { "widget.title": "Acheter plus" });
    assert.deepEqual(await writeTranslations("fr", { "widget.title": "Acheter plus" }, fetcher), { "widget.title": "Acheter plus" });
    assert.equal(calls[1].options.method, "PUT");
    assert.equal(calls[1].options.body, JSON.stringify({ "widget.title": "Acheter plus" }));
    await assert.rejects(() => writeTranslations("fr", {}, async () => ({ ok: false, status: 502, json: async () => ({ error: "Save failed" }) })), /Save failed/);
  } finally { await vite.close(); }
});
