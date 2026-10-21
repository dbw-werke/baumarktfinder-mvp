import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readToomCache } from "./shop-reader/toom-cache.mjs";
import { filterCatalogSnapshot } from "../src/services/catalogSnapshot";
import snapshot from "../src/data/verified-catalog-snapshot.json";

/** Publish only validated public observations, never worker diagnostics or API payloads. */
export function publicToomSnapshot(rows: Record<string, unknown>[]) {
  const data = { version: 1, canonical_material_ids: snapshot.canonical_material_ids, prices: rows };
  const eligible = rows.filter(row => filterCatalogSnapshot({ ...data, prices: [row] }, ["toom"]).length);
  const valid = filterCatalogSnapshot({ ...data, prices: eligible }, ["toom"]);
  if (!valid.length) throw new Error("No valid toom observations to publish");
  return { version: 1, canonical_material_ids: snapshot.canonical_material_ids,
    prices: valid.map(price => {
      const row = eligible.find(row => row.material_id === price.material_id && row.checked_at === price.checked_at
        && row.store_id === price.store_id && row.product_url === price.product_url && row.price === price.price)!;
      return { ...price, verified: true, canonical_slug: row.canonical_slug,
        canonical_version: row.canonical_version, canonical_specs: row.canonical_specs };
    }).sort((a, b) => a.material_id.localeCompare(b.material_id)) };
}

async function main() {
  const report = JSON.parse(await readFile("work/toom-refresh-last.json", "utf8"));
  if (!report.verified || report.schema_error || report.products?.some((row: { db_failure_reason?: string }) => row.db_failure_reason)) {
    throw new Error("Refresh did not produce publishable observations");
  }
  const cache = await readToomCache(resolve(process.env.TOOM_CACHE_PATH || "work/toom-verified-cache.json"));
  const published = publicToomSnapshot(cache.prices);
  await writeFile("src/data/toom-published-prices.json", `${JSON.stringify(published, null, 2)}\n`);
  console.log(`Published ${published.prices.length} verified toom observations; original checked_at preserved.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
