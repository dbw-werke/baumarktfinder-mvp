/** Read only the same-SKU public product state; never execute retailer JavaScript. */
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const type = (value, expected) => list(value?.['@type']).some((item) => String(item).split('/').pop() === expected);
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const number = (value) => Number(String(value).replace(',', '.'));
function official(value, base) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['hagebau.de', 'www.hagebau.de'].includes(url.hostname)
      || !/^\/p\/[^/]+-an(?:P|V)\d+\/?$/.test(url.pathname)) return null;
    url.search = ''; url.hash = ''; return url.href.replace(/\/$/, '');
  } catch { return null; }
}
function unconditional(offer, now) {
  if (!type(offer, 'Offer') || offer.availableAtOrFrom || offer.eligibleCustomerType || offer.validForMemberTier
    || Number(offer.eligibleQuantity?.minValue || offer.eligibleQuantity?.value || 1) > 1
    || (offer.itemCondition && !String(offer.itemCondition).endsWith('/NewCondition'))) return false;
  if (offer.validFrom && (!Number.isFinite(Date.parse(offer.validFrom)) || Date.parse(offer.validFrom) > now.getTime())) return false;
  if (offer.priceValidUntil && (!Number.isFinite(Date.parse(offer.priceValidUntil))
    || Date.parse(`${String(offer.priceValidUntil).slice(0, 10)}T23:59:59Z`) < now.getTime())) return false;
  return list(offer.priceSpecification).every((entry) => !entry.validForMemberTier && !entry.eligibleCustomerType
    && !entry.availableAtOrFrom && Number(entry.eligibleQuantity?.minValue || entry.eligibleQuantity?.value || 1) <= 1
    && (entry.price == null || Number(entry.price) === Number(offer.price))
    && (!entry.unitCode || ['C62', 'H87', 'EA'].includes(entry.unitCode))
    && (!entry.unitText || ['Stück', 'Paket', 'Packung', 'Sack', 'Eimer', 'Kartusche', 'Rolle'].includes(entry.unitText))
    && (!entry.referenceQuantity || (Number(entry.referenceQuantity.value) === 1 && ['C62', 'H87', 'EA'].includes(entry.referenceQuantity.unitCode))));
}

export function extractHagebauProductState(html, pageUrl, now = new Date()) {
  let data;
  try {
    const matches = [...html.matchAll(/\bproductData:\s*(\{[^\r\n]+\}),?\s*\r?\n/g)];
    if (matches.length !== 1) return [];
    data = JSON.parse(matches[0][1]);
  } catch { return []; }
  const row = data?.productDetails?.product, prices = row?.price?.onlinePrices;
  const page = official(pageUrl), variant = official(data?.dedicatedItemUrl, pageUrl);
  const canonical = official(html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1], pageUrl);
  if (!row || !page || !variant || !canonical || !/^P\d+$/.test(row.id) || !/^\d+$/.test(row.itemId)
    || !variant.endsWith(`-anV${row.itemId}`) || !canonical.endsWith(`-an${row.id}`) && canonical !== variant
    || page !== canonical && page !== variant || row.available !== true || row.statusOnline !== 'available'
    || row.statusStore !== 'storeNotSet' || row.hasStorePriceAndStock !== false || row.highlightUnitPrice !== false
    || row.price.defaultPriceType !== 'ONLINE' || row.price.isFromPrice !== false || !clean(row.name) || !clean(row.brand?.name)) return [];
  const amount = prices?.displayPrice;
  if (!positive(amount?.value) || amount.currency !== 'EUR' || row.price.prices?.displayPrice?.value !== amount.value
    || row.price.prices?.displayPrice?.currency !== 'EUR' || Math.abs(amount.value * 100 - Math.round(amount.value * 100)) > 0.000001) return [];
  const products = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const node = JSON.parse(match[1]);
      for (const item of [...list(node), ...list(node?.['@graph'])]) if (type(item, 'Product')) products.push(item);
    } catch { return []; }
  }
  // One explicit offer independently confirms identity, normal price and availability.
  const matches = products.filter((product) => String(product.sku) === row.itemId);
  if (matches.length !== 1) return [];
  const product = matches[0], offers = list(product.offers);
  if (offers.length !== 1 || String(product.gtin13) !== row.ean || !/^\d{8,14}$/.test(row.ean)
    || clean(product.brand?.name).toLowerCase() !== clean(row.brand.name).toLowerCase()) return [];
  const offer = offers[0];
  if (!unconditional(offer, now) || official(offer.url, pageUrl) !== variant || offer.priceCurrency !== 'EUR'
    || Number(offer.price) !== amount.value || !String(offer.availability).endsWith('/InStock')
    || (offer.unitCode && !['C62', 'H87', 'EA'].includes(offer.unitCode))
    || (offer.unitText && !['Stück', 'Paket', 'Packung', 'Sack', 'Eimer', 'Kartusche', 'Rolle'].includes(offer.unitText))) return [];
  const observedSpecs = {}, features = list(data.productDetails.features);
  for (const feature of features) {
    // Gebindegröße describes contents; ordinary dimensions may describe its packaging.
    if (!/^Gebindegröße(?:\s*\((?:kg|l|ml)\))?$/.test(feature.name)) continue;
    const measure = clean(feature.value).match(/^(\d+(?:[.,]\d+)?)\s*(kg|l|ml)$/);
    if (!measure) return [];
    const key = measure[2] === 'kg' ? 'weight_kg' : 'volume_l';
    const value = number(measure[1]) * (measure[2] === 'ml' ? 0.001 : 1);
    if (observedSpecs[key] != null && observedSpecs[key] !== value) return [];
    observedSpecs[key] = value;
  }
  const namedMeasure = clean(row.name).match(/(?:^|[,\s])([0-9]+(?:[.,][0-9]+)?)\s*(kg|l|ml)(?:\b|$)/);
  if (namedMeasure) {
    const key = namedMeasure[2] === 'kg' ? 'weight_kg' : 'volume_l';
    const value = number(namedMeasure[1]) * (namedMeasure[2] === 'ml' ? 0.001 : 1);
    if (observedSpecs[key] != null && observedSpecs[key] !== value) return [];
    observedSpecs[key] = value;
  }
  const contentKey = observedSpecs.weight_kg ? 'weight_kg' : observedSpecs.volume_l ? 'volume_l' : null;
  const packageUnit = ['Stück', 'Paket', 'Packung', 'Sack', 'Eimer', 'Kartusche', 'Rolle'].includes(prices.displayPriceUnit);
  const unitPrice = prices.unitPrice;
  // A numeric container quantity or an explicit sales-package unit is mandatory.
  if (!contentKey && !packageUnit) return [];
  if (prices.displayPriceUnit && !packageUnit) return [];
  if (unitPrice) {
    if (unitPrice.valid !== true || !positive(unitPrice.price?.value) || unitPrice.price.currency !== 'EUR') return [];
    if (contentKey) {
      if (unitPrice.unit !== (contentKey === 'weight_kg' ? 'kg' : 'l')) return [];
      const expected = amount.value / observedSpecs[contentKey];
      if (Math.abs(unitPrice.price.value - expected) > Math.max(0.011, expected * 0.01)) return [];
    }
  }
  let name = `${clean(row.brand.name)} ${clean(row.name)}`;
  if (/acryl/i.test(name) && features.some((feature) => /^überstreichbar$/i.test(feature.name) && /^(ja|true)$/i.test(feature.value))) name += ', überstreichbar';
  return [{ name, url: pageUrl, externalId: row.itemId, price: amount.value, currency: 'EUR', priceBasis: 'package',
    priceSource: 'retailer-product-state', priceBasisEvidence: 'hagebau-same-sku-variant-online-price-and-package',
    availability: 'InStock', soldIndividually: true, observedSpecs, retrievedAt: now.toISOString(),
    ...(unitPrice ? { declaredUnitPrice: unitPrice.price.value } : {}) }];
}
