import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import { buildDiscountRule, createAutomaticDiscount } from '../src/services/discounts';
import { validateTranslations } from '../src/db/translations';
import { defaultOfferModule } from '../../shared/offer-core.mjs';
import type { CampaignDraft } from '../src/domain/campaign';
import type { Env } from '../src/env';
import { offerDraft } from './helpers/offers';

afterEach(()=>vi.unstubAllGlobals());
it('projects compact v2 offers with trusted precision and excludes all accessory Products from main scope',()=>{
 const c=offerDraft(); c.gifts!.items[0].marketOverrides={jp:{mode:'specified_amount',currencyCode:'JPY',amountMinor:0}};
 const result=buildDiscountRule(c,'USD');
 expect(result.schemaVersion).toBe(2); expect(result.scope).toMatchObject({excludedProductIds:['gift-product']});
 expect(result.gifts).toMatchObject({items:[{allowedVariantIds:['900719925474099312345'],marketOverrides:{jp:{currencyDecimals:0}}}]});
 expect(JSON.stringify(result)).not.toMatch(/Visual|showImage|style|labelPosition/);
 c.gifts!.enabled=false; const legacy=buildDiscountRule(c,'USD'); expect(legacy.schemaVersion).toBe(1); expect(legacy).not.toHaveProperty('gifts');
});
it('rejects duplicate cross-module rule identities and unsafe mixed monetary overrides',()=>{
 const c=offerDraft(); c.bundles={...defaultOfferModule('bundles'),enabled:true,items:[{...c.gifts!.items[0],discountType:'fixed_amount',discountValue:100}]};
 expect(()=>buildDiscountRule(c,'USD')).toThrow(/unique|duplicate/i);
 c.bundles.items[0].ruleId='bundle'; c.bundles.items[0].marketOverrides={eu:{mode:'specified_amount',currencyCode:'EUR',amountMinor:50}};
 c.tiers[0].discountType='fixed_amount'; c.tiers[0].discountValue=100;
 expect(()=>buildDiscountRule(c,'USD')).toThrow(/mixed|mode|currency/i);
});
it('fails publication before any merchant mutation without verified Function identity and runtime capability',async()=>{
 const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
 await expect(createAutomaticDiscount({handle:'demo',accessToken:'unused',scope:'write_discounts'},offerDraft(),{...(env as Env),SHOPLINE_STORE_CURRENCY_CODE:'USD'})).rejects.toThrow(/capability/i);
 expect(upstream).not.toHaveBeenCalled();
});
it('accepts both per-locale offer titles including intentional empty strings',()=>{
 expect(validateTranslations({'widget.gifts.title':'','widget.bundles.title':'一起购买'})).toBe('');
});
it.each(['wrong-function','sku-unverified','targets-unverified','missing-protocol'])('rejects %s Function capability before any merchant write',async mode=>{
 const capability={functionId:'test-function',protocol:'gift-bundles-v1',skuIsVariantId:true,lineTotalTargets:true};
 if(mode==='wrong-function')capability.functionId='other';if(mode==='sku-unverified')capability.skuIsVariantId=false;if(mode==='targets-unverified')capability.lineTotalTargets=false;if(mode==='missing-protocol')capability.protocol='';
 const upstream=vi.fn();vi.stubGlobal('fetch',upstream);
 await expect(createAutomaticDiscount({handle:'demo',accessToken:'unused',scope:'write_discounts'},offerDraft(),{...(env as Env),SHOPLINE_STORE_CURRENCY_CODE:'USD',SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID:'test-function',SHOPLINE_OFFER_FUNCTION_CAPABILITIES:JSON.stringify({demo:capability})})).rejects.toThrow(/capability/i);expect(upstream).not.toHaveBeenCalled();
});
it('rejects foreign accessory identity before a mutation even with explicitly trusted runtime capability',async()=>{
 const upstream=vi.fn(async()=>Response.json({products:[{id:'foreign',handle:'foreign',variants:[]}]}));vi.stubGlobal('fetch',upstream);
 await expect(createAutomaticDiscount({handle:'demo',accessToken:'unused',scope:'write_discounts'},offerDraft(),{...(env as Env),SHOPLINE_STORE_CURRENCY_CODE:'USD',SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID:'test-function',SHOPLINE_OFFER_FUNCTION_CAPABILITIES:JSON.stringify({demo:{functionId:'test-function',protocol:'gift-bundles-v1',skuIsVariantId:true,lineTotalTargets:true}})})).rejects.toThrow(/ownership|identity/i);
 expect(upstream).toHaveBeenCalledTimes(1);
});
