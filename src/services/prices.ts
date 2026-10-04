import type { BaseUnit } from "./materialSuggestions";

export type StorePrice = {
  material_id: string; store_id: string; product_name: string; product_url: string;
  price: number; unit_price: number; unit: BaseUnit; package_quantity: number;
  currency: "EUR"; checked_at: string; source: "automatic" | "manual";
  price_scope: "chain"; availability: string | null;
};
export type PriceFreshness = "fresh" | "cached" | "stale";
const HOSTS: Record<string, string> = {
  obi: "obi.de", bauhaus: "bauhaus.info", hornbach: "hornbach.de", toom: "toom.de",
  hagebau: "hagebau.de", globus: "globus-baumarkt.de", hellweg: "hellweg.de",
};
export function getPriceFreshness(checkedAt: string, now = Date.now()): PriceFreshness {
  const age = now - Date.parse(checkedAt);
  if (!Number.isFinite(age) || age > 7 * 24 * 60 * 60_000) return "stale";
  return age > 24 * 60 * 60_000 ? "cached" : "fresh";
}

/** Defend against malformed imports as well as mismatched material or chain rows. */
export function validateStorePrice(row: Record<string, unknown>, materialId: string, storeIds: readonly string[], now = Date.now()): StorePrice | null {
  if (row.material_id !== materialId || typeof row.store_id !== "string" || !storeIds.includes(row.store_id) || !HOSTS[row.store_id]) return null;
  if (row.verified !== true || row.currency !== "EUR" || row.price_scope !== "chain" || !["automatic", "manual"].includes(String(row.source))) return null;
  if (typeof row.product_name !== "string" || !row.product_name.trim() || typeof row.product_url !== "string") return null;
  try {
    const url = new URL(row.product_url), host = HOSTS[row.store_id];
    if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === host || url.hostname === `www.${host}`) || url.pathname.length < 2 || /^\/(search|suche|s)(\/|$)/i.test(url.pathname)) return null;
  } catch { return null; }
  if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price <= 0 || row.price > 100_000) return null;
  if (typeof row.package_quantity !== "number" || !Number.isFinite(row.package_quantity) || row.package_quantity <= 0) return null;
  if (!["kg", "l", "m", "m2", "piece"].includes(String(row.unit))) return null;
  if (typeof row.checked_at !== "string" || !Number.isFinite(Date.parse(row.checked_at)) || Date.parse(row.checked_at) > now + 5 * 60_000) return null;
  const unitPrice = Math.round((row.price / row.package_quantity) * 100) / 100;
  if (row.unit_price !== null && row.unit_price !== undefined && (typeof row.unit_price !== "number" || Math.abs(row.unit_price - unitPrice) > 0.011)) return null;
  return { material_id: materialId, store_id: row.store_id, product_name: row.product_name.trim(), product_url: row.product_url,
    price: row.price, unit_price: unitPrice, unit: row.unit as BaseUnit, package_quantity: row.package_quantity,
    currency: "EUR", checked_at: row.checked_at, source: row.source as StorePrice["source"], price_scope: "chain",
    availability: typeof row.availability === "string" ? row.availability : null };
}

export async function fetchStorePrices(materialId: string, storeIds: readonly string[]): Promise<{ prices: Map<string, StorePrice>; error: string | null }> {
  const prices = new Map<string, StorePrice>();
  const chains = [...new Set(storeIds)].filter((id) => HOSTS[id]);
  if (!chains.length) return { prices, error: null };
  // Reuse the catalogue's validated, newest-per-pair merge for single-material consumers too.
  const { fetchStoreCatalog } = await import("./catalog");
  const result = await fetchStoreCatalog(chains);
  for (const price of result.offers) if (price.material_id === materialId) prices.set(price.store_id, price);
  return { prices, error: result.error };
}
