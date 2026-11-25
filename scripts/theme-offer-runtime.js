  // Included in the existing app-block asset. No accessory asset/network request
  // is introduced for legacy or disabled modules. Business math comes from core.
  const offerBlockState = new WeakMap();
  const campaignRequests = new Map();
  const offerId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value);
  const safeAmount = value => Number.isSafeInteger(value) && value >= 0;
  const propertyNames = ['_qb_protocol','_qb_campaign','_qb_role','_qb_rule','_qb_source_product','_qb_context'];
  function propertyIdentity(properties) {
    if (properties == null || (Array.isArray(properties) && properties.length === 0) || (!Array.isArray(properties) && typeof properties === 'object' && Object.keys(properties).length === 0)) return '';
    if (!Array.isArray(properties)) return null;
    const values = new Map();
    for (const p of properties) {
      if (!p || typeof p.name !== 'string' || typeof p.value !== 'string' || values.has(p.name)) return null;
      // Identity includes exact official visibility/type metadata and any extra
      // personalization properties. A normal variant cannot confirm a gift.
      values.set(p.name, [p.value,p.type,p.show,p.roleVisibility]);
    }
    return JSON.stringify([...values].sort(([a],[b]) => a.localeCompare(b)));
  }
  function cartIdentity(line) {
    const id = line.variant_id || line.id;
    const properties = propertyIdentity(line.properties);
    return typeof id === 'string' && properties !== null ? JSON.stringify([id, properties]) : null;
  }
  function compositeQuantities(cart) {
    if (!Array.isArray(cart?.items)) return null;
    const result = new Map();
    for (const line of cart.items) {
      const key = cartIdentity(line);
      if (!key || !safeAmount(line.quantity)) return null;
      const total = (result.get(key) || 0) + line.quantity;
      if (!safeAmount(total)) return null;
      result.set(key,total);
    }
    return result;
  }
  function buildCompositeItems(main, accessories, context) {
    if (!offerId(context.campaignId) || !offerId(context.productId) || !offerId(context.context)) throw Error('Invalid composite context');
    const all = [...main.map(item => ({...item,role:'main',productId:context.productId,handle:context.productHandle})), ...accessories];
    const grouped = new Map();
    for (const item of all) {
      if (!offerId(item.id) || !offerId(item.productId) || !['main','gift','bundle'].includes(item.role) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || (item.role !== 'main' && (!offerId(item.ruleId) || item.productId === context.productId))) throw Error('Invalid composite item');
      const data = { _qb_protocol:'gift-bundles-v1', _qb_campaign:context.campaignId, _qb_role:item.role, ...(item.role !== 'main' ? {_qb_rule:item.ruleId} : {}), _qb_source_product:context.productId, _qb_context:context.context };
      const properties = propertyNames.filter(name => name in data).map(name => ({name,value:data[name],type:'text',show:false,roleVisibility:'none'}));
      const line = { id:item.id,quantity:item.quantity,properties,productId:item.productId,productHandle:item.handle || '' };
      const key = cartIdentity(line), prior = grouped.get(key);
      if (prior) { prior.quantity += item.quantity; if (!Number.isSafeInteger(prior.quantity)) throw Error('Unsafe quantity'); }
      else grouped.set(key,line);
    }
    // An actual Product/variant cannot simultaneously act as main/accessory.
    const mainIds = new Set(all.filter(i => i.role === 'main').map(i => i.id));
    if (all.some(i => i.role !== 'main' && mainIds.has(i.id))) throw Error('Conflicting roles');
    return [...grouped.values()];
  }
  async function addComposite(items, fetcher, cartReader) {
    const expected = compositeQuantities({items});
    if (!expected || !items.length) return {status:'invalid'};
    const read = cartReader || (async signal => {
      const response = await fetcher('/api/carts/ajax-cart',{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},...(signal?{signal}:{})});
      return response.ok ? response.json() : null;
    });
    async function bounded(work) {
      const controller=typeof scope.AbortController==='function'?new scope.AbortController():null;
      let timer;
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('Cart deadline'));},8000);});
      try{return await Promise.race([work(controller?.signal),deadline]);}
      finally{clearTimeout(timer);}
    }
    let before = null;
    try { before = compositeQuantities(await bounded(read)); } catch (_) { /* unknown pre-write state */ }
    async function confirm() {
      let cart = null;
      try { cart = await bounded(read); } catch (_) { /* read only, never retry writes */ }
      const after = compositeQuantities(cart);
      const confirmed = before && after && [...expected].every(([key,q]) => (after.get(key)||0) - (before.get(key)||0) >= q);
      return confirmed ? {status:'added',cartResponse:cart} : {status:'uncertain'};
    }
    try {
      const {response,body}=await bounded(async signal=>{
        const response=await fetcher('/cart/add',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},...(signal?{signal}:{}),body:JSON.stringify({items:items.map(({id,quantity,properties})=>({id,quantity,properties}))})});
        let body=null;
        try{body=await response.json();}catch(_){ /* unreadable write result */ }
        return {response,body};
      });
      if (!response.ok && response.status >= 400 && response.status < 500) return {status:'failed',httpStatus:response.status};
      const actual = compositeQuantities(body);
      return response.ok && actual && [...expected].every(([key,q]) => (actual.get(key)||0) >= q)
        ? {status:'added',cartResponse:body} : confirm();
    } catch (_) { return confirm(); }
  }
  function nativePriceMinor(text, currency, themeVersion) {
    if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text)) return null;
    let decimals;
    try {
      if (!Intl.supportedValuesOf('currency').includes(currency)) return null;
      decimals = currencyFractionDigits(currency);
    } catch (_) { return null; }
    // OS3 price is hundredths of major units; Handlebars price is the
    // currency subunit. Exact rational arithmetic rejects lossy conversion.
    const [whole,fraction=''] = text.split('.');
    const numerator = BigInt(whole + fraction) * (themeVersion === '2.1' ? 1n : 10n ** BigInt(decimals));
    const denominator = 10n ** BigInt(fraction.length) * (themeVersion === '2.1' ? 1n : 100n);
    if (numerator % denominator) return null;
    const result = Number(numerator / denominator);
    return safeAmount(result) ? result : null;
  }
  function readNativeOffers(block) {
    const root = block.querySelector('[data-offer-native-catalog]');
    if (!root) return null;
    const products = new Map(), entries = [], owners = new Map();
    for (const node of root.querySelectorAll('[data-offer-product]')) {
      const id = node.dataset.offerProduct;
      if (!offerId(id) || products.has(id)) return null;
      const variants = [], seen = new Set();
      for (const v of node.querySelectorAll('[data-offer-variant]')) {
        const variantId = v.dataset.offerVariant;
        if (!offerId(variantId) || seen.has(variantId)) return null;
        if(owners.has(variantId) && owners.get(variantId)!==id)return null;
        owners.set(variantId,id);
        seen.add(variantId);
        variants.push({id:variantId,title:v.dataset.title || '',available:v.dataset.available==='true',priceMinor:nativePriceMinor(v.dataset.price,root.dataset.currency,block.dataset.themeVersion),image:v.dataset.image || ''});
      }
      products.set(id,{id,handle:node.dataset.handle,title:node.dataset.title || node.dataset.handle,variants});
    }
    for (const node of root.querySelectorAll('[data-offer-entry]')) entries.push({id:node.dataset.offerEntry,digest:node.dataset.digest,refs:Array.from(node.querySelectorAll('[data-offer-ref]'),r=>({id:r.dataset.offerRef,handle:r.dataset.handle,variantIds:Array.from(r.querySelectorAll('[data-offer-allowed]'),v=>v.dataset.offerAllowed)}))});
    return {currency:root.dataset.currency,locale:root.dataset.locale,country:root.dataset.countryCode || '',products,entries};
  }
  function offerContext(block) {
    return JSON.stringify([block.dataset.shop,block.dataset.shopId,block.dataset.productId,block.dataset.currency,block.dataset.shopCurrency,block.dataset.countryCode,normalizeLocale(block.dataset.locale)]);
  }
  function createOffers(block,campaign,envelope,native,state,doc,copy,currency,shopCurrency,locale,mediaQuery,chooseTier,rerender) {
    const container = element(doc,'div','qb-offers');
    const descriptor = campaign.catalogIndex;
    const matches = native?.entries.filter(entry=>entry.id===campaign.id && entry.digest===descriptor?.digest) || [];
    const trusted = offerId(campaign.id) && envelope?.version===2 && envelope.clientFeatures==='gift-bundles-v1' && Number.isSafeInteger(campaign.revision) && campaign.revision>=0 && campaign.catalogSource==='theme' && descriptor?.namespace==='qb_test_offers' && descriptor.key==='catalog_v1' && descriptor.version===1 && /^[a-f0-9]{64}$/.test(descriptor.digest) && campaign.offerCapability?.protocol==='gift-bundles-v1' && campaign.offerCapability.functionVerified===true && matches.length===1 && native.currency===currency && normalizeLocale(native.locale)===locale && native.country===(block.dataset.countryCode || '');
    const entry = matches[0];
    const groups = [];
    for (const kind of ['gifts','bundles']) {
      if (!campaign[kind]?.enabled) continue;
      try { groups.push({kind,module:OfferCore.normalizeOfferModule(campaign[kind],kind)}); } catch (_) { /* malformed extras cannot break main */ }
    }
    const validRules = new Set(groups.flatMap(g=>g.module.items.map(r=>r.ruleId)));
    for (const key of state.choices.keys()) if (!validRules.has(key)) state.choices.delete(key);
    const sellable = v=>v?.available===true && safeAmount(v.priceMinor);
    let quote={lines:[],original:0,savings:0,discounted:0,quantity:0,safe:true};
    function invalidate() {
      for(const card of container.querySelectorAll('[data-included="true"]')) {
        card.dataset.included='false';
        const label=card.querySelector('.qb-offer-state');
        if(label)label.textContent=copy('widget.offer_unavailable','Unavailable');
      }
      quote={lines:[],original:0,savings:0,discounted:0,quantity:0,safe:false};
      return quote;
    }
    function render(quantity) {
      container.replaceChildren();
      const allCards=[];
      for (const {kind,module} of groups) {
        const section=element(doc,'section','qb-offer-section'); section.dataset.offerModule=kind;
        const title=campaign.offerTitles?.[kind];
        if (typeof title==='string' && title) section.append(element(doc,'h4','qb-offer-heading',title));
        const device=module.style[mediaQuery.matches?'mobile':'desktop'];
        const grid=element(doc,'div',`qb-offer-grid${device.layout.mode==='carousel'?' qb-offer-carousel':''}`);
        const width=block.getBoundingClientRect?.().width || (mediaQuery.matches?332:700);
        grid.style.setProperty('--qb-offer-background',device.colors?.background || '#ffffff');
        grid.style.setProperty('--qb-offer-text',device.colors?.text || '#171717');
        grid.style.setProperty('--qb-offer-title-size',`${device.typography?.title?.sizePx || 14}px`);
        grid.style.setProperty('--qb-offer-title-weight',String(device.typography?.title?.weight || 600));
        grid.style.setProperty('--qb-offer-columns',String(OfferCore.effectiveOfferColumns(width,device.layout)));
        grid.style.setProperty('--qb-offer-column-gap',`${device.layout.columnGapPx}px`);grid.style.setProperty('--qb-offer-row-gap',`${device.layout.rowGapPx}px`);
        grid.style.setProperty('--qb-offer-image-size',`${device.image.sizePx}px`);grid.style.setProperty('--qb-offer-image-radius',`${device.image.radiusPx}px`);
        const cards=module.items.slice().sort((a,b)=>a.displayOrder-b.displayOrder).map(rule=>{
          const ref=trusted && entry.refs.find(r=>r.id===rule.productId);
          const actual=ref && native.products.get(rule.productId);
          const product=actual && actual.handle===ref.handle && ref.variantIds.length===new Set(ref.variantIds).size && rule.allowedVariantIds.every(id=>ref.variantIds.includes(id)) ? actual : null;
          const eligible=OfferCore.offerEligible(rule,campaign.tiers,quantity) && rule.productId!==block.dataset.productId;
          const choice=state.choices.get(rule.ruleId) || {selected:false,quantity:rule.quantity,slots:[]}; state.choices.set(rule.ruleId,choice);
          if(choice.productId && choice.productId!==rule.productId)choice.slots=[];
          choice.productId=rule.productId;
          // Revisions can remove a configured variant. Preserve every still
          // whitelisted slot, reset only those whose identity became invalid.
          choice.slots=choice.slots.map(id=>rule.allowedVariantIds.includes(id)?id:undefined);
          const count=kind==='gifts'?rule.quantity:choice.quantity;
          const options=product?.variants.filter(v=>rule.allowedVariantIds.includes(v.id)) || [];
          const renderable=Number.isSafeInteger(count) && count>0 && count<=100;
          const selected=renderable?Array.from({length:count},(_,i)=>{
            const saved=choice.slots[i], v=saved?options.find(v=>v.id===saved):options.find(sellable);
            if(v)choice.slots[i]=v.id;
            return v;
          }):[];
          const override=campaign.marketId?rule.marketOverrides?.[campaign.marketId]:undefined;
          const converted=!override ? currency===shopCurrency || rule.discountType==='percentage' || (kind==='gifts' && rule.discountValue===0) : override.mode==='specified_amount' && override.currencyCode===currency;
          let ready=!!product && renderable && selected.every(sellable) && converted;
          const cap=OfferCore.offerQuota(rule,campaign.tiers,[{productId:block.dataset.productId,quantity}]);
          const original=ready?selected.reduce((sum,v)=>sum+v.priceMinor,0):0;
          const savings=ready && eligible?selected.reduce((sum,v,i)=>sum+(i<cap?OfferCore.offerDiscountMinor(v.priceMinor,rule,override):0),0):0;
          ready=ready && safeAmount(original) && safeAmount(savings) && safeAmount(original-savings);
          return {kind,module,rule,product,eligible,choice,count,options,selected,ready,original,savings,included:ready && eligible && (kind==='gifts' || choice.selected)};
        });
        if(kind==='bundles' && module.selectionMode==='single') {
          const eligible=cards.filter(c=>c.ready && c.eligible);
          const picked=eligible.find(c=>c.choice.selected) || (state.singleCanceled?null:eligible.sort((a,b)=>b.savings-a.savings || a.rule.displayOrder-b.rule.displayOrder)[0]);
          cards.forEach(c=>{c.included=c===picked;});
        }
        for(const c of cards) {
          const {rule,choice}=c;
          const card=element(doc,'article','qb-offer-card');card.dataset.offerRule=rule.ruleId;card.dataset.offerRole=kind==='gifts'?'gift':'bundle';card.dataset.included=String(c.included);
          if(rule.label && rule.labelPosition==='corner')card.append(element(doc,'span','qb-offer-label',rule.label));
          const image=c.selected.find(v=>v?.image)?.image;
          if(rule.showImage && image && /^(https?:|data:image\/)/.test(image)){const img=element(doc,'img','qb-offer-image');img.src=image;img.alt='';card.append(img);}
          card.append(element(doc,'strong','qb-offer-title',c.product?.title || copy('widget.offer_unavailable','Unavailable')));
          if(rule.label && rule.labelPosition==='below_title')card.append(element(doc,'span','qb-offer-label-below',rule.label));
          if(!c.eligible) {
            const tier=OfferCore.offerUnlockTier(rule,campaign.tiers);
            if(tier){const unlock=element(doc,'button','qb-offer-unlock',copy('widget.offer_unlock','Unlock with {quantity} items',{quantity:tier.quantity}));unlock.type='button';unlock.addEventListener('click',()=>{if(kind==='bundles')choice.selected=true;chooseTier(tier);});card.append(unlock);}
          } else if(kind==='gifts') card.append(element(doc,'span','qb-offer-state',c.ready?copy('widget.offer_included','Included'):copy('widget.offer_unavailable','Unavailable')));
          else {
            const toggle=element(doc,'button','qb-offer-select',c.included?copy('widget.offer_included','Included'):copy('widget.offer_select','Select'));toggle.type='button';toggle.dataset.offerSelect='';toggle.setAttribute('aria-pressed',String(c.included));toggle.disabled=!c.ready;
            toggle.addEventListener('click',()=>{if(module.selectionMode==='single'){state.singleCanceled=c.included;cards.forEach(other=>other.choice.selected=false);}choice.selected=!c.included;rerender();});card.append(toggle);
            const label=element(doc,'label','qb-offer-quantity',copy('widget.offer_quantity','Quantity'));
            const input=element(doc,'input');input.type='number';input.min='1';input.step='1';input.value=String(choice.quantity);input.setAttribute('aria-label',copy('widget.offer_quantity','Quantity'));
            input.addEventListener('change',()=>{choice.quantity=Number(input.value);rerender();});label.append(input);card.append(label);
          }
          if(c.ready){
            const prices=element(doc,'div','qb-offer-prices');prices.append(element(doc,'b','',moneyMinor(c.original-c.savings,currency,locale)));if(c.savings>0)prices.append(element(doc,'del','',moneyMinor(c.original,currency,locale)));card.append(prices);
          } else if(c.eligible)card.append(element(doc,'span','qb-offer-unavailable',copy('widget.offer_unavailable','Unavailable')));
          if(c.selected.length && c.options.length)c.selected.forEach((v,i)=>{const select=element(doc,'select','qb-offer-variant');select.dataset.offerSlot=String(i);select.setAttribute('aria-label',`${copy('widget.choose_option','Choose an option')} ${i+1}`);if(!v){const placeholder=element(doc,'option','',copy('widget.choose_option','Choose an option'));placeholder.value='';select.append(placeholder);}for(const option of c.options){const node=element(doc,'option','',option.title);node.value=option.id;node.selected=v?.id===option.id;node.disabled=!sellable(option);select.append(node);}select.addEventListener('change',()=>{choice.slots[i]=select.value;rerender();});card.append(select);});
          grid.append(card);
        }
        grid.tabIndex=0;grid.addEventListener('keydown',event=>{if(device.layout.mode==='carousel' && ['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();grid.scrollBy?.({left:(event.key==='ArrowRight'?1:-1)*Math.max(220,width),behavior:'smooth'});}});
        if(device.layout.mode==='carousel'){const nav=element(doc,'div','qb-offer-nav');for(const [label,direction] of [[copy('widget.offer_previous','Previous'),-1],[copy('widget.offer_next','Next'),1]]){const b=element(doc,'button','',label);b.type='button';b.addEventListener('click',()=>grid.scrollBy?.({left:direction*Math.max(220,width),behavior:'smooth'}));nav.append(b);}section.append(nav);}
        section.append(grid);container.append(section);allCards.push(...cards);
      }
      const included=allCards.filter(c=>c.included);
      const original=included.reduce((n,c)=>n+c.original,0),savings=included.reduce((n,c)=>n+c.savings,0),count=included.reduce((n,c)=>n+c.count,0);
      const safe=[original,savings,count,original-savings].every(safeAmount);
      quote={original:safe?original:0,savings:safe?savings:0,discounted:safe?original-savings:0,quantity:safe?count:0,safe,lines:safe?included.flatMap(c=>c.selected.map((v,i)=>({id:v.id,quantity:1,role:c.kind==='gifts'?'gift':'bundle',ruleId:c.rule.ruleId,productId:c.rule.productId,handle:c.product.handle,title:c.product.title,variantTitle:v.title,priceMinor:v.priceMinor,discountedMinor:v.priceMinor-(i<OfferCore.offerQuota(c.rule,campaign.tiers,[{productId:block.dataset.productId,quantity}])?OfferCore.offerDiscountMinor(v.priceMinor,c.rule,campaign.marketId?c.rule.marketOverrides?.[campaign.marketId]:undefined):0)}))):[]};
      if(!safe){invalidate();container.append(element(doc,'p','qb-offer-unavailable',copy('widget.offer_unavailable','Unavailable')));}
      return quote;
    }
    return {container,render,invalidate,get quote(){return quote;},hasModules:groups.length>0,enabled:groups.length>0 && trusted};
  }
