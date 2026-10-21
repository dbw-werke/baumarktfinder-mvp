import { filterCatalogSnapshot } from "./catalogSnapshot";
import type { StorePrice } from "./prices";

const source = "https://raw.githubusercontent.com/dbw-werke/baumarktfinder-mvp/main/src/data/toom-published-prices.json";
const ttl = 5 * 60_000;

/** Shared public worker output for serverless deployments without a writable shared disk. */
export function createPublishedToomReader(fetcher: typeof fetch = fetch, now = Date.now) {
  let prices: StorePrice[] = [], retryAt = 0, pending: Promise<StorePrice[]> | null = null;
  return async function read(): Promise<StorePrice[]> {
    if (pending) return pending;
    if (now() < retryAt) return prices;
    pending = (async () => {
      try {
        const response = await fetcher(source, { cache: "no-store", signal: AbortSignal.timeout(3000) });
        if (!response.ok) return prices;
        const body = await response.text();
        if (body.length > 2_000_000) return prices;
        const data = JSON.parse(body);
        if (!data || !Array.isArray(data.prices) || data.prices.length > 2000) return prices;
        const valid = filterCatalogSnapshot(data, ["toom"], now());
        if (valid.length) {
          const merged = new Map(prices.map(row => [row.material_id, row]));
          for (const row of valid) {
            const old = merged.get(row.material_id);
            if (!old || Date.parse(row.checked_at) > Date.parse(old.checked_at)) merged.set(row.material_id, row);
          }
          prices = [...merged.values()];
        }
      } catch { /* Retain the last validated prices and their original timestamps. */ }
      finally { retryAt = now() + ttl; }
      return prices;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
export const readPublishedToomPrices = createPublishedToomReader();
