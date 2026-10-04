"use client";

import Image from "next/image";
import { CHAINS, type ResolvedAddress, type RoutedStore } from "../lib/stores";
import { getStoreUrl } from "../lib/resolver";
import { createRouteUrl } from "../services/maps";

export default function NearbyStoreCard({ store, origin, count, query, highlighted, onBrowse }: {
  store: RoutedStore; origin: ResolvedAddress; count: number; query: string; highlighted: boolean; onBrowse: () => void;
}) {
  return <article className={`offerCard nearbyStoreCard ${highlighted ? "nearestCard" : ""}`}>
    {highlighted && <span className="nearestBadge">Nächster Markt nach Luftlinie</span>}
    <div className="logoArea"><Image src={CHAINS[store.id].logo} alt={CHAINS[store.id].name} width={160} height={65} unoptimized /></div>
    <h3>{store.name}</h3><p className="storeAddress">{store.address}{store.addressIncomplete && <><br /><small>Straßenadresse unvollständig · Route nutzt den Kartenstandort.</small></>}</p>
    <div className="distancePlaceholder">⌖ {store.routeStatus === "unavailable" ? store.distance : `${store.distance} · ${store.duration}`}</div>
    <p className="routeDetail">{store.routeStatus === "unavailable" ? "Entfernung als Luftlinie" : store.routeStatus === "traffic" ? "Fahrzeit mit aktueller Verkehrslage" : "Fahrzeit ohne aktuelle Verkehrslage"}</p>
    <div className="catalogAvailability"><b>{count} {count === 1 ? "geprüftes Angebot" : "geprüfte Angebote"}</b><p>{count ? "Onlinepreise der Kette · Filialbestand bitte beim Händler prüfen." : "Das Sortiment findest du direkt beim Händler. Hier liegen noch keine passenden geprüften Preise vor."}</p></div>
    <div className="nearbyActions">
      {count > 0 && <button type="button" className="catalogBrowseButton" onClick={onBrowse}>Material ansehen ↓</button>}
      <a href={getStoreUrl(store.id, query)} target="_blank" rel="noopener noreferrer">{query ? "Material beim Händler suchen ↗" : "Gesamtes Händlersortiment ↗"}</a>
      <a className="routeButton" href={createRouteUrl(origin, store)} target="_blank" rel="noopener noreferrer">Route zu dieser Filiale →</a>
    </div>
    {store.attributions.length > 0 && <div className="providerAttribution">{store.attributions.map((item, index) => item.providerURI?.startsWith("https://") ? <a key={index} href={item.providerURI} target="_blank" rel="noopener noreferrer">{item.provider}</a> : <span key={index}>{item.provider}</span>)}</div>}
  </article>;
}
