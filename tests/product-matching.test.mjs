import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildStandard, evaluateProductMatch, productMatchesStandard, normalizeProductPrice, chooseNormalizedProduct } from "../scripts/shop-reader/product-standardizer.mjs";
import { findStoreProduct } from "../scripts/shop-reader/product-alternatives.mjs";
import { canonicalId } from "../scripts/refresh-catalog-snapshot.mjs";
const definitions = JSON.parse(await readFile(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
const catalog = definitions.map((row) => ({ ...row, id: canonicalId(row.slug) }));
const material = (slug) => catalog.find((row) => row.slug === slug);
const acrylic = buildStandard(material("acryl-weiss-310ml-v1"));
const product = (name, extra = {}) => ({ name, price: 6, currency: "EUR", priceBasis: "package", priceSource: "json-ld-offer", soldIndividually: true,
  url: "https://www.hornbach.de/p/testprodukt/123456/", retrievedAt: "2026-10-01T12:00:00Z", ...extra });

test("acrylic synonyms and close 300/280 ml cartridges match without optional literal words", () => {
  for (const name of ["Maleracryl Weiß 310 ml", "Anschlussacryl Weiß 310 ml", "Acryl-Dichtstoff Weiß 310 ml", "Fugendichtstoff Acryl Weiß 310 ml", "Maleracryl Weiß 300 ml", "Acryl 280 ml"])
    assert.equal(productMatchesStandard(product(name), acrylic), true, name);
  const scores = [310, 300, 280].map((ml) => evaluateProductMatch(product(`Maleracryl Weiß ${ml} ml`), acrylic).score);
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2]);
});
test("incompatible chemistry is rejected before scoring even with an acrylic category", () => {
  for (const name of ["Silikon Weiß", "Sanitärsilikon", "Neutral-Silikon", "Hybrid-Dichtstoff", "MS-Polymer", "PU-Dichtstoff", "Montagekleber", "Acrylfarbe Weiß", "Acryl Hybrid Dichtstoff"]) {
    const match = evaluateProductMatch(product(`${name} 310 ml`, { category: "Acryl-Dichtstoffe", description: "Auch für Acryl geeignet." }), acrylic);
    assert.equal(match.accepted, false, name); assert.equal(match.score, 0); assert.ok(match.hardExclusion);
  }
});
test("own attributes and category identify a sealant, but unrelated raw page text cannot", () => {
  const own = product("Fugendichtstoff 310 ml", { category: "Dichtstoffe > Acryl", attributes: [{ name: "Basis", value: "Acrylat" }, { name: "Farbe", value: "Weiß" }] });
  assert.equal(productMatchesStandard(own, acrylic), true);
  assert.equal(productMatchesStandard(product("Dichtmasse 310 ml", { rawText: "Empfehlung: Maleracryl weiß" }), acrylic), false);
  assert.equal(productMatchesStandard(product("Maleracryl silikonfrei 310 ml"), acrylic), true);
});
test("identity and package evidence conflicts cannot be hidden by metadata", () => {
  assert.equal(productMatchesStandard(product("Maleracryl 310 ml", { observedSpecs: { volume_l: .3 } }), acrylic), false);
  assert.equal(productMatchesStandard(product("Maleracryl 310 ml", { attributes: [{ name: "Basis", value: "MS-Polymer" }] }), acrylic), false);
  assert.equal(productMatchesStandard(product("Acryl 2 x 310 ml"), acrylic), false);
});
test("quality wins before price and actual fallback totals/quantities are never converted", () => {
  const exact = product("Maleracryl weiß 310 ml", { price: 8 });
  const small = product("Maleracryl weiß 300 ml", { price: 4 });
  assert.equal(chooseNormalizedProduct([small, exact], acrylic, { exactPackage: false }).price, 8);
  const fallback = chooseNormalizedProduct([small], acrylic, { exactPackage: false });
  assert.equal(fallback.price, 4); assert.equal(fallback.packageQuantity, .3);
  assert.equal(normalizeProductPrice(small, acrylic), null, "300 ml must never be stored under the 310 ml canonical ID");
  assert.equal(chooseNormalizedProduct([product("Acryl 310 ml", { price: 1 }), exact], acrylic).price, 8);
});
test("fallback updater stores the actual canonical 300 ml ID", async () => {
  const result = await findStoreProduct(material("acryl-weiss-310ml-v1"), { storeId: "hornbach", canonicalMaterials: catalog,
    repository: { mapping: async () => null }, reader: { searchShop: async () => ({ products: [product("Maleracryl weiß 300 ml", { price: 4 })] }) } });
  assert.equal(result.actualMaterial.id, material("acryl-weiss-300ml-v1").id);
  assert.equal(result.product.packageQuantity, .3); assert.equal(result.product.price, 4);
  assert.equal(result.attempts[0].products[0].detected_family, "acrylic");
  assert.equal(result.attempts[0].products[0].family_match_result, "ACCEPT");
});
test("gypsum synonyms work without literal gipskarton; wet/fire/special boards never substitute", () => {
  const standard = buildStandard(material("gipskarton-standard-12-5-2000-1250-v1"));
  assert.equal(productMatchesStandard(product("Bauplatte GKB 2000 x 1250 x 12,5 mm", { attributes: [{name:"Länge",value:"2.000 mm"},{name:"Breite",value:"1.250 mm"},{name:"Stärke",value:"12,5 mm"}] }), standard), true);
  for (const name of ["Rigipsplatte", "Gipskartonplatte", "Bauplatte", "GKB"]) assert.equal(productMatchesStandard(product(`${name} 2000 x 1250 x 12,5 mm`), standard), true, name);
  for (const name of ["Feuchtraumplatte", "Gipskarton Brandschutzplatte", "Bauplatte Spezialplatte", "XPS Bauplatte"]) assert.equal(productMatchesStandard(product(`${name} 2000 x 1250 x 12,5 mm`), standard), false, name);
});
test("Tiefgrund synonyms allow a real 10 L fallback; Haftgrund and Betonkontakt stay separate", () => {
  const standard = buildStandard(material("knauf-tiefengrund-5l-v1"));
  for (const name of ["Tiefgrund 5 l", "Tiefengrund 10 l"]) assert.equal(productMatchesStandard(product(name), standard), true);
  for (const name of ["Haftgrund 5 l", "Betonkontakt 5 l", "Tiefengrund Haftgrund 5 l"]) assert.equal(productMatchesStandard(product(name), standard), false);
});
test("impregnated gypsum is a wet-room board and never a standard board", () => {
  const candidate = product("Knauf Gipskartonplatte imprägniert 2000 x 1250 x 12,5 mm");
  const wet = buildStandard(material("gipskarton-feuchtraum-12-5-2000-1250-v1"));
  assert.equal(evaluateProductMatch(candidate, wet).detectedFamily, "gipskarton-feuchtraum");
  assert.equal(productMatchesStandard(candidate, wet), true);
  assert.equal(productMatchesStandard(candidate, buildStandard(material("gipskarton-standard-12-5-2000-1250-v1"))), false);
});
test("CD identity and section stay hard while length is a preferred package axis", () => {
  const standard = buildStandard(material("cd60-27-3000-v1"));
  assert.equal(productMatchesStandard(product("Deckenprofil CD 60/27 x 3100 mm"), standard), true);
  for (const name of ["CW 60/27 x 3000 mm", "UW 60/27 x 3000 mm", "UD 60/27 x 3000 mm", "CD 50/27 x 3000 mm"]) assert.equal(productMatchesStandard(product(name), standard), false, name);
});
test("German compound exclusions remain hard without treating Produkt as PRO", () => {
  for (const [slug, name] of [["knauf-tiefengrund-5l-v1", "Tiefengrundkonzentrat 5 l"],
    ["acryl-weiss-310ml-v1", "Parkettacryl weiß 310 ml"], ["knauf-rotband-30kg-v1", "Knauf Rotband Renovierspachtel 30 kg"]]) {
    const match = evaluateProductMatch(product(name), buildStandard(material(slug)));
    assert.equal(match.accepted, false, name); assert.ok(match.hardExclusion);
  }
  assert.equal(productMatchesStandard(product("Knauf Rotband Produkt 30 kg"), buildStandard(material("knauf-rotband-30kg-v1"))), true);
});
test("German grouped piece counts match title and own structured attributes", () => {
  const standard = buildStandard(material("tn-3-5-25-1000-v1"));
  for (const suffix of ["1.000 Stück", "1.000 Stk", "1000 Stück"]) assert.equal(productMatchesStandard(product(`Schnellbauschrauben TN Feingewinde 3,5 x 25 mm ${suffix}`), standard), true, suffix);
  assert.equal(productMatchesStandard(product("Schnellbauschrauben TN Feingewinde 3,5 x 25 mm", { attributes: [{ name: "Stückzahl", value: "1.000" }] }), standard), true);
});
