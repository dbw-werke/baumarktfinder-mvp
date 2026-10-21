/** Product-bound technical facts; never supplies a price or a package size. */
const documents = {
  '3053281': 'https://static.toom.de/produkte/bilder/3053281/technisches_datenblatt_3053281_31.pdf',
  '2368047': 'https://static.toom.de/produkte/bilder/2368047/technisches_datenblatt_2368047.pdf',
  '2360002': 'https://static.toom.de/produkte/bilder/2360002/technisches_datenblatt_2360002.pdf',
};
const normalize = value => String(value || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

export function supplementToomTechnicalEvidence(product, data) {
  const attributes = product.attributes || [], specs = product.observedSpecs || {};
  const text = normalize([product.name, product.description, ...attributes.map(a => `${a.name}: ${a.value}`)].join(' '));
  const add = (key, value) => {
    if (specs[key] != null && Math.abs(specs[key] - value) > 0.000001) return false;
    specs[key] = value; return true;
  };
  for (const attribute of attributes) {
    // Retailer uses the shorthand "200 µ" under Stärke, not a grammage.
    const microns = String(attribute.value).match(/^(\d+(?:[.,]\d+)?)\s*[µμ](?:m)?$/);
    if (/^(staerke|dicke)$/.test(normalize(attribute.name)) && microns
      && !add('thickness_mm', Number(microns[1].replace(',', '.')) / 1000)) return null;
    const ranges = String(attribute.value).matchAll(/\bsd(?:[ -]?Wert)?\s*(?:von|[:=])?\s*(\d+(?:[.,]\d+)?)\s*(?:bis|[–-])\s*(\d+(?:[.,]\d+)?)\s*m\b/gi);
    for (const range of ranges) {
      const minimum = Number(range[1].replace(',', '.')), maximum = Number(range[2].replace(',', '.'));
      if (!(minimum > 0 && maximum > minimum) || !add('sd_min_m', minimum) || !add('sd_max_m', maximum)) return null;
    }
  }
  product.observedSpecs = specs;
  const sku = String(data.basic_info?.sku || ''), document = documents[sku];
  // Only still-linked exact-SKU documentation may supplement missing properties.
  // A different product, brand, document, or contradicting current fact cannot inherit them.
  if (!document || !data.documents?.some(d => d.type === 'technischesdatenblatt' && d.url === document)) return product;
  const facts = [], brand = normalize(product.brand);
  if (sku === '3053281' && brand === 'knauf' && /\bper(?:lfix|flix)\b/.test(normalize(product.name)) && /ans(?:atz|etz)gips/.test(text)) {
    if (/rotband|uniflott|fugenspachtel/.test(text)) return null;
    facts.push({ name: 'Serie', value: 'Perlfix' });
  }
  if (sku === '2368047' && brand === 'soudal' && /(?:montage|bau)schaum/.test(normalize(product.name))) {
    if (/\b2[ -]?k\b|zweikomponent|\bb[13]\b|ohne\s+genius|pistolenschaum/.test(text)) return null;
    const color = attributes.find(a => /^(farbe|farbton|grundfarbe|color)$/.test(normalize(a.name)));
    if (color && normalize(color.value) !== 'champagner') return null;
    facts.push({ name: 'Chemische Basis', value: '1K Polyurethan' }, { name: 'Ausführung', value: 'B2 Genius Gun' });
    if (!color) facts.push({ name: 'Farbe', value: 'champagner' });
  }
  if (sku === '2360002' && brand === 'toom' && /sanitaer[ -]?silikon/.test(normalize(product.name))) {
    if (/neutralvernetzend|neutral[ -]?vernetzend|alkoxy|oxim|essigfrei/.test(text)) return null;
    facts.push({ name: 'Aushärtungssystem', value: 'essigvernetzend (Acetat)' });
  }
  if (facts.length) {
    product.attributes = [...attributes, ...facts];
    product.metadata = { ...product.metadata, technical_evidence: {
      verified_at: '2026-10-21', product_id: sku, document_url: document,
      ...(sku === '2368047' ? { applicator_source: 'https://catalogs.toom.de/frontend/catalogs/1239203/2/pdf/complete.pdf' } : {}),
      properties: facts,
    } };
  }
  return product;
}
