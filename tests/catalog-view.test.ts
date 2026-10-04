import test from "node:test";
import assert from "node:assert/strict";
import { closestBranch, filterCatalog } from "../src/lib/catalogView";
import { routeFallback, type StoreCandidate } from "../src/lib/stores";
import type { StorePrice } from "../src/services/prices";

// Synthetic fixtures only. No example store or price is served to the application.
const candidate: StoreCandidate = { id: "obi", name: "OBI Test", placeId: "fixture", address: "Teststraße", location: { lat: 50, lng: 8 }, countryCode: "DE", airDistanceMeters: 1000, attributions: [] };
const stores = [routeFallback(candidate), routeFallback({ ...candidate, id: "hornbach", placeId: "fixture-2", airDistanceMeters: 5000 }), routeFallback({ ...candidate, placeId: "fixture-3", airDistanceMeters: 500 })];
const sample: StorePrice = { store_id: "obi", material_id: "variant-25", product_name: "Dämmung Test 25 mm", product_url: "https://www.obi.de/p/123/test", price: 10, unit_price: 10, unit: "piece", package_quantity: 1, currency: "EUR", price_scope: "chain", source: "manual", checked_at: new Date().toISOString(), availability: null };
const offers = [sample, { ...sample, store_id: "hornbach", material_id: "variant-50", product_name: "Dämmung Test 50 mm" }, { ...sample, store_id: "bauhaus" }];
test("address-only catalogue includes all materials but only chains with nearby branches", () => {
  assert.equal(filterCatalog(offers, stores, "").length, 2);
  assert.equal(filterCatalog(offers, [], "").length, 0);
  assert.equal(filterCatalog(offers, stores, "", "hornbach")[0].material_id, "variant-50");
});
test("exact selected variants never mix dimensions, and free-text supports German spelling", () => {
  assert.deepEqual(filterCatalog(offers, stores, "Dämmung", "all", ["variant-25"]), [sample]);
  assert.deepEqual(filterCatalog(offers, stores, "daemmung 25"), [sample]);
  assert.deepEqual(filterCatalog(offers, stores, "daemmung 25mm"), [sample]);
  assert.equal(filterCatalog(offers, stores, "Zement").length, 0);
});
test("catalogue route goes to nearest branch of that offer's chain, without reordering input", () => {
  assert.equal(closestBranch(stores, "obi")?.placeId, "fixture-3");
  assert.equal(closestBranch(stores, "bauhaus"), undefined);
  assert.equal(stores[0].placeId, "fixture");
});
