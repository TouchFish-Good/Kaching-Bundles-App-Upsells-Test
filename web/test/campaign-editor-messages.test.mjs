import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';

for (const [key, chineseLabel] of [['variantSelectedText', '选中规格值'], ['variantSelectedBackground', '规格选中背景']]) {
test(`${key} color is editable on both devices in every application language`, async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    const { JSDOM } = await import('jsdom');
    for (const locale of ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'id', 'ja', 'ms', 'th', 'vi']) {
      const name = campaignText(locale, `styleColor${key}`);
      assert.ok(name?.trim(), locale);
      if (locale !== 'en') assert.notEqual(name, campaignText('en', `styleColor${key}`), locale);
      if (locale === 'zh-Hans') assert.equal(name, chineseLabel);
      const instance = createInstance();
      await instance.init({ lng: locale, resources: { [locale]: { translation: {} } } });
      for (const device of ['desktop', 'mobile']) {
        const config = defaultCampaignWidgetConfig();
        config.colors[key] = device === 'desktop' ? '#123456' : '#ABCDEF';
        const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(CampaignStyleEditor, { device, value: config, onChange: () => {} })));
        const dom = new JSDOM(html);
        const input = dom.window.document.getElementById(`widget-color-${device}-${key}`);
        assert.ok(Boolean(input), `${locale}/${device}: missing color control`);
        assert.equal(input.value, config.colors[key]);
        assert.equal(input.getAttribute('aria-label'), `${name} hex`);
        dom.window.close();
      }
    }
  } finally { await vite.close(); }
});
}

test('campaign creation labels exist in all eleven application languages', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { campaignEditorMessages, campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    const locales = ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant'];
    const keys = Object.keys(campaignEditorMessages.en).sort();
    assert.ok(keys.length >= 50);
    for (const key of ['internalName', 'discountName', 'discountNameRequired', 'coverageConflictTitle', 'conflictActivityName', 'conflictProductName']) assert.ok(keys.includes(key), key);
    for (const key of ['marketAmounts', 'coverageUnavailable', 'saveError', 'tierRule', 'previewAuthority', 'endRequired', 'neverExpires']) assert.ok(keys.includes(key), key);
    for (const key of ['styleBadgePosition', 'styleBadgeBelow', 'styleColorvariantSelectedBorder', 'styleColoraddButtonBackground', 'styleTypecartLine']) assert.ok(keys.includes(key), key);
    for (const key of ['copyTier', 'deleteTier', 'deleteTierTitle', 'deleteTierBody', 'confirmDeleteTier', 'cancelDeleteTier']) assert.ok(keys.includes(key), key);
    for (const key of ['styleColorcardBorder', 'styleColorsavingsLabel', 'styleColoraddButtonBorder']) assert.ok(keys.includes(key), key);
    for (const locale of locales) {
      assert.deepEqual(Object.keys(campaignEditorMessages[locale]).sort(), keys, locale);
      for (const key of keys) assert.ok(campaignText(locale, key).trim(), `${locale}: ${key}`);
    }
    assert.equal(campaignText('zh-Hans', 'styleLayout'), '布局');
    assert.equal(campaignText('zh-Hans', 'styleBadgeBelow'), '副标题下方');
    assert.equal(campaignText('fr', 'campaignName'), 'Nom de la campagne');
    assert.equal(campaignText('zh-Hans', 'copyTier'), '复制档位');
    assert.equal(campaignText('zh-Hans', 'styleColorprice'), '档位售价');
    assert.equal(campaignText('zh-Hans', 'styleTypeprice'), '档位售价');
    assert.equal(campaignText('zh-Hans', 'endRequired'), '请填写结束时间。');
    assert.equal(campaignText('zh-Hans', 'neverExpires'), '永不过期');
    for (const locale of ['id', 'ja', 'ms', 'th', 'vi']) {
      assert.notEqual(campaignText(locale, 'endsAt'), campaignText('en', 'endsAt'), locale);
      assert.notEqual(campaignText(locale, 'endRequired'), campaignText('en', 'endRequired'), locale);
      assert.notEqual(campaignText(locale, 'neverExpires'), campaignText('en', 'neverExpires'), locale);
    }
    assert.equal(campaignText('zh-Hans', 'styleColorborder'), '选中卡片边框');
    assert.equal(campaignText('unknown', 'styleLayout'), 'Layout');
  } finally { await vite.close(); }
});

test('specified market notices list each selected discount type once in every application language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    const notices = {
      en: 'Because these tiers use specified market amounts, they do not combine with the following store discounts in those markets: {{types}}.',
      fr: 'Comme ces paliers utilisent des montants spécifiques au marché, ils ne se cumulent pas avec les remises suivantes de la boutique sur ces marchés : {{types}}.',
      de: 'Da diese Staffeln feste Marktbeträge verwenden, sind sie in diesen Märkten nicht mit den folgenden Shop-Rabatten kombinierbar: {{types}}.',
      es: 'Como estos tramos usan importes específicos por mercado, no se combinan con los siguientes descuentos de la tienda en esos mercados: {{types}}.',
      it: 'Poiché queste fasce usano importi specifici per mercato, non sono cumulabili con i seguenti sconti del negozio in tali mercati: {{types}}.',
      nl: 'Omdat deze staffels vaste marktbedragen gebruiken, combineren ze in die markten niet met de volgende winkelkortingen: {{types}}.',
      sv: 'Eftersom dessa nivåer använder angivna marknadsbelopp kombineras de inte med följande butiksrabatter på dessa marknader: {{types}}.',
      tr: 'Bu kademeler belirli pazar tutarları kullandığından, bu pazarlarda mağazanın şu indirimleriyle birleştirilemez: {{types}}.',
      'pt-BR': 'Como estas faixas usam valores específicos por mercado, elas não se combinam com os seguintes descontos da loja nesses mercados: {{types}}.',
      'zh-Hans': '因当前档位设置了指定市场金额，以下档位在指定市场不与主站{{types}}叠加。',
      'zh-Hant': '因目前檔位設定了指定市場金額，以下檔位在指定市場不與主站{{types}}疊加。',
    };
    for (const [locale, template] of Object.entries(notices)) {
      const separator = locale.startsWith('zh') ? '、' : ', ';
      const types = ['otherProductDiscounts', 'orderDiscounts', 'shippingDiscounts'].map((key) => campaignText(locale, key)).join(separator);
      assert.equal(campaignText(locale, 'marketCombinationNotice', { types }), template.replace('{{types}}', types), locale);
    }
  } finally { await vite.close(); }
});

test('creation form and style controls follow the selected app language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const instance = createInstance();
    await instance.init({ lng: 'zh-Hans', resources: { 'zh-Hans': { translation: { createCampaign: '创建活动', campaignTitle: '多件优惠', saveDraft: '保存草稿', publish: '发布', cancel: '取消' } } } });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n: instance }, React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: () => {}, notify: () => {} })));
    assert.match(html, /商品范围/);
    assert.match(html, /设置/);
    assert.match(html, /样式/);
    assert.match(html, /卡片圆角/);
    assert.match(html, /添加档位/);
  } finally { await vite.close(); }
});


test('savings label typography has a localized title in all sixteen application languages', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    for (const locale of ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'id', 'ja', 'ms', 'th', 'vi']) {
      const label = campaignText(locale, 'styleTypesavingsLabel');
      assert.ok(label.trim() && label !== 'styleTypesavingsLabel', locale);
      if (locale !== 'en') assert.notEqual(label, campaignText('en', 'styleTypesavingsLabel'), locale);
    }
    assert.equal(campaignText('zh-Hans', 'styleTypesavingsLabel'), '预计节省标题');
  } finally { await vite.close(); }
});
