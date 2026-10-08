import { createPoliteFetcher, CollectionError } from "./http.mjs";
import { normalize } from "./product-standardizer.mjs";
import { confirmHornbachPackagePrices, extractToomProductState, extractGlobusProductState } from "./retailer-state.mjs";
import { readToomIdentity, parseToomSellingState } from "./toom-pricing.mjs";
import { extractHagebauProductState } from "./hagebau-state.mjs";
import { confirmObiProducts, obiProductUrl } from "./obi-state.mjs";

export const SHOPS = {
  obi: { name: "OBI", origin: "https://www.obi.de", hosts: ["www.obi.de", "obi.de"], search: (q) => `/search/${encodeURIComponent(q)}/`, product: /\/p\/\d+\// },
  toom: { name: "toom", origin: "https://toom.de", hosts: ["toom.de", "www.toom.de", "static.toom.de"], search: (q) => `/s/${encodeURIComponent(q)}/`, product: /\/p\/[^/]+\/\d+/ },
  hornbach: { name: "HORNBACH", origin: "https://www.hornbach.de", hosts: ["www.hornbach.de", "hornbach.de"], search: (q) => `/s/${encodeURIComponent(q)}`, product: /\/p\/[^/]+\/\d+/ },
  bauhaus: { name: "BAUHAUS", origin: "https://www.bauhaus.info", hosts: ["www.bauhaus.info", "bauhaus.info"], search: (q) => `/suche/produkte?text=${encodeURIComponent(q)}`, product: /\/p\/\d+/ },
  hagebau: { name: "hagebau", origin: "https://www.hagebau.de", hosts: ["www.hagebau.de", "hagebau.de"], search: (q) => `/search/?q=${encodeURIComponent(q)}`, product: /\/p\/|\/artikel\/|\/p[a-z]?\d{5,}/ },
  globus: { name: "Globus Baumarkt", origin: "https://www.globus-baumarkt.de", hosts: ["www.globus-baumarkt.de", "globus-baumarkt.de"], search: (q) => `/search/result?type=search&query=${encodeURIComponent(q)}`, product: /\/p\/|\/artikel\/|\/[^/]+-\d{6,}\/?$/ },
  hellweg: { name: "HELLWEG", origin: "https://www.hellweg.de", hosts: ["www.hellweg.de", "hellweg.de"], search: (q) => `/search?search=${encodeURIComponent(q)}`, product: /\/a\/|\/p\/|\/produkt\/|\/[^/]+-\d{5,}\/?$/ },
};
export const STORE_IDS = Object.keys(SHOPS);
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
const decode = (v) => String(v || "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const list = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
const type = (node, expected) => list(node?.["@type"]).some((v) => String(v).split("/").pop() === expected);
export function parsePrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  let text = clean(value).replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return null;
  const number = Number(text); return number > 0 && Number.isFinite(number) ? number : null;
}
export function productUrl(storeId, value, base = SHOPS[storeId]?.origin) {
  const shop = SHOPS[storeId]; if (!shop) return null;
  try { const url = new URL(decode(value), base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !shop.hosts.includes(url.hostname) || !shop.product.test(url.pathname)) return null;
    url.search = ""; url.hash = ""; return url.href;
  } catch { return null; }
}
function unit(value) {
  return ({ kg: "kg", KGM: "kg", l: "l", LTR: "l", m: "m", MTR: "m", MTK: "m2", "m²": "m2", m2: "m2",
    C62: "package", H87: "package", EA: "package", Stueck: "package", Stück: "package", piece: "package", sack: "package", pack: "package" })[value] || null;
}
function structuredSpecs(node) {
  const specs = {};
  const fields = { length: "length_mm", width: "width_mm", depth: "thickness_mm", weight: "weight_kg" };
  for (const [field, key] of Object.entries(fields)) {
    const v = node[field]; if (!v || typeof v !== "object") continue;
    const multiplier = ({ MMT: 1, mm: 1, CMT: 10, cm: 10, MTR: 1000, m: 1000, KGM: 1, kg: 1 })[v.unitCode || v.unitText];
    if (multiplier) specs[key] = Number(v.value) * multiplier;
  }
  for (const p of list(node.additionalProperty)) {
    const key = ({ laenge: "length_mm", breite: "width_mm", staerke: "thickness_mm", dicke: "thickness_mm", durchmesser: "diameter_mm", nettomasse: "weight_kg", inhalt: "volume_l", stueckzahl: "pieces" })[normalize(p.name)];
    const multiplier = ({ mm: 1, cm: 10, m: 1000, kg: 1, l: 1, ml: 0.001, KGM: 1, MMT: 1, LTR: 1, C62: 1 })[p.unitText || p.unitCode];
    if (key && multiplier) specs[key] = Number(p.value) * multiplier;
  }
  return specs;
}

/** Only simple, current, unconditional product offers. Aggregate/loyalty/branch offers fail closed. */
export function extractStructuredProducts(html, pageUrl, storeId, now = new Date()) {
  if (storeId === "hagebau") return extractHagebauProductState(html, pageUrl, now);
  const products = [], visited = new Set();
  let hasProductOffers = false;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (type(node, "Product")) extract(node);
    for (const [key, value] of Object.entries(node)) if (key !== "isRelatedTo" && key !== "isSimilarTo") {
      if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
    }
  }
  function extract(node) {
    if (list(node.offers).length) hasProductOffers = true;
    const url = productUrl(storeId, node.url || node["@id"] || pageUrl, pageUrl);
    if (!url || !clean(node.name)) return;
    const offers = list(node.offers).filter((offer) => type(offer, "Offer") && !offer.availableAtOrFrom && !offer.eligibleCustomerType && !offer.validForMemberTier);
    const candidates = [];
    for (const offer of offers) {
      if (offer.priceValidUntil && new Date(`${String(offer.priceValidUntil).slice(0, 10)}T23:59:59Z`) < now) continue;
      if (offer.validFrom && new Date(offer.validFrom) > now) continue;
      if (offer.eligibleQuantity && Number(offer.eligibleQuantity.minValue || offer.eligibleQuantity.value || 1) > 1) continue;
      if (offer.itemCondition && !String(offer.itemCondition).endsWith("NewCondition")) continue;
      if (offer.url && productUrl(storeId, offer.url, pageUrl) !== url) continue;
      const price = parsePrice(offer.price), currency = offer.priceCurrency;
      if (!price || currency !== "EUR") continue;
      const specs = list(offer.priceSpecification), active = specs.filter((p) => p.price == null || parsePrice(p.price) === price);
      // A SalePrice specification can still be a member-only or bulk price.
      if (active.some((p) => p.validForMemberTier || p.eligibleCustomerType || Number(p.eligibleQuantity?.minValue || p.eligibleQuantity?.value || 1) > 1)) continue;
      const basis = unit(offer.unitCode || offer.unitText || active[0]?.referenceQuantity?.unitCode || active[0]?.unitCode || active[0]?.unitText);
      if (active[0]?.referenceQuantity?.value && Number(active[0].referenceQuantity.value) !== 1) continue;
      // Without explicit price basis, a mass/volume-named container is a single package.
      // Area/length products must declare their price unit; assuming a sheet price is unsafe.
      const priceBasis = basis || (/\d+(?:[.,]\d+)?\s*(kg|ml|liter|l)\b/i.test(node.name) ? "package" : null);
      const availability = String(offer.availability || "").split("/").pop() || null;
      if (availability && !["InStock", "LimitedAvailability", "OnlineOnly", "PreOrder", "BackOrder"].includes(availability)) continue;
      candidates.push({ name: clean(node.name), url, price, currency, priceBasis, priceSource: "json-ld-offer", availability,
        brand: clean(typeof node.brand === "object" ? node.brand?.name : node.brand) || null,
        category: clean(typeof node.category === "string" ? node.category : "") || null,
        description: clean(decode(String(node.description || "").replace(/<[^>]*>/g, " "))),
        attributes: list(node.additionalProperty).filter((entry) => entry?.name && entry.value != null)
          .map((entry) => ({ name: clean(entry.name), value: clean(entry.value) })),
        externalId: String(node.sku || node.productID || node.gtin13 || ""), observedSpecs: structuredSpecs(node),
        soldIndividually: true, retrievedAt: now.toISOString() });
    }
    // Multiple delivery offers at the same price are okay; conflicting online offers are ambiguous.
    const prices = new Set(candidates.map((p) => `${p.price}:${p.priceBasis}`));
    if (prices.size === 1 && candidates.length && !visited.has(url)) { products.push(candidates[0]); visited.add(url); }
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1].trim())); } catch { /* Broken structured data never becomes a guessed price. */ }
  }
  if (storeId === "obi") return confirmObiProducts(html, products, pageUrl);
  if (storeId === "hornbach") return confirmHornbachPackagePrices(html, products, pageUrl);
  // Product-bound hydration/metadata fallback is used only when JSON-LD offers are absent.
  if (!products.length && !hasProductOffers && storeId === "toom") return extractToomProductState(html, pageUrl, now);
  if (!products.length && !hasProductOffers && storeId === "globus") return extractGlobusProductState(html, pageUrl, now);
  return products;
}
export function discoverProductLinks(html, pageUrl, storeId, query) {
  const words = normalize(query).split(/[^a-z0-9]+/).filter((v) => v.length > 3 && !/^\d+$/.test(v));
  const links = new Map();
  // OBI search ranking supplies candidate identity only, never a displayed price.
  // Broad terms/synonyms need not appear literally in the product URL.
  if (storeId === "obi" && /\/search\//.test(new URL(pageUrl).pathname)) {
    for (const match of html.matchAll(/(?:href\s*=\s*["']([^"']+)["']|["'](?:url|productUrl)["']\s*:\s*["']([^"']+)["'])/gi)) {
      const url = obiProductUrl(decode(match[1] || match[2]), pageUrl);
      if (url && !links.has(url)) links.set(url, 0);
    }
  }
  for (const match of html.matchAll(/(?:href\s*=\s*["']([^"']+)["']|<loc>([^<]+)<\/loc>)/gi)) {
    const url = productUrl(storeId, match[1] || match[2], pageUrl); if (!url) continue;
    const score = words.reduce((n, word) => n + Number(normalize(decodeURIComponent(url)).includes(word)), 0);
    if (score) links.set(url, score);
  }
  return [...links].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}
export function createShopReader({ http = createPoliteFetcher(), maxProductPages = 6, maxSitemaps = 4 } = {}) {
  const searchCache = new Map(), sitemapCache = new Map();
  async function readProduct(storeId, url) {
    const valid = productUrl(storeId, url); if (!valid) throw new CollectionError("invalid-product-url");
    const page = await http.get(valid, SHOPS[storeId].hosts);
    const canonical = productUrl(storeId, page.url);
    if (!canonical) throw new CollectionError("not-product-page");
    if (storeId === "toom") {
      // Legacy scheduled/import workers must not promote stale metadata prices.
      const identity = readToomIdentity(page.body, page.url);
      if (!identity || !/^\d+$/.test(identity.sapId)) throw new CollectionError("toom-active-price-identity-missing");
      const market = process.env.TOOM_TEST_MARKET_ID || "3248";
      if (!/^\d{3,8}$/.test(market)) throw new CollectionError("invalid-toom-test-market");
      const state = await http.get(`https://api.toom.de/public/v1/jsonview/${identity.sapId}/${market}`, ["api.toom.de"]);
      let data; try { data = JSON.parse(state.body); } catch { throw new CollectionError("toom-active-price-invalid"); }
      const current = parseToomSellingState(identity, data, new Date(), market);
      if (!current.products.length) throw new CollectionError(current.reason || "toom-active-price-missing");
      return current.products;
    }
    return extractStructuredProducts(page.body, page.url, storeId).filter((p) => p.url.replace(/\/$/, "") === canonical.replace(/\/$/, ""));
  }
  async function sitemapPages(storeId) {
    if (!sitemapCache.has(storeId)) sitemapCache.set(storeId, (async () => {
      const shop = SHOPS[storeId], policy = await http.getRobots(shop.origin, shop.hosts), pages = [], queue = [...policy.sitemaps];
      for (let index = 0; queue.length && index < maxSitemaps; index++) {
        const url = queue.shift();
        if (!shop.hosts.includes(new URL(url).hostname) || /\.gz$/i.test(url)) continue;
        try { const page = await http.get(url, shop.hosts);
          if (/<sitemapindex/i.test(page.body)) queue.push(...[...page.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1])).filter((u) => /product|artikel|sitemap/i.test(u)));
          else pages.push(page);
        } catch (error) { if (["blocked", "robots-unavailable"].includes(error.code)) throw error; }
      }
      return pages;
    })());
    return sitemapCache.get(storeId);
  }
  return { readProduct, async searchShop(storeId, query, { mappedUrl, candidateUrls = [] } = {}) {
    const shop = SHOPS[storeId]; if (!shop) throw new CollectionError("unknown-store");
    const products = [], errors = [], seen = new Set();
    async function collect(url) { if (seen.has(url)) return; seen.add(url);
      try { products.push(...await readProduct(storeId, url)); }
      catch (error) { errors.push({ code: error.code || "network-error", url }); if (["blocked", "robots-unavailable"].includes(error.code)) throw error; }
    }
    // Mapped products are always refreshed directly, and must pass matching again in the updater.
    if (mappedUrl) { await collect(mappedUrl); if (products.length) return { store: storeId, products, errors, discovery: "mapping" }; }
    for (const url of candidateUrls.slice(0, maxProductPages)) await collect(url);
    if (products.length) return { store: storeId, products, errors, discovery: "provided-candidate" };
    const searchUrl = shop.origin + shop.search(query); let links = [];
    try {
      if (!searchCache.has(searchUrl)) searchCache.set(searchUrl, http.get(searchUrl, shop.hosts));
      const page = await searchCache.get(searchUrl);
      // Discovery data identifies candidate URLs only. Every price comes from its product page.
      links = [...extractStructuredProducts(page.body, page.url, storeId).map((p) => p.url), ...discoverProductLinks(page.body, page.url, storeId, query)];
    } catch (error) { errors.push({ code: error.code || "network-error", url: searchUrl }); if (["blocked", "robots-unavailable"].includes(error.code)) throw error; }
    if (!links.length) for (const page of await sitemapPages(storeId)) links.push(...discoverProductLinks(page.body, page.url, storeId, query));
    for (const url of [...new Set(links)].slice(0, maxProductPages)) await collect(url);
    return { store: storeId, products, errors, discovery: "automatic" };
  } };
}
export async function searchShop(storeId, query, options) { return createShopReader().searchShop(storeId, query, options); }
