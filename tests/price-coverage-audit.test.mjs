import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { DEFAULT_MATERIAL_SLUGS, auditBranchMappings, buildCoverageAudit, parseAuditArguments, safeAuditReportPath } from "../scripts/audit-price-coverage.mjs";
import { getCanonicalComparisonCatalog } from "../src/lib/productComparison.ts";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot.ts";
import { CHAIN_IDS } from "../src/lib/stores.ts";

const materials = getCanonicalComparisonCatalog();
const bySlug = (slug) => materials.find((material) => material.slug === slug);
const small = bySlug("gipskarton-standard-12-5-1200-600-v1");
const large = bySlug("gipskarton-standard-12-5-2000-1250-v1");
const checkedAt = "2026-09-20T12:00:00Z";
// Synthetic test-only observations and physical branches never enter app snapshots.
const offer = { material_id: small.id, store_id: "obi", product_name: small.name, product_url: "https://www.obi.de/p/123456/testplatte",
  price: 7.2, unit_price: 10, package_quantity: .72, unit: "m2", currency: "EUR", checked_at: checkedAt,
  source: "manual", price_scope: "chain", availability: null };
const audit = (extra = {}) => buildCoverageAudit({ materials, offers: [offer], materialSlugs: [large.slug], now: Date.parse("2026-09-30T12:00:00Z"), ...extra });

test("actual bundled data produce exactly the user's six categories by seven chains", () => {
  const report = buildCoverageAudit({ materials, offers: getCatalogSnapshot(CHAIN_IDS) });
  assert.equal(report.rows.length, 42);
  assert.equal(report.summary.chains, 7);
  assert.equal(report.summary.requested_materials, 6);
  assert.ok(DEFAULT_MATERIAL_SLUGS.includes("acryl-weiss-310ml-v1"));
  assert.ok(!DEFAULT_MATERIAL_SLUGS.includes("knauf-uniflott-25kg-v1"));
  for (const slug of DEFAULT_MATERIAL_SLUGS) assert.deepEqual(report.rows.filter((row) => row.requested_material_slug === slug).map((row) => row.chain_id), [...CHAIN_IDS]);
});

test("audit uses the actual alternative's own ID, total, specification, source and original date", () => {
  const row = audit().rows.find((row) => row.chain_id === "obi");
  assert.equal(row.match, "alternative");
  assert.equal(row.material_id, small.id);
  assert.equal(row.requested_material_id, large.id);
  assert.equal(row.package_price, 7.2);
  assert.equal(row.package_size.quantity, .72);
  assert.equal(row.unit_price, 10);
  assert.equal(row.source, "manual");
  assert.equal(row.coverage_source, "manual_verified");
  assert.equal(row.checked_at, checkedAt);
  assert.equal(row.freshness, "stale");
  assert.equal(row.product_url, offer.product_url);
  assert.equal(row.no_offer_reason, null);
});

test("all-materials covers every canonical variant and preserves structured rejection details", () => {
  const updateReport = { materials: [{ material: large.slug, stores: [{ chain_id: "hornbach", requested_material_id: large.id,
    status: "no-exact-verified-offer", rejection_reason: "specification-mismatch:width_mm;length_mm" }] }] };
  const report = audit({ allMaterials: true, updateReport });
  assert.equal(report.rows.length, materials.length * CHAIN_IDS.length);
  assert.equal(report.summary.requested_materials, materials.length);
  assert.equal(report.rows.find((row) => row.requested_material_id === large.id && row.chain_id === "hornbach").no_offer_reason, "specification-mismatch:width_mm;length_mm");
  assert.equal(report.summary.manual_verified, 2);
  assert.equal(report.summary.automatic, 0);
  assert.equal(report.summary.materials_with_any_offer, 2);
  assert.equal(report.summary.fully_covered_materials, 0);
  assert.equal(report.coverage_by_chain.find((row) => row.chain_id === "obi").manual_verified, 2);
  assert.equal(parseAuditArguments(["--all-materials"]).allMaterials, true);
  assert.throws(() => parseAuditArguments(["--all-materials", "--materials", small.slug]), /Choose/);
});

test("new and older updater report shapes explain gaps without discarding a retained price", () => {
  const updateReport = { completed_at: "2026-09-29T12:00:00Z", materials: [{ material: large.slug, stores: [
    { chain_id: "obi", requested_material_id: large.id, status: "blocked", rejection_reason: "robots-denied", reader_products_found: 0, saved_to_supabase: false },
    { store: "hornbach", status: "no-exact-verified-offer", errors: [{ code: "not-found", url: "https://example.invalid/private" }] },
    { chain_id: "toom", requested_material_id: large.id, status: "saved", package_price: 999 },
  ] }] };
  const rows = audit({ updateReport }).rows;
  assert.equal(rows.find((row) => row.chain_id === "obi").package_price, 7.2);
  assert.deepEqual(rows.find((row) => row.chain_id === "obi").last_update_attempt.reason_codes, ["robots-denied"]);
  assert.equal(rows.find((row) => row.chain_id === "hornbach").no_offer_reason, "not-found");
  const missing = rows.find((row) => row.chain_id === "toom");
  assert.equal(missing.no_offer_reason, "reported-offer-not-in-validated-local-cache");
  assert.equal(missing.package_price, null, "A report total never becomes a cached/verified offer");
  assert.equal(rows.find((row) => row.chain_id === "hagebau").no_offer_reason, "no-validated-local-observation-and-no-matching-update-report");
});

test("another requested variant's failure is never attributed to the preferred ID", () => {
  const updateReport = { materials: [{ material: large.slug, stores: [
    { chain_id: "hornbach", requested_material_id: small.id, status: "blocked" },
    { chain_id: "toom", requested_material_id: large.id, status: "collection-error", rejection_reason: "Authorization: synthetic-secret", error: "synthetic-secret" },
  ] }] };
  const report = audit({ updateReport });
  assert.equal(report.rows.find((row) => row.chain_id === "hornbach").last_update_attempt, null);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-secret|Authorization/);
  assert.equal(report.rows.find((row) => row.chain_id === "toom").no_offer_reason, "collection-error");
});

test("distinct physical branches map to canonical chains, never to another retailer's price", () => {
  const branches = { data: { stores: [
    { id: "obi", placeId: "synthetic-obi-a", name: "OBI Testfiliale A", countryCode: "DE" },
    { id: "obi", placeId: "synthetic-obi-b", name: "OBI Testfiliale B", countryCode: "DE" },
    { id: "hornbach", placeId: "synthetic-hornbach", name: "HORNBACH Testfiliale", countryCode: "DE" },
    { id: "hornbach", placeId: "synthetic-mismatch", name: "OBI falsch zugeordnet", countryCode: "DE" },
  ] } };
  const proof = audit({ branches }).branch_proof;
  assert.equal(proof.mappings.length, 3);
  assert.equal(proof.rejected.length, 1);
  assert.notEqual(proof.mappings[0].physical_branch_id, proof.mappings[1].physical_branch_id);
  assert.deepEqual(proof.mappings[0].selections, proof.mappings[1].selections);
  assert.equal(proof.mappings[0].selections[0].product_url, offer.product_url);
  assert.equal(proof.mappings[2].selections[0].package_price, null);
  assert.equal(auditBranchMappings({ data: { error: "timeout" } }, []).status, "no-store-data-in-supplied-evidence");
});

test("CLI scopes are explicit and report writes cannot overwrite application data or inputs", () => {
  assert.deepEqual(parseAuditArguments(["--materials", "knauf-uniflott-25kg-v1"]).materialSlugs, ["knauf-uniflott-25kg-v1"]);
  assert.throws(() => parseAuditArguments(["--write"]), /Usage/);
  assert.throws(() => parseAuditArguments(["--materials", "gk,,other"]), /Invalid/);
  assert.throws(() => audit({ materialSlugs: ["unknown-definition"] }), /Missing/);
  assert.equal(safeAuditReportPath("work/test-coverage.json"), resolve("work/test-coverage.json"));
  assert.throws(() => safeAuditReportPath("src/data/manual-prices.json"), /Audit output/);
  assert.throws(() => safeAuditReportPath("docs/evidence/source.json", ["docs/evidence/source.json"]), /Audit output/);
});
