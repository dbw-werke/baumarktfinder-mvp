import requested from "../data/requested-products.json";
import manual from "../data/manual-prices.json";
import type { StorePrice } from "../services/prices";

// The registry preserves the selection and its original observation. Read the unit
// from that same manual evidence instead of inferring it from a refreshed offer.
const selections = requested.map(row => ({ ...row, unit: manual.prices.find(price => price.store_id === row.store_id
  && price.material_id === row.material_id && price.product_url === row.product_url
  && price.package_quantity === row.package_quantity && price.price === row.price && price.checked_at === row.checked_at)?.unit }));

function matchesRequestedProduct(price: StorePrice, row: typeof selections[number]): boolean {
  return row.store_id === price.store_id && row.material_id === price.material_id && row.product_url === price.product_url
    && row.package_quantity === price.package_quantity && row.unit === price.unit;
}

/** The selected product stays preferred; verified observations of that exact package may refresh its price. */
export function isRequestedProductPrice(price: StorePrice): boolean {
  return selections.some(row => matchesRequestedProduct(price, row));
}

/** Identify the original screenshot observation without relabelling newer observations as manual. */
export function isRequestedScreenshotPrice(price: StorePrice): boolean {
  return price.source === "manual" && selections.some(row => matchesRequestedProduct(price, row)
    && row.price === price.price && row.checked_at === price.checked_at);
}

export function preferPrice(candidate: StorePrice, previous?: StorePrice): boolean {
  if (!previous) return true;
  const approved = isRequestedProductPrice(candidate), oldApproved = isRequestedProductPrice(previous);
  return approved !== oldApproved ? approved : Date.parse(candidate.checked_at) > Date.parse(previous.checked_at);
}

export function requestedProduct(targetId: string, storeId: string) {
  return requested.find(row => row.store_id === storeId && row.target_ids.includes(targetId));
}
