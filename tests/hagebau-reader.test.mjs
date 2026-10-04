import test from "node:test";
import assert from "node:assert/strict";
import { extractHagebauProductState } from "../scripts/shop-reader/hagebau-state.mjs";

// Deliberately synthetic regression fixture; never added to the customer catalog.
const page = "https://www.hagebau.de/p/testprodukt-anP1234567/";
const variant = "https://www.hagebau.de/p/testprodukt-anV123456/";
function fixture(change = () => {}) {
  const prices = { displayPrice: { value: 10, currency: "EUR" },
    customerCardDisplayPrice: { value: 8, currency: "EUR" },
    unitPrice: { valid: true, price: { value: 2, currency: "EUR" }, unit: "kg" } };
  const data = { dedicatedItemUrl: variant, productDetails: {
    product: { id: "P1234567", itemId: "123456", ean: "1234567890123", name: "Uniflott 5 kg", brand: { name: "Knauf" },
      available: true, statusOnline: "available", statusStore: "storeNotSet", hasStorePriceAndStock: false, highlightUnitPrice: false,
      price: { defaultPriceType: "ONLINE", isFromPrice: false, onlinePrices: prices, prices: structuredClone(prices) } },
    features: [{ name: "Gebindegröße", value: "5 kg" }] } };
  const product = { "@type": "Product", sku: "123456", gtin13: "1234567890123", brand: { name: "Knauf" },
    offers: { "@type": "Offer", price: 10, priceCurrency: "EUR", url: variant, availability: "https://schema.org/InStock" } };
  change(data, product);
  return `<link rel="canonical" href="${page}"><script type="application/ld+json">${JSON.stringify(product)}</script>\nproductData: ${JSON.stringify(data)},\n`;
}
const read = (change) => extractHagebauProductState(fixture(change), page, new Date("2026-10-01T12:00:00Z"));
test("hagebau same-SKU normal package price excludes the customer-card discount", () => {
  const [product] = read();
  assert.equal(product.price, 10); assert.equal(product.priceBasis, "package");
  assert.equal(product.observedSpecs.weight_kg, 5); assert.equal(product.declaredUnitPrice, 2);
});
test("hagebau rejects another SKU, variant or conflicting total", () => {
  for (const change of [(_, p) => { p.sku = "999999"; }, (d) => { d.dedicatedItemUrl = variant.replace("123456", "999999"); },
    (_, p) => { p.offers.price = 8; }, (d) => { d.productDetails.product.price.prices.displayPrice.value = 8; }]) assert.deepEqual(read(change), []);
});
test("hagebau rejects unavailable, local-only or conditional offers", () => {
  for (const change of [(d) => { d.productDetails.product.available = false; }, (d) => { d.productDetails.product.hasStorePriceAndStock = true; },
    (d) => { d.productDetails.product.price.defaultPriceType = "OUTLET_PLACEHOLDER"; }, (_, p) => { p.offers.validForMemberTier = "card"; },
    (_, p) => { p.offers.eligibleQuantity = { minValue: 12 }; }]) assert.deepEqual(read(change), []);
});
test("hagebau rejects unit-only totals and contradictory package evidence", () => {
  for (const change of [(d) => { d.productDetails.product.price.onlinePrices.displayPriceUnit = "kg"; },
    (d) => { d.productDetails.features[0].value = "25 kg"; },
    (d) => { d.productDetails.product.price.onlinePrices.unitPrice.price.value = 1; }]) assert.deepEqual(read(change), []);
});
