import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import definitions from "../supabase/canonical-materials.json";
import { filterCatalogSnapshot, getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { getPriceFreshness } from "../src/services/prices";
import { canonicalId, mergeCatalogSnapshot, collectSnapshotObservations } from "../scripts/refresh-catalog-snapshot.mjs";

const material = definitions.find((entry) => entry.slug === "knauf-rotband-30kg-v1")!;
const now = Date.parse("2026-09-24T12:00:00Z"), checkedAt = "2026-09-22T10:00:00Z";
// Synthetic test data only; production snapshot is generated from actual retailer observations.
const row = {
  material_id: canonicalId(material.slug), canonical_slug: material.slug, canonical_version: material.canonical_version,
  canonical_specs: material.specs, store_id: "hornbach", product_name: "Knauf Rotband Haftputzgips 30 kg",
  product_url: "https://www.hornbach.de/p/fixture/123456/", price: 12, unit_price: 0.4, unit: "kg", package_quantity: 30,
  currency: "EUR", checked_at: checkedAt, source: "automatic", price_scope: "chain", verified: true, availability: null,
};
const snapshot = { version: 1, generated_at: "2026-09-24T12:00:00Z", canonical_material_ids: { [material.slug]: row.material_id }, prices: [row] };

test("snapshot UUIDs follow the exact PostgreSQL seed MD5 namespace", () => {
  const md5 = createHash("md5").update(`baumarktfinder:${material.slug}`).digest("hex");
  assert.equal(canonicalId(material.slug).replaceAll("-", ""), md5);
  assert.equal(canonicalId(material.slug), row.material_id);
});
test("cache filters to requested German chains and preserves the real observation timestamp", () => {
  const result = filterCatalogSnapshot(snapshot, ["hornbach"], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].checked_at, checkedAt);
  assert.equal(result[0].price_scope, "chain");
  assert.equal(result[0].availability, null);
  assert.equal(getPriceFreshness(result[0].checked_at, now), "cached");
  assert.deepEqual(filterCatalogSnapshot(snapshot, ["obi"], now), []);
  assert.deepEqual(filterCatalogSnapshot(snapshot, [], now), []);
});
test("snapshot rejects malformed, mismatched or obsolete canonical observations", () => {
  for (const changes of [{ verified: false }, { material_id: "not-a-uuid" }, { material_id: "00000000-0000-0000-0000-000000000000" },
    { canonical_version: 999 }, { canonical_slug: "unknown" }, { canonical_specs: { weight_kg: 25 } }, { package_quantity: 25 },
    { unit: "l" }, { price: 0 }, { currency: "USD" }, { price_scope: "branch" }, { product_url: "https://evil.example/p" },
    { source: "mock" }, { checked_at: "2099-01-01T00:00:00Z" }]) {
    assert.deepEqual(filterCatalogSnapshot({ ...snapshot, prices: [{ ...row, ...changes }] }, ["hornbach"], now), [], JSON.stringify(changes));
  }
});
test("manual cache entries retain their source and missing availability remains unknown", () => {
  const manual = { ...row, source: "manual" };
  const merged = mergeCatalogSnapshot({ ...snapshot, prices: [manual] }, [], definitions, now);
  const result = filterCatalogSnapshot(merged, ["hornbach"], now);
  assert.equal(result[0].source, "manual");
  assert.equal(result[0].availability, null);
  assert.equal(result[0].checked_at, checkedAt);
});
test("a failed or wrong-size retrieval cannot change a cached price or checked_at", async () => {
  for (const products of [[], [{ name: "Knauf Rotband 29 kg", price: 1, priceBasis: "package", priceSource: "json-ld-offer", currency: "EUR", url: row.product_url }]]) {
    const reader = { searchShop: async () => ({ products, discovery: "mapping" }) };
    const { observations } = await collectSnapshotObservations(definitions, { reader, previous: snapshot, stores: ["hornbach"], slugs: [material.slug] });
    assert.deepEqual(observations, []);
    const merged = mergeCatalogSnapshot(snapshot, observations, definitions, now);
    assert.deepEqual(merged.prices, [row]);
  }
});
test("older successful reports cannot replace newer snapshots; valid newer observations can", () => {
  const older = { ...row, checked_at: "2026-09-20T10:00:00Z", price: 9, unit_price: 0.3 };
  assert.deepEqual(mergeCatalogSnapshot(snapshot, [older], definitions, now).prices, [row]);
  const newer = { ...row, checked_at: "2026-09-24T11:00:00Z", price: 15, unit_price: 0.5 };
  assert.deepEqual(mergeCatalogSnapshot(snapshot, [newer], definitions, now).prices, [newer]);
});
test("fresh collection keeps the source timestamp and publishes only validated observed metadata", async () => {
  const retrievedAt = new Date(Date.now() - 1000).toISOString();
  const reader = { searchShop: async () => ({ products: [{ name: row.product_name, url: row.product_url, price: 12,
    priceBasis: "package", priceSource: "json-ld-offer", currency: "EUR", availability: "InStock", retrievedAt,
    observedSpecs: { weight_kg: 30, internal_token: "synthetic-secret" } }] }) };
  const { observations } = await collectSnapshotObservations(definitions, { reader, previous: snapshot, stores: ["hornbach"], slugs: [material.slug] });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].checked_at, retrievedAt);
  assert.equal(observations[0].availability, "InStock");
  assert.equal(observations[0].source, "automatic");
  assert.equal(observations[0].price_scope, "chain");
  assert.equal(JSON.stringify(observations).includes("synthetic-secret"), false);
});
test("public serialization drops unexpected response fields and contains no service credentials", () => {
  const merged = mergeCatalogSnapshot(snapshot, [{ ...row, checked_at: "2026-09-24T11:00:00Z", internal_token: "synthetic-secret", observed_specs: { internal_token: "synthetic-secret" } }], definitions, now);
  assert.equal(JSON.stringify(merged).includes("synthetic-secret"), false);
  assert.equal(JSON.stringify(merged).includes("internal_token"), false);
});
test("bundled fallback never returns a chain the caller did not request", () => {
  assert.deepEqual(getCatalogSnapshot(["unsupported"]), []);
  assert.ok(getCatalogSnapshot(["hornbach"]).every((price) => price.store_id === "hornbach" && price.price_scope === "chain"));
});

test("manual mappings guide fresh retrieval but never relabel an old manual price as automatic", async () => {
  const mapped: unknown[] = [];
  const { observations } = await collectSnapshotObservations(definitions, { previous: { prices: [] }, mappings: { prices: [{ ...row, source: "manual" }] },
    stores: ["hornbach"], slugs: [material.slug], reader: { searchShop: async (_store: string, _query: string, options: { mappedUrl: string }) => {
      mapped.push(options.mappedUrl); return { products: [] };
    } } });
  assert.equal(mapped[0], row.product_url); assert.deepEqual(observations, []);
});
