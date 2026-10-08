/** Price updater only; Chromium never runs in a customer request. */
import { chromium } from 'playwright';
import { createPoliteFetcher, robotsAllows } from './http.mjs';
import { toomProductUrl, toomHardBlock, readToomIdentity, parseToomSellingState, parseToomBuybox } from './toom-pricing.mjs';
export { toomProductUrl, toomHardBlock, readToomIdentity, parseToomSellingState, parseToomBuybox } from './toom-pricing.mjs';
const HOSTS = ['toom.de', 'www.toom.de'], API_HOSTS = ['api.toom.de'];
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const normalized = value => clean(value).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ');
export function rankToomProductUrls(values, query) {
  const tokens = normalized(query).split(' ').filter(Boolean);
  const score = url => {
    const words = normalized(new URL(url).pathname.split('/')[2]).split(' ');
    return tokens.reduce((sum, token) => sum + ((words.includes(token) || token.length >= 5 && words.some(word => word.includes(token))) ? (/^(?:cd|cw|uw|ud)$/.test(token) ? 100 : /^\d+$/.test(token) ? 10 : 20) : 0), 0);
  };
  return [...new Set(values.map(toomProductUrl).filter(Boolean))].sort((left, right) => score(right) - score(left));
}
const variantUrls = identity => [...new Set((identity?.data?.variants?.variant_attributes || []).flatMap(attribute =>
  (attribute.variants || []).flatMap(variant => Object.values(variant.options || {}))).map(toomProductUrl).filter(Boolean))];
export function createToomReader({ http = createPoliteFetcher({ minDelayMs: 2500 }), chromiumImpl = chromium,
  minDelayMs = 2500, timeoutMs = 20000, maxProducts = 6, marketId = process.env.TOOM_TEST_MARKET_ID || '3248', headless = true, onEvidence = null } = {}) {
  if (!/^\d{3,8}$/.test(String(marketId))) throw new Error('invalid-toom-test-market');
  let browser, context, page, blocked = null, lastNavigation = 0;
  const failure = (reason, method = 'direct', extra = {}) => ({ products: [], reason, method, removed: false, ...extra });
  const hard = error => ['blocked', 'FETCH_BLOCKED', 'captcha', 'hard_bot_block'].includes(error.code) || /HTTP (401|403|429)/.test(error.message || '');
  async function navigate(url) {
    if (blocked) throw Object.assign(new Error(blocked), { code: blocked });
    const target = new URL(url);
    if (target.protocol !== 'https:' || !HOSTS.includes(target.hostname) || target.username || target.password || target.port) throw new Error('unsafe-toom-url');
    const policy = await http.getRobots(target.origin, HOSTS);
    if (!robotsAllows(policy, url)) throw Object.assign(new Error('robots-disallowed'), { code: 'robots-disallowed' });
    await new Promise(resolve => setTimeout(resolve, Math.max(0, lastNavigation + Math.max(minDelayMs, policy.delay) - Date.now())));
    lastNavigation = Date.now();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const check = async () => {
      blocked = toomHardBlock(response?.status(), await page.title(), await page.locator('body').innerText().catch(() => ''));
      if (blocked) throw Object.assign(new Error(blocked), { code: blocked });
    };
    await check();
    if ([404, 410].includes(response?.status())) throw Object.assign(new Error('product_removed'), { code: 'not-found' });
    if (response?.status() >= 400) throw Object.assign(new Error('playwright_http_error'), { code: 'playwright_http_error' });
    for (const frame of page.frames()) {
      const decline = frame.getByRole('button', { name: /^(Alle ablehnen|Alles ablehnen|Ablehnen|Nur notwendige Cookies)$/i }).first();
      if (await decline.isVisible().catch(() => false)) { await decline.click({ timeout: 2000 }); break; }
    }
    return check;
  }
  async function start() {
    if (browser) return;
    browser = await chromiumImpl.launch({ headless });
    context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1440, height: 1000 } });
    page = await context.newPage(); page.setDefaultTimeout(timeoutMs);
  }
  async function browserProduct(url, directReason) {
    try {
      await start(); const check = await navigate(url);
      await page.locator('[data-testid="buybox-price"] [data-testid="price-box-pricing-current"]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
      await check();
      const current = toomProductUrl(page.url());
      if (!current || current.split('/').at(-1) !== url.split('/').at(-1)) return failure('product_redirect_mismatch', 'playwright', { directReason, removed: true });
      const html = await page.content(), identity = readToomIdentity(html, current);
      const box = await page.evaluate(() => {
        const own = document.querySelector('[data-testid="buybox-price"]');
        const value = id => own?.querySelector(`[data-testid="${id}"]`)?.textContent || '';
        const body = document.body.innerText;
        return { name: document.querySelector('h1')?.textContent || '', current: value('price-box-pricing-current'), previous: value('price-box-pricing-previous'),
          packagePrice: value('price-box-package-pricing'), size: value('price-box-size'), conditional: /Vorteilskarte|Mitgliederpreis|Kundenkartenpreis/.test(own?.textContent || ''),
          market: body.match(/Mein Markt:\s*([^\n]+)/)?.[1] || null, deliveryState: body.match(/Lieferung nach Hause\s*([^\n]+)/)?.[1] || null };
      });
      if (onEvidence) await onEvidence({ url: current, method: 'playwright', box });
      const result = parseToomBuybox(identity, box);
      return { ...result, method: 'playwright', removed: false, directReason, variantUrls: variantUrls(identity) };
    } catch (error) {
      if (hard(error)) blocked = error.code === 'captcha' ? 'captcha' : 'hard_bot_block';
      return failure(blocked || error.code || 'playwright_navigation_failed', 'playwright', { directReason, removed: error.code === 'not-found' });
    }
  }
  async function readProduct(value) {
    const url = toomProductUrl(value);
    if (!url) return failure('invalid_product_url');
    if (blocked) return failure(blocked);
    let directReason = null;
    try {
      const document = await http.get(url, HOSTS);
      const redirected = toomProductUrl(document.url);
      if (!redirected || redirected.split('/').at(-1) !== url.split('/').at(-1)) return failure('product_redirect_mismatch', 'direct', { removed: true });
      const identity = readToomIdentity(document.body, document.url);
      if (!identity) directReason = 'product_identity_missing';
      else if (!/^\d+$/.test(identity.sapId)) directReason = 'structured_price_endpoint_missing';
      else {
        const endpoint = `https://api.toom.de/public/v1/jsonview/${identity.sapId}/${marketId}`;
        const response = await http.get(endpoint, API_HOSTS);
        let state; try { state = JSON.parse(response.body); } catch { directReason = 'structured_price_invalid'; }
        if (state) {
          const result = parseToomSellingState(identity, state, new Date(), String(marketId));
          if (onEvidence) await onEvidence({ url: redirected, method: 'direct', endpoint, state, result });
          if (result.products.length) return { ...result, method: 'direct', removed: false, variantUrls: variantUrls(identity) };
          directReason = result.reason;
        }
      }
    } catch (error) {
      if (hard(error)) { blocked = 'hard_bot_block'; return failure(blocked); }
      if (error.code === 'robots-disallowed') return failure('robots-disallowed');
      directReason = error.code === 'not-found' ? 'direct_fetch_404' : error.code || 'direct_fetch_failed';
    }
    return browserProduct(url, directReason);
  }
  return { readProduct, async search(query) {
    const term = typeof query === 'string' ? query : query?.name;
    if (!clean(term)) return failure('invalid_query');
    if (blocked) return failure(blocked);
    const searchUrl = `https://toom.de/s/${encodeURIComponent(clean(term))}/`, errors = [], products = [];
    let urls = [], method = 'direct';
    try {
      const response = await http.get(searchUrl, HOSTS);
      urls = [...response.body.matchAll(/href=["']([^"']+)["']/g)].map(match => toomProductUrl(decode(match[1]))).filter(Boolean);
    } catch (error) {
      if (hard(error)) { blocked = 'hard_bot_block'; return failure(blocked); }
      if (error.code === 'robots-disallowed') return failure('robots-disallowed');
      errors.push({ reason: error.code || 'direct_search_failed' });
    }
    if (!urls.length) {
      try {
        await start(); const check = await navigate(searchUrl); method = 'playwright';
        await page.locator('a[href*="/p/"]').first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
        await check(); urls = (await page.locator('a[href*="/p/"]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.href))).map(toomProductUrl).filter(Boolean);
      } catch (error) { if (hard(error)) blocked = error.code === 'captcha' ? 'captcha' : 'hard_bot_block'; return failure(blocked || error.code || 'playwright_search_failed', 'playwright'); }
    }
    const seen = new Set();
    while (seen.size < maxProducts) {
      const url = rankToomProductUrls(urls.filter(value => !seen.has(value)), term)[0];
      if (!url) break;
      seen.add(url);
      const result = await readProduct(url);
      products.push(...result.products);
      urls.push(...(result.variantUrls || []));
      if (result.reason) errors.push({ url, reason: result.reason });
      if (blocked) break;
    }
    return { products, method, reason: products.length ? null : blocked || 'no_verified_products', removed: false, errors };
  }, async close() { await context?.close().catch(() => {}); await browser?.close().catch(() => {}); } };
}
