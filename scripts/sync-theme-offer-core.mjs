import { readFile, writeFile } from 'node:fs/promises';
const target = new URL('../theme-app-extension/public/app-block.js', import.meta.url);
const core = await readFile(new URL('../shared/offer-core.cjs', import.meta.url), 'utf8');
const runtime = await readFile(new URL('./theme-offer-runtime.js', import.meta.url), 'utf8');
const generated = `  // BEGIN GENERATED OFFERS (scripts/sync-theme-offer-core.mjs)\n  const OfferCore = (() => { const exports = {};\n${core}\nreturn exports; })();\n${runtime}\n  // END GENERATED OFFERS`;
const source = await readFile(target, 'utf8');
const pattern = /  \/\/ BEGIN GENERATED OFFERS[\s\S]*?  \/\/ END GENERATED OFFERS/;
const result = pattern.test(source) ? source.replace(pattern, () => generated) : source.replace('  async function mountBlock(', () => `${generated}\n\n  async function mountBlock(`);
if (process.argv.includes('--check')) {
  if (source !== result) throw new Error('Run node scripts/sync-theme-offer-core.mjs');
  console.log('Theme canonical offer core/runtime verified.');
} else await writeFile(target, result);
