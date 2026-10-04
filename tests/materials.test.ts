import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMaterialSearch, searchMaterialCatalog, type CachedMaterial } from '../src/services/materialSuggestions';
import { getPriceFreshness, validateStorePrice, fetchStorePrices } from '../src/services/prices';
import { buildStandard } from '../scripts/shop-reader/product-standardizer.mjs';

const definitions = JSON.parse(readFileSync(new URL('../supabase/canonical-materials.json', import.meta.url), 'utf8'));
const catalog: CachedMaterial[] = definitions.map((entry: CachedMaterial['material'] & { slug: string; aliases: string[] }) => ({
  material: { ...entry, id: entry.slug, active: true }, aliases: entry.aliases,
}));

test('canonical seeds cover required categories without retailer prices', () => {
  assert.ok(catalog.length >= 24);
  for (const { material } of catalog) {
    assert.ok(material.specs && Object.keys(material.specs).length);
    assert.ok(material.package_quantity > 0);
    assert.ok(['kg', 'l', 'm', 'm2', 'piece'].includes(material.base_unit));
    assert.equal(Object.hasOwn(material, 'price'), false);
    assert.ok(buildStandard(material), `Seed must be supported by the exact matcher: ${material.name}`);
  }
});
test('Rigips, Regips and GK preserve both explicit standard board variants', () => {
  for (const query of ['rig', 'rigips', 'Regips', 'GK', 'gk platte', 'rigips platte']) {
    const results = searchMaterialCatalog(catalog, query);
    assert.ok(results.some((item) => item.id === 'gipskarton-standard-12-5-1200-600-v1'), query);
    assert.ok(results.some((item) => item.id === 'gipskarton-standard-12-5-2000-1250-v1'), query);
  }
});
test('umlauts, decimal commas, case and abbreviations normalize', () => {
  assert.equal(normalizeMaterialSearch('  DÄMMUNG  12,5 × 600  '), 'daemmung 12.5 600');
  assert.ok(searchMaterialCatalog(catalog, 'Dämmung').some((row) => row.id.includes('glaswolle')));
  assert.ok(searchMaterialCatalog(catalog, 'TN25').some((row) => row.id === 'tn-3-5-25-1000-v1'));
});
test('one spelling edit and a transposition are tolerated for words', () => {
  assert.ok(searchMaterialCatalog(catalog, 'rotbamd').some((row) => row.id.includes('rotband')));
  assert.ok(searchMaterialCatalog(catalog, 'rotbnad').some((row) => row.id.includes('rotband')));
  assert.equal(searchMaterialCatalog(catalog, 'robxamd').length, 0);
});
test('dimensions do not receive fuzzy substitution and unknown query stays unresolved', () => {
  assert.equal(searchMaterialCatalog(catalog, 'gipskarton 9,5').length, 0);
  assert.equal(searchMaterialCatalog(catalog, 'quantenbeton').length, 0);
  assert.equal(searchMaterialCatalog(catalog, '  ').length, 0);
});
test('deactivated and legacy unreviewed definitions are excluded', () => {
  const copied = structuredClone(catalog);
  for (const entry of copied) entry.material.canonical_version = 0;
  assert.equal(searchMaterialCatalog(copied, 'GK').length, 0);
  for (const entry of copied) { entry.material.canonical_version = 1; entry.material.active = false; }
  assert.equal(searchMaterialCatalog(copied, 'GK').length, 0);
});
test('autocomplete never exceeds ten results', () => assert.ok(searchMaterialCatalog(catalog, 'g').length <= 10));

const now = Date.parse('2026-09-23T10:00:00Z');
const valid = {
  material_id: 'canonical-material', store_id: 'hornbach', product_name: 'Test package, 30 kg',
  product_url: 'https://www.hornbach.de/p/test-product/12345/', price: 11.59, unit_price: 0.39,
  package_quantity: 30, unit: 'kg', checked_at: '2026-09-23T09:00:00Z', source: 'automatic',
  price_scope: 'chain', verified: true, currency: 'EUR', availability: null,
};
const validate = (overrides: Record<string, unknown> = {}) => validateStorePrice({ ...valid, ...overrides }, 'canonical-material', ['hornbach'], now);

test('package price remains distinct from unit price', () => {
  const result = validate();
  assert.ok(result);
  assert.equal(result.price, 11.59);
  assert.equal(result.unit_price, 0.39);
});
test('price is scoped by material and chain together', () => {
  assert.equal(validate({ material_id: 'another-material' }), null);
  assert.equal(validate({ store_id: 'obi' }), null);
  assert.equal(validate({ verified: false }), null);
});
test('invalid amounts and quantity fail closed', () => {
  for (const price of [0, -1, NaN, Infinity, 100001, '11.59', null]) assert.equal(validate({ price }), null);
  for (const package_quantity of [0, -1, NaN, Infinity, '30']) assert.equal(validate({ package_quantity }), null);
  assert.equal(validate({ unit_price: 7 }), null);
});
test('only exact official German product links can accompany prices', () => {
  for (const product_url of ['https://www.hornbach.de/', 'https://www.hornbach.de/search?q=test', 'https://www.hornbach.de/s/test', 'https://evil.test/product', 'https://www.hornbach.de.evil.test/p/123', 'https://user:pass@www.hornbach.de/p/123', 'http://www.hornbach.de/p/123', 'https://www.hornbach.at/p/123', 'https://www.hornbach.de:8000/p/123']) {
    assert.equal(validate({ product_url }), null, product_url);
  }
});
test('currency, scope, source and timestamps are validated', () => {
  for (const invalid of [{ currency: 'CHF' }, { price_scope: 'branch' }, { source: 'mock' }, { checked_at: 'invalid' }, { checked_at: '2026-09-24T00:00:00Z' }]) assert.equal(validate(invalid), null);
});
test('old valid and manual observations stay available with explicit freshness', () => {
  assert.ok(validate({ checked_at: '2025-01-01T00:00:00Z', source: 'manual' }));
  assert.equal(getPriceFreshness('2026-09-23T09:00:00Z', now), 'fresh');
  assert.equal(getPriceFreshness('2026-09-21T09:00:00Z', now), 'cached');
  assert.equal(getPriceFreshness('2026-08-23T09:00:00Z', now), 'stale');
  assert.equal(getPriceFreshness('invalid', now), 'stale');
});
test('unsupported chain queries require no database call', async () => {
  const response = await fetchStorePrices('any', ['unknown']);
  assert.equal(response.prices.size, 0);
  assert.equal(response.error, null);
});
