import { resolve } from "node:path";
import { readToomCache } from "../../../../../scripts/shop-reader/toom-cache.mjs";
import { getCatalogSnapshot } from "../../../../services/catalogSnapshot";
import { validateStorePrice } from "../../../../services/prices";
import { readPublishedToomPrices } from "../../../../services/publishedToomPrices";
import { mergeCatalogSources } from "../../../../services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read at request time so a separate hourly updater becomes visible without a server restart. */
export async function GET(): Promise<Response> {
  const published = process.env.VERCEL ? await readPublishedToomPrices() : [];
  const seeds = [...getCatalogSnapshot(["toom"]), ...published].map(row => ({ ...row, verified: true }));
  let rows: Record<string, unknown>[] = seeds;
  try {
    const cache = await readToomCache(resolve(/* turbopackIgnore: true */ process.env.TOOM_CACHE_PATH || "work/toom-verified-cache.json"), seeds);
    rows = cache.prices;
  } catch { /* An unreadable local cache must not hide the bundled verified observations. */ }
  const prices = rows.flatMap(row => {
    if (!row || typeof row.material_id !== "string" || !row.material_id.trim()) return [];
    const valid = validateStorePrice(row, row.material_id, ["toom"]);
    return valid ? [{ ...valid, verified: true }] : [];
  });
  const selected = mergeCatalogSources(["toom"], prices, getCatalogSnapshot(["toom"]), null).offers;
  return Response.json({ prices: selected.map(row => ({ ...row, verified: true })) }, { headers: { "Cache-Control": "private, no-store" } });
}
