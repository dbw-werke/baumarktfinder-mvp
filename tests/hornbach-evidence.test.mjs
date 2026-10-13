import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confirmHornbachPackagePrices } from '../scripts/shop-reader/retailer-state.mjs';
import { buildStandard, extractSpecifications, normalizeProductPrice } from '../scripts/shop-reader/product-standardizer.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const definitions = await read('../supabase/canonical-materials.json');
const mesh = await read('../docs/evidence/hornbach-mesh-20261012.json');
const observations = await read('../docs/evidence/hornbach-missing-raw-20261012.json');
const packageProofs = await read('../docs/evidence/hornbach-package-proof-20261012.json');
const standard = slug => buildStandard(definitions.find(row => row.slug === slug));
const product = key => observations.find(row => row.key === key).result[0];

// Reconstruct only the public, SKU-bound fields captured in the official-page evidence.
function confirmObservedPackage(candidate, price = candidate.price) {
  const proof = packageProofs.find(row => row.url === candidate.url);
  assert.ok(proof, candidate.url);
  const selected = { __typename: 'Product', abstractProductId: candidate.externalId,
    title: proof.name, url: proof.url, defaultPrice: proof.defaultPrice, basicPrice: proof.basicPrice,
    defaultSalesUnit: proof.defaultSalesUnit, attributeList: proof.attributes,
    offerDV: { merchant: proof.merchant, canBeAddedToCart: proof.canBeAddedToCart } };
  const html = `<script>\nwindow.__ARTICLE_DETAIL_APOLLO_STATE__ = ${JSON.stringify({ selected })}\n</script>`;
  return confirmHornbachPackagePrices(html, [{ ...candidate, name: proof.name, price, priceBasis: null }], proof.url)[0];
}

test('HORNBACH screw package contains 1000 screws and costs the observed pack total, not a one-screw price', () => {
  const candidate = product('tn-schrauben');
  const verified = confirmObservedPackage(candidate);
  const normalized = normalizeProductPrice(verified, standard('tn-3-5-25-1000-v1'));
  assert.ok(normalized);
  assert.equal(normalized.price, 10.55);
  assert.equal(normalized.packageQuantity, 1000);
  assert.equal(normalized.matchEvidence.observed_specs.length_mm, 25);
  assert.equal(normalized.url, candidate.url);
  assert.equal(normalizeProductPrice(confirmObservedPackage(candidate, 0.01), standard('tn-3-5-25-1000-v1')), null);
});

test('HORNBACH mesh aperture does not replace the independently stated roll dimensions', () => {
  const candidate = mesh.products[0];
  const spec = standard(mesh.material_slug);
  const extracted = extractSpecifications(candidate, spec);
  assert.deepEqual(extracted.conflicts, []);
  assert.equal(extracted.values.length_mm, 10000);
  assert.equal(extracted.values.width_mm, 1000);
  assert.equal(extracted.values.grammage_g_m2, 160);
  const normalized = normalizeProductPrice(candidate, spec);
  assert.ok(normalized);
  assert.equal(normalized.packageQuantity, 10);
  assert.equal(normalized.price, 28.05);
  assert.notEqual(normalized.price, candidate.declaredUnitPrice * normalized.packageQuantity);
  assert.equal(normalizeProductPrice({ ...candidate, name: candidate.name.replace('10 m x 1 m', '10 m x 2 m') }, spec), null);
});

test('HORNBACH ISOVER preserves the stated 76.36 EUR pack total instead of reconstructing it from 8.48 EUR/m²', () => {
  const candidate = product('mineralwolle');
  const spec = standard('steinwolle-040-40-9m2-v1');
  const verified = confirmObservedPackage(candidate);
  const normalized = normalizeProductPrice(verified, spec);
  assert.ok(normalized);
  assert.equal(normalized.price, 76.36);
  assert.equal(normalized.declaredUnitPrice, 8.48);
  assert.equal(normalized.packageQuantity, 9);
  assert.equal(normalized.matchEvidence.observed_specs.pieces, 12);
  assert.equal(normalized.matchEvidence.observed_specs.type, 'steinwolle-trennwandplatte');
  assert.equal(normalized.matchEvidence.observed_specs.thermal_conductivity, 0.040);
  assert.equal(normalized.url, candidate.url);
  for (const incorrectTotal of [8.48, 76.32]) {
    assert.equal(normalizeProductPrice(confirmObservedPackage(candidate, incorrectTotal), spec), null);
  }
});

test('HORNBACH insulation still rejects conflicting thickness, package area and glass wool identity', () => {
  const candidate = product('mineralwolle');
  const spec = standard('steinwolle-040-40-9m2-v1');
  for (const [attribute, value] of [['Stärke', '50 mm'], ['Packinhalt', '8,5 m²'], ['Material', 'Glaswolle']]) {
    const changed = { ...candidate, attributes: candidate.attributes.map(row => row.name === attribute ? { ...row, value } : row) };
    assert.equal(normalizeProductPrice(changed, spec), null, `${attribute}: ${value}`);
  }
});
