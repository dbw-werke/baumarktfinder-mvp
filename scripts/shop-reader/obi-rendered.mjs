import { obiProductUrl } from './obi-state.mjs';

const amount = '(\\d+(?:\\.\\d{3})*),\\s*(\\d{2})\\s*€';
const euro = match => Number(`${match[1].replaceAll('.','')}.${match[2]}`);
/** Only the current product's visible purchase section is price evidence. */
export function parseObiRenderedProduct({url,name,text,category,attributes}, now = new Date()) {
  const productUrl = obiProductUrl(url);
  if (!productUrl || !name?.trim()) return {products:[],reason:'playwright_no_product_identity'};
  const clean = String(text || '').replace(/\u00a0/g,' ').replace(/\r/g,'');
  const start = clean.indexOf(name.trim());
  if (start < 0) return {products:[],reason:'playwright_no_product_identity'};
  const buybox = clean.slice(start).split(/Produktübersicht|Produktbeschreibung|Andere Kunden kauften|Ähnliche Produkte|Bewertungen/)[0];
  if (!/Verkäufer:\s*OBI E-Commerce GmbH\b/i.test(buybox) || /Verkäufer:\s*(?!OBI E-Commerce GmbH\b)\S/i.test(buybox))
    return {products:[],reason:'playwright_seller_unverified'};
  if (/Lieferung nach Hause\s*Derzeit nicht möglich/i.test(buybox) || !/Lieferung nach Hause/i.test(buybox))
    return {products:[],reason:'playwright_online_offer_unverified'};
  if (/heyOBI Vorteil|Registrierung erforderlich|nur.*(?:Mitglied|Kundenkarte)|Mengenrabatt|Staffelpreis/i.test(buybox))
    return {products:[],reason:'playwright_conditional_price'};
  const totals = [...buybox.matchAll(new RegExp(`Gesamtpreis:\\s*${amount}`,'g')),
    ...buybox.matchAll(new RegExp(`${amount}\\s*\\/\\s*Verkaufseinheit`,'g'))].map(euro);
  let price = totals[0];
  if (totals.some(value=>value!==price)) return {products:[],reason:'playwright_conflicting_prices'};
  if (!price) {
    // Single plain purchase price is allowed; UVP, shipping and per-unit amounts are not.
    const purchase = buybox.split(/Lieferung nach Hause/)[0].replace(new RegExp(`UVP\\s*${amount}`,'g'),'');
    const standalone = [...purchase.matchAll(new RegExp(`${amount}(?!\\s*\\/)`,'g'))].map(euro);
    if (standalone.length !== 1 || /\bab\s+\d/i.test(purchase)) return {products:[],reason:'playwright_price_missing'};
    price=standalone[0];
  }
  const unitPrices = [...buybox.matchAll(new RegExp(`${amount}\\s*\\/\\s*(kg|l|m²|m2|m)(?![a-z²2])`,'gi'))];
  if (new Set(unitPrices.map(m=>`${euro(m)}:${m[3]}`)).size > 1) return {products:[],reason:'playwright_conflicting_unit_prices'};
  const unit = unitPrices[0];
  const overview=clean.slice(start).split(/Produktübersicht/)[1]?.split(/Produktbeschreibung|Produktdaten|Bewertungen|Andere Kunden/)[0] || '';
  const observedSpecs={};
  const area=overview.match(/(?:Paketinhalt|Packungsinhalt|Fläche pro (?:Paket|Packung)):\s*(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  if (area) observedSpecs.area_m2=Number(area[1].replace(',','.'));
  const format=overview.match(/Format:\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*x\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  if (format) {
    const dimensions=[Number(format[1].replace(',','.'))*({mm:1,cm:10,m:1000}[format[2]]),Number(format[3].replace(',','.'))*({mm:1,cm:10,m:1000}[format[4]])].sort((a,b)=>b-a);
    observedSpecs.length_mm=dimensions[0];observedSpecs.width_mm=dimensions[1];
  }
  // Retailers also show shipping-box dimensions/gross weight. Those are not product/package specifications.
  const sections=clean.split(/Produktdaten\s*\n/);
  const data=sections.length>1 ? sections.at(-1).split(/Maße\s*&\s*Gewicht|Bewertungen|Produktbeschreibung/)[0] : '';
  const visibleAttributes=[];
  for (const match of data.matchAll(/(?:^|\n)((?:Inhalt|Länge|Breite|Stärke|Dicke|Durchmesser|Stückzahl|Körnung|Volumen|Farbe|Artikeltyp|Produktart)(?:\s*\((?:l|kg|mm|cm|m|m²)\))?)\s*(?:\||\n|\t)\s*([^\n]+)/g))
    visibleAttributes.push({name:match[1],value:match[2].trim()});
  return {products:[{name:name.trim(),url:productUrl,price,currency:'EUR',priceBasis:'package',priceSource:'obi-rendered-product',
    seller:'OBI E-Commerce GmbH',priceScope:'chain',availability:'OnlineOnly',retrievedAt:now.toISOString(),
    externalId:new URL(productUrl).pathname.split('/')[2],category:category || null,attributes:attributes || visibleAttributes,attributeEvidence:'own-product-data-section',observedSpecs,
    ...(unit ? {declaredUnitPrice:euro(unit),declaredUnit:unit[3].replace('²','2')} : {}),
    priceBasisEvidence:totals.length ? 'visible-own-product-total' : 'visible-own-product-single-purchase-price',
    verificationStatus:'verified',retrievalMethod:'playwright'}],reason:null};
}

export function obiHardBlock(status, title = '', body = '') {
  const visible = `${title}\n${body}`;
  if (/captcha|bestätige[n]? sie.*mensch|bestaetige[n]?.*mensch|verify (?:you are|that you are) human/i.test(visible)) return 'captcha';
  if ([401,403,429].includes(status) || /access denied|unusual traffic|request blocked|security check|checking your browser|bot challenge/i.test(visible)) return 'hard_bot_block';
  return null;
}
