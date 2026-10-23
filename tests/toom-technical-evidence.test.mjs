import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readToomIdentity, parseToomSellingState, createToomReader } from '../scripts/shop-reader/toom-reader.mjs';
import { buildStandard, chooseNormalizedProduct } from '../scripts/shop-reader/product-standardizer.mjs';

const definitions = JSON.parse(await readFile(new URL('../supabase/canonical-materials.json', import.meta.url), 'utf8'));
const specs = slug => buildStandard(definitions.find(row => row.slug === slug));
const sheet = (sku, suffix = '') => `https://static.toom.de/produkte/bilder/${sku}/technisches_datenblatt_${sku}${suffix}.pdf`;
const cases = [
  ['3053281', 'Knauf', "Ansatzgips 'Perflix' 25 kg", 'knauf-perlfix-25kg-v1', [], sheet('3053281', '_31')],
  ['8350160', 'toom', 'Baufolie extra stark 4 x 25 m 200 g/m² transluzent', 'pe-folie-200-4000-25000-v1', [
    ['Breite', '4 m'], ['Länge', '25 m'], ['Stärke', '200 µ'], ['Material', 'Polyethylen (PE)'],
  ]],
  ['3150288', 'Isover', "Klimamembran 'Vario Duplex UV' 60 m²", 'dampfbremse-variabel-03-5-1500-40000-v1', [
    ['Breite', '1,5 m'], ['Länge', '4000 cm'], ['Eigenschaft', 'variabler sd-Wert von 0,3 bis 5,0 m'],
  ]],
  ['2368047', 'Soudal', 'PU-Montageschaum B2 750 ml', 'pu-schaum-1k-b2-genius-champagner-750ml-v1', [], sheet('2368047')],
  ['2360002', 'toom', 'Sanitärsilikon weiß 310 ml', 'sanitaer-silikon-acetat-weiss-310ml-v1', [], sheet('2360002')],
];
// Minimal product-bound fields observed 21 October; test selling amounts are synthetic.
function fixture(entry, amend = () => {}) {
  const [sku, brand, name, , attributes, document] = entry;
  const url = `https://toom.de/p/fixture/${sku}`;
  const data = { basic_info: { sku, name }, details: { base_quantity_unit: 'PCE', sap_artikelnummer: '1000000000000', brand: { name: brand } },
    meta_data: { canonical_url: url }, characteristics: { properties: attributes.map(([label, value]) => ({ label, value })) },
    documents: document ? [{ type: 'technischesdatenblatt', url: document }] : [] };
  amend(data);
  const html = `<div id="root" data-props="${encodeURIComponent(JSON.stringify({ content: data }))}"></div>`;
  return { url, html, identity: readToomIdentity(html, url) };
}
for (const entry of cases) test(`toom refresh validates SKU ${entry[0]} using its own technical evidence`, () => {
  const { identity } = fixture(entry);
  assert.ok(identity);
  const product = parseToomSellingState(identity, { deliver: { price: { regular: 17.23 } } }).products[0];
  const selected = chooseNormalizedProduct([product], specs(entry[3]));
  assert.ok(selected, entry[3]);
  assert.equal(selected.price, 17.23);
  if (entry[5]) assert.equal(product.metadata.technical_evidence.document_url, entry[5]);
  if (entry[0] === '2368047') {
    assert.equal(selected.matchEvidence.observed_specs.color, 'champagner');
    assert.match(selected.name, /Genius Gun, champagner/);
  }
  if (entry[0] === '3150288') assert.equal(selected.matchEvidence.observed_specs.sd_min_m, 0.3);
});
test('technical supplementation never supplies a price or copies a missing canonical dimension', () => {
  const { identity } = fixture(cases[1], data => { data.characteristics.properties = data.characteristics.properties.filter(row => row.label !== 'Stärke'); });
  assert.equal(identity.product.observedSpecs.thickness_mm, undefined);
  assert.equal(parseToomSellingState(identity, {}).products.length, 0);
  const product = parseToomSellingState(identity, { deliver: { price: { regular: 17.23 } } }).products[0];
  assert.equal(chooseNormalizedProduct([product], specs(cases[1][3])), null);
});
test('unrelated SKU or changed linked documentation cannot inherit verified chemical properties', () => {
  for (const entry of [cases[3], cases[4]]) {
    const unknown = [...entry]; unknown[0] = '9999999';
    const unrelated = fixture(unknown).identity;
    assert.equal(unrelated.product.metadata?.technical_evidence, undefined);
    assert.equal(chooseNormalizedProduct(parseToomSellingState(unrelated, { deliver: { price: { regular: 17.23 } } }).products, specs(entry[3])), null);
    for (const amend of [data => { data.documents = []; }, data => { data.documents[0].url += '?different-version'; }]) {
      const { identity } = fixture(entry, amend);
      if (!identity) continue;
      assert.equal(identity.product.metadata?.technical_evidence, undefined);
      const product = parseToomSellingState(identity, { deliver: { price: { regular: 17.23 } } }).products[0];
      assert.equal(chooseNormalizedProduct([product], specs(entry[3])), null);
    }
  }
});
test('current contradictory facts invalidate static technical supplementation and conflicting live measurements', () => {
  for (const [entry, label, value] of [
    [cases[3], 'Ausführung', '2K B2'], [cases[3], 'Ausführung', '1K B1'], [cases[3], 'Farbe', 'weiß'],
    [cases[4], 'Aushärtungssystem', 'neutralvernetzend'], [cases[0], 'Serie', 'Rotband'],
    [cases[1], 'Stärke', '100 µ'], [cases[2], 'Eigenschaft', 'sd-Wert von 0,5 bis 5,0 m'],
  ]) assert.equal(fixture(entry, data => data.characteristics.properties.push({ label, value })).identity, null);
});
test('toom discovery uses the short canonical search query while keeping detailed specifications for matching', async () => {
  for (const slug of ['direktabhaenger-cd-125mm-v1', 'noniusabhaenger-cd-130mm-v1', cases[2][3]]) {
    const material = definitions.find(row => row.slug === slug) || definitions.find(row => row.product_family === (slug.startsWith('direkt') ? 'direktabhaenger' : 'noniusabhaenger'));
    let requested;
    const reader = createToomReader({ http: { get: async url => { requested = url; throw Object.assign(new Error('stop after search request'), { code: 'robots-disallowed' }); } } });
    await reader.search(material);
    assert.equal(requested, `https://toom.de/s/${encodeURIComponent(buildStandard(material).search)}/`);
    assert.notEqual(buildStandard(material).search, material.name);
    await reader.close();
  }
});
