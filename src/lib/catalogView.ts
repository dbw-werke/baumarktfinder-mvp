import { normalizeMaterialSearch } from "../services/materialSuggestions";
import type { StorePrice } from "../services/prices";
import type { RoutedStore } from "./stores";

function searchable(value: string): string {
  return normalizeMaterialSearch(value).replace(/(\d)(?=[a-z])/g, "$1 ");
}

/** A catalogue is scoped to chains with an actual nearby branch, never to arbitrary national offers. */
export function filterCatalog(offers: readonly StorePrice[], stores: readonly RoutedStore[], query: string, chain = "all", materialIds: readonly string[] = []): StorePrice[] {
  const nearby = new Set(stores.map((store) => store.id as string));
  const tokens = searchable(query).split(" ").filter(Boolean);
  return offers.filter((offer) => nearby.has(offer.store_id) && (chain === "all" || offer.store_id === chain)
    && (materialIds.length ? materialIds.includes(offer.material_id) : tokens.every((token) => searchable(offer.product_name).includes(token))));
}

export function closestBranch(stores: readonly RoutedStore[], chain: string): RoutedStore | undefined {
  return stores.filter((store) => store.id === chain).sort((a, b) => a.airDistanceMeters - b.airDistanceMeters)[0];
}
