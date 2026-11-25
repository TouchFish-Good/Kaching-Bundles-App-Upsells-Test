import { defaultOfferModule } from '../../../shared/offer-core.mjs';
import type { CampaignDraft } from '../../src/domain/campaign';
export function offerDraft(): CampaignDraft {
 const gifts = defaultOfferModule('gifts'); gifts.enabled = true; gifts.items = [{ruleId:'gift',displayOrder:0,productId:'gift-product',allowedVariantIds:['900719925474099312345'],quantity:1,label:'Visual',labelPosition:'corner',showImage:true,discountType:'fixed_price',discountValue:0,trigger:{type:'quantity',operator:'gte',quantity:2}}];
 return {id:'offers',name:'Offers',status:'active',startsAt:'2020-01-01T00:00:00Z',scope:{kind:'products',productIds:['main'],excludedProductIds:[]},tiers:[{tierId:'two',displayOrder:0,quantity:2,discountType:'none'}],combinesWith:{orderDiscounts:false,productDiscounts:false,shippingDiscounts:false},gifts};
}
