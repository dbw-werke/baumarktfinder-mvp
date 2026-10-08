/** Pure toom identity and active selling-price parsers. */
import { extractToomProductState } from './retailer-state.mjs';
const HOSTS = ['toom.de', 'www.toom.de'];
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const money = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
const unit = value => ({ kilogramm: 'kg', kg: 'kg', liter: 'l', l: 'l', milliliter: 'ml', ml: 'ml', meter: 'm', m: 'm', 'm²': 'm2', m2: 'm2', quadratmeter: 'm2', stück: 'piece', stueck: 'piece', pack: 'package', paket: 'package', pce: 'package' })[clean(value).toLowerCase()] || null;
const fail = reason => ({ products: [], reason });

export function toomProductUrl(value) {
  try { const url = new URL(value, 'https://toom.de');
    if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname) || url.port || url.username || url.password || !/^\/p\/[^/]+\/\d+\/?$/.test(url.pathname)) return null;
    return `https://toom.de${url.pathname.replace(/\/$/, '')}`;
  } catch { return null; }
}
export function toomHardBlock(status, title = '', body = '') {
  if (/captcha|verify (?:you are|that you are) human|bestätigen? sie.*mensch/i.test(`${title}\n${body}`)) return 'captcha';
  if ([401, 403, 429].includes(status) || /access denied|request blocked|unusual traffic|checking your browser|bot challenge/i.test(`${title}\n${body}`)) return 'hard_bot_block';
  return null;
}
export function readToomIdentity(html, url, now = new Date()) {
  const valid = toomProductUrl(url);
  if (!valid) return null;
  try {
    const encoded = html.match(/<div\b(?=[^>]*\bid="root")(?=[^>]*\bdata-props="([^"]+)")[^>]*>/)?.[1];
    const data = JSON.parse(decodeURIComponent(decode(encoded))).content;
    if (toomProductUrl(data?.meta_data?.canonical_url) !== valid || String(data?.basic_info?.sku) !== valid.split('/').at(-1)) return null;
    const product = extractToomProductState(html, url, now, { identityOnly: true })[0];
    if (!product) return null;
    const ownText = [product.name, ...(product.attributes || []).map(a => `${a.name}: ${a.value}`)].join(' ');
    const profile = ownText.match(/\b(CD|CW|UW|UD)[ -]*(?:Profil[e]?\s*)?(\d{2})\s*\/\s*(\d{2})\b/i);
    if (profile) product.observedSpecs = { ...product.observedSpecs, profile: `${profile[1].toLowerCase()}${profile[2]}/${profile[3]}` };
    for (const attribute of product.attributes || []) {
      if (/^(?:Inhalt|Stückzahl|Anzahl pro Packung)$/i.test(attribute.name)) {
        const pieces = attribute.value.match(/^(\d+)\s*(?:Stk\.?|Stück|Stueck)$/i);
        if (pieces) product.observedSpecs.pieces = Number(pieces[1]);
      }
      if (/^Lieferumfang$/i.test(attribute.name)) {
        const single = attribute.value.match(/^1\s*x\s*(?:Schleifpapier|Schleifbogen)$/i);
        if (single) product.observedSpecs.pieces = 1;
      }
    }
    // For an actual direct hanger the installed leg is the technical length, not the flat blank.
    if (/Direktabhänger/i.test(product.name)) {
      const leg = product.description.match(/Schenkellänge\s+(?:von\s+)?(\d+(?:[.,]\d+)?)\s*mm/i);
      if (leg) { product.observedSpecs.length_mm = Number(leg[1].replace(',', '.')); product.attributes.push({ name: 'Schenkellänge', value: `${leg[1]} mm` }); }
    }
    return { product: { ...product, url: valid }, sapId: String(data.details?.sap_artikelnummer || ''), data };
  } catch { return null; }
}
function packageInfo(size, product) {
  const match = clean(size).match(/^(\d+(?:[.,]\d+)?)\s*(Kilogramm|kg|Milliliter|ml|Liter|l|Meter|m|m²|m2|Quadratmeter|Stück|Stueck)$/i);
  if (!match) return { observedSpecs: product.observedSpecs || {} };
  let quantity = Number(match[1].replace(',', '.')), baseUnit = unit(match[2]);
  if (baseUnit === 'ml') { quantity /= 1000; baseUnit = 'l'; }
  const key = { kg: 'weight_kg', l: 'volume_l', m2: 'area_m2', m: 'length_mm', piece: 'pieces' }[baseUnit];
  const observedSpecs = { ...product.observedSpecs };
  if (key) observedSpecs[key] = baseUnit === 'm' ? quantity * 1000 : quantity;
  return { packageQuantity: quantity, baseUnit: baseUnit === 'piece' ? 'piece' : baseUnit, actualSize: clean(size), observedSpecs };
}
function calendarDate(value) {
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : false;
}
function activePrice(row, validUntil, now, validFrom) {
  if (!row || !money(row.regular)) return null;
  if (row.offer == null || row.offer === 0 || row.offer === row.regular) return { price: row.regular, oldPrice: null };
  if (!money(row.offer) || row.offer >= row.regular) return null;
  const date = row.offer_valid_to || validUntil, starts = row.offer_valid_from || validFrom;
  const berlinDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
  if (starts) {
    const first = calendarDate(starts);
    if (first === false || (first ? first > berlinDate : !Number.isFinite(Date.parse(starts)) || Date.parse(starts) > now.getTime())) return null;
  }
  if (date) {
    const expires = calendarDate(date);
    if (expires === false || (expires ? expires < berlinDate : !Number.isFinite(Date.parse(date)) || Date.parse(date) < now.getTime())) return null;
  }
  return { price: row.offer, oldPrice: row.regular };
}

/** API response is bound to the SAP article from the exact PDP, never a recommendation. */
export function parseToomSellingState(identity, state, now = new Date(), marketId = '3248') {
  if (!identity?.product) return fail('product_identity_missing');
  const delivery = state?.deliver;
  if (!delivery?.price) return fail('active_online_price_missing');
  const primaryUnit = unit(delivery.price.amount_unit), secondaryUnit = unit(delivery.package?.price?.amount_unit);
  if ((delivery.price.amount_unit && !primaryUnit) || (delivery.package?.price?.amount_unit && !secondaryUnit)) return fail('unknown_price_unit');
  let total, perUnit;
  if (primaryUnit && !['package', 'piece'].includes(primaryUnit)) {
    if (!['package', 'piece'].includes(secondaryUnit)) return fail('package_price_missing');
    total = activePrice(delivery.package.price, delivery.price.offer_valid_to, now, delivery.price.offer_valid_from);
    perUnit = activePrice(delivery.price, delivery.price.offer_valid_to, now);
  } else {
    total = activePrice(delivery.price, delivery.price.offer_valid_to, now);
    if (secondaryUnit && !['package', 'piece'].includes(secondaryUnit)) perUnit = activePrice(delivery.package.price, delivery.price.offer_valid_to, now, delivery.price.offer_valid_from);
  }
  if (!total) return fail('active_price_invalid_or_expired');
  if (delivery.package?.price && !perUnit && secondaryUnit && !['package', 'piece'].includes(secondaryUnit)) return fail('unit_price_invalid_or_expired');
  const declaredUnit = primaryUnit && !['package', 'piece'].includes(primaryUnit) ? primaryUnit : secondaryUnit;
  const info = packageInfo(delivery.package?.size, identity.product);
  if (perUnit && info.packageQuantity && info.baseUnit === declaredUnit && Math.abs(total.price / info.packageQuantity - perUnit.price) > 0.011) return fail('package_unit_price_conflict');
  return { products: [{ ...identity.product, ...info, ...total, currency: 'EUR', priceBasis: 'package', priceSource: 'retailer-product-state',
    priceBasisEvidence: 'toom-exact-sap-current-deliver-state',
    ...(perUnit ? { declaredUnitPrice: perUnit.price, declaredUnit } : {}),
    // A public online-channel price does not prove stock in the customer's branch.
    availability: null, priceScope: 'chain', retrievedAt: now.toISOString(), verificationStatus: 'verified', retrievalMethod: 'direct',
    metadata: { delivery_state: delivery.state || null, delivery_available: delivery.state === 'available',
      observed_market_id: String(marketId), price_channel: 'deliver', pickup_state: state.reserve?.state || null },
  }], reason: null };
}
const parseEuro = value => {
  const match = clean(value).match(/^(\d+(?:\.\d{3})*),\s*(\d{2})\s*€(?:\s*\/\s*(.+))?$/);
  return match ? { price: Number(`${match[1].replaceAll('.', '')}.${match[2]}`), unit: match[3] ? unit(match[3]) : null, explicitUnit: Boolean(match[3]) } : null;
};
/** Inputs come only from the current PDP's buybox data-testid elements. */
export function parseToomBuybox(identity, box, now = new Date()) {
  if (!identity?.product || !box || clean(box.name) !== clean(identity.data.basic_info.name)) return fail('product_identity_missing');
  if (box.conditional) return fail('conditional_price');
  const current = parseEuro(box.current), other = parseEuro(box.packagePrice), previous = parseEuro(box.previous);
  if (!current || (current.explicitUnit && !current.unit)) return fail('active_price_missing');
  const currentIsUnit = current.unit && !['package', 'piece'].includes(current.unit);
  const total = currentIsUnit ? other : current;
  if (!total || !money(total.price) || (currentIsUnit && !['package', 'piece'].includes(other?.unit))) return fail('package_price_missing');
  const perUnit = currentIsUnit ? current : other?.unit && !['package', 'piece'].includes(other.unit) ? other : null;
  const info = packageInfo(clean(box.size).replace(/^Paketinhalt:\s*/i, ''), identity.product);
  if (perUnit && info.packageQuantity && info.baseUnit === perUnit.unit && Math.abs(total.price / info.packageQuantity - perUnit.price) > 0.011) return fail('package_unit_price_conflict');
  // A crossed-out €/m² value must never be converted to a made-up old package price.
  const oldPrice = !currentIsUnit && previous && !previous.unit && previous.price > total.price ? previous.price : null;
  return { products: [{ ...identity.product, ...info, price: total.price, oldPrice, priceBasis: 'package', priceSource: 'retailer-product-state',
    priceBasisEvidence: 'toom-own-visible-buybox-current', ...(perUnit ? { declaredUnitPrice: perUnit.price, declaredUnit: perUnit.unit } : {}),
    availability: null, priceScope: 'chain', retrievedAt: now.toISOString(), verificationStatus: 'verified', retrievalMethod: 'playwright',
    metadata: { observed_market: box.market || null, delivery_state: box.deliveryState || null, price_channel: 'visible-buybox' },
  }], reason: null };
}

