import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rankCanonicalVariants, findStoreProduct } from "../scripts/shop-reader/product-alternatives.mjs";
import { updateMaterial } from "../scripts/update-store-prices.mjs";
import { canonicalId, collectSnapshotObservations } from "../scripts/refresh-catalog-snapshot.mjs";

const definitions = JSON.parse(await readFile(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
const catalog = definitions.map((material) => ({ ...material, id: canonicalId(material.slug) }));
const preferred = catalog.find((material) => material.slug === "knauf-rotband-30kg-v1");
const alternative = catalog.find((material) => material.slug === "knauf-rotband-25kg-v1");
function offer(material, price = 12, store = "hornbach") {
  const url = store === "hornbach" ? "https://www.hornbach.de/p/test-rotband/123456/"
    : store === "obi" ? "https://www.obi.de/p/123456/test-rotband" : "https://toom.de/p/test-rotband/123456/";
  return { name: material.name, url, price, currency: "EUR", priceBasis: "package", priceSource: "json-ld-offer",
    soldIndividually: true, retrievedAt: new Date().toISOString() };
}
const repository = { mapping: async () => null };

test("retrieval prefers exact package even when an alternative is cheaper", async () => {
  let requests = 0;
  const result = await findStoreProduct(preferred, { repository, storeId: "hornbach", canonicalMaterials: catalog,
    reader: { searchShop: async () => { requests++; return { products: [offer(alternative, 5), offer(preferred, 15)] }; } } });
  assert.equal(result.actualMaterial.id, preferred.id); assert.equal(result.product.price, 15);
  assert.equal(result.matchKind, "exact"); assert.equal(requests, 1);
});

test("nearest compatible canonical size is retrieved before a farther cheaper size", async () => {
  const far = { ...alternative, id: "far", slug: "test-rotband-5", name: "Knauf Rotband 5 kg", store_search_term: "Knauf Rotband 5 kg",
    package_quantity: 5, specs: { ...alternative.specs, weight_kg: 5 } };
  assert.deepEqual(rankCanonicalVariants(preferred, [far, alternative]).map((row) => row.material.id), [alternative.id, far.id]);
  const requests = [];
  const result = await findStoreProduct(preferred, { repository, storeId: "hornbach", canonicalMaterials: [far, alternative],
    reader: { searchShop: async (_store, query) => {
      requests.push(query); return { products: query === preferred.store_search_term ? [offer(far, 3)] : [offer(alternative, 10)] };
    } } });
  assert.equal(result.actualMaterial.id, alternative.id); assert.equal(result.product.price, 10);
  assert.equal(result.matchKind, "alternative"); assert.equal(requests.length, 2);
});

test("wrong type, thickness and undeclared sizes fail; a brand preference is soft", async () => {
  const wrongType = { ...alternative, id: "wrong", specs: { ...alternative.specs, type: "ansetzgips" } };
  const wrongBrand = { ...alternative, id: "other-brand", brand: "Other" };
  assert.deepEqual(rankCanonicalVariants(preferred, [wrongType, wrongBrand]).map((entry) => entry.material.id), [wrongBrand.id]);
  const sheet = catalog.find((m) => m.slug === "gipskarton-standard-12-5-1200-600-v1");
  assert.equal(rankCanonicalVariants(sheet, [{ ...sheet, id: "thin", specs: { ...sheet.specs, thickness_mm: 9.5 } }]).length, 0);
  const result = await findStoreProduct(preferred, { repository, storeId: "hornbach", canonicalMaterials: [preferred],
    reader: { searchShop: async () => ({ products: [offer(alternative)] }) } });
  assert.equal(result.product, null);
});

test("alternative saves its actual material ID, original package quantity and observed total", async () => {
  const writes = [];
  const result = await updateMaterial(preferred, { stores: ["hornbach"], canonicalMaterials: catalog,
    repository: { ...repository, save: async (payload) => writes.push(payload) },
    reader: { searchShop: async () => ({ products: [offer(alternative, 9.99)] }) } });
  assert.equal(writes.length, 1); assert.equal(writes[0].material_id, alternative.id);
  assert.equal(writes[0].package_quantity, 25); assert.equal(writes[0].price, 9.99);
  assert.equal(result.stores[0].preferred_material_id, preferred.id); assert.equal(result.stores[0].match_kind, "alternative");
});

test("cross-store outlier check does not compare different package totals", async () => {
  const small = { ...alternative, id: "small", name: "Knauf Rotband 5 kg", package_quantity: 5, specs: { ...alternative.specs, weight_kg: 5 } };
  const writes = [];
  const result = await updateMaterial(preferred, { stores: ["hornbach", "obi", "toom"], canonicalMaterials: [small],
    repository: { ...repository, save: async (payload) => writes.push(payload) },
    reader: { searchShop: async (store) => ({ products: [offer(store === "hornbach" ? small : preferred, store === "hornbach" ? 3 : 15, store)] }) } });
  assert.equal(writes.length, 3); assert.equal(result.stores[0].status, "saved");
  assert.equal(writes.find((row) => row.store_id === "hornbach").price, 3);
});

test("base-unit-only prices still fail and a blocked retailer is not retried for variants", async () => {
  const empty = await findStoreProduct(preferred, { repository, storeId: "hornbach", canonicalMaterials: catalog,
    reader: { searchShop: async () => ({ products: [{ ...offer(alternative, 0.39), priceBasis: "kg" }] }) } });
  assert.equal(empty.product, null);
  let requests = 0;
  await assert.rejects(findStoreProduct(preferred, { repository, storeId: "hornbach", canonicalMaterials: catalog,
    reader: { searchShop: async () => { requests++; throw Object.assign(new Error("blocked"), { code: "blocked" }); } } }));
  assert.equal(requests, 1);
});

test("snapshot preserves actual canonical identity for a preferred-material alternative", async () => {
  const { observations } = await collectSnapshotObservations(definitions, { stores: ["hornbach"], slugs: [preferred.slug],
    reader: { searchShop: async () => ({ products: [offer(alternative, 10)] }) } });
  assert.equal(observations.length, 1); assert.equal(observations[0].material_id, alternative.id);
  assert.equal(observations[0].canonical_slug, alternative.slug); assert.equal(observations[0].price, 10);
  assert.equal(observations[0].canonical_specs.weight_kg, 25);
});

test("missing-price trace distinguishes wrong packages, unit-only prices and blocked collection without writes", async () => {
  let writes = 0;
  const result = await updateMaterial(preferred, { stores: ["hornbach", "obi"], repository: { ...repository, save: async () => { writes++; } },
    reader: { searchShop: async (store) => {
      if (store === "obi") throw Object.assign(new Error("blocked"), { code: "blocked" });
      return { discovery: "provided-candidate", products: [offer(alternative), { ...offer(preferred, 0.39), priceBasis: "kg" }] };
    } } });
  const [mismatch, blocked] = result.stores;
  assert.equal(mismatch.chain_id, "hornbach"); assert.equal(mismatch.requested_material_id, preferred.id);
  assert.equal(mismatch.reader_products_found, 2); assert.equal(mismatch.saved_to_supabase, false);
  assert.match(mismatch.rejection_reason, /wrong-specification:weight_kg/);
  assert.match(mismatch.rejection_reason, /base-unit-price-only/);
  assert.equal(mismatch.attempts[0].products[0].observed_specs.weight_kg, 25);
  assert.equal(blocked.reader_products_found, 0); assert.equal(blocked.rejection_reason, "blocked");
  assert.equal(blocked.attempts[0].rejection_reason, "blocked"); assert.equal(writes, 0);
});

test("verified trace uses the alternative's actual package and distinguishes dry runs from database failures", async () => {
  const options = { stores: ["hornbach"], canonicalMaterials: catalog, repository: { ...repository, save: async () => { throw new Error("unavailable"); } },
    reader: { searchShop: async () => ({ products: [offer(alternative, 9.99)] }) } };
  const dry = (await updateMaterial(preferred, { ...options, dryRun: true })).stores[0];
  assert.equal(dry.package_size.quantity, 25); assert.equal(dry.package_price, 9.99);
  assert.equal(dry.product_url, offer(alternative).url); assert.equal(dry.saved_to_supabase, false);
  assert.equal(dry.rejection_reason, null);
  const failed = (await updateMaterial(preferred, options)).stores[0];
  assert.equal(failed.rejection_reason, "database-save-failed"); assert.equal(failed.saved_to_supabase, false);
  assert.equal(failed.retained_previous_price, true); assert.equal(failed.matched_product, alternative.name);
});
