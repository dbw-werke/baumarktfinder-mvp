import StoreCard from "./StoreCard";
import StoreRow from "./StoreRow";
import { selectChainOffer, type CanonicalMaterial } from "../lib/productComparison";
import { estimateComparisonPrice } from "../lib/estimatedPrices";
import type { ResolvedAddress, RoutedStore } from "../lib/stores";
import type { StorePrice } from "../services/prices";
import type { ObiOffer } from "../lib/obi-offer";

/** Each physical branch gets its own card; validated online prices belong to its chain. */
export default function ProductComparison({ stores, origin, offers, material, catalog, searchTerm, observedAt, obiOffer }: {
  stores: RoutedStore[]; origin: ResolvedAddress; offers: StorePrice[]; material: CanonicalMaterial | null;
  catalog: CanonicalMaterial[]; searchTerm: string; observedAt: number; obiOffer?: ObiOffer | null;
}) {
  return <StoreRow className="comparisonGrid" label="Produktpreise der nächstgelegenen Märkte">{stores.map((store, index) => {
    const dynamicObi = store.id === "obi" ? obiOffer : null;
    const selection = material && !dynamicObi ? selectChainOffer(material, offers, catalog, store.id) : undefined;
    const estimate = material && !dynamicObi && !selection?.price ? estimateComparisonPrice(material, offers, catalog, store.id) : null;
    return <StoreCard key={store.placeId} store={store} origin={origin} price={dynamicObi ?? selection?.price} estimate={estimate} comparison={selection}
      searchTerm={material?.name ?? searchTerm} highlighted={index === 0} observedAt={observedAt} />;
  })}</StoreRow>;
}
