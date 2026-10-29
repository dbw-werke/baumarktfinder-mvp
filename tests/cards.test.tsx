import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import StoreCard from "../src/components/StoreCard";
import ProductComparison from "../src/components/ProductComparison";
import { getCanonicalComparisonCatalog } from "../src/lib/productComparison";
import { routeFallback, type ResolvedAddress, type StoreCandidate } from "../src/lib/stores";
import type { StorePrice } from "../src/services/prices";
import type { EstimatedComparisonPrice } from "../src/lib/estimatedPrices";

// Deliberately synthetic fixtures, used only for regression testing; never served by the app.
const origin: ResolvedAddress = { countryCode: "DE", address: "Test-Ausgangspunkt", location: { lat: 50.12, lng: 8.65 } };
const store: StoreCandidate = { id: "obi", name: "OBI Testfiliale", placeId: "test-place-1", address: "Teststraße 1", location: { lat: 50.15, lng: 8.69 }, countryCode: "DE", airDistanceMeters: 3500, attributions: [] };
const price: StorePrice = { material_id: "test-material", store_id: "obi", product_name: "Testplatte 1200 × 600 × 12,5 mm", product_url: "https://www.obi.de/p/12345/testplatte", price: 7.2, unit_price: 10, unit: "m2", package_quantity: .72, currency: "EUR", checked_at: "2026-09-20T12:00:00Z", source: "automatic", price_scope: "chain", availability: null };
const observedAt = Date.parse("2026-09-21T10:00:00Z");
const estimate: EstimatedComparisonPrice = {
  kind: "estimate", material_id: "test-material", store_id: "obi", price: 8.64, unit_price: 12,
  package_quantity: .72, unit: "m2", currency: "EUR", method: "median-unit-price-v1", basis: "exact-material",
  sources: [{ ...price, store_id: "hornbach", product_url: "https://www.hornbach.de/p/testplatte/1234567/", normalization_factor: 1 },
    { ...price, store_id: "bauhaus", price: 10.08, unit_price: 14, product_url: "https://www.bauhaus.info/gipskartonplatten/testplatte/p/12345678", normalization_factor: 1 }],
};
const render = (offer?: StorePrice, time = observedAt) => renderToStaticMarkup(<StoreCard store={routeFallback(store)} price={offer} origin={origin} searchTerm="Gipskarton Test" highlighted observedAt={time} />);

test("card separates package price from unit price and links exactly to the priced product", () => {
  const html = render(price);
  assert.match(html, /7,20/);
  assert.match(html, /10,00.*\/ m²/);
  assert.match(html, /Produkt- \/ Packungspreis/);
  assert.ok(html.includes(`href="${price.product_url}"`));
  assert.match(html, /Onlinepreis der Kette/);
  assert.doesNotMatch(html, /Auf Lager|sofort verfügbar/i);
});
test("missing prices stay visibly unavailable and use the official canonical search", () => {
  const html = render();
  assert.match(html, /Preis aktuell nicht verfügbar/);
  assert.match(html, /https:\/\/www.obi.de\/search\/Gipskartonplatte/);
  assert.doesNotMatch(html, /7,20/);
});
test("routing failure shows one Luftlinie label, keeps card and links to the exact physical store", () => {
  const html = render(price);
  assert.equal((html.match(/3,5 km Luftlinie/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Luftlinie Luftlinie/);
  assert.match(html, /Nächste Filiale/);
  assert.doesNotMatch(html, /Geringste Luftlinie/);
  assert.match(html, /Fahrzeit derzeit nicht verfügbar/);
  assert.match(html, /destination_place_id=test-place-1/);
  assert.match(html, /origin=50.12%2C8.65/);
});
test("old/manual observations remain transparent and are not called live prices", () => {
  const html = render({ ...price, source: "manual" }, Date.parse("2026-09-29T12:00:00Z"));
  assert.match(html, /Manuell gepflegt/);
  assert.match(html, /älter als 7 Tage/);
  assert.match(html, /Geprüft:/);
  assert.doesNotMatch(html, /Livepreis|Echtzeitpreis/);
});

test("estimated cards show the numeric target package price, distinct label and traceable sources with a search CTA", () => {
  const html = renderToStaticMarkup(<StoreCard store={routeFallback(store)} estimate={estimate} origin={origin} searchTerm="Gipskarton Test" highlighted observedAt={observedAt} />);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector("article")?.getAttribute("data-price-kind"), "estimate");
  assert.equal(document.querySelector(".matchBadge")?.textContent, "Schätzpreis");
  assert.match(document.querySelector(".packagePrice")?.textContent ?? "", /^ca\. 8,64/);
  assert.match(document.querySelector(".unitPrice")?.textContent ?? "", /^ca\. 12,00.*\/ m²/);
  assert.equal(document.querySelector(".actualSpecification")?.textContent, "0,72 m²");
  assert.equal(document.querySelector(".priceScope")?.textContent, "Unverbindlicher Vergleichswert · kein Händlerangebot");
  const details = document.querySelector(".priceDetails")!;
  assert.match(details.textContent ?? "", /Median geprüfter Grundpreise dieses Materials/);
  assert.match(details.textContent ?? "", /HORNBACH/);
  assert.match(details.textContent ?? "", /BAUHAUS/);
  assert.match(details.textContent ?? "", /20\.09\.2026/);
  assert.deepEqual(Array.from(details.querySelectorAll("a"), (link) => link.href), estimate.sources.map((source) => source.product_url));
  const action = document.querySelector<HTMLAnchorElement>(".offerButton")!;
  assert.match(action.href, /^https:\/\/www\.obi\.de\/search\/Gipskartonplatte/);
  assert.match(action.textContent ?? "", /Beim Händler suchen/);
  assert.doesNotMatch(html, /Preis aktuell nicht verfügbar|Onlinepreis der Kette|Zum Angebot|Auf Lager|sofort verfügbar/);
});

test("verified retail prices always take precedence over an available estimate", () => {
  const html = renderToStaticMarkup(<StoreCard store={routeFallback(store)} price={price} estimate={estimate} origin={origin} searchTerm="Gipskarton Test" highlighted observedAt={observedAt} />);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector("article")?.getAttribute("data-price-kind"), "verified");
  assert.match(document.querySelector(".packagePrice")?.textContent ?? "", /^7,20/);
  assert.equal(document.querySelector(".offerButton")?.getAttribute("href"), price.product_url);
  assert.doesNotMatch(html, /Schätzpreis|Schätzgrundlage|ca\. 8,64/);
});

test("area-normalized sheet estimates explain their adjustment and retain precise source unit prices", () => {
  const sheetEstimate: EstimatedComparisonPrice = { ...estimate, basis: "comparable-material", price: 1.99, unit_price: 1.99, package_quantity: 1, unit: "piece",
    sources: [{ ...estimate.sources[0], product_name: "Test-Schleifpapier, 15 Blatt", price: 11.95, package_quantity: 15, unit: "piece", unit_price: 11.95 / 15, normalization_factor: 2.5 }] };
  const html = renderToStaticMarkup(<StoreCard store={routeFallback(store)} estimate={sheetEstimate} origin={origin} searchTerm="Schleifpapier" highlighted observedAt={observedAt} />);
  const details = new JSDOM(html).window.document.querySelector(".priceDetails")!;
  assert.match(details.textContent ?? "", /Median geprüfter Grundpreise vergleichbarer Materialien/);
  assert.match(details.textContent ?? "", /0,796667/);
  assert.match(details.textContent ?? "", /gewünschte Blattfläche angepasst: Grundpreis × 2,5/);
});

test("estimates for a different retailer cannot leak into the card", () => {
  const html = renderToStaticMarkup(<StoreCard store={routeFallback(store)} estimate={{ ...estimate, store_id: "bauhaus" }} origin={origin} searchTerm="Gipskarton Test" highlighted observedAt={observedAt} />);
  assert.match(html, /Preis aktuell nicht verfügbar/);
  assert.doesNotMatch(html, /ca\. 8,64|Schätzpreis/);
});

test("a dynamic OBI offer keeps its actual size and price instead of an estimate", () => {
  const catalog = getCanonicalComparisonCatalog();
  const requested = catalog.find((item) => item.product_family === "uniflott" && item.package_quantity === 25)!;
  const dynamic = { ...price, store_id: "obi" as const, product_name: "Knauf Uniflott Fugenspachtel, 5 kg", actual_size: "5 kg",
    product_url: "https://www.obi.de/p/6728141/knauf-uniflott-spachtelmasse-5-kg", price: 11.49, unit_price: 2.3,
    package_quantity: 5, unit: "kg" as const, family: "uniflott", match_score: 1 };
  const html = renderToStaticMarkup(<ProductComparison stores={[routeFallback(store)]} origin={origin} offers={[]} material={requested} catalog={catalog} searchTerm={requested.name} observedAt={observedAt} obiOffer={dynamic} />);
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector("article")?.getAttribute("data-price-kind"), "verified");
  assert.match(document.querySelector(".packagePrice")?.textContent ?? "", /^11,49/);
  assert.equal(document.querySelector(".actualSpecification")?.textContent, "5 kg");
  assert.equal(document.querySelector(".matchBadge")?.textContent, "Geprüfter Preis");
  assert.equal(document.querySelector(".offerButton")?.getAttribute("href"), dynamic.product_url);
  assert.doesNotMatch(html, /Schätzpreis|Schätzgrundlage/);
});

test("comparison attaches chain prices to every physical branch and keeps an alternative's own package/link", () => {
  const catalog = getCanonicalComparisonCatalog();
  const requested = catalog.find((item) => item.product_family === "uniflott" && item.package_quantity === 25)!;
  const actual = catalog.find((item) => item.product_family === "uniflott" && item.package_quantity === 5)!;
  assert.ok(requested && actual);
  const observation: StorePrice = { ...price, material_id: actual.id, product_name: actual.name,
    price: 11.49, unit_price: 2.3, unit: "kg", package_quantity: 5, product_url: "https://www.obi.de/p/6728141/knauf-uniflott-spachtelmasse-5-kg" };
  const branches = [routeFallback(store), routeFallback({ ...store, placeId: "test-place-2", name: "OBI Testfiliale 2" }), routeFallback({ ...store, id: "bauhaus", placeId: "test-place-3", name: "BAUHAUS Testfiliale" })];
  const html = renderToStaticMarkup(<ProductComparison stores={branches} origin={origin} offers={[observation]} material={requested} catalog={catalog} searchTerm={requested.name} observedAt={observedAt} />);
  assert.equal((html.match(/<article /g) ?? []).length, 3);
  assert.equal((html.match(/data-match="alternative"/g) ?? []).length, 2);
  assert.equal((html.match(/class="packagePrice">11,49/g) ?? []).length, 2);
  assert.equal((html.match(/class="actualSpecification">5 kg/g) ?? []).length, 2);
  assert.equal((html.match(/Schätzpreis/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Preis aktuell nicht verfügbar/);
  assert.equal((html.match(/href="https:\/\/www.obi.de\/p\/6728141\/knauf-uniflott-spachtelmasse-5-kg"/g) ?? []).length, 2);
  assert.match(html, /destination_place_id=test-place-1/);
  assert.match(html, /destination_place_id=test-place-2/);
  const cards = new JSDOM(html).window.document.querySelectorAll("article");
  assert.equal(cards[2].getAttribute("data-price-kind"), "estimate");
  assert.match(cards[2].querySelector(".packagePrice")?.textContent ?? "", /^ca\. \d/);
  assert.match(cards[2].querySelector(".actualSpecification")?.textContent ?? "", /25 kg/);
  assert.match(cards[2].querySelector(".offerButton")?.getAttribute("href") ?? "", /^https:\/\/www\.bauhaus\.info\/search\?q=/);
  assert.doesNotMatch(html, /führt keine|nicht im Sortiment/);
});
