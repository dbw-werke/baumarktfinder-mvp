/** Read-only application-data audit. Run with `node --import tsx`; no network or DB calls. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getCanonicalComparisonCatalog, selectChainOffer } from "../src/lib/productComparison.ts";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot.ts";
import { getPriceFreshness } from "../src/services/prices.ts";
import { CHAIN_IDS, detectChain, isChainId } from "../src/lib/stores.ts";

export const DEFAULT_MATERIAL_SLUGS = [
  "gipskarton-standard-12-5-1200-600-v1", "knauf-tiefengrund-5l-v1", "knauf-rotband-30kg-v1",
  "acryl-weiss-310ml-v1", "cd60-27-3000-v1", "glaswolle-035-120-6m2-v1",
];
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const reasonCode = (value) => typeof value === "string" && /^[a-z][a-z0-9_:;-]{0,199}$/i.test(value) ? value : null;

function reportedAttempt(report, material, chain) {
  const groups = Array.isArray(report?.materials) ? report.materials : Array.isArray(report?.reports) ? report.reports : [];
  let found = null;
  for (const group of groups) {
    for (const row of Array.isArray(group?.stores) ? group.stores : []) {
      const requested = row.requested_material_id ?? row.preferred_material_id ?? group.material ?? row.material_id;
      if ((requested !== material.id && requested !== material.slug) || (row.chain_id ?? row.store) !== chain) continue;
      const codes = [reasonCode(row.rejection_reason), ...(Array.isArray(row.errors) ? row.errors.map((error) => reasonCode(error?.code)) : [])].filter(Boolean);
      found = { status: reasonCode(row.status) ?? "unknown-report-status", reason_codes: [...new Set(codes)],
        report_observed_at: timestamp(report.completed_at) ?? timestamp(report.started_at),
        reader_products_found: Number.isInteger(row.reader_products_found) && row.reader_products_found >= 0 ? row.reader_products_found : null,
        saved_to_supabase: typeof row.saved_to_supabase === "boolean" ? row.saved_to_supabase : null };
    }
  }
  return found;
}

function noOfferReason(attempt) {
  if (!attempt) return "no-validated-local-observation-and-no-matching-update-report";
  if (["saved", "verified-dry-run"].includes(attempt.status)) return "reported-offer-not-in-validated-local-cache";
  return attempt.reason_codes[0] ?? attempt.status;
}

/** One result per requested material and chain, using precisely the application's selector. */
export function buildCoverageAudit({ materials, offers, materialSlugs = DEFAULT_MATERIAL_SLUGS, allMaterials = false, updateReport = null, branches = null, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error("Invalid audit time.");
  if (allMaterials) materialSlugs = materials.filter((material) => material.active !== false && material.canonical_version >= 1).map((material) => material.slug);
  if (!Array.isArray(materialSlugs) || !materialSlugs.length) throw new Error("At least one canonical material slug is required.");
  const targets = [...new Set(materialSlugs)].map((slug) => {
    const matches = materials.filter((material) => material.slug === slug);
    if (matches.length !== 1) throw new Error(`Missing or ambiguous canonical material: ${slug}`);
    return matches[0];
  });
  const metadata = new Map(materials.map((material) => [material.id, material]));
  const rows = targets.flatMap((target) => CHAIN_IDS.map((chain) => {
    const selection = selectChainOffer(target, offers, materials, chain);
    const price = selection.price, actual = price ? metadata.get(price.material_id) : null;
    const attempt = reportedAttempt(updateReport, target, chain);
    return { chain_id: chain, requested_material_id: target.id, requested_material_slug: target.slug,
      requested_specification: selection.preferredSpecification, match: selection.match,
      material_id: price?.material_id ?? null, material_slug: actual?.slug ?? null,
      actual_specification: selection.actualSpecification, specs: actual?.specs ?? null,
      package_size: price ? { quantity: price.package_quantity, unit: price.unit } : null,
      package_price: price?.price ?? null, unit_price: price?.unit_price ?? null, currency: price?.currency ?? null,
      product_name: price?.product_name ?? null, product_url: price?.product_url ?? null,
      source: price?.source ?? null, coverage_source: price?.source === "manual" ? "manual_verified" : price?.source ?? null, checked_at: price?.checked_at ?? null,
      freshness: price ? getPriceFreshness(price.checked_at, now) : null,
      no_offer_reason: price ? null : noOfferReason(attempt), last_update_attempt: attempt };
  }));
  const branchProof = auditBranchMappings(branches, rows);
  return { audited_at: new Date(now).toISOString(),
    scope: "Validated bundled price observations and current canonical definitions; no live retailer, database, branch stock or availability check.",
    observation_times_preserved: true, application_data_modified: false,
    summary: { requested_materials: targets.length, chains: CHAIN_IDS.length, matrix_rows: rows.length,
      validated_cached_offers: offers.length, exact: rows.filter((row) => row.match === "exact").length,
      alternative: rows.filter((row) => row.match === "alternative").length,
      unavailable: rows.filter((row) => row.match === "unavailable").length,
      manual_verified: rows.filter((row) => row.coverage_source === "manual_verified").length,
      automatic: rows.filter((row) => row.coverage_source === "automatic").length,
      materials_with_any_offer: targets.filter((target) => rows.some((row) => row.requested_material_id === target.id && row.match !== "unavailable")).length,
      fully_covered_materials: targets.filter((target) => rows.filter((row) => row.requested_material_id === target.id).every((row) => row.match !== "unavailable")).length },
    coverage_by_chain: CHAIN_IDS.map((chain) => {
      const selected = rows.filter((row) => row.chain_id === chain);
      return { chain_id: chain, requested_materials: selected.length, exact: selected.filter((row) => row.match === "exact").length,
        alternative: selected.filter((row) => row.match === "alternative").length, unavailable: selected.filter((row) => row.match === "unavailable").length,
        manual_verified: selected.filter((row) => row.coverage_source === "manual_verified").length, automatic: selected.filter((row) => row.coverage_source === "automatic").length };
    }),
    rows, branch_proof: branchProof };
}

/** Branch IDs stay distinct; only their verified canonical chain selects a price. */
export function auditBranchMappings(input, rows) {
  if (input === null || input === undefined) return { status: "not-supplied", mappings: [], rejected: [] };
  const stores = Array.isArray(input) ? input : Array.isArray(input.stores) ? input.stores : Array.isArray(input.data?.stores) ? input.data.stores : null;
  if (!stores) return { status: "no-store-data-in-supplied-evidence", mappings: [], rejected: [] };
  const mappings = [], rejected = [], seen = new Set();
  for (const store of stores) {
    const placeId = typeof store?.placeId === "string" && store.placeId.trim() ? store.placeId : null;
    const name = typeof store?.name === "string" ? store.name : "";
    if (!placeId || store.countryCode !== "DE" || !isChainId(store.id) || detectChain(name) !== store.id || seen.has(placeId)) {
      rejected.push({ physical_branch_id: placeId, reason: "invalid-duplicate-or-mismatched-canonical-chain" });
      continue;
    }
    seen.add(placeId);
    mappings.push({ physical_branch_id: placeId, branch_name: name, chain_id: store.id,
      selections: rows.filter((row) => row.chain_id === store.id).map((row) => ({
        requested_material_id: row.requested_material_id, material_id: row.material_id, match: row.match,
        package_price: row.package_price, product_url: row.product_url, checked_at: row.checked_at,
      })) });
  }
  return { status: "stored-branch-evidence-only-not-a-live-location-check", mappings, rejected };
}

export function parseAuditArguments(args) {
  const options = { materialSlugs: DEFAULT_MATERIAL_SLUGS, allMaterials: false, updateReport: null, branches: null, report: null };
  let explicitMaterials = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--all-materials") { options.allMaterials = true; continue; }
    const value = args[++index];
    if (!["--materials", "--update-report", "--branches", "--report"].includes(flag) || !value || value.startsWith("--")) throw new Error("Usage: npm run prices:audit -- [--all-materials | --materials slug,slug] [--update-report file.json] [--branches file.json] [--report work/audit.json]");
    if (flag === "--materials") {
      explicitMaterials = true;
      const slugs = value.split(",").map((slug) => slug.trim());
      if (slugs.some((slug) => !/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug))) throw new Error("Invalid canonical material slug.");
      options.materialSlugs = slugs;
    } else options[{ "--update-report": "updateReport", "--branches": "branches", "--report": "report" }[flag]] = value;
  }
  if (options.allMaterials && explicitMaterials) throw new Error("Choose --all-materials or --materials, not both.");
  return options;
}

/** Reports may only be written to evidence/scratch directories, never app data or source. */
export function safeAuditReportPath(file, inputs = []) {
  const path = resolve(file);
  const allowed = [resolve(projectRoot, "work"), resolve(projectRoot, "docs/evidence")].some((base) => {
    const tail = relative(base, path);
    return tail !== "" && !tail.startsWith("..") && !isAbsolute(tail);
  });
  if (!allowed || !path.endsWith(".json") || inputs.some((input) => input && resolve(input) === path)) throw new Error("Audit output must be a new report under work/ or docs/evidence/, distinct from all inputs.");
  return path;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseAuditArguments(args);
  const readJson = async (path) => path ? JSON.parse(await readFile(path, "utf8")) : null;
  const [updateReport, branches] = await Promise.all([readJson(options.updateReport), readJson(options.branches)]);
  const report = buildCoverageAudit({ materials: getCanonicalComparisonCatalog(), offers: getCatalogSnapshot(CHAIN_IDS),
    materialSlugs: options.materialSlugs, allMaterials: options.allMaterials, updateReport, branches });
  if (options.report) {
    const path = safeAuditReportPath(options.report, [options.updateReport, options.branches]);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...report.summary, report: relative(projectRoot, path), branch_proof: report.branch_proof.status, application_data_modified: false }, null, 2));
  } else console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
