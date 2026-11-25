import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

for (const search of ['', '?lang=invalid_language', '?lang=zh-hans-cn', '?lang=fr']) {
  test(`startup language ${search || '(no language)'} has translated recovery controls`, async () => {
    const previous = globalThis.window;
    globalThis.window = { location: { search } };
    const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
    try {
      const { initI18next, getQueryLang } = await vite.ssrLoadModule('/src/utils/i18n.ts');
      const t = await initI18next();
      assert.equal(t('retry'), search === '?lang=fr' ? 'Réessayer' : '重试');
      assert.equal(t('loadingCampaigns'), search === '?lang=fr' ? 'Chargement des campagnes...' : '正在加载活动...');
      assert.equal(getQueryLang(), search === '?lang=fr' ? 'fr' : 'zh-Hans');
    } finally { globalThis.window = previous; await vite.close(); }
  });
}
