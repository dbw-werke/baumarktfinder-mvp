import test from "node:test";
import assert from "node:assert/strict";
import { hasComparableSpecification, productPurposeConflict } from "../src/lib/productCompatibility.mjs";
import { getVariantDistance, selectChainOffer, type CanonicalMaterial } from "../src/lib/productComparison";
import type { StorePrice } from "../src/services/prices";

const vario = (quantity: number): CanonicalMaterial => ({ id: `vario-${quantity}`, name: `Rigips VARIO Fugenspachtel ${quantity} kg`,
  product_family: "vario", brand: "Rigips", base_unit: "kg", package_quantity: quantity, canonical_version: 1,
  specs: { type: "fugenspachtel", weight_kg: quantity } });
const primer = (quantity: number): CanonicalMaterial => ({ id: `super-${quantity}`, name: `MEM Super Haftgrund ${quantity} l`,
  product_family: "super-haftgrund", brand: "MEM", base_unit: "l", package_quantity: quantity, canonical_version: 1,
  specs: { type: "super-haftgrund", volume_l: quantity } });
// Synthetic prices only exercise selection; they are never persisted as retailer observations.
const offer = (material: CanonicalMaterial, productName = material.name): StorePrice => ({ material_id: material.id,
  store_id: "toom", product_name: productName, product_url: "https://toom.de/p/test/1234567", price: 100,
  unit_price: Math.round(100 / material.package_quantity * 100) / 100, unit: material.base_unit,
  package_quantity: material.package_quantity, currency: "EUR", checked_at: "2026-10-17T10:00:00Z",
  source: "manual", price_scope: "chain", availability: null });

test("VARIO only accepts a 25 kg sack, never a smaller exact offer or package fallback", () => {
  const target = vario(25);
  assert.equal(hasComparableSpecification(target), true);
  assert.equal(selectChainOffer(target, [offer(target)], [target], "toom").price?.price, 100);
  for (const quantity of [5, 8, 20, 30, 50]) {
    const wrong = vario(quantity);
    assert.equal(hasComparableSpecification(wrong), false, String(quantity));
    assert.equal(getVariantDistance(target, wrong), null);
    assert.equal(selectChainOffer(wrong, [offer(wrong)], [wrong], "toom").match, "unavailable");
    assert.equal(selectChainOffer(target, [offer(wrong)], [target, wrong], "toom").match, "unavailable");
  }
  assert.equal(hasComparableSpecification({ ...target, specs: { ...target.specs, pieces: 5 } }), false);
});

test("Super Haftgrund requires the MEM product identity, including product-bound structured evidence", () => {
  const target = primer(5);
  for (const name of ["MEM Super Haftgrund 5 l", "MEM Super-Haftgrund 5 l", "MEM Superhaftgrund 10 l"]) {
    assert.equal(productPurposeConflict(target, { name }), null, name);
  }
  assert.equal(productPurposeConflict(target, { name: "MEM Haftgrund 5 l", attributes: { Produktserie: "Super Haftgrund" } }), null);
  assert.equal(productPurposeConflict({ productFamily: "super-haftgrund" }, { name: "MEM Super Haftgrund 5 l" }), null);
  for (const name of ["Haftgrund mit Quarzsand 5 l", "MEM Haftgrund 5 l", "MEM Tiefengrund 5 l", "Super Haftgrund 5 l",
    "Andere Marke Super Haftgrund 5 l", "MEM Super Haftgrund Betonkontakt 5 l"]) {
    assert.ok(productPurposeConflict(target, { name }), name);
    assert.equal(selectChainOffer(target, [offer(target, name)], [target], "toom").match, "unavailable", name);
  }
  assert.ok(productPurposeConflict(target, { name: "MEM Haftgrund 5 l", description: "Alternative zu MEM Super Haftgrund" }));
});

test("Super Haftgrund keeps real 5/10 litre packages and excludes old primer families", () => {
  const target = primer(5), actual = primer(10);
  assert.ok(getVariantDistance(target, actual)! > 0);
  const selected = selectChainOffer(target, [offer(actual)], [target, actual], "toom");
  assert.equal(selected.match, "alternative");
  assert.equal(selected.actualSpecification, "10 l");
  assert.equal(selected.price?.package_quantity, 10);
  assert.equal(selected.price?.price, 100);
  for (const type of ["haftgrund", "haftgrund-quarzsand"]) {
    const old = { ...target, id: type, product_family: "haftgrund", specs: { ...target.specs, type } };
    assert.equal(getVariantDistance(target, old), null);
    assert.equal(selectChainOffer(target, [offer(old)], [target, old], "toom").match, "unavailable");
  }
});
