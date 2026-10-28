import assert from "node:assert/strict";
import test from "node:test";
import { estimateComparisonPrice } from "../src/lib/estimatedPrices";
import { getCanonicalComparisonCatalog, type CanonicalMaterial } from "../src/lib/productComparison";
import type { StorePrice } from "../src/services/prices";

const target: CanonicalMaterial = { id: "11111111-1111-4111-8111-111111111111", name: "Testmaterial",
  product_family: "test-material", brand: null, base_unit: "kg", package_quantity: 25,
  specs: { type: "test-material", weight_kg: 25, pieces: 1 }, active: true, canonical_version: 1 };
const pack = (quantity: number, suffix = "2"): CanonicalMaterial => ({ ...target,
  id: `22222222-2222-4222-8222-22222222222${suffix}`, package_quantity: quantity,
  specs: { ...target.specs, weight_kg: quantity } });
const hosts: Record<string, string> = { obi: "obi.de", bauhaus: "bauhaus.info", hornbach: "hornbach.de", toom: "toom.de" };
function offer(material: CanonicalMaterial, store: string, price: number): StorePrice {
  return { material_id: material.id, store_id: store, product_name: material.name,
    product_url: `https://www.${hosts[store]}/p/test-product-12345`, price,
    unit_price: Math.round(price / material.package_quantity * 100) / 100, package_quantity: material.package_quantity,
    unit: material.base_unit, currency: "EUR", checked_at: "2026-10-20T12:00:00.000Z",
    source: "automatic", price_scope: "chain", availability: null };
}

test("estimates use deterministic median, one vote per chain, retain provenance and never mutate inputs", () => {
  const offers = [offer(target, "obi", 10), offer(target, "bauhaus", 20), offer(target, "hornbach", 90)];
  const before = JSON.stringify(offers);
  const result = estimateComparisonPrice(target, offers, [target], "hellweg")!;
  assert.equal(result.price, 20);
  assert.equal(result.unit_price, .8);
  assert.equal(result.basis, "exact-material");
  assert.equal(result.sources.length, 3);
  assert.deepEqual(result, estimateComparisonPrice(target, [...offers].reverse(), [target], "hellweg"));
  assert.equal(JSON.stringify(offers), before);
  assert.ok(result.sources.every(s => s.checked_at === offers[0].checked_at && s.normalization_factor === 1));
  assert.equal("product_url" in result, false);
  assert.equal("availability" in result, false);
  assert.equal("verified" in result, false);
});

test("latest observation replaces a duplicate chain without biasing the median", () => {
  const latest = { ...offer(target, "obi", 30), checked_at: "2026-10-21T12:00:00.000Z" };
  const offers = [offer(target, "obi", 10), latest, latest, offer(target, "bauhaus", 20)];
  const result = estimateComparisonPrice(target, offers, [target], "hellweg")!;
  assert.equal(result.price, 25);
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources.find(s => s.store_id === "obi")?.price, 30);
});

test("same material takes priority over package alternatives and verified offers suppress estimates", () => {
  const alternative = pack(30);
  const offers = [offer(target, "obi", 10), offer(alternative, "bauhaus", 60)];
  assert.equal(estimateComparisonPrice(target, offers, [target, alternative], "hellweg")?.price, 10);
  assert.equal(estimateComparisonPrice(target, offers, [target, alternative], "obi"), null);
  assert.equal(estimateComparisonPrice(target, offers, [target, alternative], "bauhaus"), null);
});

test("quantity conversion uses exact unit prices before final cent rounding", () => {
  const alternative = pack(30);
  const result = estimateComparisonPrice(target, [offer(alternative, "obi", 10)], [target, alternative], "hellweg")!;
  assert.equal(result.price, 8.33);
  assert.equal(result.basis, "comparable-material");
  assert.equal(result.package_quantity, 25);
  assert.equal(result.sources[0].package_quantity, 30);
  assert.equal(result.sources[0].unit_price, 10 / 30);
});

test("invalid, unverified and estimated observations never seed estimates; units and identity stay strict", () => {
  const invalid = [
    { ...offer(target, "obi", 10), verified: false },
    { ...offer(target, "bauhaus", 10), kind: "estimate" },
    { ...offer(target, "hornbach", 10), product_url: "https://attacker.example/p/123" },
    { ...offer(target, "toom", 10), price: NaN },
  ];
  assert.equal(estimateComparisonPrice(target, invalid, [target], "hellweg"), null);
  const wrongUnit: CanonicalMaterial = { ...pack(25), base_unit: "l", specs: { type: "test-material", volume_l: 25, pieces: 1 } };
  const wrongType = { ...pack(30, "3"), specs: { ...pack(30).specs, type: "different-function" } };
  assert.equal(estimateComparisonPrice(target, [offer(wrongUnit, "obi", 10), offer(wrongType, "bauhaus", 10)], [target, wrongUnit, wrongType], "hellweg"), null);
  assert.equal(estimateComparisonPrice(target, [offer(target, "obi", 10)], [target, target], "hellweg"), null);
  assert.equal(estimateComparisonPrice({ ...target, active: false }, [], [target], "hellweg"), null);
  assert.equal(estimateComparisonPrice(target, [], [target], "unknown-store"), null);
});

test("bundled evidence covers a material when the nearby chain provides no offers, including CD profile legacy metadata", () => {
  const catalog = getCanonicalComparisonCatalog();
  for (const material of catalog.filter(m => ["direktabhaenger-cd60-125-1-v1", "glaswolle-035-120-6m2-v1"].includes(m.slug!))) {
    const result = estimateComparisonPrice(material, [], catalog, "hellweg")!;
    assert.ok(result?.price > 0);
    assert.ok(result.sources.length > 0);
    if (material.product_family === "mineralwolle") assert.ok(result.sources.every(source => {
      const original = catalog.find(m => m.id === source.material_id)!;
      return original.specs.thickness_mm === 120 && original.specs.thermal_conductivity === .035;
    }));
  }
});

test("paper sheet estimates normalize area instead of treating a narrow strip as a whole sheet", () => {
  const sheet: CanonicalMaterial = { ...target, product_family: "schleifpapier", name: "Schleifpapier Holz K180",
    base_unit: "piece", package_quantity: 10, specs: { type: "schleifpapier", grit: 180, width_mm: 93, length_mm: 230, pieces: 10 } };
  const source = { ...sheet, id: pack(1).id, package_quantity: 1, specs: { ...sheet.specs, width_mm: 230, length_mm: 280, pieces: 1 } };
  const result = estimateComparisonPrice(sheet, [offer(source, "obi", 2)], [sheet, source], "hellweg")!;
  assert.equal(result.price, Math.round(2 * 10 * (93 * 230) / (230 * 280) * 100) / 100);
  assert.equal(result.sources[0].normalization_factor, 93 / 280);
});
