import test from "node:test";
import assert from "node:assert/strict";
import { bundledMaterialCatalog, searchMaterialCatalog } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { resolveMvpPreferredMaterial, withMvpMaterialMetadata } from "../src/lib/toomIntent";
import { selectChainOffer } from "../src/lib/productComparison";
import { lookupObi } from "../src/lib/obi-server";

const catalog = bundledMaterialCatalog();
const materials = catalog.map(entry => entry.material);
const stores = ["toom", "obi", "bauhaus", "hornbach", "globus", "hagebau", "hellweg"];
const offers = getCatalogSnapshot(stores);
function selection(query: string, store: string) {
  const target = resolveMvpPreferredMaterial(catalog, query);
  assert.ok(target, query);
  return selectChainOffer(target, offers, materials, store);
}

test("Finish and Perlfix use the screenshot's TOOM total and exact package/product", () => {
  for (const [query, slug, price, quantity, url] of [
    ["Finish", "knauf-uniflott-finish-8kg-v1", 17.99, 8, "https://toom.de/p/feinspachtelmasse-uniflott-finish-8-kg/2356740"],
    ["Uniflott Finish", "knauf-uniflott-finish-8kg-v1", 17.99, 8, "https://toom.de/p/feinspachtelmasse-uniflott-finish-8-kg/2356740"],
    ["Perlfix", "knauf-perlfix-25kg-v1", 10.49, 25, "https://toom.de/p/ansatzgips-perflix-25-kg/3053281"],
  ] as const) {
    assert.equal(resolveMvpPreferredMaterial(catalog, query)?.slug, slug);
    const result = selection(query, "toom");
    assert.equal(result.match, "exact");
    assert.equal(result.price?.price, price);
    assert.equal(result.price?.package_quantity, quantity);
    assert.equal(result.price?.unit, "kg");
    assert.equal(result.price?.product_url, url);
    assert.equal(result.price?.source, "manual");
  }
});

test("both Haftgrund searches select the four correctly assigned screenshot offers", () => {
  for (const query of ["Super Haftgrund", "Haftgrund", "MEM Super Haftgrund"]) {
    assert.equal(resolveMvpPreferredMaterial(catalog, query)?.slug, "mem-super-haftgrund-5l-v1");
    for (const [store, total, quantity, url] of [
      ["toom", 29.99, 5, "https://toom.de/p/super-haftgrund-5-l/3351128"],
      ["obi", 29.99, 5, "https://www.obi.de/p/2373454/mem-super-haftgrund-5-l"],
      ["bauhaus", 26.95, 5, "https://www.bauhaus.info/tiefengrund-haftgrund/mem-haftgrund/p/13881776"],
      ["globus", 37.99, 10, "https://www.globus-baumarkt.de/p/mem-super-haftgrund-10-l-0779050060/"],
    ] as const) {
      const result = selection(query, store);
      assert.equal(result.price?.store_id, store, query);
      assert.equal(result.price?.price, total, `${query}/${store}`);
      assert.equal(result.price?.package_quantity, quantity);
      assert.equal(result.price?.unit, "l");
      assert.equal(result.price?.product_url, url);
      assert.equal(result.price?.source, "manual");
      assert.equal(result.actualSpecification, `${quantity} l`);
      assert.equal(result.match, store === "globus" ? "alternative" : "exact");
      assert.match(result.price!.product_name, /MEM Super[ -]Haftgrund/);
    }
  }
});

test("VARIO resolves only to 25 kg and has no invented price; retired quartz and smaller VARIO stay hidden", () => {
  for (const query of ["Vario", "Rigips Vario", "Rigips VARIO 25 kg"]) {
    const target = resolveMvpPreferredMaterial(catalog, query);
    assert.ok(target);
    assert.equal(target.slug, "rigips-vario-25kg-v1");
    assert.equal(target.package_quantity, 25);
    for (const store of stores) {
      const expected = store === "bauhaus" ? 36.05 : store === "obi" ? 29.99 : null;
      const result = selection(query, store);
      if (expected !== null) {
        assert.equal(result.price?.price, expected);
        assert.equal(result.price?.package_quantity, 25);
      } else assert.equal(result.match, "unavailable");
    }
  }
  assert.ok(catalog.filter(row => row.material.product_family === "vario").every(row => row.material.package_quantity === 25));
  assert.equal(catalog.some(row => row.material.slug === "haftgrund-quarzsand-5l-v1"), false);
  assert.equal(searchMaterialCatalog(catalog, "Haftgrund").some(row => /quarzsand/i.test(row.name)), false);
});

test("the older catalogue receives scoped new metadata without relabeling unrelated prices", () => {
  const old = catalog.filter(row => !["super-haftgrund", "vario", "uniflott-finish"].includes(row.material.product_family)
    && row.material.slug !== "knauf-perlfix-25kg-v1");
  const restored = withMvpMaterialMetadata(old);
  for (const query of ["Finish", "Perlfix", "Super Haftgrund", "Vario"]) {
    assert.equal(resolveMvpPreferredMaterial(restored, query)?.id, resolveMvpPreferredMaterial(catalog, query)?.id, query);
  }
  assert.equal(selection("Finish", "bauhaus").price?.price, 15.6);
  assert.equal(selection("Finish", "obi").price?.price, 17.99);
  assert.equal(selection("Perlfix", "bauhaus").price?.price, 10.5);
  assert.equal(selection("Perlfix", "obi").price?.price, 12.79);
  assert.equal(selection("Perlfix", "obi").price?.package_quantity, 30);
});

test("the read-only OBI lookup exposes the verified Super Haftgrund screenshot offer", async () => {
  const info = console.info;
  console.info = () => {};
  try {
    const result = await lookupObi("Super Haftgrund");
    assert.equal(result.offer?.price, 29.99);
    assert.equal(result.offer?.package_quantity, 5);
    assert.equal(result.offer?.product_url, "https://www.obi.de/p/2373454/mem-super-haftgrund-5-l");
    assert.match(result.offer!.product_name, /MEM Super[ -]Haftgrund/);
  } finally { console.info = info; }
});
