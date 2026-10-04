import { createShopReader } from './shops.mjs';
import { createPoliteFetcher } from './http.mjs';
import { createObiBrowserReader } from './obi-browser.mjs';
import { selectObiOffer } from './obi-lookup.mjs';
import { normalizeObiQuery } from './obi-query-matcher.mjs';

/** Used by the CLI worker only. Customer requests never import or launch Chromium. */
export function createObiUpdaterReader({direct=null,browser=null,browserOptions={}}={}) {
  const lightweight=direct || createShopReader({http:createPoliteFetcher({timeoutMs:8000}),maxProductPages:6,maxSitemaps:1});
  let rendered=browser,hardStop=null;
  return {
    async searchShop(store,query,options={}) {
      if (store!=='obi') throw new Error('obi-only');
      const retrieval={direct:{status:'not_run',products:0},playwright:{status:'not_run',products:0}};
      const products=[],errors=[];
      if (hardStop) return {products,errors:[{code:'FETCH_BLOCKED',reason:hardStop}],retrieval};
      try {
        const response=await lightweight.searchShop('obi',normalizeObiQuery(query),options);
        products.push(...response.products);
        retrieval.direct.products=response.products.length;
        retrieval.direct.status=selectObiOffer(query,response.products).offer ? 'success' : 'failure';
        errors.push(...response.errors.map(e=>({...e,code:e.code==='not-found' ? 'direct_fetch_404' : `direct_${e.code}`})));
        if (response.errors.some(e=>['blocked','robots-disallowed','robots-unavailable'].includes(e.code))) hardStop=response.errors[0].code;
        if (retrieval.direct.status==='failure' && !response.errors.length) errors.push({code:products.length ? 'no_valid_product_match' : 'direct_empty_products'});
      } catch(error) {
        retrieval.direct.status='failure';
        errors.push({code:error.code==='not-found' ? 'direct_fetch_404' : `direct_${error.code || 'network_error'}`});
        if (['blocked','robots-disallowed','robots-unavailable'].includes(error.code)) hardStop=error.code;
      }
      if (hardStop) errors.push({code:'FETCH_BLOCKED',reason:hardStop});
      else if (retrieval.direct.status!=='success') {
        rendered ??= createObiBrowserReader(browserOptions);
        const response=await rendered.searchShop('obi',normalizeObiQuery(query),options);
        retrieval.playwright.products=response.products.length;
        retrieval.playwright.status=selectObiOffer(query,response.products).offer ? 'success' : 'failure';
        products.push(...response.products);errors.push(...response.errors);
        if (response.errors.some(e=>e.code==='FETCH_BLOCKED')) hardStop=response.errors.find(e=>e.code==='FETCH_BLOCKED').reason || 'hard_bot_block';
        if (response.products.length && retrieval.playwright.status!=='success') errors.push({code:'no_valid_product_match'});
      }
      return {store:'obi',products,errors,retrieval};
    },
    async close() {await rendered?.close?.();}
  };
}
