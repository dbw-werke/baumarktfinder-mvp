/** Public, verified cache refresh. No Supabase connection, credentials or database writes. */
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createShopReader, STORE_IDS, productUrl } from "./shop-reader/shops.mjs";
import { buildStandard, productMatchesStandard } from "./shop-reader/product-standardizer.mjs";
import { updateMaterial } from "./update-store-prices.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputPath = resolve(projectRoot, "src/data/verified-catalog-snapshot.json");
const definitionsPath = resolve(projectRoot, "supabase/canonical-materials.json");
const defaultSlugs = ["knauf-rotband-30kg-v1", "knauf-perlfix-30kg-v1", "knauf-uniflott-25kg-v1"];
export function canonicalId(slug) {
  const digest = createHash("md5").update(`baumarktfinder:${slug}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
function validSnapshotRow(row, material, now) {
  if (!row || !material || row.material_id !== canonicalId(material.slug) || row.canonical_version !== material.canonical_version || stableJson(row.canonical_specs) !== stableJson(material.specs)) return false;
  if (row.verified !== true || row.currency !== "EUR" || row.price_scope !== "chain" || !["automatic", "manual"].includes(row.source) || !STORE_IDS.includes(row.store_id)) return false;
  if (row.unit !== material.base_unit || row.package_quantity !== material.package_quantity || !Number.isFinite(row.price) || row.price <= 0 || row.price > 100000 || Math.abs(row.price * 100 - Math.round(row.price * 100)) > 0.000001) return false;
  const unitPrice = Math.round(row.price / row.package_quantity * 100) / 100;
  if (!Number.isFinite(row.unit_price) || Math.abs(row.unit_price - unitPrice) > 0.011 || typeof row.product_name !== "string" || !row.product_name.trim() || !productUrl(row.store_id, row.product_url)) return false;
  if (!Number.isFinite(Date.parse(row.checked_at)) || Date.parse(row.checked_at) > now + 300000) return false;
  const standard = buildStandard({ ...material, id: row.material_id });
  return standard && productMatchesStandard({ name: row.product_name, observedSpecs: row.observed_specs || {}, soldIndividually: true }, standard, { exactPackage: true });
}
function publicRow(row) {
  // Deliberately whitelist serialized fields: no arbitrary API responses or environment metadata.
  const observed = {};
  for (const [key, value] of Object.entries(row.observed_specs || {})) {
    if (typeof row.canonical_specs[key] === "number" && typeof value === "number" && Number.isFinite(value) && value > 0) observed[key] = value;
    if (key === "type" && value === row.canonical_specs.type) observed.type = value;
  }
  return { material_id: row.material_id, canonical_slug: row.canonical_slug, canonical_version: row.canonical_version,
    canonical_specs: row.canonical_specs, store_id: row.store_id, product_name: row.product_name, product_url: row.product_url,
    price: row.price, unit_price: row.unit_price, unit: row.unit, package_quantity: row.package_quantity,
    currency: "EUR", checked_at: row.checked_at, source: row.source, price_scope: "chain", verified: true,
    availability: typeof row.availability === "string" ? row.availability : null,
    ...(Object.keys(observed).length ? { observed_specs: observed } : {}) };
}

/** Failed or older refreshes cannot overwrite an original observation. Obsolete canonical specs fail closed. */
export function mergeCatalogSnapshot(previous, observations, definitions, now = Date.now()) {
  const materials = new Map(definitions.map((material) => [material.slug, material])), rows = new Map();
  const accept = (row) => {
    const material = materials.get(row?.canonical_slug);
    if (!validSnapshotRow(row, material, now)) return;
    const key = `${row.material_id}:${row.store_id}`, existing = rows.get(key);
    if (!existing || Date.parse(row.checked_at) > Date.parse(existing.checked_at)) rows.set(key, publicRow(row));
  };
  if (previous?.version === 1 && Array.isArray(previous.prices)) previous.prices.forEach(accept);
  observations.forEach(accept);
  return { version: 1, generated_at: new Date(now).toISOString(),
    canonical_material_ids: Object.fromEntries(definitions.map((material) => [material.slug, canonicalId(material.slug)])),
    prices: [...rows.values()].sort((a, b) => a.material_id.localeCompare(b.material_id) || a.store_id.localeCompare(b.store_id)) };
}

export async function collectSnapshotObservations(definitions, { reader, previous = { prices: /** @type {Record<string, unknown>[]} */ ([]) }, mappings = previous, candidateUrlsByMaterial = {}, stores = ["hornbach"], slugs = defaultSlugs, log = () => {} }) {
  const observations = [], reports = [];
  const sourceProducts = new Map();
  const recordingReader = { searchShop: async (store, query, options) => {
    const result = await reader.searchShop(store, query, options);
    for (const product of result.products || []) sourceProducts.set(`${store}:${product.url}`, product);
    return result;
  } };
  const repository = { mapping: async (materialId, storeId) => mappings.prices?.find((row) => row.material_id === materialId && row.store_id === storeId)?.product_url };
  const canonicalMaterials = definitions.map((definition) => ({ ...definition, id: canonicalId(definition.slug) }));
  for (const definition of definitions.filter((material) => slugs.includes(material.slug))) {
    const material = { ...definition, id: canonicalId(definition.slug) };
    const report = await updateMaterial(material, { reader: recordingReader, repository, stores, dryRun: true, canonicalMaterials,
      candidateUrls: candidateUrlsByMaterial[material.slug] || candidateUrlsByMaterial[material.id] || {}, candidateUrlsByMaterial, log });
    reports.push(report);
    for (const row of report.stores) {
      if (row.status !== "verified-dry-run") continue;
      const actual = canonicalMaterials.find((candidate) => candidate.id === row.material_id);
      if (!actual) continue;
      const product = sourceProducts.get(`${row.store}:${row.product_url}`);
      const observation = { material_id: actual.id, canonical_slug: actual.slug, canonical_version: actual.canonical_version,
        canonical_specs: actual.specs, store_id: row.store, product_name: row.product_name, product_url: row.product_url,
        price: row.price, unit_price: Math.round(row.price / row.package_quantity * 100) / 100, unit: row.unit,
        package_quantity: row.package_quantity, currency: "EUR", checked_at: row.checked_at, source: "automatic",
        price_scope: "chain", verified: true, availability: product?.availability || null,
        observed_specs: row.observed_specs || product?.observedSpecs || {} };
      if (validSnapshotRow(observation, actual, Date.now())) observations.push(publicRow(observation));
    }
  }
  return { observations, reports };
}

export async function main(args = process.argv.slice(2)) {
  const storesArgument = args.find((arg) => arg.startsWith("--stores="));
  const materialsArgument = args.find((arg) => arg.startsWith("--materials="));
  const candidatesArgument = args.find((arg) => arg.startsWith("--candidates="));
  const reportArgument = args.find((arg) => arg.startsWith("--report="));
  const stores = storesArgument ? storesArgument.slice("--stores=".length).split(",") : ["hornbach", "obi"];
  if (stores.some((store) => !STORE_IDS.includes(store)) || args.some((arg) => ![storesArgument, materialsArgument, candidatesArgument, reportArgument, "--all-materials"].includes(arg)) || (materialsArgument && args.includes("--all-materials"))) throw new Error("Usage: npm run prices:snapshot -- [--stores=hornbach,obi] [--materials=slug,slug | --all-materials] [--candidates=file.json] [--report=file.json]");
  const definitions = JSON.parse(await readFile(definitionsPath, "utf8"));
  const slugs = args.includes("--all-materials") ? definitions.map((m) => m.slug) : materialsArgument ? materialsArgument.slice("--materials=".length).split(",") : defaultSlugs;
  if (slugs.some((slug) => !definitions.some((material) => material.slug === slug))) throw new Error("Unknown canonical material slug.");
  const candidateUrlsByMaterial = candidatesArgument ? JSON.parse(await readFile(resolve(projectRoot, candidatesArgument.slice("--candidates=".length)), "utf8")) : {};
  let previous;
  try { previous = JSON.parse(await readFile(outputPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Existing snapshot cannot be read safely; no overwrite attempted."); previous = { version: 1, prices: [] }; }
  // Previously verified manual product URLs are useful mappings, never new automatic prices.
  const manual = JSON.parse(await readFile(resolve(projectRoot, "src/data/manual-prices.json"), "utf8"));
  const mappings = mergeCatalogSnapshot(previous, manual.prices || [], definitions);
  const { observations, reports } = await collectSnapshotObservations(definitions, {
    reader: createShopReader(), previous, mappings, candidateUrlsByMaterial, stores, slugs, log: console.log });
  const snapshot = mergeCatalogSnapshot(previous, observations, definitions);
  if (observations.length) {
    await mkdir(dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(temporary, outputPath);
  }
  const reportPath = resolve(projectRoot, reportArgument ? reportArgument.slice("--report=".length) : "work/catalog-snapshot-refresh.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ completed_at: new Date().toISOString(), fresh_observations: observations.length, cached_prices: snapshot.prices.length, database_writes: 0, reports }, null, 2)}\n`, "utf8");
  console.log(`${observations.length} freshly verified observations; ${snapshot.prices.length} verified cached offers. Original checked_at timestamps retained; no database writes.`);
  if (!observations.length) process.exitCode = 2;
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
