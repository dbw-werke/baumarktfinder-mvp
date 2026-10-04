import test from "node:test";
import assert from "node:assert/strict";
import { buildStandard, productMatchesStandard, chooseNormalizedProduct, normalizeProductPrice } from "../scripts/shop-reader/product-standardizer.mjs";
import { extractStructuredProducts, parsePrice, productUrl, createShopReader } from "../scripts/shop-reader/shops.mjs";
import { parseRobots, robotsAllows, createPoliteFetcher } from "../scripts/shop-reader/http.mjs";
import { updateMaterial, createRepository } from "../scripts/update-store-prices.mjs";
import { validateManualRow } from "../scripts/import-store-prices.mjs";

// Synthetic fixture values. Never production price seeds.
const material = { id: "fixture-material", name: "Knauf Rotband 30 kg", canonical_version: 1,
  base_unit: "kg", package_quantity: 30, specs: { weight_kg: 30, required_terms: ["knauf", "rotband"] } };
const standard = buildStandard(material);
const offer = { name: "Knauf Rotband Haftputzgips 30 kg", price: 12, currency: "EUR", priceBasis: "package",
  priceSource: "json-ld-offer", availability: "InStock", url: "https://www.hornbach.de/p/fixture/123456/", retrievedAt: new Date().toISOString() };
const document = (product) => `<script type="application/ld+json">${JSON.stringify(product)}</script>`;
const schema = { "@type": "Product", name: offer.name, url: offer.url, offers: { "@type": "Offer", price: "12.00", priceCurrency: "EUR", availability: "https://schema.org/InStock" } };

test("canonical material is explicit; legacy and incomplete sheet definitions fail closed", () => {
  assert.equal(buildStandard({ ...material, canonical_version: undefined }), null);
  assert.equal(buildStandard({ ...material, name: "Gipskarton", base_unit: "m2", specs: { thickness_mm: 12.5 } }), null);
  assert.equal(buildStandard({ ...material, specs: { ...material.specs, unknown_strength: 40 } }), null);
});
test("exact canonical validation rejects wrong bag sizes, families and multipacks", () => {
  for (const name of ["Knauf Rotband 25 kg", "Knauf Rotband Finish 30 kg", "Knauf Rotband PRO 30 kg", "Knauf Rotband 2 x 30 kg", "Knauf Perlfix 30 kg"])
    assert.equal(productMatchesStandard({ ...offer, name }, standard, { exactPackage: true }), false, name);
  assert.equal(chooseNormalizedProduct([{ ...offer, name: "Knauf Rotband 25 kg", price: 1 }, offer], standard)?.price, 12);
});
test("all sheet dimensions are checked, including less than 1 mm thickness difference", () => {
  const sheet = buildStandard({ ...material, name: "Gipskarton", base_unit: "m2", package_quantity: 2.5,
    specs: { length_mm: 2000, width_mm: 1250, thickness_mm: 12.5, area_m2: 2.5 } });
  assert.equal(productMatchesStandard({ name: "Gipskarton 200 x 125 x 1,25 cm" }, sheet), true);
  for (const name of ["Gipskarton 2000 x 600 x 12,5 mm", "Gipskarton 2500 x 1250 x 12,5 mm", "Gipskarton 2000 x 1250 x 12 mm", "Gipskarton 12,5 mm"])
    assert.equal(productMatchesStandard({ name, rawText: "Also available 2000 x 1250 x 12,5 mm" }, sheet, { exactPackage: true }), false, name);
});
test("profile length, width and height are checked together", () => {
  const profile = buildStandard({ ...material, name: "CD-Profil", base_unit: "m", package_quantity: 3, specs: { length_mm: 3000, width_mm: 60, height_mm: 27 } });
  assert.equal(productMatchesStandard({ name: "CD Profil 60/27 x 3000 mm" }, profile), true);
  assert.equal(productMatchesStandard({ name: "CD Profil 60/27 x 2600 mm" }, profile, { exactPackage: true }), false);
});
test("package and base price remain separate and inconsistent unit prices are rejected", () => {
  assert.equal(normalizeProductPrice(offer, standard)?.unitPrice, 0.4);
  assert.equal(normalizeProductPrice({ ...offer, price: 0.4, priceBasis: "kg" }, standard), null);
  assert.equal(normalizeProductPrice({ ...offer, price: 0.39, priceBasis: "kg" }, standard), null);
  assert.equal(normalizeProductPrice({ ...offer, price: 0.4, declaredUnitPrice: 0.4 }, standard), null);
  assert.equal(normalizeProductPrice({ ...offer, priceBasis: null }, standard), null);
  assert.equal(normalizeProductPrice({ ...offer, currency: "USD" }, standard), null);
  assert.equal(normalizeProductPrice({ ...offer, price: 11.595 }, standard), null);
});
test("standard gypsum wording is valid, but fire/acoustic and special boards are excluded", () => {
  const sheet = buildStandard({ ...material, name: "Gipskarton", base_unit: "m2", package_quantity: 2.5,
    specs: { type: "standard", length_mm: 2000, width_mm: 1250, thickness_mm: 12.5 } });
  assert.equal(productMatchesStandard({ name: "Gipskarton GKB 2000 x 1250 x 12,5 mm" }, sheet), true);
  assert.equal(productMatchesStandard({ name: "Gipskartonplatte 2000 x 1250 x 12,5 mm" }, sheet), true);
  for (const type of ["GKF", "DF", "Hartgips", "Diamant", "Silentboard", "Schallschutz", "Spezialplatte"]) {
    assert.equal(productMatchesStandard({ name: `Gipskarton ${type} 2000 x 1250 x 12,5 mm` }, sheet), false);
  }
});
test("German and machine price formats parse without currency-text guesses", () => {
  assert.equal(parsePrice("1.234,56"), 1234.56); assert.equal(parsePrice("12,99"), 12.99);
  assert.equal(parsePrice("12.99"), 12.99); assert.equal(parsePrice("0,39 €/kg"), null);
  assert.equal(parsePrice(""), null); assert.equal(parsePrice("NaN"), null);
});
test("structured parser rejects aggregates, branch-only, expired, conditional and conflicting offers", () => {
  assert.equal(extractStructuredProducts(document(schema), offer.url, "hornbach")[0]?.price, 12);
  assert.equal(extractStructuredProducts(document({ ...schema, offers: { ...schema.offers, availability: undefined } }), offer.url, "hornbach")[0]?.availability, null);
  for (const changes of [{ "@type": "AggregateOffer", lowPrice: 1 }, { availableAtOrFrom: { name: "Berlin" } },
    { priceValidUntil: "2001-01-01" }, { eligibleQuantity: { minValue: 10 } }, { availability: "https://schema.org/OutOfStock" }, { priceCurrency: "USD" }]) {
    assert.equal(extractStructuredProducts(document({ ...schema, offers: { ...schema.offers, ...changes } }), offer.url, "hornbach").length, 0);
  }
  assert.equal(extractStructuredProducts(document({ ...schema, offers: [schema.offers, { ...schema.offers, price: 20 }] }), offer.url, "hornbach").length, 0);
  assert.equal(extractStructuredProducts(document({ ...schema, offers: { ...schema.offers, priceSpecification: {
    "@type": "UnitPriceSpecification", price: 12, priceType: "https://schema.org/SalePrice", validForMemberTier: { name: "Club" }
  } } }), offer.url, "hornbach").length, 0);
});
test("unknown sheet price basis does not become a guessed package price", () => {
  const found = extractStructuredProducts(document({ ...schema, name: "Gipskarton 2000 x 1250 x 12,5 mm" }), offer.url, "hornbach");
  assert.equal(found[0].priceBasis, null);
});
test("official product URLs reject search pages, foreign hosts, credentials and ports", () => {
  for (const url of ["https://evil.example/p/fixture/123456/", "https://hornbach.de@evil.example/p/fixture/123456/", "http://www.hornbach.de/p/fixture/123456/", "https://www.hornbach.de/s/rotband", "https://www.hornbach.de:8443/p/fixture/123456/"])
    assert.equal(productUrl("hornbach", url), null);
});
test("robots longest rule and specific user-agent take precedence", () => {
  const policy = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*?secret=\n");
  assert.equal(robotsAllows(policy, "https://shop.example/private/item"), false);
  assert.equal(robotsAllows(policy, "https://shop.example/private/public/item"), true);
  assert.equal(robotsAllows(policy, "https://shop.example/p?secret=yes"), false);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nAllow: /\nUser-agent: BaumarktFinderPriceBot\nDisallow: /"), "https://shop.example/p"), false);
});
test("robots failure or denial performs no product fetch", async () => {
  for (const [status, body] of [[200, "User-agent: *\nDisallow: /"], [403, "denied"], [200, "<html>challenge</html>"]]) {
    const calls = [];
    const http = createPoliteFetcher({ minDelayMs: 0, fetchImpl: async (url) => { calls.push(url); return new Response(body, { status }); } });
    await assert.rejects(http.get("https://shop.example/p", ["shop.example"]));
    assert.deepEqual(calls, ["https://shop.example/robots.txt"]);
  }
});
test("failed or changed scrape leaves saved mapping, timestamp, price and history untouched", async () => {
  for (const kind of ["throws", "empty", "wrong-size"]) {
    const cache = { price: 10, checked_at: "2000-01-01", history: [10], url: offer.url }, before = structuredClone(cache);
    const repository = { mapping: async () => cache.url, save: async () => { cache.price = 999; cache.history.push(999); } };
    const reader = { searchShop: async () => { if (kind === "throws") throw new Error("offline");
      return { products: kind === "empty" ? [] : [{ ...offer, name: "Knauf Rotband 25 kg" }], discovery: "mapping" }; } };
    const result = await updateMaterial(material, { repository, reader, stores: ["hornbach"] });
    assert.equal(result.status, "unavailable"); assert.deepEqual(cache, before);
  }
});
test("valid update writes one atomic RPC; dry run performs no writes", async () => {
  const saved = [], repository = { mapping: async () => null, save: async (payload) => saved.push(payload) };
  const reader = { searchShop: async () => ({ products: [offer] }) };
  await updateMaterial(material, { repository, reader, stores: ["hornbach"], dryRun: true }); assert.equal(saved.length, 0);
  await updateMaterial(material, { repository, reader, stores: ["hornbach"] }); assert.equal(saved.length, 1);
  assert.equal(saved[0].source, "automatic"); assert.equal(saved[0].price, 12); assert.equal(saved[0].package_quantity, 30);
  const calls = []; await createRepository({ rpc: async (...args) => { calls.push(args); return { data: "id" }; } }).save(saved[0]);
  assert.deepEqual(calls, [["save_verified_price", { payload: saved[0] }]]);
});
test("manual imports are labeled manual and reject wrong package sizes", () => {
  const row = { store_id: "hornbach", product_url: offer.url, product_name: offer.name, price: 12, base_unit: "kg",
    package_quantity: 30, price_basis: "package", currency: "EUR", checked_at: new Date().toISOString(), verification_note: "Synthetic test of verified complete specification." };
  assert.equal(validateManualRow(row, material).source, "manual");
  assert.equal(validateManualRow(row, material).availability, null);
  assert.throws(() => validateManualRow({ ...row, product_name: "Knauf Rotband 25 kg" }, material));
});
test("generic retailers share the mapped-product refresh path; hagebau requires its own same-SKU proof", async () => {
  const fixtures = { obi: "https://www.obi.de/p/123456/fixture", toom: "https://toom.de/p/fixture/123456/", hornbach: offer.url,
    bauhaus: "https://www.bauhaus.info/fixture/p/123456", hagebau: "https://www.hagebau.de/p/fixture/123456/",
    globus: "https://www.globus-baumarkt.de/p/fixture/123456/", hellweg: "https://www.hellweg.de/p/fixture/123456/" };
  for (const [store, url] of Object.entries(fixtures).filter(([store]) => store !== "hagebau")) {
    const ownSchema = store === "obi" ? { ...schema, url, sku:"123456", offers:{...schema.offers,seller:{name:"OBI E-Commerce GmbH"}} } : { ...schema, url };
    const reader = createShopReader({ http: { get: async () => ({ body: document(ownSchema), url }) } });
    assert.equal((await reader.searchShop(store, "fixture", { mappedUrl: url })).discovery, "mapping");
  }
});
