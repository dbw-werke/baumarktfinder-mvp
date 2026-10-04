import test from "node:test";
import assert from "node:assert/strict";
import { extractStructuredProducts } from "../scripts/shop-reader/shops.mjs";
import { confirmHornbachPackagePrices, extractToomProductState, extractGlobusProductState } from "../scripts/shop-reader/retailer-state.mjs";
import { buildStandard, normalizeProductPrice } from "../scripts/shop-reader/product-standardizer.mjs";

const hbUrl = "https://www.hornbach.de/p/test-bauplatte/123456/";
const name = "Gipskarton Bauplatte GKB 2000 x 1250 x 12,5 mm";
const observed = { name, url: hbUrl, externalId: "123456", price: 11.05, priceBasis: null };
const hb = { __typename: "Product", abstractProductId: "123456", title: name, url: hbUrl,
  defaultSalesUnit: { productMeasurementUnitCode: "ST" }, offerDV: { merchant: { isMarketplaceMerchant: false }, canBeAddedToCart: true },
  basicPrice: { price: 11.05, unit: "ST", currency: "€" }, defaultPrice: { price: 4.42, unit: "m²", currencyCode: "EUR" } };
const hbHtml = (product) => `<script>\nwindow.__ARTICLE_DETAIL_APOLLO_STATE__ = ${JSON.stringify({ product })}\n</script>`;

test("Hornbach confirms the independently observed ST total without multiplying a rounded base price", () => {
  const row = confirmHornbachPackagePrices(hbHtml(hb), [observed], hbUrl)[0];
  assert.equal(row.price, 11.05); assert.equal(row.priceBasis, "package"); assert.equal(row.declaredUnitPrice, 4.42);
});
test("Hornbach package proof rejects wrong SKU, marketplace, conflicting total and base-unit-only data", () => {
  for (const change of [{ abstractProductId: "654321" }, { url: hbUrl.replace("123456", "654321") },
    { basicPrice: { ...hb.basicPrice, price: 11.06 } }, { basicPrice: null }, { defaultSalesUnit: { productMeasurementUnitCode: "m²" } },
    ]) {
    assert.equal(confirmHornbachPackagePrices(hbHtml({ ...hb, ...change }), [observed], hbUrl)[0].priceBasis, null);
  }
});
test("Hornbach never relabels a marketplace offer as a chain price, even with an already known package basis", () => {
  const marketplace = { ...hb, offerDV: { merchant: { isMarketplaceMerchant: true }, canBeAddedToCart: true } };
  assert.equal(confirmHornbachPackagePrices(hbHtml(marketplace), [{ ...observed, priceBasis: "package" }], hbUrl).length, 0);
  assert.equal(confirmHornbachPackagePrices(hbHtml(marketplace), [observed], hbUrl).length, 0);
  const details = { ...hb, attributeList: [{ key: "Inhaltsstoffe", value: "Essig vernetztes Silikon" }] };
  assert.match(confirmHornbachPackagePrices(hbHtml(details), [observed], hbUrl)[0].name, /Essig vernetztes Silikon/);
  const foam = { ...hb, description: "Dieser einkomponentige PU-Schaum ist zum Dämmen geeignet." };
  assert.match(confirmHornbachPackagePrices(hbHtml(foam), [observed], hbUrl)[0].name, /einkomponentiger PU-Schaum/);
  assert.doesNotMatch(confirmHornbachPackagePrices(hbHtml({ ...foam, abstractProductId: "other" }), [observed], hbUrl)[0].name, /einkomponentiger/);
});

const toomUrl = "https://toom.de/p/test-bauplatte/123456";
const tm = { basic_info: { sku: "123456", name }, details: { base_quantity_unit: "PCE" },
  meta_data: { canonical_url: toomUrl, meta_price: 11.23 }, documents: [{ type: "technischesdatenblatt", filename: "plate_gkb_data" }] };
const tmHtml = (data, price = 11.23) => `<div id="root" data-props="${encodeURIComponent(JSON.stringify({ content: data }))}"></div>
  <meta property="product:price:amount" content="${price}"/><meta property="og:title" content="${name}"/>Alle Preisangaben in EUR inkl.`;
test("toom reads only matching product PCE data with agreeing independent price metadata", () => {
  const row = extractToomProductState(tmHtml(tm), toomUrl)[0];
  assert.equal(row.price, 11.23); assert.equal(row.priceBasis, "package"); assert.equal(row.observedSpecs.type, "standard");
  assert.equal(row.availability, null); assert.equal(row.priceSource, "retailer-product-state");
  assert.equal(extractToomProductState(tmHtml(tm, 4.49), toomUrl).length, 0);
  assert.equal(extractToomProductState(tmHtml({ ...tm, details: { base_quantity_unit: "MTK" } }), toomUrl).length, 0);
  assert.equal(extractToomProductState(tmHtml(tm), toomUrl.replace("123456", "654321")).length, 0);
});
test("toom adds only the brand belonging to the verified SKU, without weakening identity checks", () => {
  const branded = { ...tm, details: { ...tm.details, brand: { name: "Knauf" } } };
  assert.equal(extractToomProductState(tmHtml(branded), toomUrl)[0].name, `Knauf ${name}`);
  assert.equal(extractToomProductState(tmHtml(branded, 9), toomUrl).length, 0);
});
test("toom uses only an explicit positive overpaintable product property", () => {
  for (const [property, accepted] of [["überstreichbar", true], ["Bereits nach 10 min überstreichbar", true], ["nicht überstreichbar", false], ["Für überstreichbare Fugen", false]]) {
    const details = { ...tm.details, selling_points: { items: [property] } };
    assert.equal(extractToomProductState(tmHtml({ ...tm, details }), toomUrl)[0].name.endsWith("; überstreichbar"), accepted);
  }
});
test("reader metadata belongs to the selected SKU and excludes recommended products", () => {
  const related = { basic_info: { name: "Silikon", description: "Fremdes Produkt" }, characteristics: { specs: [{ label: "Material", value: "Silikon" }] } };
  const data = { ...tm, basic_info: { ...tm.basic_info, description: "Eigene Beschreibung" }, recommendedProducts: [related], similarProducts: [related],
    characteristics: { specs: [{ label: "Material", value: "Gipskarton" }] } };
  const row = extractToomProductState(tmHtml(data), toomUrl)[0];
  assert.equal(row.description, "Eigene Beschreibung");
  assert.deepEqual(row.attributes, [{ name: "Material", value: "Gipskarton" }]);
  const selected = { ...hb, description: "Eigener Artikel", brand: { name: "Knauf" }, attributeList: [{ key: "Material", value: "Gips" }] };
  const html = `<script>\nwindow.__ARTICLE_DETAIL_APOLLO_STATE__ = ${JSON.stringify({ selected, other: { ...selected, abstractProductId: "other", description: "Fremder Artikel" } })}\n</script>`;
  const product = confirmHornbachPackagePrices(html, [observed], hbUrl)[0];
  assert.equal(product.description, "Eigener Artikel"); assert.equal(product.brand, "Knauf");
  assert.deepEqual(product.attributes, [{ name: "Material", value: "Gips" }]);
});
test("toom insulation reads SKU-bound dimensions and rejects inconsistent conductivity and package area", () => {
  const characteristics = { specs: [{ code: "mca_laenge", value: "480 cm" }, { code: "mca_breite", value: "120 cm" },
    { code: "mcv_dim_staerke", value: "120 mm" }, { code: "mca_material", value: "Glaswolle" },
    { code: "mca_thermal_conductivity_level", value: "35" }, { code: "mca_waermeleitfaehigkeit", value: "0,035 W/m²K" },
    { code: "mca_inhaltpropackung", value: "5,76 m²" }] };
  const title = "Klemmfilz Integra ZKF1-035 120 mm";
  const data = { ...tm, basic_info: { ...tm.basic_info, name: title }, characteristics };
  const html = tmHtml(data).replace(`content="${name}"`, `content="${title}"`);
  const product = extractToomProductState(html, toomUrl)[0];
  const standard = buildStandard({ name: "Glaswolle Klemmfilz", canonical_version: 1, base_unit: "m2", package_quantity: 5.76,
    specs: { type: "glaswolle-klemmfilz", length_mm: 4800, width_mm: 1200, thickness_mm: 120, pieces: 1, area_m2: 5.76, thermal_conductivity: 0.035, required_terms: ["glaswolle", "035"] } });
  assert.equal(normalizeProductPrice(product, standard)?.packageQuantity, 5.76);
  assert.equal(normalizeProductPrice({ ...product, name: product.name.replace("WLS 035", "WLS 034") }, standard), null);
  assert.equal(extractToomProductState(html.replace(encodeURIComponent("0,035 W/m²K"), encodeURIComponent("0,034 W/m²K")), toomUrl).length, 0);
  assert.equal(normalizeProductPrice({ ...product, observedSpecs: { ...product.observedSpecs, area_m2: 6 } }, standard), null);
});

const globusUrl = "https://www.globus-baumarkt.de/p/test-bauplatte-0123456789/";
const event = { event: "view_item", ecommerce: { currency: "EUR", value: 11.05,
  items: [{ item_id: "GLO123456789", item_name: name, price: 11.05, quantity: 1, location_id: "", affiliation: "" }] } };
const glHtml = (data, price = "11,05", description = "Inhalt: 1 Stück") => `<script>var onEventDataLayer = JSON.parse('${JSON.stringify(data)}');</script>
  <meta property="og:url" content="${globusUrl}"/><meta property="product:product_link" content="${globusUrl}"/>
  <meta property="og:title" content="${name} kaufen | Globus Baumarkt"/><meta property="product:price" content="${price} €"/>
  <div class="product-detail-description-text"><ul><li>${description}</li></ul></div>`;
test("Globus cross-checks the exact SKU and EUR price against one independently declared sale unit", () => {
  const row = extractGlobusProductState(glHtml(event), globusUrl)[0];
  assert.equal(row.price, 11.05); assert.equal(row.priceBasis, "package"); assert.equal(row.observedSpecs.pieces, 1);
  assert.equal(row.availability, null);
  for (const html of [glHtml(event, "4,42"), glHtml(event, "11,05", "Inhalt: 50 Stück"), glHtml({ ...event, ecommerce: { ...event.ecommerce, currency: "USD" } }),
    glHtml({ ...event, ecommerce: { ...event.ecommerce, items: [{ ...event.ecommerce.items[0], location_id: "selected-branch" }] } })])
    assert.equal(extractGlobusProductState(html, globusUrl).length, 0);
});
test("hydration fallback never overrides an explicit invalid or member-only JSON-LD offer", () => {
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, url: toomUrl,
    offers: { "@type": "Offer", price: 11.23, priceCurrency: "EUR", validForMemberTier: "Club" } })}</script>`;
  assert.equal(extractStructuredProducts(tmHtml(tm) + jsonLd, toomUrl, "toom").length, 0);
});
