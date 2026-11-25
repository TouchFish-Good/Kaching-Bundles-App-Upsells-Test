import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("normalizes only enabled storefront languages", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { normalizeStoreLanguages } = await vite.ssrLoadModule("/src/prototype/store-languages.ts");
    assert.deepEqual(normalizeStoreLanguages({ default_language: "en", supported_languages: ["en", "fr", "fr"] }), { defaultLanguage: "en", languages: ["en", "fr"] });
    assert.throws(() => normalizeStoreLanguages({ default_language: "en", supported_languages: [] }), /language/i);
    assert.throws(() => normalizeStoreLanguages({ default_language: "en", supported_languages: ["fr"] }), /default language/i);
  } finally { await vite.close(); }
});
