import test from "node:test";
import assert from "node:assert/strict";
import definitions from "../supabase/canonical-materials.json";
import manual from "../src/data/manual-prices.json";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer } from "../src/lib/productComparison";
import { buildStandard, evaluateProductMatch } from "../scripts/shop-reader/product-standardizer.mjs";

const catalog = getCanonicalComparisonCatalog();
const get = (slug: string) => {
  const id = manual.canonical_material_ids[slug as keyof typeof manual.canonical_material_ids];
  const material = catalog.find(item => item.id === id);
  assert.ok(material, slug);
  return material;
};
const target = get("glaswolle-035-120-6m2-v1");
const offers = getCatalogSnapshot(["bauhaus", "hornbach"]);

test("glasswool references retain the two screenshot totals and their actual 100 mm rolls", () => {
  for (const [store, slug, price, unitPrice, lambda, url] of [
    ["bauhaus", "glaswolle-035-100-6-72m2-v1", 44, 6.55, 0.035,
      "https://www.bauhaus.info/glaswolle/isover-lanae-glaswolle-klemmfilz-wls-035/p/33169235"],
    ["hornbach", "glaswolle-034-100-6-72m2-v1", 44.06, 6.56, 0.034,
      "https://www.hornbach.de/p/isover-klemmfilz-integra-zkf-1-034-lanae-zwischensparrendaemmung-fuer-steildach-5600-mm-x-1200-mm-x-100-mm-rolle-6-72-m/12358614/"],
  ] as const) {
    const material = get(slug);
    assert.equal(material.specs.thickness_mm, 100);
    assert.equal(material.specs.width_mm, 1200);
    assert.equal(material.specs.length_mm, 5600);
    assert.equal(material.specs.thermal_conductivity, lambda);
    assert.equal(material.specs.pieces, 1);
    const result = selectChainOffer(material, offers, catalog, store);
    assert.equal(result.match, "exact");
    assert.equal(result.price?.price, price);
    assert.equal(result.price?.unit_price, unitPrice);
    assert.equal(result.price?.package_quantity, 6.72);
    assert.equal(result.price?.unit, "m2");
    assert.equal(result.price?.product_url, url);
    assert.equal(result.price?.source, "manual");
    assert.equal(result.price?.checked_at, "2026-10-18T19:35:00.000Z");
    assert.equal(result.actualSpecification, "100 × 1200 × 5600 mm · 6,72 m²");
    assert.notEqual(result.price?.price, unitPrice);
    assert.notEqual(result.price?.price, 43.25);
  }
});

test("adding reference rolls does not loosen insulation thickness or conductivity matching", () => {
  assert.equal(target.specs.thickness_mm, 120);
  assert.equal(target.specs.thermal_conductivity, 0.035);
  assert.equal(target.package_quantity, 6);
  const roll035 = get("glaswolle-035-100-6-72m2-v1");
  const roll034 = get("glaswolle-034-100-6-72m2-v1");
  assert.equal(getVariantDistance(target, roll035), null);
  assert.equal(getVariantDistance(target, roll034), null);
  assert.equal(getVariantDistance(roll035, roll034), null);
  const standard = buildStandard(definitions.find(item => item.slug === "glaswolle-035-120-6m2-v1"));
  assert.ok(standard);
  for (const row of manual.prices.filter(item => [roll035.id, roll034.id].includes(item.material_id))) {
    assert.equal(evaluateProductMatch({ name: row.product_name, observedSpecs: row.observed_specs }, standard, { exactPackage: true }).accepted, false);
  }
});
