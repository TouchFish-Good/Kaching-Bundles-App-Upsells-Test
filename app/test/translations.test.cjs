const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');

test('translations remain isolated by shop and language', async () => {
  const { TranslationRepository } = require('../src/service/translations');
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new TranslationRepository(db);
    await repository.write('shop-a', 'fr', { 'widget.add_to_cart': 'Ajouter {quantity} au panier · {price}' });
    assert.deepEqual(await repository.read('shop-a', 'fr'), { 'widget.add_to_cart': 'Ajouter {quantity} au panier · {price}' });
    assert.deepEqual(await repository.read('shop-b', 'fr'), {});
    assert.deepEqual(await repository.read('shop-a', 'de'), {});
  } finally { db.close(); }
});

test('translation validation rejects unknown keys but allows merchants to omit placeholders', async () => {
  const { validateTranslations } = require('../src/service/translations');
  assert.equal(validateTranslations({ 'widget.add_to_cart': 'Ajouter {quantity}' }), '');
  assert.match(validateTranslations({ 'tier.badge': 'Popular' }), /unknown/i);
  assert.match(validateTranslations(JSON.parse('{"__proto__":"unsafe"}')), /unknown/i);
  assert.equal(validateTranslations({ 'widget.add_to_cart': 'Ajouter {quantity} · {price}' }), '');
  assert.equal(validateTranslations({ 'widget.add_to_cart': '' }), '');
});

test('translation endpoint rejects disabled locales before writing', async () => {
  const { createTranslationsController } = require('../src/controller/translations');
  const writes = [];
  const handler = createTranslationsController({ read: async () => ({}), write: async (...args) => writes.push(args) }, async () => ({ defaultLanguage: 'en', languages: ['en', 'fr'] }));
  const response = { locals: { shopline: { session: { handle: 'shop-a', accessToken: 'token' } } }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'PUT', params: { locale: 'de' }, body: JSON.stringify({ 'widget.title': 'Sparen' }) }, response);
  assert.equal(response.code, 400);
  assert.match(response.body.error, /not enabled/);
  assert.equal(writes.length, 0);
});
