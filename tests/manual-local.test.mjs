import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareLocalManualImport, validateManualRow } from "../scripts/import-store-prices.mjs";
const definitions = JSON.parse(await readFile(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
// Synthetic manual observation used only in tests, never written to a product database.
const row = { material_slug: "knauf-rotband-30kg-v1", store_id: "obi", product_name: "Knauf Rotband Haftputz 30 kg", product_url: "https://www.obi.de/p/123456/testprodukt", price: 12, price_basis: "package", currency: "EUR", base_unit: "kg", package_quantity: 30, checked_at: "2026-09-20T12:00:00Z", verification_note: "Synthetic manual import test, no actual retailer observation." };
const empty = { version: 1, prices: [] };
test("local manual database uses the same exact product checks and preserves source/date", () => {
  const result = prepareLocalManualImport([row], definitions, empty);
  assert.equal(result.prices.length, 1);
  assert.equal(result.prices[0].source, "manual");
  assert.equal(result.prices[0].checked_at, row.checked_at);
  assert.equal(result.prices[0].unit, "kg");
  assert.equal(result.prices[0].unit_price, 0.4);
  assert.equal(result.prices[0].product_url, row.product_url);
});
test("one wrong variant prevents the complete manual import without mutating saved data", () => {
  const saved = prepareLocalManualImport([row], definitions, empty);
  const before = JSON.stringify(saved);
  assert.throws(() => prepareLocalManualImport([row, { ...row, store_id: "hornbach", product_name: "Rotband 25 kg" }], definitions, saved));
  assert.equal(JSON.stringify(saved), before);
  assert.throws(() => prepareLocalManualImport([row, row], definitions, saved), /Duplicate/);
});
test("an older manual import cannot overwrite a newer verified observation", () => {
  const saved = prepareLocalManualImport([row], definitions, empty);
  const result = prepareLocalManualImport([{ ...row, checked_at: "2026-09-19T12:00:00Z", price: 9 }], definitions, saved);
  assert.equal(result.prices[0].price, 12);
  assert.equal(result.prices[0].checked_at, row.checked_at);
});

test("manual import requires explicit package evidence and rejects every conflicting basis alias", () => {
  const withoutBasis = { ...row };
  delete withoutBasis.price_basis;
  assert.throws(() => prepareLocalManualImport([withoutBasis], definitions, empty), /price_basis=package/);
  for (const basis of ["kg", "l", "m2", "m", "unit", null, ""]) {
    assert.throws(() => prepareLocalManualImport([{ ...row, price_basis: basis }], definitions, empty), /price_basis=package/);
    assert.throws(() => prepareLocalManualImport([{ ...row, priceBasis: basis }], definitions, empty), /price_basis=package/);
  }
  assert.equal(prepareLocalManualImport([{ ...withoutBasis, priceBasis: "package" }], definitions, empty).prices[0].price, 12);
});

test("unit price evidence cannot become a package price or override a contradictory alias", () => {
  for (const key of ["unit_price", "declared_unit_price", "declaredUnitPrice"]) {
    assert.throws(() => prepareLocalManualImport([{ ...row, price: 0.39, [key]: 0.39 }], definitions, empty), /declared unit price/);
    assert.throws(() => prepareLocalManualImport([{ ...row, unit_price: 0.4, [key]: 12 }], definitions, empty), /declared unit price/);
    assert.equal(prepareLocalManualImport([{ ...row, [key]: 0.4 }], definitions, empty).prices[0].price, 12);
    for (const value of [null, "0.40", true, NaN, Infinity, 0, -1]) {
      assert.throws(() => prepareLocalManualImport([{ ...row, [key]: value }], definitions, empty), /declared unit price/);
    }
  }
});

test("only an independently supplied numeric package total is accepted and its evidence survives", () => {
  for (const price of [undefined, null, "12", true, NaN, Infinity, 0]) {
    assert.throws(() => prepareLocalManualImport([{ ...row, price, unit_price: 0.4 }], definitions, empty), /numeric package price/);
  }
  const material = { ...definitions.find((definition) => definition.slug === row.material_slug), id: "synthetic-material" };
  const payload = validateManualRow({ ...row, unit_price: 0.4 }, material);
  assert.equal(payload.price, 12);
  assert.equal(payload.match_evidence.price_basis, "package");
  assert.equal(payload.match_evidence.verification_note, row.verification_note);
  assert.deepEqual(payload.match_evidence.declared_unit_prices, { unit_price: 0.4 });
});

test("new import validation leaves previous saved observations and their dates intact", () => {
  const saved = prepareLocalManualImport([row], definitions, empty);
  const before = JSON.stringify(saved);
  const result = prepareLocalManualImport([{ ...row, store_id: "hornbach", product_url: "https://www.hornbach.de/p/testprodukt/123456/" }], definitions, saved);
  assert.deepEqual(result.prices.find((price) => price.store_id === "obi"), saved.prices[0]);
  assert.equal(JSON.stringify(saved), before);
  assert.throws(() => prepareLocalManualImport([{ ...row, priceBasis: "kg" }], definitions, saved), /price_basis=package/);
  assert.equal(JSON.stringify(saved), before);
});
