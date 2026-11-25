import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1TranslationRepository } from '../src/db/translations';
import type { Env } from '../src/env';

describe('D1 translation repository', () => {
  const database = (env as Env).DB;

  beforeEach(async () => {
    await applyMigrations(database);
    await database.prepare('DELETE FROM quantity_breaks_translations').run();
  });

  it('round trips tenant-scoped locale copy', async () => {
    const repository = new D1TranslationRepository(database);
    const copy = { 'widget.add_to_cart': 'Buy {quantity} for {price}' };
    await repository.write('shop-a', 'en', copy);
    await expect(repository.read('shop-a', 'en')).resolves.toEqual(copy);
    await expect(repository.read('shop-b', 'en')).resolves.toEqual({});
  });

  it('rejects unknown keys but allows merchants to omit placeholders', async () => {
    const repository = new D1TranslationRepository(database);
    await expect(repository.write('shop-a', 'en', { 'widget.unknown': 'x' })).rejects.toThrow('Unknown translation key');
    await expect(repository.write('shop-a', 'en', { 'widget.add_to_cart': 'Buy now' })).resolves.toBeUndefined();
  });

  it('rejects malformed persisted copy instead of returning non-string public data', async () => {
    await database.prepare(`INSERT INTO quantity_breaks_translations (shop_handle, locale, copy_json, updated_at)
      VALUES (?, ?, ?, ?)`).bind('shop-a', 'en', JSON.stringify({ 'widget.title': 42 }), '2026-10-28T00:00:00.000Z').run();

    await expect(new D1TranslationRepository(database).read('shop-a', 'en')).rejects.toThrow('Stored translation data is invalid');
  });
});
