import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ProductComparison from "../src/components/ProductComparison";
import { buildNumericalCoverageAudit, main } from "../scripts/audit-numerical-price-coverage.mjs";
import { getCanonicalComparisonCatalog, selectChainOffer } from "../src/lib/productComparison";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { CHAINS, CHAIN_IDS, routeFallback, type ResolvedAddress } from "../src/lib/stores";
import { getStoreUrl } from "../src/lib/resolver";
import { getMaterialSearchTerms } from "../src/lib/materialSearch.mjs";

const materials = getCanonicalComparisonCatalog();
const active = materials.filter((material) => material.active !== false && material.canonical_version >= 1);
const offers = getCatalogSnapshot(CHAIN_IDS);
const now = Date.parse("2026-10-27T12:00:00Z");
const report = buildNumericalCoverageAudit({ materials, offers, now });
const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const origin: ResolvedAddress = { address: "Test-Ausgangspunkt", countryCode: "DE", location: { lat: 50.12, lng: 8.65 } };
// Synthetic physical branches exercise real components; no fixture enters application data.
const stores = CHAIN_IDS.map((id, index) => routeFallback({
  id, placeId: `numeric-audit-${id}`, name: `${CHAINS[id].name} Testfiliale`,
  address: "Teststraße 1", countryCode: "DE", location: { lat: 50.15, lng: 8.69 },
  airDistanceMeters: 2000 + index * 1000, attributions: [],
}));

test("full active catalog × all chains has one genuine numeric result per pair, with estimates counted separately", () => {
  assert.ok(active.length > 0);
  assert.equal(report.summary.active_products, active.length);
  assert.equal(report.summary.chains, CHAIN_IDS.length);
  assert.equal(report.rows.length, active.length * CHAIN_IDS.length);
  assert.equal(new Set(report.rows.map((row) => `${row.requested_material_id}:${row.chain_id}`)).size, report.rows.length);
  assert.equal(report.summary.missing_numeric_prices, 0);
  assert.equal(report.summary.numeric_price_coverage_percent, 100);
  assert.equal(report.summary.verified_prices + report.summary.estimated_prices, report.rows.length);
  assert.ok(report.summary.estimated_prices > 0, "Do not report estimates as verified coverage");
  assert.equal(report.estimates_are_verified_retailer_prices, false);
  assert.equal(report.application_data_modified, false);
  for (const row of report.rows) {
    assert.ok(typeof row.package_price === "number" && Number.isFinite(row.package_price) && row.package_price > 0, `${row.requested_material_slug}/${row.chain_id}`);
    assert.ok(typeof row.unit_price === "number" && Number.isFinite(row.unit_price) && row.unit_price > 0);
    assert.ok(typeof row.package_quantity === "number" && Number.isFinite(row.package_quantity) && row.package_quantity > 0);
    assert.equal(row.currency, "EUR");
  }
});

test("audit preserves every verified selection and exposes estimate sources without inventing target-retailer offers", () => {
  const original = JSON.stringify({ materials, offers });
  const repeat = buildNumericalCoverageAudit({ materials, offers, now });
  assert.deepEqual(repeat, report, "Calculation must be reproducible");
  assert.equal(JSON.stringify({ materials, offers }), original);
  for (const material of active) {
    for (const chain of CHAIN_IDS) {
      const row = report.rows.find((item) => item.requested_material_id === material.id && item.chain_id === chain)!;
      const selected = selectChainOffer(material, offers, materials, chain).price;
      if (selected) {
        assert.equal(row.price_kind, "verified");
        assert.equal(row.material_id, selected.material_id);
        assert.equal(row.package_price, selected.price);
        assert.equal(row.unit_price, selected.unit_price);
        assert.equal(row.package_quantity, selected.package_quantity);
        assert.equal(row.product_url, selected.product_url);
        assert.equal(row.checked_at, selected.checked_at);
        assert.equal(row.estimate, null);
      } else {
        assert.equal(row.price_kind, "estimate");
        assert.equal(row.material_id, material.id);
        assert.equal(row.package_quantity, material.package_quantity);
        assert.equal(row.unit, material.base_unit);
        assert.equal(row.product_url, null);
        assert.equal(row.checked_at, null);
        assert.equal(row.source, null);
        assert.equal(row.estimate?.method, "median-unit-price-v1");
        assert.ok(row.estimate);
        assert.ok(row.estimate.sources.length > 0);
        assert.equal(new Set(row.estimate.sources.map((source) => source.store_id)).size, row.estimate.sources.length);
        for (const source of row.estimate.sources) {
          assert.ok(source.product_url.startsWith("https://"));
          assert.ok(Number.isFinite(Date.parse(source.checked_at)));
          assert.ok(source.price > 0 && source.unit_price > 0 && source.package_quantity > 0);
        }
      }
    }
  }
});

test("every product/store pair renders its actual numeric price, truthful badge, quantity and correct retailer action", () => {
  let rendered = 0;
  for (const material of active) {
    const html = renderToStaticMarkup(createElement(ProductComparison, {
      stores, origin, offers, material, catalog: materials, searchTerm: material.name, observedAt: now,
    }));
    const dom = new JSDOM(html);
    const cards = [...dom.window.document.querySelectorAll("article.productOfferCard")];
    assert.equal(cards.length, CHAIN_IDS.length, material.name);
    for (const [index, card] of cards.entries()) {
      const chain = CHAIN_IDS[index];
      const row = report.rows.find((item) => item.requested_material_id === material.id && item.chain_id === chain)!;
      const context = `${material.slug}/${chain}`;
      assert.equal(card.getAttribute("data-store-id"), stores[index].placeId, context);
      assert.equal(card.getAttribute("data-price-kind"), row.price_kind, context);
      assert.equal(card.querySelector(".missingPrice"), null, context);
      assert.ok(typeof row.package_price === "number", context);
      assert.equal(card.querySelector(".packagePrice")?.textContent, `${row.price_kind === "estimate" ? "ca. " : ""}${money.format(row.package_price)}`, context);
      assert.equal(card.querySelector(".actualSpecification")?.textContent, row.actual_specification ?? row.requested_specification, context);
      const action = card.querySelector<HTMLAnchorElement>(".offerButton")!;
      if (row.price_kind === "estimate") {
        assert.ok(row.estimate, context);
        assert.equal(card.querySelector(".matchBadge")?.textContent, "Schätzpreis", context);
        assert.equal(card.querySelector(".priceScope")?.textContent, "Unverbindlicher Vergleichswert · kein Händlerangebot", context);
        assert.match(card.querySelector(".unitPrice")?.textContent ?? "", /^ca\. \d/, context);
        assert.match(action.textContent ?? "", /Beim Händler suchen/, context);
        assert.equal(action.getAttribute("href"), getStoreUrl(chain, getMaterialSearchTerms(material.name)[0] || material.name), context);
        assert.doesNotMatch(card.textContent ?? "", /Onlinepreis der Kette|Zum Angebot|Auf Lager|sofort verfügbar/, context);
        assert.deepEqual([...card.querySelectorAll<HTMLAnchorElement>(".priceDetails a")].map((link) => link.getAttribute("href")), row.estimate.sources.map((source) => source.product_url), context);
      } else {
        assert.notEqual(card.querySelector(".matchBadge")?.textContent, "Schätzpreis", context);
        const knownBrokenPage = chain === "bauhaus" && /\/p\/27790416\/?$/.test(row.product_url ?? "");
        assert.equal(action.getAttribute("href"), knownBrokenPage ? getStoreUrl(chain, "27790416") : row.product_url, context);
      }
      rendered += 1;
    }
    dom.window.close();
  }
  assert.equal(rendered, active.length * CHAIN_IDS.length);
});

test("an unsupported future material cannot cause a false 100 percent numeric-coverage claim", () => {
  const unknown = { ...active[0], id: "test-unsupported-material", slug: "test-unsupported-material", product_family: "test-unsupported-material", name: "Test-only unknown material" };
  const missing = buildNumericalCoverageAudit({ materials: [unknown], offers: [], now });
  assert.equal(missing.summary.verified_prices, 0);
  assert.equal(missing.summary.estimated_prices, 0);
  assert.equal(missing.summary.missing_numeric_prices, CHAIN_IDS.length);
  assert.equal(missing.summary.numeric_price_coverage_percent, 0);
  assert.ok(missing.rows.every((row) => row.package_price === null && row.missing_reason));
  assert.throws(() => buildNumericalCoverageAudit({ materials: [], offers: [], now }), /No active/);
  assert.throws(() => buildNumericalCoverageAudit({ materials: [active[0], active[0]], offers: [], now }), /Duplicate/);
});

test("audit CLI rejects application-data outputs and unknown arguments before writing", async () => {
  await assert.rejects(main(["--report", "src/data/numerical-prices.json"]), /Audit output/);
  await assert.rejects(main(["--report", "supabase/seed.sql"]), /Audit output/);
  await assert.rejects(main(["--materials", active[0].slug!]), /Usage:/);
});
