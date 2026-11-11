"use client";

import { CHAINS, type RoutedStore } from "../lib/stores";
import type { CanonicalMaterial, ChainOfferSelection } from "../lib/productComparison";
import type { EstimatedComparisonPrice } from "../lib/estimatedPrices";
import type { StorePrice } from "../services/prices";
import type { ObiOffer } from "../lib/obi-offer";

export type ComparisonEntry = {
  store: RoutedStore;
  cardId: string;
  price?: StorePrice | ObiOffer;
  estimate: EstimatedComparisonPrice | null;
  comparison?: ChainOfferSelection;
};

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const unitLabels = { m2: "m²", piece: "Stück", m: "m", kg: "kg", l: "l" };

export default function MobilePriceOverview({ entries, material }: { entries: ComparisonEntry[]; material: CanonicalMaterial | null }) {
  const nearest = new Map<string, ComparisonEntry>();
  for (const entry of entries) {
    if (!entry.price && entry.estimate?.store_id !== entry.store.id) continue;
    const previous = nearest.get(entry.store.id);
    if (!previous || entry.store.distanceMeters < previous.store.distanceMeters) nearest.set(entry.store.id, entry);
  }
  const rows = [...nearest.values()];
  if (!rows.length) return null;

  function openCard(cardId: string) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <section className="mobilePriceOverview" aria-label="Kompakter Preisvergleich">
    <div className="compactPriceHeading"><h3>Preise im Überblick</h3><span>{rows.length} Händler</span></div>
    <ul className="compactPriceList">{rows.map(({ store, cardId, price, estimate, comparison }) => {
      const estimated = !price && estimate?.store_id === store.id ? estimate : null;
      const amount = price ?? estimated!;
      const specification = price && "actual_size" in price ? price.actual_size : comparison?.actualSpecification ?? comparison?.preferredSpecification ?? (amount.package_quantity && amount.unit ? `${amount.package_quantity.toLocaleString("de-DE")} ${unitLabels[amount.unit]}` : "Packungsgröße siehe Karte");
      const alternative = comparison?.match === "alternative" || Boolean(material && price && (price.unit !== material.base_unit || price.package_quantity !== material.package_quantity));
      return <li className="compactPriceRow" key={store.id} data-store-id={store.placeId} data-price-kind={price ? "verified" : "estimate"}>
        <div className="compactPriceMerchant"><strong title={store.name}>{CHAINS[store.id].name}</strong><span className="compactPriceDistance">{store.distance}{store.routeStatus !== "unavailable" && <> · {store.duration}</>}</span></div>
        <div className="compactPriceValue"><strong>{estimated ? "ca. " : ""}{money.format(amount.price)}</strong>{estimated && <span className="compactPriceType">Schätzpreis</span>}</div>
        <button className="compactPriceOpen" type="button" aria-label={`Details zum Preis bei ${store.name} öffnen`} aria-controls={cardId} onClick={() => openCard(cardId)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
        <p className="compactPriceSpecification"><span className="compactPriceSize">{specification}</span>{amount.unit_price != null && amount.unit && <span className="compactUnitPrice"> · {estimated ? "ca. " : ""}{money.format(amount.unit_price)} / {unitLabels[amount.unit]}</span>}{alternative && <span className="compactPriceAlternative"> · Alternative Größe</span>}</p>
      </li>;
    })}</ul>
    <p className="compactPriceNote">Packungspreise · unterschiedliche Größen beachten. Je Händler die nächste Filiale.</p>
    {rows.some(({ price, estimate }) => !price && estimate) && <p className="compactPriceEstimateNote">Schätzpreise sind unverbindliche Vergleichswerte, keine bestätigten Händlerangebote.</p>}
  </section>;
}
