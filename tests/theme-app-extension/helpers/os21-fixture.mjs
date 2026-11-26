import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
const extension = new URL('../../../theme-app-extension/', import.meta.url);
export const os21Context = {
  shop: { id: '1726037928557', currency: { iso_code: 'USD' } },
  localization: { country: { iso_code: 'US', currency: { iso_code: 'USD' } }, language: { iso_code: 'en' } },
  product: { id: 'product-21', available: true, handle: 'test-product', title: 'Jacket "A" <special>',
    options: ['Colour', 'Size', 'Color', 'Material', 'Style'],
    variants: [
      { id: 'sku21', title: 'Black / S / 1 / Cotton / Regular', option1: 'Black', option2: 'S', option3: '1', option4: 'Cotton', option5: 'Regular', price: 1999, compare_at_price: 2499, available: true, image: 'https://example.com/a.jpg' },
      { id: 'sold21', title: 'White / M / 2 / Wool / Slim', option1: 'White', option2: 'M', option3: '2', option4: 'Wool', option5: 'Slim', price: 2999, compare_at_price: 2999, available: false, image: '' },
    ],
  },
};
export function renderOs21(context = os21Context) {
  const hbs = Handlebars.create();
  // This helper models the documented t helper with the actual OS2.1 publishable
  // files. It does not emulate SHOPLINE's schema/editor locale resolver.
  const copy = JSON.parse(readFileSync(new URL(`compatibility/locales/${context.localization.language.iso_code}.json`, extension), 'utf8'));
  hbs.registerHelper('asset_url', name => `/assets/${name}`);
  hbs.registerHelper('image_url', value => value || '');
  hbs.registerHelper('t', key => key.split('.').reduce((value, part) => value?.[part], copy) ?? key);
  hbs.registerHelper('schema', () => '');
  // Documented SHOPLINE helpers are modeled only for local template fixtures.
  // This is not the platform renderer or a claim about merchant permissions.
  // Do not assume nested assignments mutate @root. Exercise context-local
  // assignment so templates must explicitly choose their shared state owner.
  hbs.registerHelper('assign', function(key,value) { this[key]=value; return ''; });
  hbs.registerHelper('get', (key,object) => object?.[key]);
  hbs.registerHelper('append', (a,b) => String(a)+String(b));
  hbs.registerHelper('plus', (a,b) => a+b);
  hbs.registerHelper('JSONparse', value => JSON.parse(value));
  hbs.registerHelper('contains', function(collection,value,options) { return (Array.isArray(collection) || typeof collection==='string') && collection.includes(value) ? options.fn(this) : options.inverse(this); });
  const originalIf=hbs.helpers.if;
  hbs.registerHelper('if', function(...args) { const options=args.pop(); if(args.length===3) { const [a,op,b]=args; return (op==='=='?a===b:op==='<'?a<b:false) ? options.fn(this) : options.inverse(this); } return originalIf.call(this,args[0],options); });
  const template = readFileSync(new URL('compatibility/blocks/app-block.html', extension), 'utf8');
  return hbs.compile(template, { strict: false })(context);
}
export const os21Campaign = { id: 'os21-offer', name: 'Offer', tiers: [
  { tierId: 'one', quantity: 1, discountType: 'none', label: 'Single' },
  { tierId: 'pair', quantity: 2, discountType: 'percentage', discountValue: 2000, label: 'Pair', recommended: true },
] };
