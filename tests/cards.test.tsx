import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import StoreCard from "../src/components/StoreCard";
import ProductComparison from "../src/components/ProductComparison";
import { getCanonicalComparisonCatalog } from "../src/lib/productComparison";
import { routeFallback, type ResolvedAddress, type StoreCandidate } from "../src/lib/stores";
import type { StorePrice } from "../src/services/prices";

// Deliberately synthetic fixtures, used only for regression testing; never served by the app.
const origin: ResolvedAddress = { countryCode: "DE", address: "Test-Ausgangspunkt", location: { lat: 50.12, lng: 8.65 } };
const store: StoreCandidate = { id: "obi", name: "OBI Testfiliale", placeId: "test-place-1", address: "Teststraße 1", location: { lat: 50.15, lng: 8.69 }, countryCode: "DE", airDistanceMeters: 3500, attributions: [] };
const price: StorePrice = { material_id: "test-material", store_id: "obi", product_name: "Testplatte 1200 × 600 × 12,5 mm", product_url: "https://www.obi.de/p/12345/testplatte", price: 7.2, unit_price: 10, unit: "m2", package_quantity: .72, currency: "EUR", checked_at: "2026-09-20T12:00:00Z", source: "automatic", price_scope: "chain", availability: null };
const observedAt = Date.parse("2026-09-21T10:00:00Z");
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
  assert.match(html, /Preis nicht verfügbar/);
  assert.match(html, /https:\/\/www.obi.de\/search\/Gipskarton%20Test/);
  assert.doesNotMatch(html, /7,20/);
});
test("routing failure shows one Luftlinie label, keeps card and links to the exact physical store", () => {
  const html = render(price);
  assert.equal((html.match(/3,5 km Luftlinie/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Luftlinie Luftlinie/);
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
  assert.equal((html.match(/Preis nicht verfügbar/g) ?? []).length, 1);
  assert.equal((html.match(/href="https:\/\/www.obi.de\/p\/6728141\/knauf-uniflott-spachtelmasse-5-kg"/g) ?? []).length, 2);
  assert.match(html, /destination_place_id=test-place-1/);
  assert.match(html, /destination_place_id=test-place-2/);
  assert.doesNotMatch(html, /57,45|führt keine|nicht im Sortiment/);
});
