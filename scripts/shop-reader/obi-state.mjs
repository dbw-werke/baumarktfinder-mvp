/** OBI-only proof around the shared structured Product/Offer parser. */
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const isType = (node, type) => list(node?.['@type']).some(value => String(value).split('/').pop() === type);
export function obiProductUrl(value, base = 'https://www.obi.de') {
  try { const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['www.obi.de','obi.de'].includes(url.hostname) || !/^\/p\/\d+\/[^/]+\/?$/.test(url.pathname)) return null;
    url.search=''; url.hash=''; return url.href.replace(/\/$/,'');
  } catch { return null; }
}
export function confirmObiProducts(html, products, pageUrl) {
  const url = obiProductUrl(pageUrl); if (!url) return [];
  const sku = new URL(url).pathname.split('/')[2], nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (isType(node,'Product')) nodes.push(node);
    if (Array.isArray(node)) node.forEach(walk);
    else if (node['@graph']) list(node['@graph']).forEach(walk);
    else if (node.mainEntity) walk(node.mainEntity);
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* Invalid evidence is unusable. */ }
  }
  const own = nodes.filter(node => String(node.sku || node.productID) === sku && obiProductUrl(node.url || node['@id'] || pageUrl) === url);
  if (own.length !== 1) return [];
  const offers = list(own[0].offers);
  // Third-party marketplace or selected-market prices are not OBI chain prices.
  if (!offers.length || offers.some(offer => !isType(offer,'Offer') || !/^OBI(?:\s+E-Commerce(?:\s+GmbH)?)?$/i.test(String(offer.seller?.name || offer.seller || '').trim())
    || offer.availableAtOrFrom || offer.eligibleCustomerType || offer.validForMemberTier)) return [];
  // A nested referenceQuantity.unitText is a unit-price declaration too.
  // Never let the shared container-name fallback turn e.g. 0.40 EUR/kg into a 25 kg bag price.
  const packageUnits = new Set(['C62','H87','EA','package','piece','Stück','Stueck','pack','sack']);
  const ambiguous = offers.some(offer => {
    const specs = list(offer.priceSpecification).filter(spec => spec.price == null || Number(spec.price) === Number(offer.price));
    return specs.some(spec => {
      const units = [spec.referenceQuantity?.unitCode,spec.referenceQuantity?.unitText,spec.unitCode,spec.unitText].filter(Boolean);
      return units.some(unit => !packageUnits.has(unit)) || (isType(spec,'UnitPriceSpecification') && !units.length && !packageUnits.has(offer.unitCode || offer.unitText));
    });
  });
  if (ambiguous) return [];
  return products.filter(product => obiProductUrl(product.url) === url && String(product.externalId) === sku && product.priceBasis === 'package')
    .map(product => ({ ...product, seller:'OBI', priceScope:'chain', priceBasisEvidence:'obi-own-sku-unconditional-seller-package-offer' }));
}
