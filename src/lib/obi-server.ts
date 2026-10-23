import { resolve } from "node:path";
import { createObiLookup } from "../../scripts/shop-reader/obi-lookup.mjs";
import { obiSupabaseStorage } from "../../scripts/shop-reader/obi-storage.mjs";
import manual from "../data/manual-prices.json";
import automatic from "../data/verified-catalog-snapshot.json";
import generic from "../data/obi-verified-products.json";
import { getCatalogSnapshot } from "../services/catalogSnapshot";
import { validateObiOffer } from "./obi-offer";
import { bundledMaterialCatalog } from "../services/materialSuggestions";
import { resolveMvpPreferredMaterial } from "./toomIntent";
import { selectChainOffer } from "./productComparison";
import { productPurposeConflict } from "./productCompatibility.mjs";

const sourceRows = [...manual.prices, ...automatic.prices] as Record<string, unknown>[];
export const obiSeedProducts = [...getCatalogSnapshot(["obi"]).map(row => ({
  name: row.product_name, url: row.product_url, price: row.price, currency: row.currency,
  priceBasis: "package", priceSource: row.source === "manual" ? "manual-admin-verification" : "json-ld-offer",
  observedSpecs: sourceRows.find(item => item.product_url === row.product_url && item.checked_at === row.checked_at)?.observed_specs ?? {},
  packageQuantity: row.package_quantity, baseUnit: row.unit,
  retrievedAt: row.checked_at, availability: row.availability, declaredUnitPrice: row.unit_price,
})), ...generic.products];
// Node runtime only. A persistent volume can be configured without a new material schema.
const service = createObiLookup({ seedProducts: obiSeedProducts, readOnly: true,
  ...obiSupabaseStorage(),
  cacheFile: resolve(/* turbopackIgnore: true */ process.env.OBI_CACHE_PATH || "work/obi-query-cache.json"),
  logger: report => console.info("OBI_LOOKUP", JSON.stringify(report)),
});
export async function lookupObi(query: string) {
  const catalog = bundledMaterialCatalog();
  const material = resolveMvpPreferredMaterial(catalog, query);
  const result = await service.lookup(material?.name ?? query);
  let dynamic = validateObiOffer(result.offer);
  // Film comparisons need the catalogue's verified sd/thickness and complete roll metadata.
  if (material && ["dampfbremse", "pe-folie"].includes(material.product_family)) dynamic = null;
  if (material?.product_family === "super-haftgrund" && dynamic && productPurposeConflict(material, dynamic)) dynamic = null;
  if (material?.product_family === "vario" && dynamic && (dynamic.unit !== "kg" || dynamic.package_quantity !== 25
    || !/\brigips\b/i.test(dynamic.product_name) || !/\bvario\b/i.test(dynamic.product_name) || /hydro/i.test(dynamic.product_name))) dynamic = null;
  const selected = material ? selectChainOffer(material, getCatalogSnapshot(["obi"]), catalog.map(row => row.material), "obi") : null;
  const price = selected?.price;
  // A stale generic cache must never displace today's verified canonical/manual observation.
  const offer = price && (selected.requestedProduct || !dynamic || Date.parse(price.checked_at) >= Date.parse(dynamic.checked_at))
    ? validateObiOffer({ ...price, actual_size: selected.actualSpecification, family: material?.product_family, match_score: 100 })
    : dynamic;
  return { offer, normalizedQuery: result.normalizedQuery,
    cacheStatus: result.cacheStatus, warning: result.warning };
}
