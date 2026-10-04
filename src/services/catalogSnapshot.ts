import snapshot from "../data/verified-catalog-snapshot.json";
import manual from "../data/manual-prices.json";
import definitions from "../../supabase/canonical-materials.json";
import { validateStorePrice, type StorePrice } from "./prices";

type SnapshotData = {
  version: number;
  canonical_material_ids: Record<string, string>;
  prices: unknown[];
};
const canonicalMaterials = new Map(definitions.map((material) => [material.slug, material]));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Public cache only. Never creates observations, updates timestamps or claims branch stock. */
export function filterCatalogSnapshot(data: SnapshotData, storeIds: readonly string[], now = Date.now()): StorePrice[] {
  if (data.version !== 1 || !data.canonical_material_ids || !Array.isArray(data.prices)) return [];
  const prices = new Map<string, StorePrice>();
  for (const entry of data.prices) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.canonical_slug !== "string" || typeof row.material_id !== "string" || !uuid.test(row.material_id)) continue;
    const material = canonicalMaterials.get(row.canonical_slug);
    if (!material || data.canonical_material_ids[material.slug] !== row.material_id || row.canonical_version !== material.canonical_version) continue;
    if (stableJson(row.canonical_specs) !== stableJson(material.specs) || row.unit !== material.base_unit || row.package_quantity !== material.package_quantity) continue;
    const price = validateStorePrice(row, row.material_id, storeIds, now);
    if (!price) continue;
    const key = `${price.material_id}:${price.store_id}`, previous = prices.get(key);
    if (!previous || Date.parse(price.checked_at) > Date.parse(previous.checked_at)) prices.set(key, price);
  }
  return [...prices.values()];
}

/** Verified observations supplement the database; the catalogue merges by newest checked_at. */
export function getCatalogSnapshot(storeIds: readonly string[]): StorePrice[] {
  const combined = new Map<string, StorePrice>();
  for (const row of [...filterCatalogSnapshot(snapshot, storeIds), ...filterCatalogSnapshot(manual, storeIds)]) {
    const key = `${row.material_id}:${row.store_id}`, previous = combined.get(key);
    if (!previous || Date.parse(row.checked_at) >= Date.parse(previous.checked_at)) combined.set(key, row);
  }
  return [...combined.values()];
}
