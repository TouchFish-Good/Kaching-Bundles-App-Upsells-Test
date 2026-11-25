// i18n/ and public/ are shared sources; OS2.1 has its own localization format.
// Do not run generate-theme-i18n.mjs here: it would overwrite edited copy.
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';

const root = new URL('../theme-app-extension/', import.meta.url);
const check = process.argv.includes('--check');
const read = path => readFile(new URL(path, root));
const optionalRead = path => read(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const list = path => readdir(new URL(path, root)).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
const outputs = new Map();
const locales = {};
const templatePath = 'compatibility/blocks/app-block.html';
const template = (await read(templatePath)).toString('utf8');
const schemaPattern = /{{#schema}}([\s\S]*?){{\/schema}}/;
const schemaMatch = schemaPattern.exec(template);
if (!schemaMatch) throw new Error(`${templatePath}: missing schema block`);
const schema = JSON.parse(schemaMatch[1]);
const keys = [...template.matchAll(/{{\s*t\s+'([^']+)'\s*}}/g)].map(([, key]) => key);
const sources = (await list('i18n/')).filter(name => name.endsWith('.json') && !name.endsWith('.schema.json')).sort();
for (const name of sources) {
  const content = await read(`i18n/${name}`);
  const locale = name.slice(0, -5);
  const copy = JSON.parse(content.toString('utf8'));
  for (const key of keys) {
    if (typeof key.split('.').reduce((value, part) => value?.[part], copy) !== 'string') {
      throw new Error(`${locale}: missing storefront translation ${key}`);
    }
  }
  locales[locale] = copy;
  outputs.set(`compatibility/locales/${name}`, content);
}
if (!locales.en) throw new Error('i18n/en.json is required as the shared English source');
const editorEnglish = JSON.parse((await read('i18n/en.schema.json')).toString('utf8'));
const name = editorEnglish.appBlock?.block?.name;
if (typeof name !== 'string' || !name.trim() || name.startsWith('t:')) throw new Error('Missing literal English app block name');
// The official migration guide documents schema.locales for OS2.1. Avoid
// depending on the unverified OS3 .schema.json / t: editor-name convention.
const generatedSchema = { ...schema, name, settings: schema.settings ?? [], locales };
// Use a callback so merchant copy containing $& or $1 is never interpreted as
// a String.replace substitution. Preserve placeholder strings verbatim.
const generatedTemplate = template.replace(schemaPattern, () => `{{#schema}}\n${JSON.stringify(generatedSchema, null, 2)}\n{{/schema}}`);
let blockBytes = Buffer.byteLength(generatedTemplate);
for (const block of await list('compatibility/blocks/')) {
  if (block !== 'app-block.html' && block.endsWith('.html')) blockBytes += (await read(`compatibility/blocks/${block}`)).length;
}
if (blockBytes > 102400) throw new Error(`OS2.1 blocks exceed 100 KiB (102400 bytes): ${blockBytes}`);
outputs.set(templatePath, Buffer.from(generatedTemplate));
for (const asset of ['app-block.js', 'app-block.css']) outputs.set(`compatibility/assets/${asset}`, await read(`public/${asset}`));

// Only remove the exact OS3 editor copies produced by the previous sync
// implementation. Custom or orphan files need manual review and stay intact.
const obsolete = [];
const blocked = [];
for (const name of await list('compatibility/locales/')) {
  const path = `compatibility/locales/${name}`;
  if (outputs.has(path)) continue;
  if (name.endsWith('.schema.json')) {
    const source = await optionalRead(`i18n/${name}`);
    if (source && source.equals(await read(path))) { obsolete.push(path); continue; }
  }
  blocked.push(`${path} (not generated; review and remove manually)`);
}
if (blocked.length) {
  console.error(`Unmanaged OS2.1 locale files preserved:\n${blocked.join('\n')}`);
  process.exitCode = 1;
} else {
  const stale = [...obsolete];
  for (const [path, content] of outputs) {
    if (!(await optionalRead(path))?.equals(content)) stale.push(path);
  }
  if (check) {
    if (stale.length) {
      console.error(`Outdated OS2.1 resources. Run npm run theme:sync:\n${stale.join('\n')}`);
      process.exitCode = 1;
    } else console.log(`OS2.1 resources verified (${outputs.size} files, ${sources.length} languages, ${blockBytes} block bytes).`);
  } else {
    for (const [path, content] of outputs) {
      if (!stale.includes(path)) continue;
      await mkdir(new URL('.', new URL(path, root)), { recursive: true });
      await writeFile(new URL(path, root), content);
    }
    for (const path of obsolete) { await unlink(new URL(path, root)); console.log(`Removed generated OS3 editor copy: ${path}`); }
    console.log(`OS2.1 resources synchronized (${outputs.size} files, ${sources.length} languages, ${blockBytes} block bytes).`);
  }
}
