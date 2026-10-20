import test from "node:test";
import assert from "node:assert/strict";
import definitions from "../supabase/canonical-materials.json";
import { buildStandard, evaluateProductMatch, chooseNormalizedProduct } from "../scripts/shop-reader/product-standardizer.mjs";
import { getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer, type CanonicalMaterial } from "../src/lib/productComparison";
import { productPurposeConflict } from "../src/lib/productCompatibility.mjs";
import type { StorePrice } from "../src/services/prices";
import { bundledMaterialCatalog } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";

const definition = definitions.find(item => item.slug === "trennwandband-30-3-30000-v1")!;
const band = buildStandard(definition)!;
const catalog = getCanonicalComparisonCatalog();
const target = catalog.find(item => item.product_family === "trennwandband" && item.specs.width_mm === 30 && item.specs.thickness_mm === 3)!;
const alternative = (specs: Record<string, unknown> = {}): CanonicalMaterial => ({ ...target,
  id: "00000000-0000-4000-8000-000000000123", name: "Dichtungsband für Trockenbau 30 m × 30 mm × 3,2 mm",
  product_family: "dichtungsband", specs: { ...target.specs, type: "dichtungsband", thickness_mm: 3.2, ...specs } });

test("drywall band aliases accept the same technical package without demanding self-adhesive title wording", () => {
  for (const alias of ["Trennwandband", "Dichtungsband", "Trennwand-Dichtungsband", "Anschlussband", "Dichtband", "selbstklebendes Dichtungsband"]) {
    const result = evaluateProductMatch({ name: `${alias} 30 mm × 3 mm × 30 m`, category: "Trockenbau" }, band);
    assert.equal(result.accepted, true, `${alias}: ${result.rejectionReason}`);
    assert.ok("packageQuantity" in result);
    assert.equal(result.packageQuantity, 30);
    assert.equal(result.matchKind, "exact");
  }
});

test("band aliases never admit unrelated sealing and floor products, including structured purpose evidence", () => {
  for (const name of ["Sanitär-Dichtband", "Fensterdichtungsband", "Bitumenband", "Abdichtungsbahn", "Abdichtungsband",
    "Fugendichtband", "Randdämmstreifen", "Butyl-Anschlussband"]) {
    const product = { name: `${name} 30 mm × 3 mm × 30 m` };
    assert.equal(evaluateProductMatch(product, band).accepted, false, name);
    assert.ok(productPurposeConflict(target, product), name);
  }
  assert.equal(evaluateProductMatch({ name: "Anschlussband 30 mm × 3 mm × 30 m", description: "Zur Fensterabdichtung" }, band).accepted, false);
  for (const name of ["Dichtband", "Dichtungsband", "Anschlussband"]) {
    assert.equal(evaluateProductMatch({ name: `${name} 30 mm × 3 mm × 30 m` }, band).accepted, false, name);
  }
});

test("band variants preserve profile width and only allow a close foam thickness and actual roll length", () => {
  const near = alternative();
  assert.ok(getVariantDistance(target, near)! > 0);
  assert.equal(getVariantDistance(target, alternative({ width_mm: 50 })), null);
  assert.equal(getVariantDistance(target, alternative({ thickness_mm: 5 })), null);
  const exactAlias = alternative({ thickness_mm: 3 });
  assert.equal(getVariantDistance(target, exactAlias), 0);
  assert.equal(getVariantDistance(target, { ...near, product_family: "randdaemmstreifen", specs: { ...near.specs, type: "randdaemmstreifen" } }), null);
  assert.equal(getVariantDistance(target, { ...near, name: "Fenster-Dichtungsband 30 mm" }), null);
  assert.ok(getVariantDistance(target, { ...near, package_quantity: 20, specs: { ...near.specs, length_mm: 20000 } })! > getVariantDistance(target, near)!);
});

test("the plain Dichtungsband 50 mm selector uses its verified drywall offer without category metadata", () => {
  const materials = bundledMaterialCatalog().map(item => item.material);
  const selected = materials.find(material => material.slug === "dichtungsband-50-3-30000-v1")!;
  assert.equal(getVariantDistance(selected, selected), 0);
  const prices = getCatalogSnapshot(["bauhaus"]);
  const result = selectChainOffer(selected, prices, materials, "bauhaus");
  assert.equal(result.match, "exact");
  assert.equal(result.price?.price, 9.05);
  assert.equal(result.actualSpecification, "3 × 50 × 30000 mm · 30 m");
  assert.ok(result.price?.product_url.endsWith("/p/25501375"));
  assert.equal(productPurposeConflict(selected, { product_name: "Dichtungsband 30 m × 50 mm × 3 mm" }), "unverified-band-purpose");
  for (const name of ["Fensterdichtungsband", "Sanitär-Dichtband", "Bitumenband", "Abdichtungsbahn"]) {
    assert.equal(getVariantDistance(selected, { ...selected, name }), null, name);
    assert.equal(selectChainOffer(selected, [{ ...result.price!, product_name: name }], materials, "bauhaus").match, "unavailable", name);
  }
});

test("reader chooses exact band size before a cheaper 3.2 mm variant; package total stays untouched", () => {
  // Synthetic prices are only ranking fixtures, never retailer data.
  const raw = { category: "Trockenbau", currency: "EUR", priceSource: "manual-admin-verification", priceBasis: "package", price: 10, url: "https://www.hornbach.de/p/test/1234567/" };
  const exact = { ...raw, name: "Dichtungsband 30 m × 30 mm × 3 mm", price: 12 };
  const near = { ...raw, name: "Dichtungsband 30 m × 30 mm × 3,2 mm", price: 8 };
  assert.equal(evaluateProductMatch(near, band).accepted, true);
  assert.equal(evaluateProductMatch(near, band, { exactPackage: true }).accepted, false);
  assert.equal(chooseNormalizedProduct([near, exact], band, { exactPackage: false })?.price, 12);
  assert.equal(chooseNormalizedProduct([near], band, { exactPackage: false })?.price, 8);
  const closer = { ...raw, name: "Dichtungsband 30 m × 30 mm × 3,1 mm", price: 11 };
  assert.equal(chooseNormalizedProduct([near, closer], band, { exactPackage: false })?.price, 11);
});

test("customer comparison carries the actual verified band package and prefers the exact offer", () => {
  const actual = alternative();
  const price: StorePrice = { material_id: actual.id, store_id: "hornbach", product_name: actual.name,
    product_url: "https://www.hornbach.de/p/test/1234567/", price: 9, unit_price: 0.3, package_quantity: 30, unit: "m",
    currency: "EUR", checked_at: new Date(Date.now() - 1000).toISOString(), source: "manual", price_scope: "chain", availability: null };
  const selection = selectChainOffer(target, [price], [...catalog, actual], "hornbach");
  assert.equal(selection.match, "alternative");
  assert.equal(selection.price?.price, 9);
  assert.match(selection.actualSpecification!, /3,2 × 30 × 30000 mm/);
  const exact = { ...price, material_id: target.id, product_name: target.name, price: 12, unit_price: 0.4 };
  assert.equal(selectChainOffer(target, [price, exact], [...catalog, actual], "hornbach").price?.price, 12);
  assert.equal(selectChainOffer(target, [{ ...price, product_name: "Fensterdichtungsband" }], [...catalog, actual], "hornbach").match, "unavailable");
});

test("Wandanschlussprofil is a UD alias only for the verified 28/27 section", () => {
  const ud = buildStandard(definitions.find(item => item.product_family === "ud-profil"))!;
  assert.equal(evaluateProductMatch({ name: "Wandanschlussprofil 3000 x 28 x 27 mm" }, ud).accepted, true);
  for (const name of ["Wandanschlussprofil 3000 x 50 x 40 mm", "CD Wandanschlussprofil 3000 x 28 x 27 mm", "CW Profil 3000 x 28 x 27 mm", "UW Profil 3000 x 28 x 27 mm"]) {
    assert.equal(evaluateProductMatch({ name }, ud).accepted, false, name);
  }
});

test("explicit mm in a hanger's matching CD section does not change its technical identity", () => {
  const hanger = buildStandard(definitions.find(item => item.slug === "direktabhaenger-cd60-125-1-v1"))!;
  assert.equal(evaluateProductMatch({ name: "Direktabhänger CD 60 mm/27 mm, 125 mm, 1 Stück" }, hanger).accepted, true);
  assert.equal(evaluateProductMatch({ name: "Direktabhänger CD 50 mm/27 mm, 125 mm, 1 Stück" }, hanger).accepted, false);
});

test("hanger retailer searches stay simple even when a stored canonical search title is long", () => {
  for (const [family, search] of [["direktabhaenger", "Direktabhänger"], ["noniusabhaenger", "Nonius Unterteil"]]) {
    const material = definitions.find(item => item.product_family === family)!;
    assert.equal(buildStandard({ ...material, store_search_term: material.name })?.search, search);
  }
});
