"use client";

import Image from "next/image";
import { CHAINS, type ResolvedAddress, type RoutedStore } from "../lib/stores";
import { getStoreUrl } from "../lib/resolver";
import { createRouteUrl } from "../services/maps";
import type { StorePrice } from "../services/prices";
import type { ChainOfferSelection } from "../lib/productComparison";
import type { ObiOffer } from "../lib/obi-offer";

const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const unitLabels = { m2: "m²", piece: "Stück", m: "m", kg: "kg", l: "l" };

export default function StoreCard({ store, price, origin, searchTerm, highlighted, observedAt, comparison }: {
  store: RoutedStore; price?: StorePrice | ObiOffer; origin: ResolvedAddress; searchTerm: string; highlighted: boolean; observedAt: number; comparison?: ChainOfferSelection;
}) {
  const ageHours = price ? (observedAt - new Date(price.checked_at).getTime()) / 3_600_000 : 0;
  const freshness = price?.source === "manual" ? "Manuell gepflegt" : ageHours <= 24 ? "Automatisch aktualisiert" : "Gespeicherter Preis";
  const badge = "Geringste Luftlinie";
  const offerUrl = price?.product_url || getStoreUrl(store.id, searchTerm);
  return <article className={`offerCard productOfferCard ${highlighted ? "nearestCard" : ""}`} data-store-id={store.placeId} data-match={comparison?.match}>
    {highlighted && <span className="nearestBadge">{badge}</span>}
    <div className="logoArea"><Image src={CHAINS[store.id].logo} alt={CHAINS[store.id].name} width={160} height={65} unoptimized /></div>
    <h3>{store.name}</h3><p className="storeAddress">{store.address}</p>
    <div className="distancePlaceholder"><span aria-hidden="true">⌖</span>{store.routeStatus === "unavailable" ? store.distance : `${store.distance} · ${store.duration}`}</div>
    <div className="pricePlaceholder"><p className="productName" title={price?.product_name ?? searchTerm}>{price?.product_name ?? searchTerm}</p>
      <p className="actualSpecification">{price && "actual_size" in price ? price.actual_size : comparison?.actualSpecification ?? comparison?.preferredSpecification ?? (price?.package_quantity && price.unit ? `${price.package_quantity.toLocaleString("de-DE")} ${unitLabels[price.unit]}` : "Gewünschte Ausführung")}</p>
      {comparison && <div className="matchStatus"><span className={`matchBadge ${comparison.match === "alternative" ? "alternativeBadge" : ""}`}>{comparison.match === "exact" ? "Wunschgröße" : comparison.match === "alternative" ? "Alternative Größe" : "Kein geprüftes Angebot"}</span></div>}
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
          {comparison?.match === "alternative" && <p>Kein geprüftes Angebot der Wunschgröße ({comparison.preferredSpecification}). Gezeigt wird die verfügbare geprüfte Alternative.</p>}
        </details>
      </> : <><strong className="missingPrice">Preis nicht verfügbar</strong><p className="priceScope">Für diese Ausführung liegt noch kein geprüfter Preis vor.</p></>}
    </div>
    <div className="cardActions">
      <a className="offerButton" href={offerUrl} target="_blank" rel="noopener noreferrer">{price ? "Zum Angebot ↗" : "Beim Händler suchen ↗"}</a>
      <a className="routeButton" href={createRouteUrl(origin, store)} target="_blank" rel="noopener noreferrer">Route →</a>
    </div>
    {store.attributions.length > 0 && <div className="providerAttribution">{store.attributions.map((item, index) => item.providerURI?.startsWith("https://") ? <a key={index} href={item.providerURI} target="_blank" rel="noopener noreferrer">{item.provider}</a> : <span key={index}>{item.provider}</span>)}</div>}
  </article>;
}
