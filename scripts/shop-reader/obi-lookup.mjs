import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createShopReader } from './shops.mjs';
import { createPoliteFetcher } from './http.mjs';
import { obiProductUrl } from './obi-state.mjs';
import { normalizeObiQuery, rankObiCandidates } from './obi-query-matcher.mjs';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
function basicRejection(product, now) {
  if (!product || !obiProductUrl(product.url)) return 'invalid-obi-product-url';
  if (!['json-ld-offer','retailer-product-state','obi-rendered-product','manual-admin-verification'].includes(product.priceSource) || product.priceBasis !== 'package') return 'unverified-package-price';
  if (product.currency !== 'EUR' || !positive(product.price) || product.price > 100000 || Math.abs(product.price * 100 - Math.round(product.price * 100)) > .00001) return 'invalid-total-price';
  if (!Number.isFinite(Date.parse(product.retrievedAt)) || Date.parse(product.retrievedAt) > now + 300000) return 'invalid-observation-time';
  if (product.availability && !['InStock','LimitedAvailability','OnlineOnly','PreOrder','BackOrder'].includes(product.availability)) return 'not-purchasable';
  return null;
}
export function selectObiOffer(query, products, now = Date.now()) {
  const rejected = [], valid = [];
  // Validate every candidate before ranking so an invalid cheap/first offer cannot hide a valid one.
  for (const product of products) {
    const reason = basicRejection(product, now);
    const match = rankObiCandidates(query, [product]);
    const selected = match.selected;
    const unitPrice = selected?.declaredUnitPrice ?? selected?.unitPrice;
    const invalidUnit = selected?.declaredUnit && selected.declaredUnit !== selected.baseUnit || positive(unitPrice) && positive(selected?.packageQuantity) && Math.abs(unitPrice - selected.price / selected.packageQuantity) > Math.max(.011, unitPrice * .01);
    if (reason || !selected || !selected.actualSize || invalidUnit) {
      rejected.push({ ...(match.candidates[0] || {}), result:'REJECT', rejectionReason:reason || (!selected ? match.candidates[0]?.rejectionReason : invalidUnit ? 'conflicting-unit-price' : 'unverified-package-size') });
    } else valid.push(product);
  }
  const ranked = rankObiCandidates(query, valid), product = ranked.selected;
  const offer = product ? { store_id:'obi',product_name:product.name,product_url:obiProductUrl(product.url),actual_size:product.actualSize,
    price:product.price,currency:'EUR',checked_at:product.retrievedAt,source:product.priceSource === 'manual-admin-verification' ? 'manual' : 'automatic',price_scope:'chain',
    ...(positive(product.packageQuantity) && product.baseUnit ? {package_quantity:product.packageQuantity,unit:product.baseUnit,
      unit_price:Math.round(product.price / product.packageQuantity * 1000000)/1000000} : {}),
    family:product.detectedFamily,match_score:product.matchScore,verification_status:'verified',
    retrieval_method:product.priceSource==='manual-admin-verification' ? 'manual' : product.retrievalMethod || 'structured-http' } : null;
  return { offer, product, intent:ranked.intent, candidates:[...ranked.candidates,...rejected] };
}

/** Persistent verified query cache, independent of canonical material IDs. Server/worker only. */
export function createObiLookup({ seedProducts = [], cacheFile = null, reader = null, now = Date.now,
  freshMs = 24*60*60*1000, retryMs = 15*60*1000, logger = () => {}, loadProducts=null,saveProducts=null } = {}) {
  const cache = new Map(), pending = new Map(), attempts = new Map();
  let initialized, loadedAt = -Infinity, databaseLoadedAt=-Infinity, writing = Promise.resolve(), busy = false, retryAt = 0;
  const errors = [];
  async function initialize() {
    const merge=products=>{for (const p of products.slice(0,500)) if (!basicRejection(p,now())) {
      const url=obiProductUrl(p.url),old=cache.get(url);
      if (!old || Date.parse(p.retrievedAt)>Date.parse(old.retrievedAt)) cache.set(url,p);
    }};
    if (loadProducts && now()-databaseLoadedAt>=60000) {
      databaseLoadedAt=now();
      try {merge(await loadProducts());} catch {if (!errors.some(e=>e.code==='database-read-failed')) errors.push({code:'database-read-failed'});}
    }
    if (!cacheFile) return;
    try {
      // Runtime cache lives on a configured volume; it must not be bundled with server source.
      const raw = await readFile(/* turbopackIgnore: true */ cacheFile,'utf8'); if (raw.length > 8000000) throw new Error('cache-too-large');
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.products)) throw new Error('invalid-cache');
      merge(data.products);
    } catch (error) { if (error.code !== 'ENOENT') errors.push({code:'cache-read-failed'}); }
  }
  async function persist() {
    if (!cacheFile) return;
    writing = writing.catch(()=>{}).then(async()=>{
      await mkdir(dirname(cacheFile),{recursive:true});
      const temp = `${cacheFile}.${process.pid}.tmp`;
      await writeFile(temp,JSON.stringify({version:1,products:[...cache.values()].slice(-500)},null,2)+'\n');
      await rename(temp,cacheFile);
    });
    try { await writing; } catch { errors.push({code:'cache-write-failed'}); }
  }
  function pool() {
    const latest = new Map();
    for (const product of [...seedProducts,...cache.values()]) {
      // Revalidate older cache formats too. A newer contradictory observation must
      // not hide an older still-valid observation for the same SKU.
      if (basicRejection(product,now()) || !selectObiOffer(product.name,[product],now()).offer) continue;
      const url = obiProductUrl(product.url), old = latest.get(url);
      if (!old || Date.parse(product.retrievedAt) > Date.parse(old.retrievedAt)) latest.set(url,product);
    }
    return [...latest.values()];
  }
  async function run(query, normalizedQuery, force) {
    // A separately running updater writes this cache. Existing server instances must see its new data.
    if (!initialized || now()-loadedAt>=3000) { loadedAt=now();initialized=initialize(); }
    await initialized;
    const prior = selectObiOffer(query,pool(),now()), failure = [...errors];
    let result = prior, cacheStatus = prior.offer ? 'verified-cache' : 'miss', productsFound = 0, retrieval=null;
    const exactRequestedPackage = prior.product && Object.entries(prior.intent.packageSpecs).every(([key,value]) =>
      Math.abs(Number(prior.candidates.find(c=>c.productUrl===prior.product.url && c.result==='ACCEPT')?.observedSpecs[key]) - Number(value)) < .001);
    const fresh = prior.offer && exactRequestedPackage && now()-Date.parse(prior.offer.checked_at) <= freshMs;
    if (!force && fresh) cacheStatus = 'fresh-verified-cache';
    else if (retryAt > now() || (attempts.get(normalizedQuery) || 0) > now()) failure.push({code:'reader-cooldown'});
    else if (busy) failure.push({code:'reader-busy'});
    else {
      busy = true; attempts.set(normalizedQuery,now()+retryMs);
      if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
      try {
        const source = reader ?? createShopReader({http:createPoliteFetcher({timeoutMs:5000}),maxProductPages:4,maxSitemaps:1});
        const response = await source.searchShop('obi',query,{candidateUrls:prior.product ? [prior.product.url] : []});
        retrieval=response.retrieval ?? null;
        const products = Array.isArray(response.products) ? response.products.slice(0,50) : [];
        productsFound = products.length;
        failure.push(...(response.errors || []).map(error=>({code:String(error.code || 'reader-error'),url:error.url,reason:error.reason})));
        const found = selectObiOffer(query,products,now());
        if (found.product) {
          const saved=[];
          for (const candidate of products) if (selectObiOffer(query,[candidate],now()).offer) {
            const url = obiProductUrl(candidate.url), old = cache.get(url);
            if (!old || Date.parse(candidate.retrievedAt) >= Date.parse(old.retrievedAt)) {cache.set(url,candidate);saved.push(candidate);}
          }
          while (cache.size > 500) cache.delete(cache.keys().next().value);
          await persist(); result = selectObiOffer(query,pool(),now()); cacheStatus = 'updated';
          if (saveProducts) {try {await saveProducts(saved);} catch {failure.push({code:'database-write-failed'});}}
        } else { result = {...prior,candidates:[...found.candidates,...prior.candidates]}; cacheStatus = prior.offer ? 'stale-verified-cache' : 'unavailable'; }
        if (failure.some(e=>['blocked','FETCH_BLOCKED','robots-unavailable','not-found','network-error'].includes(e.code))) retryAt = now()+retryMs;
      } catch (error) {
        failure.push({code:error.code || 'reader-error'}); retryAt = now()+retryMs;
        cacheStatus = prior.offer ? 'stale-verified-cache' : 'unavailable';
      } finally { busy = false; }
    }
    const diagnostics = {userQuery:query,normalizedQuery,productsFound,topCandidates:result.candidates,
      selectedProduct:result.offer,requestedFamily:result.intent.family,requestedSpecs:result.intent.requestedSpecs,
      cacheStatus,cacheUpdated:cacheStatus==='updated',retrieval,verificationStatus:result.offer ? 'verified' : 'unverified',source:result.offer?.source ?? null,errors:failure};
    logger(diagnostics);
    return {offer:result.offer,normalizedQuery,cacheStatus,diagnostics,
      warning:failure.length && cacheStatus!=='updated' ? result.offer ? 'OBI konnte nicht neu gelesen werden. Das letzte geprüfte Angebot bleibt mit seinem Prüfdatum sichtbar.' : 'OBI liefert derzeit keinen verifizierbaren Preis. Die Abrufursache wurde protokolliert.' : result.offer ? null : 'Für diese OBI-Suche wurde kein technisch passendes Angebot mit belegtem Packungspreis gefunden.'};
  }
  return {async lookup(query,{force=false}={}) {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 160 || /[<>\u0000-\u001f]|https?:\/\//i.test(query)) throw new Error('invalid-query');
    const normalized = normalizeObiQuery(query);
    if (!pending.has(normalized)) pending.set(normalized,run(query.trim(),normalized,force).finally(()=>pending.delete(normalized)));
    return pending.get(normalized);
  }};
}
