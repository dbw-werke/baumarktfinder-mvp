import test from "node:test";
import assert from "node:assert/strict";
import { bundledMaterialCatalog } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { resolveMvpPreferredMaterial, withMvpMaterialMetadata } from "../src/lib/toomIntent";
import { selectChainOffer, type CanonicalMaterial } from "../src/lib/productComparison";
import { buildStandard, evaluateProductMatch } from "../scripts/shop-reader/product-standardizer.mjs";

const catalog = bundledMaterialCatalog();
const materials = catalog.map(entry => entry.material);
const offers = getCatalogSnapshot(["bauhaus"]);

test("simple CD aliases retain the verified BAUHAUS 3 m package and total price", () => {
  for (const query of ["CD Profil", "CD-Deckenprofil", "CD 60/27", "CD60/27", "Deckenprofil 60/27"]) {
    const target = resolveMvpPreferredMaterial(catalog, query);
    assert.ok(target, query);
    assert.equal(target.slug, "cd60-27-3000-v1", query);
    const selected = selectChainOffer(target, offers, materials, "bauhaus");
    assert.equal(selected.price?.price, 6.65, query);
    assert.equal(selected.price?.source, "manual", query);
    assert.equal(selected.price?.package_quantity, 3, query);
    assert.equal(selected.price?.unit, "m", query);
    assert.equal(selected.price?.product_url, "https://www.bauhaus.info/cd-profile/probau-cd-deckenprofil/p/20489120", query);
    assert.match(selected.actualSpecification!, /27 × 60 × 3000 mm/);
  }
});

test("BAUHAUS moisture board keeps GKBI identity, actual dimensions and package price", () => {
  const target = resolveMvpPreferredMaterial(catalog, "Feuchtraumplatte");
  assert.ok(target);
  assert.equal(target.specs.type, "feuchtraum");
  const selected = selectChainOffer(target, offers, materials, "bauhaus");
  assert.equal(selected.price?.price, 15.95);
  assert.equal(selected.price?.product_url, "https://www.bauhaus.info/feuchtraumplatten/knauf-gipskartonplatte-gkbi/p/13874329");
  assert.match(selected.price!.product_name, /GKBI/);
  assert.equal(selected.price?.package_quantity, 2.5);
  assert.match(selected.actualSpecification!, /12,5 × 1250 × 2000 mm/);

  // A smaller requested board must use the real larger GKBI package, never GKB.
  const smaller: CanonicalMaterial = { ...target, id: "00000000-0000-4000-8000-000000000001", package_quantity: 1.2,
    specs: { ...target.specs, width_mm: 600, area_m2: 1.2 } };
  const metadata = [...materials, smaller];
  const alternative = selectChainOffer(smaller, offers, metadata, "bauhaus");
  assert.equal(alternative.match, "alternative");
  assert.equal(alternative.price?.product_url, selected.price?.product_url);
  assert.equal(alternative.price?.price, 15.95);
  assert.equal(alternative.price?.package_quantity, 2.5);
  const standardBoardIds = new Set(materials.filter(material => material.specs.type === "standard").map(material => material.id));
  assert.equal(selectChainOffer(smaller, offers.filter(offer => standardBoardIds.has(offer.material_id)), metadata, "bauhaus").match, "unavailable");
});

test("simple OSB queries select the genuine BAUHAUS alternative without normalizing its total", () => {
  for (const query of ["OSB", "OSB Platte", "OSB Verlegeplatte", "OSB/3 Platte", "OSB/3 Verlegeplatte", "OSB Nut und Feder", "OSB 18 mm"]) {
    const target = resolveMvpPreferredMaterial(catalog, query);
    assert.ok(target, query);
    assert.equal(target.slug, "osb3-18-2500-1250-v1", query);
    assert.equal(target.store_search_term, "OSB Platte", query);
    const selected = selectChainOffer(target, offers, materials, "bauhaus");
    assert.equal(selected.match, "alternative", query);
    assert.equal(selected.price?.product_name, "OSB-Verlegeplatte", query);
    assert.equal(selected.price?.price, 15.14, query);
    assert.equal(selected.price?.package_quantity, 1.6875, query);
    assert.equal(selected.price?.product_url, "https://www.bauhaus.info/verlegeplatten/osb-verlegeplatte/p/20121495", query);
    assert.match(selected.actualSpecification!, /18 × 675 × 2500 mm/);
  }
});

test("OSB family matching rejects unrelated boards even when their dimensions match", () => {
  const target = resolveMvpPreferredMaterial(catalog, "OSB");
  assert.ok(target);
  const standard = buildStandard(target);
  assert.ok(standard);
  for (const name of ["MDF Platte 2500 x 1250 x 18 mm", "Spanplatte 2500 x 1250 x 18 mm", "Gipskartonplatte 2500 x 1250 x 18 mm"]) {
    const result = evaluateProductMatch({ name }, standard);
    assert.equal(result.accepted, false, name);
    assert.equal(result.rejectionReason, "incompatible_product_family", name);
  }
});

test("an older database missing the OSB variant still supplies its verified BAUHAUS card", () => {
  const old = catalog.filter(entry => entry.material.slug !== "osb3-18-2500-675-v1");
  const before = JSON.stringify(old);
  const restored = withMvpMaterialMetadata(old);
  assert.equal(JSON.stringify(old), before);
  assert.equal(new Set(restored.map(entry => entry.material.id)).size, restored.length);
  assert.ok(restored.some(entry => entry.material.slug === "osb3-18-2500-675-v1"));
  const target = resolveMvpPreferredMaterial(restored, "OSB Platte");
  assert.ok(target);
  const selected = selectChainOffer(target, offers, restored.map(entry => entry.material), "bauhaus");
  assert.equal(selected.price?.price, 15.14);
  assert.equal(selected.price?.package_quantity, 1.6875);
});
