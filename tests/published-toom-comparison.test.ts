import assert from "node:assert/strict";
import test from "node:test";
import published from "../src/data/toom-published-prices.json";
import { filterCatalogSnapshot, getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { mergeCatalogSources } from "../src/services/catalog";
import { getCanonicalComparisonCatalog, selectChainOffer } from "../src/lib/productComparison";

test("published current TOOM prices retain every previously comparable material", () => {
  const catalog = getCanonicalComparisonCatalog(), saved = getCatalogSnapshot(["toom"]);
  const live = filterCatalogSnapshot(published, ["toom"]);
  assert.ok(live.length > 0, "real worker snapshot is published");
  const merged = mergeCatalogSources(["toom"], [], [...live, ...saved], null).offers;
  for (const material of catalog) {
    const before = selectChainOffer(material, saved, catalog, "toom");
    const after = selectChainOffer(material, merged, catalog, "toom");
    if (before.price) assert.ok(after.price, `${material.name}: refreshed titles must not hide a verified offer`);
  }
});

test("short direct-hanger title is recognized only for its verified SKU and compatible package", () => {
  const catalog = getCanonicalComparisonCatalog();
  const target = catalog.find(row => row.slug === "direktabhaenger-cd60-125-1-v1")!;
  const old = getCatalogSnapshot(["toom"]).find(row => row.product_url.endsWith("/3153733"))!;
  const current = { ...old, source: "automatic" as const, product_name: "Knauf Direktabhänger für CD-Profile" };
  assert.equal(selectChainOffer(target, [current], catalog, "toom").price?.price, .69);
  for (const wrong of [
    { ...current, product_url: current.product_url.replace("3153733", "9999999") },
    { ...current, package_quantity: 100 },
    { ...current, product_name: "Nonius Direktabhänger für CD-Profile" },
    { ...current, product_name: "Direktabhänger für CD-Profile CW" },
    { ...current, product_name: "Direktabhänger für CD-Profile CD 50/27" },
  ]) assert.equal(selectChainOffer(target, [wrong], catalog, "toom").match, "unavailable");
});
