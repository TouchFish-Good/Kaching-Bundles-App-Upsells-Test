import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const campaignEditor = readFileSync(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
const styleEditor = readFileSync(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
const translations = readFileSync(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');

test('campaign style editor localizes merchant-facing settings while retaining stable selector values', () => {
  assert.match(campaignEditor, /<CampaignStyleEditor device=\{activeStyleDevice\}[^>]*value=\{activeStyle\}/);
  assert.match(styleEditor, /function CampaignStyleEditor[\s\S]*?useTranslation\(\)/);
  assert.match(styleEditor, /label\('styleVariantDisplay', 'Variant display'\)/);
  assert.match(styleEditor, /<option value="image">\{label\('styleImages', 'Original variant images'\)\}<\/option>/);
});

test('long storefront translations use a wrapping, auto-growing multiline control', () => {
  assert.match(translations, /<textarea[^>]*ref=\{resizeTranslation\}/);
  assert.match(translations, /onInput=\{\(event\) => resizeTranslation\(event\.currentTarget\)\}/);
  assert.match(css, /\.translationValueField textarea\s*\{[^}]*overflow-wrap:anywhere/);
});

test('localized color labels have a flexible column beside the swatch and hex value', () => {
  assert.match(css, /\.colorField\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 44px auto/);
});

test('translation page uses storefront copy as its eyebrow without a duplicate heading', () => {
  assert.match(translations, /<span className=\{styles\.eyebrow\}>\{t\('translationTitle'\)\}<\/span>/);
  assert.doesNotMatch(translations, /<h1>\{t\('translationTitle'\)\}<\/h1>/);
  assert.match(css, /\.eyebrow\s*\{[^}]*font-size:20px[^}]*font-weight:650/);
  assert.match(css, /\.translationsWorkspace\s*\{[^}]*margin:0 auto[^}]*color:#242424/);
  assert.doesNotMatch(css, /\.translationsWorkspace\s*\{[^}]*max-width/);
  assert.match(css, /\.feedbackEyebrow\s*\{[^}]*font-size:20px[^}]*font-weight:650/);
});
