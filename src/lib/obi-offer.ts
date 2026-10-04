import type { BaseUnit } from "../services/materialSuggestions";

/** Dynamic OBI products have their own SKU/URL, not a fabricated canonical material ID. */
export type ObiOffer = {
  store_id: "obi"; product_name: string; product_url: string; actual_size: string;
  price: number; currency: "EUR"; checked_at: string; source: "manual" | "automatic";
  price_scope: "chain"; unit?: BaseUnit; unit_price?: number; package_quantity?: number;
  family: string; match_score: number;
  verification_status?: "verified"; retrieval_method?: string;
};
export type ObiSearchResult = { offer: ObiOffer | null; normalizedQuery: string; cacheStatus: string; warning: string | null };
export function validateObiOffer(value: unknown): ObiOffer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ObiOffer;
  if (row.store_id !== "obi" || row.currency !== "EUR" || row.price_scope !== "chain" || !["manual", "automatic"].includes(row.source)
    || typeof row.product_name !== "string" || !row.product_name.trim() || row.product_name.length > 1000
    || typeof row.actual_size !== "string" || !row.actual_size.trim() || row.actual_size.length > 250
    || !Number.isFinite(row.price) || row.price <= 0 || row.price > 100_000 || Math.abs(row.price * 100 - Math.round(row.price * 100)) > .00001
    || typeof row.checked_at !== "string" || !Number.isFinite(Date.parse(row.checked_at)) || Date.parse(row.checked_at) > Date.now() + 300_000) return null;
  try { const url = new URL(row.product_url);
    if (url.protocol !== "https:" || !["www.obi.de", "obi.de"].includes(url.hostname) || url.port || url.username || url.password || !/^\/p\/\d+\/[^/]+\/?$/.test(url.pathname)) return null;
  } catch { return null; }
  if (row.unit !== undefined && !["m2", "m", "kg", "l", "piece"].includes(row.unit)) return null;
  if (row.package_quantity !== undefined && (!Number.isFinite(row.package_quantity) || row.package_quantity <= 0)) return null;
  if (row.unit_price !== undefined && (!row.unit || !row.package_quantity || !Number.isFinite(row.unit_price) || row.unit_price <= 0
    || Math.abs(row.unit_price - row.price / row.package_quantity) > Math.max(.011, row.unit_price * .01))) return null;
  return { store_id: "obi", product_name: row.product_name, product_url: row.product_url, actual_size: row.actual_size,
    price: row.price, currency: "EUR", checked_at: row.checked_at, source: row.source, price_scope: "chain",
    ...(row.unit ? { unit: row.unit } : {}), ...(row.package_quantity ? { package_quantity: row.package_quantity } : {}),
    ...(row.unit_price ? { unit_price: row.unit_price } : {}), family: typeof row.family === "string" ? row.family : "unknown", match_score: Number.isFinite(row.match_score) ? row.match_score : 0,
    verification_status:"verified",retrieval_method:["manual","playwright","structured-http"].includes(row.retrieval_method ?? "") ? row.retrieval_method : undefined };
}
