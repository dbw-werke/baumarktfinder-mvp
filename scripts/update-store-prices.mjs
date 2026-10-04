import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createShopReader, STORE_IDS, productUrl } from "./shop-reader/shops.mjs";
import { buildStandard, filterCrossStorePriceOutliers, normalize } from "./shop-reader/product-standardizer.mjs";
import { findStoreProduct } from "./shop-reader/product-alternatives.mjs";

export function createRepository(client) {
  return {
    async materials() {
      const { data, error } = await client.from("materials").select("*").eq("active", true).gte("canonical_version", 1).order("name");
      if (error) throw new Error(`Material schema unavailable (${error.code || "database-error"}); apply migration and seed first.`);
      return data || [];
    },
    async mapping(materialId, storeId) {
      const { data, error } = await client.from("store_products").select("product_url").eq("material_id", materialId).eq("store_id", storeId).eq("active", true).maybeSingle();
      if (error) throw new Error(`Product mapping unavailable (${error.code || "database-error"}).`);
      return data?.product_url;
    },
    async save(payload) {
      const { data, error } = await client.rpc("save_verified_price", { payload });
      if (error) throw new Error(`Atomic price write failed (${error.code || "database-error"}).`);
      return data;
    },
  };
}
export function databaseRepository() {
  dotenv.config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server.");
  return createRepository(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
export function pricePayload(material, storeId, product, source = "automatic") {
  const url = productUrl(storeId, product.url);
  if (!url) throw new Error("Invalid official product URL.");
  return { material_id: material.id, store_id: storeId, product_name: product.name, product_url: url,
    price: product.price, package_quantity: product.packageQuantity, base_unit: product.unit, currency: "EUR",
    source, price_scope: "chain", checked_at: product.retrievedAt || new Date().toISOString(),
    external_id: product.externalId || null, availability: product.availability || null, match_evidence: product.matchEvidence };
}

/** No write is attempted until a valid current offer has passed every canonical check. */
export async function updateMaterial(material, { repository, reader, stores = STORE_IDS, dryRun = false, candidateUrls = {}, canonicalMaterials = [], candidateUrlsByMaterial = {}, log = () => {} }) {
  const standard = buildStandard(material), report = { material: material.slug || material.id, name: material.name, stores: [] };
  if (!standard) { report.status = "unsupported-canonical-specification"; return report; }
  const candidates = [];
  for (const storeId of stores) {
    const row = { store: storeId, chain_id: storeId, requested_material_id: material.id, status: "unavailable", retained_previous_price: true,
      reader_products_found: 0, matched_product: null, package_size: null, package_price: null, product_url: null, saved_to_supabase: false, rejection_reason: null }; report.stores.push(row);
    try {
      const result = await findStoreProduct(material, { storeId, repository, reader, canonicalMaterials,
        candidateUrls: candidateUrls[storeId] || [], candidateUrlsByMaterial });
      row.attempts = result.attempts;
      row.reader_products_found = result.attempts.reduce((total, attempt) => total + (attempt.reader_products_found || 0), 0);
      if (!result.product) {
        row.status = "no-exact-verified-offer"; row.errors = result.errors;
        row.rejection_reason = [...new Set(result.attempts.flatMap((attempt) => [attempt.rejection_reason, ...(attempt.products || []).map((product) => product.rejection_reason)]).filter(Boolean))].join("; ") || "no-compatible-verified-offer";
      } else {
        candidates.push({ store: storeId, price: result.product.price, ...result, row }); row.status = "candidate";
        row.matched_product = result.product.name;
        row.match_score = result.product.matchScore; row.detected_family = result.product.matchEvidence.detected_family;
        row.observed_specs = result.product.matchEvidence.observed_specs;
        row.package_size = { quantity: result.product.packageQuantity, unit: result.product.unit, specs: result.actualMaterial.specs };
        row.package_price = result.product.price; row.product_url = result.product.url;
      }
    } catch (error) {
      row.status = error.code || "collection-error";
      row.rejection_reason = row.status;
      row.attempts = error.collectionAttempts || [];
      row.reader_products_found = row.attempts.reduce((total, attempt) => total + (attempt.reader_products_found || 0), 0);
      row.error = error.name === "CollectionError" ? error.message : "Retrieval or mapping lookup failed; no price was written.";
    }
    log(`${material.name} | ${storeId}: ${row.status}`);
  }
  // Package totals from different sizes are not comparable price outliers.
  const byActualMaterial = new Map();
  for (const candidate of candidates) {
    const id = candidate.actualMaterial.id;
    if (!byActualMaterial.has(id)) byActualMaterial.set(id, []);
    byActualMaterial.get(id).push(candidate);
  }
  const accepted = new Set([...byActualMaterial.values()].flatMap((group) => filterCrossStorePriceOutliers(group)));
  for (const candidate of candidates) {
    const { row, store, product, actualMaterial, matchKind } = candidate;
    if (!accepted.has(candidate)) { row.status = "price-outlier"; row.rejection_reason = "price-outlier-for-same-package"; continue; }
    try {
      const payload = pricePayload(actualMaterial, store, product);
      if (!dryRun) await repository.save(payload);
      Object.assign(row, { status: dryRun ? "verified-dry-run" : "saved", retained_previous_price: dryRun,
        saved_to_supabase: !dryRun,
        material_id: actualMaterial.id, canonical_slug: actualMaterial.slug, preferred_material_id: material.id, match_kind: matchKind,
        price: product.price, unit_price: product.unitPrice, unit: product.unit, package_quantity: product.packageQuantity,
        product_name: product.name, product_url: product.url, checked_at: payload.checked_at });
    } catch { row.status = "save-failed"; row.rejection_reason = "database-save-failed"; }
  }
  report.status = report.stores.some((row) => ["saved", "verified-dry-run"].includes(row.status)) ? "ok" : "unavailable";
  return report;
}

export function parseArguments(args) {
  const options = { dryRun: false, stores: STORE_IDS, limit: Infinity, query: "", report: "work/price-update-last.json" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (["--stores", "--limit", "--materials-file", "--candidates", "--report"].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--stores") options.stores = value.split(",");
      else if (arg === "--limit") options.limit = Number(value);
      else if (arg === "--materials-file") options.materialsFile = value;
      else if (arg === "--candidates") options.candidatesFile = value;
      else options.report = value;
    } else if (arg.startsWith("--")) throw new Error(`Unknown argument ${arg}`);
    else options.query += `${arg} `;
  }
  if (options.stores.some((store) => !STORE_IDS.includes(store)) || options.stores.length === 0) throw new Error("Unknown retailer.");
  if (!(options.limit > 0)) throw new Error("--limit must be positive.");
  if (options.materialsFile && !options.dryRun) throw new Error("--materials-file is restricted to read-only --dry-run.");
  return options;
}
export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args), reader = createShopReader();
  const repository = options.materialsFile ? { mapping: async () => null } : databaseRepository();
  const canonicalMaterials = options.materialsFile ? JSON.parse(await readFile(options.materialsFile, "utf8")) : await repository.materials();
  let materials = canonicalMaterials;
  const query = normalize(options.query);
  if (query && query !== "all") materials = materials.filter((m) => normalize(`${m.name} ${m.slug} ${m.product_family}`).includes(query));
  materials = materials.slice(0, options.limit);
  if (!materials.length) throw new Error("No active canonical materials matched.");
  const candidateUrls = options.candidatesFile ? JSON.parse(await readFile(options.candidatesFile, "utf8")) : {};
  const report = { started_at: new Date().toISOString(), dry_run: options.dryRun, materials: [] };
  for (const material of materials) report.materials.push(await updateMaterial(material, {
    repository, reader, stores: options.stores, dryRun: options.dryRun,
    canonicalMaterials, candidateUrlsByMaterial: candidateUrls,
    candidateUrls: candidateUrls[material.slug] || candidateUrls[material.id] || {}, log: console.log }));
  report.completed_at = new Date().toISOString();
  report.verified = report.materials.flatMap((m) => m.stores).filter((row) => ["saved", "verified-dry-run"].includes(row.status)).length;
  report.write_failures = report.materials.flatMap((m) => m.stores).filter((row) => row.status === "save-failed").length;
  await mkdir(dirname(resolve(options.report)), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Verified offers: ${report.verified}. Report: ${options.report}. Failed retrievals retained every previous price.`);
  if (report.write_failures) process.exitCode = 1;
  else if (!report.verified) process.exitCode = 2;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
