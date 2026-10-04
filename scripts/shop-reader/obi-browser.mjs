/** Updater-only Chromium reader. No stealth, CAPTCHA solving, proxies or client imports. */
import { chromium } from 'playwright';
import { createPoliteFetcher, robotsAllows } from './http.mjs';
import { SHOPS, extractStructuredProducts } from './shops.mjs';
import { obiProductUrl } from './obi-state.mjs';
import { parseObiRenderedProduct, obiHardBlock } from './obi-rendered.mjs';

export function createObiBrowserReader({headless=true,marketUrl=null,storageState=null,maxProducts=6,minDelayMs=2500,
  timeoutMs=20000,chromiumImpl=chromium,http=createPoliteFetcher(),onEvidence=null}={}) {
  let browser,context,page,blocked=null,initialized=false,lastRequest=0;
  const errors=[];
  async function navigate(url) {
    const target=new URL(url);
    if (!SHOPS.obi.hosts.includes(target.hostname) || target.protocol!=='https:' || target.username || target.password || target.port) throw new Error('unsafe-obi-url');
    if (blocked) throw Object.assign(new Error(blocked),{code:'FETCH_BLOCKED',reason:blocked});
    const policy=await http.getRobots(target.origin,SHOPS.obi.hosts);
    if (!robotsAllows(policy,target.href)) throw Object.assign(new Error('robots-disallowed'),{code:'robots-disallowed'});
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,lastRequest+Math.max(minDelayMs,policy.delay)-Date.now())));
    lastRequest=Date.now();
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
    const check=async()=> {
      blocked=obiHardBlock(response?.status() || 0,await page.title(),await page.locator('body').innerText({timeout:3000}).catch(()=>''));
      if (blocked) throw Object.assign(new Error(blocked),{code:'FETCH_BLOCKED',reason:blocked});
    };
    await check();
    if (response?.status()===404) throw Object.assign(new Error('playwright_http_404'),{code:'playwright_http_404'});
    if (response && response.status()>=400) throw Object.assign(new Error('playwright_http_error'),{code:'playwright_http_error'});
    // Only a normal optional consent rejection. No challenge interaction.
    for (const frame of page.frames()) {
      const decline=frame.getByRole('button',{name:/^(?:Alle ablehnen|Ablehnen|Nur notwendige Cookies|Nur notwendige akzeptieren)$/i}).first();
      if (await decline.isVisible().catch(()=>false)) {await decline.click({timeout:2000});break;}
    }
    await check();
    return check;
  }
  async function start() {
    if (initialized) return;
    initialized=true;
    browser=await chromiumImpl.launch({headless});
    context=await browser.newContext({locale:'de-DE',viewport:{width:1440,height:1000},...(storageState ? {storageState} : {})});
    page=await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    if (marketUrl) {
      const market=new URL(marketUrl);
      if (!/^\/markt\/[^?#]+/.test(market.pathname)) throw new Error('invalid-test-market-url');
      await navigate(market.href);
      const choose=page.getByRole('button',{name:/als (?:meinen )?markt (?:auswählen|festlegen)|markt auswählen/i}).first();
      if (await choose.isVisible().catch(()=>false)) await choose.click();
      else errors.push({code:'test-market-selection-unconfirmed'});
    }
  }
  return {
    async searchShop(store,query,{candidateUrls=[]}={}) {
      if (store!=='obi') throw new Error('obi-only');
      const products=[],failures=[...errors];
      try {
        await start();
        const check=await navigate(SHOPS.obi.origin+SHOPS.obi.search(query));
        await page.locator('a[href*="/p/"]').first().waitFor({state:'visible',timeout:12000}).catch(()=>{});
        await check();
        const links=await page.locator('a[href*="/p/"]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.href));
        const urls=[...new Set([...candidateUrls,...links].map(url=>obiProductUrl(url)).filter(Boolean))].slice(0,maxProducts);
        if (!urls.length) failures.push({code:'playwright_no_products'});
        for (const url of urls) {
          try {
            const checkProduct=await navigate(url);
            await page.locator('h1').first().waitFor({state:'visible'});
            await page.getByText(/Verkäufer:/).first().waitFor({state:'visible',timeout:8000}).catch(()=>{});
            await checkProduct();
            const current=obiProductUrl(page.url());
            if (!current || current!==url) {failures.push({code:'playwright_product_redirect_mismatch',url});continue;}
            const html=await page.content(),structured=extractStructuredProducts(html,current,'obi');
            const name=await page.locator('h1').first().innerText();
            const text=await page.locator('body').innerText();
            if (onEvidence) await onEvidence({url:current,name,text});
            const rendered=parseObiRenderedProduct({url:current,name,text});
            if (rendered.products.length) products.push(...rendered.products);
            else if (structured.length && !/seller|online_offer|conditional|conflicting/.test(rendered.reason || '')) products.push(...structured.map(p=>({...p,retrievalMethod:'playwright',verificationStatus:'verified'})));
            else failures.push({code:rendered.reason || 'playwright_price_missing',url});
          } catch(error) {
            failures.push({code:error.code || 'playwright_navigation_failed',reason:error.reason,url});
            if (error.code==='FETCH_BLOCKED') break;
          }
        }
      } catch(error) {failures.push({code:error.code || (browser ? 'playwright_navigation_failed' : 'playwright_launch_failed'),reason:error.reason});}
      return {store:'obi',products,errors:failures,discovery:'playwright'};
    },
    async close() { await context?.close().catch(()=>{});await browser?.close().catch(()=>{}); }
  };
}
