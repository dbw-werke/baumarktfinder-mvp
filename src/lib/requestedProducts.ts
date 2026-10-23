import requested from "../data/requested-products.json";
import type { StorePrice } from "../services/prices";

/** Explicitly reviewed screenshot selections. Their original observation date stays visible.
 * Remove/update the corresponding registry entry when a new product or price is approved.
 * Automatic observations continue to be collected independently.
 */
export function isRequestedScreenshotPrice(price: StorePrice): boolean {
  return price.source === "manual" && requested.some(row => row.store_id === price.store_id
    && row.material_id === price.material_id && row.product_url === price.product_url
    && row.price === price.price && row.package_quantity === price.package_quantity && row.checked_at === price.checked_at);
}

export function preferPrice(candidate: StorePrice, previous?: StorePrice): boolean {
  if (!previous) return true;
  const approved = isRequestedScreenshotPrice(candidate), oldApproved = isRequestedScreenshotPrice(previous);
  return approved !== oldApproved ? approved : Date.parse(candidate.checked_at) > Date.parse(previous.checked_at);
}

export function requestedProduct(targetId: string, storeId: string) {
  return requested.find(row => row.store_id === storeId && row.target_ids.includes(targetId));
}
