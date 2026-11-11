import StoreCard from "./StoreCard";
import StoreRow from "./StoreRow";
import MobilePriceOverview, { type ComparisonEntry } from "./MobilePriceOverview";
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
  const entries: ComparisonEntry[] = stores.map((store) => {
    const dynamicObi = store.id === "obi" ? obiOffer : null;
    const selection = material && !dynamicObi ? selectChainOffer(material, offers, catalog, store.id) : undefined;
    const estimate = material && !dynamicObi && !selection?.price ? estimateComparisonPrice(material, offers, catalog, store.id) : null;
    return { store, cardId: `comparison-card-${encodeURIComponent(store.placeId)}`, price: dynamicObi ?? selection?.price, estimate, comparison: selection };
  });
  return <>
    <MobilePriceOverview entries={entries} material={material} />
    <StoreRow className="comparisonGrid" label="Produktpreise der nächstgelegenen Märkte">{entries.map(({ store, cardId, price, estimate, comparison }, index) => <StoreCard key={store.placeId} cardId={cardId} store={store} origin={origin} price={price} estimate={estimate} comparison={comparison}
      searchTerm={material?.name ?? searchTerm} highlighted={index === 0} observedAt={observedAt} comparisonLayout />)}</StoreRow>
  </>;
}
