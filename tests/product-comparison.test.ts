import test from "node:test";
import assert from "node:assert/strict";
import definitions from "../supabase/canonical-materials.json";
import { formatMaterialSpecification, getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer, type CanonicalMaterial } from "../src/lib/productComparison";
import type { StorePrice } from "../src/services/prices";

// Synthetic offers in tests only; the selector never creates a retail price.
const catalog = getCanonicalComparisonCatalog();
const find = (name: string) => catalog.find((material) => material.name === name)!;
const uniflott5 = find("Knauf Uniflott Fugenspachtel, 5 kg");
const uniflott25 = find("Knauf Uniflott Fugenspachtel, 25 kg");
function offer(material: CanonicalMaterial, options: Partial<StorePrice> = {}): StorePrice {
  const price = options.price ?? 20;
  return { material_id: material.id, store_id: "hornbach", product_name: material.name, product_url: "https://www.hornbach.de/p/testartikel/1234567/",
    price, unit_price: Math.round(price / material.package_quantity * 100) / 100, package_quantity: material.package_quantity, unit: material.base_unit,
    currency: "EUR", checked_at: new Date(Date.now() - 1000).toISOString(), source: "manual", price_scope: "chain", availability: null, ...options };
}
function variant(material: CanonicalMaterial, id: string, quantity: number, specs: Record<string, unknown>): CanonicalMaterial {
  return { ...material, id, package_quantity: quantity, specs: { ...material.specs, ...specs } };
}

test("all bundled definitions have valid comparison metadata without adding offers", () => {
  assert.equal(catalog.length, definitions.length);
  assert.equal(new Set(catalog.map((material) => material.id)).size, catalog.length);
  for (const material of catalog) assert.equal(getVariantDistance(material, material), 0, material.name);
});

test("an exact preferred ID wins over every cheaper alternative", () => {
  const exact = offer(uniflott5, { price: 100, unit_price: 20 });
  const result = selectChainOffer(uniflott5, [offer(uniflott25, { price: 5, unit_price: 0.2 }), exact], catalog);
  assert.equal(result.match, "exact");
  assert.equal(result.price?.material_id, uniflott5.id);
  assert.equal(result.price?.price, 100);
  assert.equal(result.actualSpecification, "5 kg");
});

test("size fallback keeps its actual ID, package price and unit price and avoids a stock claim", () => {
  const actual = offer(uniflott25);
  const result = selectChainOffer(uniflott5, [actual], catalog);
  assert.equal(result.match, "alternative");
  assert.deepEqual(result.price, actual);
  assert.equal(result.actualSpecification, "25 kg");
  assert.equal(result.preferredSpecification, "5 kg");
  assert.equal(result.explanation, "Alternative Größe – kein geprüftes Angebot der Wunschgröße");
});

test("selection is independent per physical branch and cannot silently cross chains", () => {
  const obi = offer(uniflott5, { store_id: "obi", product_url: "https://www.obi.de/p/123456/test" });
  const hornbach = offer(uniflott25);
  assert.equal(selectChainOffer(uniflott5, [obi, hornbach], catalog).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [obi, hornbach], catalog, "obi").match, "exact");
  const firstBranch = selectChainOffer(uniflott5, [obi, hornbach], catalog, "hornbach");
  assert.equal(firstBranch.match, "alternative");
  assert.deepEqual(firstBranch, selectChainOffer(uniflott5, [obi, hornbach], catalog, "hornbach"));
  assert.equal(selectChainOffer(uniflott5, [obi, hornbach], catalog, "toom").match, "unavailable");
});

test("nearest size wins before the cheapest size; a newer duplicate replaces the old observation", () => {
  const target = variant(uniflott5, "target-10", 10, { weight_kg: 10 });
  const near = variant(uniflott5, "near-12", 12, { weight_kg: 12 });
  const old = offer(near, { price: 12, unit_price: 1, checked_at: new Date(Date.now() - 60_000).toISOString() });
  const fresh = offer(near, { price: 24, unit_price: 2 });
  const result = selectChainOffer(target, [offer(uniflott25, { price: 5, unit_price: 0.2 }), old, fresh], [...catalog, target, near]);
  assert.equal(result.price?.material_id, near.id);
  assert.equal(result.price?.price, 24);
});

test("a matching label never substitutes a different family or functional variant", () => {
  const wrong = [find("Knauf Uniflott Finish Fertigspachtel, 8 kg"), find("Rigips VARIO Fugenspachtel, 5 kg"), find("Knauf Perlfix Ansetzgips, 30 kg"),
    { ...uniflott25, id: "other-spec", specs: { ...uniflott25.specs, waterproof: true } }];
  for (const material of wrong) {
    assert.equal(getVariantDistance(uniflott5, material), null);
    assert.equal(selectChainOffer(uniflott5, [offer(material, { product_name: uniflott5.name })], [...catalog, material]).match, "unavailable");
  }
});

test("boards allow other face dimensions but preserve thickness, material and moisture type", () => {
  const small = find("Gipskartonplatte Standard 12,5 × 600 × 1200 mm");
  const large = find("Gipskartonplatte Standard 12,5 × 1250 × 2000 mm");
  const wet = find("Feuchtraum-Gipskartonplatte 12,5 × 1250 × 2000 mm");
  assert.ok(getVariantDistance(small, large)! > 0);
  assert.equal(getVariantDistance(small, wet), null);
  assert.equal(getVariantDistance(small, { ...large, specs: { ...large.specs, thickness_mm: 9.5 } }), null);
  const result = selectChainOffer(small, [offer(large)], catalog);
  assert.equal(result.match, "alternative");
  assert.equal(result.actualSpecification, "12,5 × 1250 × 2000 mm · 2,5 m²");
});

test("liquid litres and acrylic millilitres use real total quantities, preserving color and chemistry", () => {
  const primer = find("Knauf Tiefengrund, 5 l");
  const large = variant(primer, "primer-10", 10, { volume_l: 10 });
  assert.ok(getVariantDistance(primer, large)! > 0);
  assert.equal(formatMaterialSpecification(large), "10 l");
  const acrylic = find("Acryl-Dichtstoff weiß, überstreichbar, 310 ml");
  const small = variant(acrylic, "acrylic-300", 0.3, { volume_l: 0.3 });
  assert.equal(selectChainOffer(acrylic, [offer(small)], [...catalog, small]).actualSpecification, "300 ml");
  assert.ok(getVariantDistance(acrylic, { ...small, specs: { ...small.specs, color: "transparent" } })! > getVariantDistance(acrylic, small)!);
  assert.equal(getVariantDistance(acrylic, { ...small, product_family: "silikon" }), null);
});

test("profile lengths may differ but cross-sections cannot; screw lengths remain functional", () => {
  const profile = find("UD-Wandprofil 28/27 × 3000 mm");
  const longer = variant(profile, "profile-4", 4, { length_mm: 4000 });
  assert.ok(getVariantDistance(profile, longer)! > 0);
  assert.equal(getVariantDistance(profile, { ...longer, specs: { ...longer.specs, width_mm: 30 } }), null);
  assert.equal(getVariantDistance(profile, find("CD-Deckenprofil 60/27 × 3000 mm")), null);
  const screw = find("Schnellbauschrauben TN 3,5 × 25 mm, Feingewinde, 1000 Stück");
  assert.equal(getVariantDistance(screw, find("Schnellbauschrauben TN 3,5 × 35 mm, Feingewinde, 1000 Stück")), null);
  const fewer = variant(screw, "screws-500", 500, { pieces: 500 });
  assert.ok(getVariantDistance(screw, fewer)! > 0);
  assert.equal(formatMaterialSpecification(fewer), "3,5 × 25 mm · 500 Stück");
});
test("broad CW/UW width requests do not invent a height; explicitly requested heights still have to match", () => {
  for (const name of ["CW-Ständerprofil 50 mm, 2600 mm", "UW-Rahmenprofil 50 mm, 2000 mm"]) {
    const broad = find(name);
    assert.ok(broad); assert.equal(broad.specs.height_mm, undefined);
    assert.equal(getVariantDistance(broad, broad), 0);
    assert.equal(getVariantDistance(broad, { ...broad, specs: { ...broad.specs, width_mm: 75 } }), null);
    const explicit = { ...broad, specs: { ...broad.specs, height_mm: 40 } };
    assert.equal(getVariantDistance(explicit, broad), null);
    assert.equal(getVariantDistance(explicit, { ...explicit, specs: { ...explicit.specs, height_mm: 50 } }), null);
    assert.equal(getVariantDistance(explicit, explicit), 0);
  }
});

test("multi-unit packs compare their actual area and count while insulation performance stays fixed", () => {
  const insulation = find("Glaswolle-Klemmfilz WLG 035, 120 × 1200 × 5000 mm, 6 m²/Rolle");
  const pack = variant(insulation, "two-rolls", 12, { pieces: 2, area_m2: 12 });
  assert.ok(getVariantDistance(insulation, pack)! > 0);
  assert.equal(formatMaterialSpecification(pack), "2 Stück · 120 × 1200 × 5000 mm · 12 m² gesamt");
  assert.equal(getVariantDistance(insulation, { ...pack, specs: { ...pack.specs, thermal_conductivity: 0.04 } }), null);
  assert.equal(getVariantDistance(insulation, { ...pack, package_quantity: 6 }), null);
});

test("missing metadata, inactive versions, invalid quantities and corrupt offers fail closed", () => {
  const incomplete = { ...uniflott25, specs: { type: "fugenspachtel" } };
  const inactive = { ...uniflott25, active: false };
  const legacy = { ...uniflott25, canonical_version: 0 };
  for (const material of [incomplete, inactive, legacy]) assert.equal(getVariantDistance(uniflott5, material), null);
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott25)], [uniflott5]).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott25, { package_quantity: 5 })], catalog).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott25, { unit: "l" })], catalog).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott25, { price: -5 })], catalog).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott25, { product_url: "https://example.com/wrong" })], catalog).match, "unavailable");
});

test("unknown IDs are never relabelled and duplicate canonical IDs cannot win", () => {
  const unknown = offer(uniflott5, { material_id: "unknown" });
  assert.equal(selectChainOffer(uniflott5, [unknown], catalog).match, "unavailable");
  assert.equal(selectChainOffer(uniflott5, [offer(uniflott5)], [...catalog, uniflott5]).match, "unavailable");
  const alteredTarget = variant(uniflott5, uniflott5.id, 10, { weight_kg: 10 });
  assert.equal(selectChainOffer(alteredTarget, [offer(uniflott5)], catalog).match, "unavailable");
});
