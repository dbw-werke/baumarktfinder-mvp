/** Read-only full-catalog audit; estimates and verified retailer offers remain separate. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getCanonicalComparisonCatalog, selectChainOffer } from "../src/lib/productComparison.ts";
import { estimateComparisonPrice } from "../src/lib/estimatedPrices.ts";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot.ts";
import { CHAIN_IDS } from "../src/lib/stores.ts";
import { safeAuditReportPath } from "./audit-price-coverage.mjs";

const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const hasNumericPrice = (value) => value && positive(value.price) && positive(value.unit_price) && positive(value.package_quantity);

function summarize(rows) {
  const verified = rows.filter((row) => row.price_kind === "verified").length;
  const estimated = rows.filter((row) => row.price_kind === "estimate").length;
  const missing = rows.filter((row) => row.price_kind === "unavailable").length;
  return {
    combinations: rows.length,
    verified_prices: verified,
    estimated_prices: estimated,
    missing_numeric_prices: missing,
    numeric_price_coverage_percent: rows.length ? Math.floor((verified + estimated) / rows.length * 10000) / 100 : 0,
    verified_price_coverage_percent: rows.length ? Math.floor(verified / rows.length * 10000) / 100 : 0,
  };
}

/** Uses the same verified-first selection and fallback as ProductComparison. */
export function buildNumericalCoverageAudit({ materials = getCanonicalComparisonCatalog(), offers = getCatalogSnapshot(CHAIN_IDS), now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new Error("Invalid audit time.");
  const targets = materials.filter((material) => material.active !== false && material.canonical_version >= 1);
  if (!targets.length) throw new Error("No active canonical materials to audit.");
  if (new Set(targets.map((material) => material.id)).size !== targets.length) throw new Error("Duplicate active canonical material ID.");
  const rows = targets.flatMap((target) => CHAIN_IDS.map((chain) => {
    const selection = selectChainOffer(target, offers, materials, chain);
    const verified = selection.price;
    const estimate = verified ? null : estimateComparisonPrice(target, offers, materials, chain);
    const value = verified ?? estimate;
    const numeric = hasNumericPrice(value);
    return {
      requested_material_id: target.id,
      requested_material_slug: target.slug ?? null,
      requested_product_name: target.name,
      requested_specification: selection.preferredSpecification,
      chain_id: chain,
      price_kind: numeric ? verified ? "verified" : "estimate" : "unavailable",
      verified_match: verified && numeric ? selection.match : null,
      material_id: value?.material_id ?? null,
      package_price: numeric ? value.price : null,
      unit_price: numeric ? value.unit_price : null,
      package_quantity: numeric ? value.package_quantity : null,
      unit: numeric ? value.unit : null,
      currency: numeric ? value.currency : null,
      product_name: verified?.product_name ?? null,
      product_url: verified?.product_url ?? null,
      actual_specification: verified ? selection.actualSpecification : null,
      source: verified?.source ?? null,
      checked_at: verified?.checked_at ?? null,
      estimate: estimate && numeric ? { method: estimate.method, basis: estimate.basis, sources: estimate.sources } : null,
      missing_reason: numeric ? null : value ? "invalid-numeric-price" : "no-validated-offer-or-compatible-estimate-basis",
    };
  }));
  const summary = summarize(rows);
  const uniquePairs = new Set(rows.map((row) => `${row.requested_material_id}:${row.chain_id}`));
  if (uniquePairs.size !== targets.length * CHAIN_IDS.length || summary.verified_prices + summary.estimated_prices + summary.missing_numeric_prices !== rows.length) {
    throw new Error("Incomplete or duplicate product/store audit matrix.");
  }
  return {
    audited_at: new Date(now).toISOString(),
    scope: "All active canonical products × all configured chains, using validated bundled observations and the runtime estimator. No live retailer, database, physical branch stock or deployment verification.",
    application_data_modified: false,
    estimates_are_verified_retailer_prices: false,
    summary: { active_products: targets.length, chains: CHAIN_IDS.length, ...summary },
    coverage_by_chain: CHAIN_IDS.map((chain) => ({ chain_id: chain, ...summarize(rows.filter((row) => row.chain_id === chain)) })),
    rows,
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--report" || !args[1])) {
    throw new Error("Usage: node --import tsx scripts/audit-numerical-price-coverage.mjs [--report docs/evidence/report.json]");
  }
  const output = args[1] ? safeAuditReportPath(args[1]) : null;
  const report = buildNumericalCoverageAudit();
  if (output) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...report.summary, report: output, application_data_modified: false }, null, 2));
  } else console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
