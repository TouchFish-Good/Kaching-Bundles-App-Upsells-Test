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
      // Compare effective visibility: cart responses may include legacy show
      // defaults even when the request uses roleVisibility alone.
      let visibility=p.roleVisibility;
      if(visibility==null || visibility==='')visibility=p.show===true?'all':p.show===false || p.show==null?'none':null;
      if(!['customer','merchant','all','none'].includes(visibility))return null;
      values.set(p.name, [p.value,p.type,visibility]);
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
      const properties = propertyNames.filter(name => name in data).map(name => ({name,value:data[name],type:'text',roleVisibility:'none'}));
      if (item.role === 'gift' && context.giftProperty) {
        const {name,value}=context.giftProperty;
        if(typeof name!=='string' || !name.trim() || name.startsWith('_qb_') || typeof value!=='string' || !value.trim())throw Error('Invalid gift property');
        properties.push({name,value,type:'text',roleVisibility:'all'});
      }
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
      return confirmed ? {status:'added',cartResponse:cart} : {status:'uncertain',resolve:confirm};
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
  function offerImageUrl(value) {
    const image=typeof value==='string'?value.trim():'';
    if(/^data:image\//i.test(image))return image;
    try {
      const url=new URL(image.startsWith('//')?'https:'+image:image);
      return ['http:','https:'].includes(url.protocol)?url.href:'';
    } catch (_) { return ''; }
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
        variants.push({id:variantId,title:v.dataset.title || '',available:v.dataset.available==='true'?true:v.dataset.available==='false'?false:null,priceMinor:nativePriceMinor(v.dataset.price,root.dataset.currency,block.dataset.themeVersion),image:offerImageUrl(v.dataset.image)});
      }
      products.set(id,{id,handle:node.dataset.handle,title:node.dataset.title || node.dataset.handle,image:offerImageUrl(node.dataset.image),variants});
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
    // Match Function qualification: all configured Products in enabled modules
    // are accessories, even if native data for a particular rule is unavailable.
    const accessoryProducts = new Set(groups.flatMap(g=>g.module.items.map(r=>r.productId)));
    const mainQualifies = !accessoryProducts.has(block.dataset.productId);
    const mainProducts = quantity=>mainQualifies?[{productId:block.dataset.productId,quantity}]:[];
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
    let disposeLayout=[];
    function render(quantity) {
      disposeLayout.forEach(dispose=>dispose());disposeLayout=[];
      const focused=container.contains(doc.activeElement) ? doc.activeElement : null;
      const focusedRule=focused?.closest?.('[data-offer-rule]')?.dataset.offerRule;
      const focusedSlot=focused?.dataset?.offerSlot;
      const scrollPositions=new Map(Array.from(container.querySelectorAll('[data-offer-module]'),section=>[section.dataset.offerModule,section.querySelector('.qb-offer-grid')?.scrollLeft || 0]));
      container.replaceChildren();
      const allCards=[];
      for (const {kind,module} of groups) {
        const section=element(doc,'section','qb-offer-section'); section.dataset.offerModule=kind;
        const title=campaign.offerTitles?.[kind];
        if (typeof title==='string' && title) section.append(element(doc,'h4','qb-offer-heading',title));
        const device=module.style[mediaQuery.matches?'mobile':'desktop'];
        const grid=element(doc,'div',`qb-offer-grid${device.layout.mode==='carousel'?' qb-offer-carousel':''}`);
        grid.dataset.cardLayout=device.layout.cardLayout || (device.layout.columns===1?'stacked':device.layout.columns===2?'grid':'horizontal');
        const width=block.getBoundingClientRect?.().width || (mediaQuery.matches?332:700);
        for(const [key,value] of Object.entries({background:device.colors?.background || '#ffffff',text:device.colors?.text || '#171717','title-color':device.colors?.title || device.colors?.text || '#171717','section-title-color':device.colors?.sectionTitle || device.colors?.text || '#171717','badge-text':device.colors?.badgeText || '#ffffff','badge-background':device.colors?.badgeBackground || '#171717'}))section.style.setProperty('--qb-offer-'+key,value);
        for(const field of ['price','comparePrice','savings','variant','selectedBorder'])section.style.setProperty('--qb-offer-'+field+'-color',device.colors?.[field] || (field==='comparePrice'?'#777777':device.colors?.text || '#171717'));
        section.style.setProperty('--qb-offer-badge-radius',`${device.badge?.radiusPx ?? 4}px`);
        section.style.setProperty('--qb-offer-card-radius',`${device.card?.radiusPx ?? 8}px`);
        for(const [key,field,size] of [['title','title',14],['section-title','sectionTitle',16],['badge','badge',11],['price','price',14],['comparePrice','comparePrice',12],['savings','savings',12],['variant','variant',13]]){
          section.style.setProperty('--qb-offer-'+key+'-size',`${device.typography?.[field]?.sizePx || size}px`);
          section.style.setProperty('--qb-offer-'+key+'-weight',String(device.typography?.[field]?.weight || (['comparePrice','savings','variant'].includes(field)?400:600)));
        }
        const layout=['stacked','list'].includes(device.layout.cardLayout)?{...device.layout,columns:1}:device.layout;
        let effectiveColumns=OfferCore.effectiveOfferColumns(width,layout);
        grid.dataset.effectiveColumns=String(effectiveColumns);
        grid.style.setProperty('--qb-offer-columns',String(effectiveColumns));
        const selectionLayouts=[];
        grid.style.setProperty('--qb-offer-column-gap',`${device.layout.columnGapPx}px`);grid.style.setProperty('--qb-offer-row-gap',`${device.layout.rowGapPx}px`);
        grid.style.setProperty('--qb-offer-image-size',`${device.image.sizePx}px`);grid.style.setProperty('--qb-offer-image-radius',`${device.image.radiusPx}px`);
        const cards=module.items.slice().sort((a,b)=>a.displayOrder-b.displayOrder).map(rule=>{
          const ref=trusted && entry.refs.find(r=>r.id===rule.productId);
          const actual=ref && native.products.get(rule.productId);
          const product=actual && actual.handle===ref.handle && ref.variantIds.length===new Set(ref.variantIds).size && rule.allowedVariantIds.every(id=>ref.variantIds.includes(id)) ? actual : null;
          const eligible=mainQualifies && OfferCore.offerEligible(rule,campaign.tiers,quantity);
          const choice=state.choices.get(rule.ruleId) || {selected:false,slots:[]}; state.choices.set(rule.ruleId,choice);
          if(choice.productId && choice.productId!==rule.productId)choice.slots=[];
          choice.productId=rule.productId;
          // Revisions can remove a configured variant. Preserve every still
          // whitelisted slot, reset only those whose identity became invalid.
          choice.slots=choice.slots.map(id=>rule.allowedVariantIds.includes(id)?id:undefined);
          const count=rule.quantity;
          const allowed=product?.variants.filter(v=>rule.allowedVariantIds.includes(v.id)) || [];
          // Absence or unknown availability is not evidence of sold out stock.
          const soldOut=!!product && rule.allowedVariantIds.length>0 && rule.allowedVariantIds.every(id=>allowed.some(v=>v.id===id && v.available===false));
          const options=allowed.filter(v=>v.available!==false);
          const renderable=Number.isSafeInteger(count) && count>0 && count<=100;
          const selected=renderable?Array.from({length:count},(_,i)=>{
            const saved=choice.slots[i], v=(saved?options.find(v=>v.id===saved):null) || options.find(v=>v.available===true);
            if(v)choice.slots[i]=v.id;
            return v;
          }):[];
          const override=campaign.marketId?rule.marketOverrides?.[campaign.marketId]:undefined;
          const converted=!override ? currency===shopCurrency || rule.discountType==='percentage' || (kind==='gifts' && rule.discountValue===0) : override.mode==='specified_amount' && override.currencyCode===currency;
          let ready=!!product && renderable && selected.every(sellable) && converted;
          const cap=OfferCore.offerQuota(rule,campaign.tiers,mainProducts(quantity));
          const original=ready?selected.reduce((sum,v)=>sum+v.priceMinor,0):0;
          const savings=ready && eligible?selected.reduce((sum,v,i)=>sum+(i<cap?OfferCore.offerDiscountMinor(v.priceMinor,rule,override):0),0):0;
          const unlockTier=!eligible && mainQualifies && OfferCore.offerUnlockTier(rule,campaign.tiers);
          // Advertise the configured price at a reachable tier, while only
          // current eligibility can authorize quote savings and cart lines.
          const displayCap=eligible?cap:unlockTier?OfferCore.offerQuota(rule,campaign.tiers,mainProducts(unlockTier.quantity)):0;
          const displaySavings=ready?selected.reduce((sum,v,i)=>sum+(i<displayCap?OfferCore.offerDiscountMinor(v.priceMinor,rule,override):0),0):0;
          ready=ready && safeAmount(original) && safeAmount(savings) && safeAmount(original-savings) && safeAmount(displaySavings) && safeAmount(original-displaySavings);
          return {kind,module,rule,product,eligible,choice,count,options,selected,ready,original,savings,displaySavings,unlockTier,soldOut,included:ready && eligible && (kind==='gifts' || choice.selected)};
        }).filter(c=>!c.soldOut);
        if(kind==='bundles' && module.selectionMode==='single') {
          const candidates=cards.filter(c=>c.choice.selected && c.ready && c.eligible);
          const picked=candidates.sort((a,b)=>b.savings-a.savings || a.rule.displayOrder-b.rule.displayOrder)[0];
          cards.forEach(c=>{c.included=c===picked;});
        }
        for(const c of cards) {
          const {rule,choice}=c;
          const display=module.display || {};
          const showImage=display.showImage ?? rule.showImage, labelPosition=display.labelPosition ?? rule.labelPosition;
          const card=element(doc,'article','qb-offer-card');card.dataset.offerRule=rule.ruleId;card.dataset.offerRole=kind==='gifts'?'gift':'bundle';card.dataset.included=String(c.included);
          card.dataset.locked=String(!c.eligible);
          if(rule.label && labelPosition==='corner')card.append(element(doc,'span','qb-badge qb-offer-label',rule.label));
          const image=c.selected[0]?.image || c.product?.image;
          const content=element(doc,'div',kind==='gifts'?'qb-offer-content':'qb-offer-product');
          const description=kind==='gifts'?content:element(doc,'div','qb-offer-description');
          const imageParent=kind==='gifts'?card:content;
          card.dataset.hasImage=String(!!(showImage && image));
          if(showImage && image){const img=element(doc,'img','qb-offer-image');img.src=image;img.alt='';imageParent.append(img);}
          const productTitle=element(doc,'strong','qb-offer-title',c.product?.title || copy('widget.offer_unavailable','Unavailable'));
          description.append(productTitle);
          if(rule.label && labelPosition==='below_title')description.append(element(doc,'span','qb-badge qb-offer-label-below',rule.label));
          if(kind==='bundles')content.append(description);
          const tier=c.unlockTier;
          let topLine;
          if(kind==='bundles') {
            topLine=element(doc,'div','qb-offer-topline');topLine.dataset.hasSavings=String(c.displaySavings>0);
            const label=element(doc,'label','qb-offer-select');
            const toggle=element(doc,'input');toggle.type='checkbox';toggle.dataset.offerSelect='';toggle.checked=c.included;
            toggle.setAttribute('aria-label',c.product?.title || copy('widget.offer_select','Select'));
            toggle.disabled=!c.ready || !c.eligible;
            const changeSelection=selected=>{
              if(toggle.disabled)return;
              if(module.selectionMode==='single' && selected)cards.forEach(other=>other.choice.selected=false);
              choice.selected=selected;
              rerender();
            };
            toggle.addEventListener('change',()=>changeSelection(toggle.checked));
            toggle.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();changeSelection(!c.included);}});
            card.addEventListener('click',event=>{
              if(event.target.closest?.('select,option,input,button,label,a'))return;
              changeSelection(!c.included);
            });
            selectionLayouts.push(()=>{
              const multiple=effectiveColumns>1;
              label.dataset.visuallyHidden=String(multiple);
              if(multiple){card.setAttribute('role','group');card.setAttribute('aria-label',c.product?.title || copy('widget.offer_select','Select'));}
              else {card.removeAttribute('role');card.removeAttribute('aria-label');}
            });
            label.append(toggle);topLine.append(label);card.append(topLine);
          }
          card.append(content);
          if(!c.ready)description.append(element(doc,'span','qb-offer-state',copy('widget.offer_unavailable','Unavailable')));
          if(c.ready){
            if(kind==='bundles') {
              const prices=element(doc,'div','qb-offer-prices');
              prices.append(element(doc,'b','',moneyMinor(c.original-c.displaySavings,currency,locale)));
              if(c.displaySavings>0){
                prices.append(element(doc,'span','qb-offer-savings',copy('widget.tier_savings_badge','Save {saving_amount}',{saving_amount:moneyMinor(c.displaySavings,currency,locale)})));
                prices.append(element(doc,'del','',moneyMinor(c.original,currency,locale)));
              }
              topLine.append(prices);
            } else if(c.displaySavings>0 && (display.showSavings ?? rule.showSavings)!==false)content.append(element(doc,'span','qb-offer-savings',copy('widget.tier_savings_badge','Save {saving_amount}',{saving_amount:moneyMinor(c.displaySavings,currency,locale)})));
          }
          if(c.selected.length && c.options.length)c.selected.forEach((v,i)=>{const select=element(doc,'select','qb-select qb-offer-variant');select.dataset.offerSlot=String(i);select.disabled=!c.eligible;select.setAttribute('aria-label',`${copy('widget.choose_option','Choose an option')} ${i+1}`);if(!v){const placeholder=element(doc,'option','',copy('widget.choose_option','Choose an option'));placeholder.value='';select.append(placeholder);}for(const option of c.options){const node=element(doc,'option','',option.title);node.value=option.id;node.selected=v?.id===option.id;node.disabled=!sellable(option);select.append(node);}select.addEventListener('change',()=>{choice.slots[i]=select.value;rerender();});description.append(select);});
          if(!c.eligible){
            const locked=copy('widget.offer_locked','Locked');
            const overlay=element(doc,'button','qb-offer-lock');overlay.type='button';overlay.disabled=!tier;
            overlay.setAttribute('aria-label',tier?`${locked}. ${copy('widget.offer_unlock','Unlock with {quantity} items',{quantity:tier.quantity})}`:locked);
            const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 48 56');icon.setAttribute('aria-hidden','true');
            const shackle=doc.createElementNS('http://www.w3.org/2000/svg','path');shackle.setAttribute('d','M12 23V15a12 12 0 0 1 24 0v8');shackle.setAttribute('fill','none');shackle.setAttribute('stroke','currentColor');shackle.setAttribute('stroke-width','5');
            const body=doc.createElementNS('http://www.w3.org/2000/svg','path');body.setAttribute('d','M7 22h34a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4Zm17 9a4 4 0 0 0-2 7.46V44a2 2 0 0 0 4 0v-5.54A4 4 0 0 0 24 31Z');body.setAttribute('fill','currentColor');body.setAttribute('fill-rule','evenodd');icon.append(shackle,body);
            overlay.append(icon,element(doc,'span','',locked));
            overlay.addEventListener('click',()=>{if(overlay.disabled)return;if(kind==='bundles'){if(module.selectionMode==='single')cards.forEach(other=>other.choice.selected=false);choice.selected=true;}chooseTier(tier);});
            card.append(overlay);
          }
          grid.append(card);
        }
        const carousel=device.layout.mode==='carousel';
        const navButtons=[];
        const rtl=()=>scope.getComputedStyle?.(grid).direction==='rtl';
        const updateBounds=()=>{const position=rtl()?-grid.scrollLeft:grid.scrollLeft;navButtons.forEach((button,index)=>{button.disabled=index===0 ? !(position>1) : !(position+grid.clientWidth<grid.scrollWidth-1);button.hidden=button.disabled;});};
        const measureLayout=()=>{
          const actualWidth=grid.clientWidth || block.getBoundingClientRect?.().width || width;
          effectiveColumns=OfferCore.effectiveOfferColumns(actualWidth,layout);
          grid.dataset.effectiveColumns=String(effectiveColumns);
          grid.style.setProperty('--qb-offer-columns',String(effectiveColumns));
          selectionLayouts.forEach(update=>update());
          const badgeHeight=Math.max(0,...Array.from(grid.querySelectorAll('.qb-offer-label'),badge=>badge.getBoundingClientRect?.().height || 0));
          if(badgeHeight)grid.style.setProperty('--qb-offer-badge-clearance',`${Math.ceil(badgeHeight/2)+2}px`);
          updateBounds();
        };
        const reveal=target=>{
          if(!carousel)return;
          const card=target.closest?.('[data-offer-rule]');
          if(!card || !grid.getBoundingClientRect || !card.getBoundingClientRect)return;
          const a=card.getBoundingClientRect(),b=grid.getBoundingClientRect();
          const left=a.left<b.left?a.left-b.left:a.right>b.right?a.right-b.right:0;
          if(left)grid.scrollBy?.({left,behavior:'instant'});
        };
        if(carousel)grid.tabIndex=0;
        let revealTimer;
        const cancelReveal=()=>clearTimeout(revealTimer);disposeLayout.push(cancelReveal);
        const scheduleReveal=target=>{cancelReveal();revealTimer=setTimeout(()=>{if(grid.isConnected && doc.activeElement===target)reveal(target);},350);};
        grid.addEventListener('keydown',event=>{if(carousel && ['ArrowLeft','ArrowRight'].includes(event.key)){if(event.target===grid){event.preventDefault();grid.scrollBy?.({left:(event.key==='ArrowRight'?1:-1)*Math.max(220,grid.clientWidth || width),behavior:'smooth'});}else scheduleReveal(event.target);}});
        grid.addEventListener('keyup',event=>{if(event.target!==grid && ['ArrowLeft','ArrowRight'].includes(event.key))scheduleReveal(event.target);});
        for(const name of ['pointerdown','touchstart','wheel'])grid.addEventListener(name,cancelReveal,{passive:true});
        grid.addEventListener('focusin',event=>reveal(event.target));
        grid.addEventListener('scroll',updateBounds);
        const list=element(doc,'div','qb-offer-list');
        list.append(grid);
        if(carousel){const nav=element(doc,'div','qb-offer-nav');for(const [label,direction] of [[copy('widget.offer_previous','Previous'),-1],[copy('widget.offer_next','Next'),1]]){const b=element(doc,'button','',label);b.type='button';b.disabled=true;b.hidden=true;b.setAttribute('aria-label',label);b.textContent=direction<0?'‹':'›';b.addEventListener('click',()=>grid.scrollBy?.({left:direction*(rtl()?-1:1)*Math.max(220,grid.clientWidth || width),behavior:'smooth'}));nav.append(b);navButtons.push(b);}list.append(nav);}
        section.append(list);container.append(section);grid.scrollLeft=scrollPositions.get(kind) || 0;measureLayout();
        // Initial render can precede mounting the offers container. Recheck
        // actual geometry after mount, then track resizing and badge wrapping.
        const layoutTimer=setTimeout(measureLayout,0);disposeLayout.push(()=>clearTimeout(layoutTimer));
        if(typeof scope.ResizeObserver==='function'){const observer=new scope.ResizeObserver(measureLayout);observer.observe(grid);for(const badge of grid.querySelectorAll('.qb-offer-label'))observer.observe(badge);disposeLayout.push(()=>observer.disconnect());}
        allCards.push(...cards);
      }
      const included=allCards.filter(c=>c.included);
      const original=included.reduce((n,c)=>n+c.original,0),savings=included.reduce((n,c)=>n+c.savings,0),count=included.reduce((n,c)=>n+c.count,0);
      const safe=[original,savings,count,original-savings].every(safeAmount);
      quote={original:safe?original:0,savings:safe?savings:0,discounted:safe?original-savings:0,quantity:safe?count:0,safe,lines:safe?included.flatMap(c=>c.selected.map((v,i)=>({id:v.id,quantity:1,role:c.kind==='gifts'?'gift':'bundle',ruleId:c.rule.ruleId,showSavings:(c.module.display?.showSavings ?? c.rule.showSavings)!==false,productId:c.rule.productId,handle:c.product.handle,title:c.product.title,variantTitle:v.title,priceMinor:v.priceMinor,discountedMinor:v.priceMinor-(i<OfferCore.offerQuota(c.rule,campaign.tiers,mainProducts(quantity))?OfferCore.offerDiscountMinor(v.priceMinor,c.rule,campaign.marketId?c.rule.marketOverrides?.[campaign.marketId]:undefined):0)}))):[]};
      if(!safe){invalidate();container.append(element(doc,'p','qb-offer-unavailable',copy('widget.offer_unavailable','Unavailable')));}
      if(focusedRule)for(const input of container.querySelectorAll('[data-offer-select],[data-offer-slot]'))if(input.closest('[data-offer-rule]')?.dataset.offerRule===focusedRule && (focusedSlot===undefined ? input.hasAttribute('data-offer-select') : input.dataset.offerSlot===focusedSlot))input.focus({preventScroll:true});
      return quote;
    }
    return {container,render,invalidate,dispose(){disposeLayout.forEach(dispose=>dispose());disposeLayout=[];},get quote(){return quote;},hasModules:groups.length>0,enabled:groups.length>0 && trusted};
  }
