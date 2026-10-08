import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToomCache, readToomCache, validToomRecord } from "../scripts/shop-reader/toom-cache.mjs";
import { refreshToomProduct, runToomRefresh } from "../scripts/shop-reader/toom-refresh.mjs";
const definitions = JSON.parse(await readFile(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
const material = { ...definitions.find(m => m.slug === "knauf-uniflott-25kg-v1"), id: "synthetic-uniflott" };
// Synthetic observations, never used by the application or persisted outside temporary test directories.
const stored = { material_id: material.id, store_id: "toom", product_name: "Knauf Uniflott 25 kg", product_url: "https://toom.de/p/fixture/1234567",
  price: 47, unit_price: 1.88, unit: "kg", package_quantity: 25, currency: "EUR", checked_at: "2026-01-01T00:00:00Z", source: "manual", price_scope: "chain", verified: true };
const product = { name: stored.product_name, url: stored.product_url, price: 39, declaredUnitPrice: 1.56, oldPrice: 47, currency: "EUR", priceBasis: "package", priceSource: "retailer-product-state", retrievedAt: "2026-01-02T00:00:00Z" };
async function fixture(t, rows = [stored]) {
  const dir = await mkdtemp(join(tmpdir(), "toom-refresh-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "cache.json"); return { file, cache: createToomCache({ file, seedRows: rows }) };
}
test("exact stored URL refresh changes active package price, preserves previous observation and updates checked_at", async t => {
  const { file, cache } = await fixture(t); let searches = 0;
  const row = await refreshToomProduct({ material, stored, cache, reader: {
    readProduct: async url => { assert.equal(url, stored.product_url); return { products: [product], method: "direct" }; },
    search: async () => { searches++; throw new Error("must not search"); },
  } });
  assert.equal(searches, 0); assert.equal(row.price_changed, true); assert.equal(row.new_active_price, 39);
  assert.equal(row.old_price, 47); assert.equal(row.unit_price, 1.56); assert.equal(row.cache_updated, true);
  const state = await readToomCache(file); assert.equal(state.prices[0].price, 39);
  assert.equal(state.prices[0].checked_at, product.retrievedAt);
  assert.deepEqual(state.history.map(r => r.price), [47, 39]);
});
test("unchanged price updates verification time without repeatedly growing change history", async t => {
  const { cache } = await fixture(t);
  const reader = { readProduct: async () => ({ products: [{ ...product, price: 47, oldPrice: null, declaredUnitPrice: 1.88 }], method: "playwright" }) };
  const row = await refreshToomProduct({ material, stored, cache, reader });
  assert.equal(row.price_changed, false); assert.equal(row.cache_updated, true); assert.equal(row.checked_at, product.retrievedAt);
  const state = await cache.load(); assert.equal(state.prices[0].price, 47);
});
test("failed refresh and database write never delete the valid cached price", async t => {
  const { cache } = await fixture(t);
  const fail = await refreshToomProduct({ material, stored, cache, reader: { readProduct: async () => ({ products: [], reason: "captcha", method: "direct" }) } });
  assert.equal(fail.failure_reason, "captcha"); assert.equal(fail.checked_at, stored.checked_at);
  assert.deepEqual((await cache.load()).prices, [stored]);
  const saved = await refreshToomProduct({ material, stored, cache, reader: { readProduct: async () => ({ products: [product], method: "direct" }) },
    storage: { save: async () => { throw new Error("PGRST205:verified_store_prices"); } } });
  assert.equal(saved.cache_updated, true); assert.equal(saved.db_updated, false); assert.match(saved.db_failure_reason, /PGRST205/);
  assert.equal((await cache.load()).prices[0].price, 39);
});
test("dead URL searches for a valid replacement; live redirect to another SKU is refused", async t => {
  const { cache } = await fixture(t); let searches = 0;
  const replacement = { ...product, url: "https://toom.de/p/new-fixture/7654321" };
  const reader = { readProduct: async () => ({ products: [replacement], method: "direct" }), search: async () => { searches++; return { products: [replacement], method: "direct" }; } };
  const rejected = await refreshToomProduct({ material, stored, cache, reader });
  assert.equal(rejected.failure_reason, "no_valid_product_match"); assert.equal(searches, 0);
  reader.readProduct = async () => ({ products: [], removed: true, reason: "http_404", method: "playwright" });
  const accepted = await refreshToomProduct({ material, stored, cache, reader });
  assert.equal(searches, 1); assert.equal(accepted.replacement, true); assert.equal(accepted.product_url, replacement.url);
  assert.equal((await cache.load()).history[0].product_url, stored.product_url);
});
test("wrong family, package, unit-only or stale observations cannot replace a verified record", async t => {
  const { cache } = await fixture(t);
  for (const bad of [{ ...product, name: "Knauf Rotband 25 kg" }, { ...product, name: "Knauf Uniflott 5 kg" },
    { ...product, priceBasis: "kg" }, { ...product, declaredUnitPrice: 3 }, { ...product, retrievedAt: "2025-01-01T00:00:00Z" }]) {
    const result = await refreshToomProduct({ material, stored, cache, reader: { readProduct: async () => ({ products: [bad], method: "direct" }) } });
    assert.ok(result.failure_reason); assert.deepEqual((await cache.load()).prices, [stored]);
  }
});
test("hourly default only checks all stored products sequentially and preserves cache on schema errors", async t => {
  const { cache } = await fixture(t); let active = 0, searches = 0;
  const reader = { readProduct: async () => { assert.equal(active++, 0); await Promise.resolve(); active--; return { products: [product], method: "direct" }; }, search: async () => { searches++; } };
  const report = await runToomRefresh({ materials: [material, { ...material, id: "other" }], cache, reader,
    storage: { loadProducts: async () => { throw new Error("missing_schema"); }, save: async () => { throw new Error("invalid_key"); } } });
  assert.equal(report.checked, 1); assert.equal(report.changed, 1); assert.equal(searches, 0);
  assert.equal(report.schema_error, "missing_schema"); assert.equal(report.db_updated, 0);
});
test("new successful discovery is automatically included in the next ordinary refresh", async t => {
  const { file, cache } = await fixture(t, []);
  let calls = 0;
  const reader = { search: async () => ({ products: [product], method: "direct" }), readProduct: async () => { calls++; return { products: [{ ...product, retrievedAt: "2026-01-03T00:00:00Z" }], method: "direct" }; } };
  const discovery = await runToomRefresh({ materials: [material], cache, reader, discover: true });
  assert.equal(discovery.refreshable_after, 1);
  const next = await runToomRefresh({ materials: [material], cache: createToomCache({ file }), reader });
  assert.equal(calls, 1); assert.equal(next.checked, 1); assert.equal(next.changed, 0);
});
test("older DB records, unit-only malformed records and foreign URLs do not mask latest price", async t => {
  const { cache } = await fixture(t);
  assert.equal(validToomRecord({ ...stored, product_url: "https://evil.test/p/foo/123" }), false);
  await cache.save({ ...stored, price: 39, unit_price: 1.56, checked_at: product.retrievedAt });
  await cache.merge([stored, { ...stored, price: 1.88, checked_at: "2026-01-04T00:00:00Z" }]);
  assert.equal((await cache.load()).prices[0].price, 39);
});
