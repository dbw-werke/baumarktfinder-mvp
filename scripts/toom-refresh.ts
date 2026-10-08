import dotenv from "dotenv";
import { writeFile, mkdir, open, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import definitions from "../supabase/canonical-materials.json";
import snapshot from "../src/data/verified-catalog-snapshot.json";
import manual from "../src/data/manual-prices.json";
import { filterCatalogSnapshot } from "../src/services/catalogSnapshot";
import { createToomCache } from "./shop-reader/toom-cache.mjs";
import { runToomRefresh } from "./shop-reader/toom-refresh.mjs";
import { createToomReader } from "./shop-reader/toom-reader.mjs";
import { toomSupabaseStorage } from "./shop-reader/toom-storage.mjs";

dotenv.config({ path: ".env.local", quiet: true });
async function main() {
const args = process.argv.slice(2);
let reportPath = "work/toom-refresh-last.json", limit = Infinity, discover = false, query = "";
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--discover") discover = true;
  else if (["--report", "--limit", "--query"].includes(arg)) {
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    if (arg === "--report") reportPath = value;
    if (arg === "--limit") { limit = Number(value); if (!Number.isInteger(limit) || limit <= 0) throw new Error("Invalid limit"); }
    if (arg === "--query") query = value;
  } else throw new Error(`Unknown argument ${arg}`);
}
const ids: Record<string, string> = snapshot.canonical_material_ids;
let materials = definitions.map(m => ({ ...m, id: ids[m.slug] })).filter(m => m.id);
if (query) materials = materials.filter(m => new RegExp(query, "i").test(`${m.name} ${m.slug} ${m.aliases.join(" ")}`));
const validIds = new Set(materials.map(m => m.id));
const sourceRows = [...snapshot.prices, ...manual.prices];
const seedRows = [...filterCatalogSnapshot(snapshot, ["toom"]), ...filterCatalogSnapshot(manual, ["toom"])].map(row => ({
  ...sourceRows.find(raw => raw.store_id === "toom" && raw.product_url === row.product_url && raw.checked_at === row.checked_at), ...row, verified: true,
}));
const file = resolve(process.env.TOOM_CACHE_PATH || "work/toom-verified-cache.json");
await mkdir(dirname(file), { recursive: true });
let lock;
try { lock = await open(`${file}.lock`, "wx"); }
catch { throw new Error("Another toom updater holds the cache lock. Do not run overlapping jobs; inspect any abandoned lock after a crash."); }
let reader: ReturnType<typeof createToomReader> | undefined;
try {
  await lock.writeFile(String(process.pid));
  reader = createToomReader();
  const cache = createToomCache({ file, seedRows });
  // Preserve unrelated mappings on disk even for a targeted verification.
  const filteredCache = query ? { ...cache, load: async () => { const state = await cache.load(); return { ...state, prices: state.prices.filter(r => validIds.has(String(r.material_id))) }; } } : cache;
  let storage, configurationError: string | null = null;
  try { storage = toomSupabaseStorage(); } catch (error) { configurationError = error instanceof Error ? error.message : "toom-database-configuration-missing"; }
  const report = await runToomRefresh({ materials, cache: filteredCache, reader, storage, discover, limit,
    log: (row: Record<string, unknown>) => console.log(JSON.stringify(row)),
  });
  if (configurationError) report.schema_error = configurationError;
  await mkdir(dirname(resolve(reportPath)), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ report: reportPath, refreshable: report.refreshable, checked: report.checked, changed: report.changed, failed: report.failed, db_updated: report.db_updated }));
  if (report.failed || report.schema_error || report.products.some((p: { db_failure_reason?: string }) => p.db_failure_reason)) process.exitCode = 2;
} finally {
  try { await reader?.close(); }
  finally { await lock.close(); await unlink(`${file}.lock`); }
}
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "toom_refresh_failed"); process.exitCode = 1; });
