import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runToomMvpAudit } from '../scripts/shop-reader/toom-audit.mjs';
import { createToomCache, readToomCache } from '../scripts/shop-reader/toom-cache.mjs';
import { runToomRefresh } from '../scripts/shop-reader/toom-refresh.mjs';

const definitions = JSON.parse(await readFile(new URL('../supabase/canonical-materials.json', import.meta.url), 'utf8'));
const preferred = { ...definitions.find(row => row.slug === 'knauf-perlfix-30kg-v1'), id: 'synthetic-preferred-30' };
const alternative = { ...preferred, id: 'synthetic-actual-10', slug: 'synthetic-perlfix-10', name: 'Knauf Perlfix 10 kg',
  package_quantity: 10, specs: { ...preferred.specs, weight_kg: 10 } };
const intent = { key: 'perlfix', input: 'Perlfix', canonical_slug: preferred.slug, search_term: 'Knauf Perlfix', aliases: [] };
const catalog = [preferred, alternative].map(material => ({ material, aliases: [] }));
const resolveIntent = () => ({ material: preferred, searchTerm: intent.search_term, definition: intent });
const candidate = { name: 'Knauf Perlfix Ansetzgips 10 kg', url: 'https://toom.de/p/synthetic-perlfix/1234567',
  price: 9.99, currency: 'EUR', priceBasis: 'package', priceSource: 'retailer-product-state',
  retrievedAt: '2026-01-02T12:00:00Z', retrievalMethod: 'direct' };
const base = { intents: [intent], catalog, resolveIntent };
async function fixture(t, seedRows = []) {
  const directory = await mkdtemp(join(tmpdir(), 'toom-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'cache.json');
  return { file, cache: createToomCache({ file, seedRows }) };
}
test('broad intent stores a genuine smaller package under its actual material and preserves observed time', async t => {
  const { cache, file } = await fixture(t);
  const report = await runToomMvpAudit({ ...base, cache, reader: { search: async () => { throw new Error('replay must not fetch'); } },
    recorded: { results: [{ query: 'Perlfix', products: [candidate] }] } });
  const row = report.products[0], state = await readToomCache(file);
  assert.equal(row.actual_material_id, alternative.id); assert.equal(row.new_active_price, 9.99);
  assert.equal(row.actual_package.quantity, 10); assert.equal(row.checked_at, candidate.retrievedAt);
  assert.equal(state.prices.length, 1); assert.equal(state.prices[0].material_id, alternative.id);
  assert.equal(state.prices.some(price => price.material_id === preferred.id), false);
  assert.equal(report.checked_live, 0); assert.equal(report.frontend_verified, 0); assert.equal(row.frontend.status, 'pending');
});
test('newly discovered actual variant remains refreshable and preserves its earlier price history', async t => {
  const { cache, file } = await fixture(t);
  await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [candidate] }] } });
  let requests = 0;
  const refreshed = await runToomRefresh({ materials: [preferred, alternative], cache: createToomCache({ file }), reader: {
    readProduct: async url => { requests++; assert.equal(url, candidate.url); return { products: [{ ...candidate, price: 8.99, retrievedAt: '2026-01-03T12:00:00Z' }], method: 'direct' }; },
    search: async () => { throw new Error('existing actual variant must refresh its exact URL'); },
  } });
  assert.equal(requests, 1); assert.equal(refreshed.changed, 1);
  const state = await readToomCache(file);
  assert.deepEqual(state.history.map(row => row.price), [9.99, 8.99]);
  assert.equal(state.prices[0].package_quantity, 10);
});
test('recorded replay cannot erase a newer valid observation or claim a new check', async t => {
  const { cache } = await fixture(t);
  await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [{ ...candidate, price: 8.99, retrievedAt: '2026-01-04T12:00:00Z' }] }] } });
  const report = await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [candidate] }] } });
  assert.equal(report.products[0].new_active_price, 8.99);
  assert.equal(report.products[0].checked_at, '2026-01-04T12:00:00Z');
  assert.equal(report.products[0].observation_source, 'verified-cache'); assert.equal(report.updated, 0);
});
test('live intent searches once then selects a valid actual variant instead of the first wrong-family result', async t => {
  const { cache } = await fixture(t); let searches = 0;
  const report = await runToomMvpAudit({ ...base, cache, reader: { search: async term => {
    searches++; assert.equal(term, 'Knauf Perlfix');
    return { products: [{ ...candidate, name: 'Knauf Rotband 10 kg', price: 1 }, candidate], method: 'direct' };
  } } });
  assert.equal(searches, 1); assert.equal(report.checked_live, 1); assert.equal(report.products[0].new_active_price, 9.99);
  assert.equal(report.products[0].actual_material_id, alternative.id);
  assert.ok(report.products[0].candidate_diagnostics[0].actual_rejection);
});
test('replaying another SKU never silently replaces an existing verified mapping', async t => {
  const { cache } = await fixture(t);
  await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [candidate] }] } });
  const report = await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [{ ...candidate,
    url: 'https://toom.de/p/another-synthetic-product/7654321', price: 8.99, retrievedAt: '2026-01-05T12:00:00Z' }] }] } });
  assert.equal(report.products[0].product_url, candidate.url); assert.equal(report.updated, 0);
  assert.equal((await cache.load()).prices.length, 1);
});
test('an exact valid cached package stays preferred over a replayed close package', async t => {
  const { cache } = await fixture(t);
  const exact = { ...candidate, name: 'Knauf Perlfix 30 kg', price: 25.99, url: 'https://toom.de/p/exact-synthetic/7654321' };
  await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [exact] }] } });
  const report = await runToomMvpAudit({ ...base, cache, reader: {}, recorded: { results: [{ products: [candidate] }] } });
  assert.equal(report.products[0].actual_material_id, preferred.id);
  assert.equal(report.products[0].actual_package.quantity, 30); assert.equal(report.products[0].new_active_price, 25.99);
});
