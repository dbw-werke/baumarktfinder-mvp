import { resolve } from "node:path";
import { createObiLookup } from "../../scripts/shop-reader/obi-lookup.mjs";
import { obiSupabaseStorage } from "../../scripts/shop-reader/obi-storage.mjs";
import manual from "../data/manual-prices.json";
import automatic from "../data/verified-catalog-snapshot.json";
import generic from "../data/obi-verified-products.json";
import { getCatalogSnapshot } from "../services/catalogSnapshot";
import { validateObiOffer } from "./obi-offer";

const sourceRows = [...manual.prices, ...automatic.prices] as Record<string, unknown>[];
export const obiSeedProducts = [...getCatalogSnapshot(["obi"]).map(row => ({
  name: row.product_name, url: row.product_url, price: row.price, currency: row.currency,
  priceBasis: "package", priceSource: row.source === "manual" ? "manual-admin-verification" : "json-ld-offer",
  observedSpecs: sourceRows.find(item => item.product_url === row.product_url && item.checked_at === row.checked_at)?.observed_specs ?? {},
  packageQuantity: row.package_quantity, baseUnit: row.unit,
  retrievedAt: row.checked_at, availability: row.availability, declaredUnitPrice: row.unit_price,
})), ...generic.products];
// Node runtime only. A persistent volume can be configured without a new material schema.
const service = createObiLookup({ seedProducts: obiSeedProducts,
  ...obiSupabaseStorage(),
  cacheFile: resolve(/* turbopackIgnore: true */ process.env.OBI_CACHE_PATH || "work/obi-query-cache.json"),
  logger: report => console.info("OBI_LOOKUP", JSON.stringify(report)),
});
export async function lookupObi(query: string) {
  const result = await service.lookup(query);
  return { offer: validateObiOffer(result.offer), normalizedQuery: result.normalizedQuery,
    cacheStatus: result.cacheStatus, warning: result.warning };
}
