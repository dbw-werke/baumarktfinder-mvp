"use client";

import Image from "next/image";
import { CHAINS, isChainId, type ResolvedAddress, type RoutedStore } from "../lib/stores";
import { getStoreUrl } from "../lib/resolver";
import { createRouteUrl } from "../services/maps";
import type { StorePrice } from "../services/prices";
import type { ChainOfferSelection } from "../lib/productComparison";
import type { EstimatedComparisonPrice } from "../lib/estimatedPrices";
import type { ObiOffer } from "../lib/obi-offer";
import { getMaterialDisplayName, getMaterialSearchTerms } from "../lib/materialSearch.mjs";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const sourceUnitPrice = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 6 });
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const unitLabels = { m2: "m²", piece: "Stück", m: "m", kg: "kg", l: "l" };

export default function StoreCard({ store, price, estimate, origin, searchTerm, highlighted, observedAt, comparison, comparisonLayout = false }: {
  store: RoutedStore; price?: StorePrice | ObiOffer; estimate?: EstimatedComparisonPrice | null; origin: ResolvedAddress; searchTerm: string; highlighted: boolean; observedAt: number; comparison?: ChainOfferSelection; comparisonLayout?: boolean;
}) {
  const estimated = !price && estimate?.store_id === store.id ? estimate : null;
  const ageHours = price ? (observedAt - new Date(price.checked_at).getTime()) / 3_600_000 : 0;
  const freshness = price?.source === "manual" ? "Manuell gepflegt" : ageHours <= 24 ? "Automatisch aktualisiert" : "Gespeicherter Preis";
  const badge = "Nächste Filiale";
  // The retailer intermittently serves an error for this exact product page.
  // Preserve its price/source URL but let the customer find the same SKU directly.
  const retailerSearch = store.id === "bauhaus" && /\/p\/27790416\/?$/.test(price?.product_url ?? "");
  const offerUrl = retailerSearch ? getStoreUrl(store.id, "27790416") : price?.product_url || getStoreUrl(store.id, getMaterialSearchTerms(searchTerm)[0] || searchTerm);
  return <article className={`offerCard productOfferCard ${highlighted ? "nearestCard" : ""}`} data-store-id={store.placeId} data-match={comparison?.match} data-price-kind={price ? "verified" : estimated ? "estimate" : "unavailable"}>
    {highlighted && <span className="nearestBadge">{badge}</span>}
    <div className="logoArea" data-chain={store.id}><Image src={CHAINS[store.id].logo} alt={CHAINS[store.id].name} width={160} height={65} unoptimized /></div>
    <h3 title={store.name}>{store.name}</h3><p className="storeAddress" title={store.address}>{store.address}</p>
    <div className="distancePlaceholder">{comparisonLayout && <svg className="cardLocationIcon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>}<span>{store.distance}</span>{store.routeStatus !== "unavailable" && <><span className="distanceSeparator"> · </span><span className="driveTime">{store.duration}</span></>}</div>
    <div className="pricePlaceholder"><p className="productName" title={price?.product_name ?? searchTerm}>{getMaterialDisplayName(price?.product_name ?? searchTerm)}</p>
      <p className="actualSpecification">{price && "actual_size" in price ? price.actual_size : comparison?.actualSpecification ?? comparison?.preferredSpecification ?? (price?.package_quantity && price.unit ? `${price.package_quantity.toLocaleString("de-DE")} ${unitLabels[price.unit]}` : estimated ? `${estimated.package_quantity.toLocaleString("de-DE")} ${unitLabels[estimated.unit]}` : "Gewünschte Ausführung")}</p>
      {(comparison || estimated || price) && <div className="matchStatus"><span className={`matchBadge ${estimated || comparison?.match === "alternative" ? "alternativeBadge" : ""}`}>{estimated ? "Schätzpreis" : comparison?.requestedProduct ? "Ausgewähltes Produkt" : comparison?.match === "exact" ? "Wunschgröße" : comparison?.match === "alternative" ? "Alternative Größe" : price ? "Geprüfter Preis" : "Kein geprüftes Angebot"}</span></div>}
      {comparison?.specificationWarning && <small>{comparison.specificationWarning}</small>}
      {price ? <>
        <strong className="packagePrice">{money.format(price.price)}</strong><span className="packageLabel">Produkt- / Packungspreis · inkl. MwSt.</span>
        {price.unit_price != null && price.unit && <p className="unitPrice">{money.format(price.unit_price)} / {unitLabels[price.unit]}</p>}
        <p className="priceScope">Onlinepreis der Kette · ggf. zzgl. Versand</p>
        <details className="priceDetails"><summary>Preisdetails{ageHours > 168 ? " · älter als 7 Tage" : ""}</summary>
          <span className="priceSource">{freshness}</span>
          <small>Geprüft: {date.format(new Date(price.checked_at))} Uhr</small>
          <p>Filialpreis und Bestand können abweichen.</p>
          <p>{price.product_name}</p>
          <p>{store.routeStatus === "traffic" ? "Fahrzeit mit aktueller Verkehrslage" : store.routeStatus === "driving" ? "Fahrzeit ohne aktuelle Verkehrslage" : "Fahrzeit derzeit nicht verfügbar"}</p>
          {comparison?.requestedProduct ? <p>Ausgewähltes Produkt: Größe und Packungspreis laut Screenshot.</p>
            : comparison?.match === "alternative" && <p>Kein geprüftes Angebot der Wunschgröße ({comparison.preferredSpecification}). Gezeigt wird die verfügbare geprüfte Alternative.</p>}
        </details>
      </> : estimated ? <>
        <strong className="packagePrice">{comparisonLayout ? <span className="estimateQualifier">ca. </span> : "ca. "}{money.format(estimated.price)}</strong><span className="packageLabel">Geschätzter Produkt- / Packungspreis</span>
        <p className="unitPrice">ca. {money.format(estimated.unit_price)} / {unitLabels[estimated.unit]}</p>
        <p className="priceScope">Unverbindlicher Vergleichswert · kein Händlerangebot</p>
        <details className="priceDetails"><summary>Schätzgrundlage</summary>
          <p>Median geprüfter Grundpreise {estimated.basis === "exact-material" ? "dieses Materials" : "vergleichbarer Materialien"}, umgerechnet auf {estimated.package_quantity.toLocaleString("de-DE")} {unitLabels[estimated.unit]}.</p>
          <p>Kein bestätigter Preis oder Bestand bei {CHAINS[store.id].name}.</p>
          {estimated.basis === "comparable-material" && <p>Die Vergleichsprodukte können in Marke, Größe oder Ausführung abweichen.</p>}
          {estimated.sources.map((source, index) => <p key={`${source.store_id}-${source.material_id}-${index}`}>
            <a href={source.product_url} target="_blank" rel="noopener noreferrer">{isChainId(source.store_id) ? CHAINS[source.store_id].name : source.store_id}: {source.product_name}</a><br />
            {money.format(source.price)} / {source.package_quantity.toLocaleString("de-DE")} {unitLabels[source.unit]} · {sourceUnitPrice.format(source.unit_price)} / {unitLabels[source.unit]}<br />
            {source.normalization_factor !== 1 && <><small>Auf die gewünschte Blattfläche angepasst: Grundpreis × {source.normalization_factor.toLocaleString("de-DE", { maximumSignificantDigits: 12 })}.</small><br /></>}
            <small>Quelle geprüft: {date.format(new Date(source.checked_at))} Uhr</small>
          </p>)}
        </details>
      </> : <strong className="missingPrice">Preis aktuell nicht verfügbar</strong>}
    </div>
    <div className="cardActions">
      <a className="offerButton" href={offerUrl} target="_blank" rel="noopener noreferrer" aria-label={price && !retailerSearch ? `Angebot für ${price.product_name} bei ${CHAINS[store.id].name}` : `Bei ${CHAINS[store.id].name} suchen`}>{comparisonLayout ? <><span>{retailerSearch ? "Produkt bei BAUHAUS suchen" : price ? "Zum Angebot" : "Beim Händler suchen"}</span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3h7v7M21 3l-11 11M10 4H4v16h16v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></> : <><span className="desktopLabel">{retailerSearch ? "Produkt bei BAUHAUS suchen ↗" : price ? "Zum Angebot ↗" : "Beim Händler suchen ↗"}</span><span className="mobileLabel">{price && !retailerSearch ? "Angebot ↗" : "Suchen ↗"}</span></>}</a>
      <a className="routeButton" href={createRouteUrl(origin, store)} target="_blank" rel="noopener noreferrer">{comparisonLayout ? <>Route<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 3-7 18-3-8-8-3 18-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></> : "Route →"}</a>
    </div>
    {store.attributions.length > 0 && <div className="providerAttribution">{store.attributions.map((item, index) => item.providerURI?.startsWith("https://") ? <a key={index} href={item.providerURI} target="_blank" rel="noopener noreferrer">{item.provider}</a> : <span key={index}>{item.provider}</span>)}</div>}
  </article>;
}
