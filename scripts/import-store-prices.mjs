/** Admin fallback for a documented, manually checked exact product. Never impersonates automatic retrieval. */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { databaseRepository, pricePayload } from "./update-store-prices.mjs";
import { buildStandard, normalizeProductPrice } from "./shop-reader/product-standardizer.mjs";
import { productUrl } from "./shop-reader/shops.mjs";
import { canonicalId, mergeCatalogSnapshot } from "./refresh-catalog-snapshot.mjs";

export function validateManualRow(row, material) {
  const standard = buildStandard(material);
  if (!standard) throw new Error("Missing or unsupported canonical material.");
  if (!row.checked_at || !Number.isFinite(Date.parse(row.checked_at)) || Date.parse(row.checked_at) > Date.now() + 300000) throw new Error("A valid actual checked_at time is required.");
  if (typeof row.verification_note !== "string" || row.verification_note.trim().length < 10) throw new Error("Document the manual product/specification verification in verification_note.");
  if (row.currency !== "EUR" || row.base_unit !== standard.baseUnit || Number(row.package_quantity) !== standard.packageQuantity) throw new Error("Currency, package quantity or base unit does not match.");
  if (!productUrl(row.store_id, row.product_url)) throw new Error("An official exact product URL is required.");
  // The admin must attest an independently observed package total. A Grundpreis
  // alone cannot supply that total, even when the package quantity is known.
  const priceBases = ["price_basis", "priceBasis"].filter((key) => Object.hasOwn(row, key));
  if (!priceBases.length || priceBases.some((key) => row[key] !== "package")) throw new Error("Explicit price_basis=package is required; unit prices cannot be imported as package prices.");
  if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price <= 0) throw new Error("An independently observed numeric package price is required.");
  const declaredPrices = ["unit_price", "declared_unit_price", "declaredUnitPrice"].filter((key) => Object.hasOwn(row, key));
  const expectedUnitPrice = row.price / standard.packageQuantity;
  for (const key of declaredPrices) {
    if (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] <= 0
      || Math.abs(row[key] - expectedUnitPrice) > Math.max(0.011, expectedUnitPrice * 0.01)) {
      throw new Error("The declared unit price does not match the observed package price.");
    }
  }
  const product = normalizeProductPrice({ name: row.product_name, url: row.product_url, price: row.price,
    currency: row.currency, priceBasis: "package", priceSource: "manual-admin-verification", availability: row.availability || null,
    declaredUnitPrice: declaredPrices.length ? row[declaredPrices[0]] : undefined,
    observedSpecs: row.observed_specs || {}, soldIndividually: true, retrievedAt: row.checked_at }, standard);
  if (!product) throw new Error("Product specifications or price are not an exact canonical match.");
  product.matchEvidence.extraction = "manual-admin-verification";
  product.matchEvidence.verification_note = row.verification_note.trim();
  if (declaredPrices.length) product.matchEvidence.declared_unit_prices = Object.fromEntries(declaredPrices.map((key) => [key, row[key]]));
  return pricePayload(material, row.store_id, product, "manual");
}

/** Validate the complete import before atomically replacing the local manual database. */
export function prepareLocalManualImport(rows, definitions, previous) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Expected a non-empty JSON array.");
  const materials = definitions.map((definition) => ({ ...definition, id: canonicalId(definition.slug) }));
  const seen = new Set();
  const observations = rows.map((row) => {
    const material = materials.find((item) => item.id === row.material_id || (row.material_slug && item.slug === row.material_slug));
    const payload = validateManualRow(row, material);
    const key = `${payload.material_id}:${payload.store_id}`;
    if (seen.has(key)) throw new Error("Duplicate material/retailer pair in import.");
    seen.add(key);
    return { ...payload, canonical_slug: material.slug, canonical_version: material.canonical_version,
      canonical_specs: material.specs, verified: true, unit: payload.base_unit, unit_price: Math.round(payload.price / payload.package_quantity * 100) / 100,
      observed_specs: row.observed_specs || {} };
  });
  return mergeCatalogSnapshot(previous, observations, definitions);
}
export async function main(args = process.argv.slice(2)) {
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file || args.some((arg) => arg.startsWith("--") && !["--write", "--dry-run", "--local"].includes(arg))) throw new Error("Usage: node scripts/import-store-prices.mjs <verified-prices.json> [--local] [--write]");
  if (args.includes("--write") && args.includes("--dry-run")) throw new Error("Choose --write or --dry-run.");
  const rows = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(rows) || !rows.length) throw new Error("Expected a non-empty JSON array.");
  if (args.includes("--local")) {
    const target = new URL("../src/data/manual-prices.json", import.meta.url);
    const definitions = JSON.parse(await readFile(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
    const previous = JSON.parse(await readFile(target, "utf8"));
    const snapshot = prepareLocalManualImport(rows, definitions, previous);
    if (args.includes("--write")) {
      const temporary = new URL(`../src/data/manual-prices.${process.pid}.tmp`, import.meta.url);
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await rename(temporary, target);
    }
    console.log(`${rows.length} manual rows validated; ${snapshot.prices.length} total local offers; ${args.includes("--write") ? "local file updated, source=manual; rebuild deployed apps" : "dry run, no writes"}. No database credentials required.`);
    return;
  }
  const repository = databaseRepository(), materials = await repository.materials();
  // Validate the complete file before the first write, so malformed rows cannot cause partial imports.
  const payloads = rows.map((row) => validateManualRow(row, materials.find((m) => m.id === row.material_id || (row.material_slug && m.slug === row.material_slug))));
  const seen = new Set();
  for (const payload of payloads) { const key = `${payload.material_id}:${payload.store_id}`;
    if (seen.has(key)) throw new Error("Duplicate material/retailer pair in import."); seen.add(key); }
  if (args.includes("--write")) for (const payload of payloads) await repository.save(payload);
  console.log(`${payloads.length} verified manual prices ${args.includes("--write") ? "saved with source=manual" : "validated; dry run made no writes"}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
