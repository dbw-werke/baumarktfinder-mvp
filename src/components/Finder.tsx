"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SuggestionInput from "./SuggestionInput";
import GoogleAddressInput from "./GoogleAddressInput";
import StoreRow from "./StoreRow";
import SearchLoading from "./SearchLoading";
import StoreCard from "./StoreCard";
import NearbyStoreCard from "./NearbyStoreCard";
import ProductComparison from "./ProductComparison";
import { getMaterialCatalog, getMaterialSuggestions, resolvePreferredMaterial, searchMaterialCatalog, warmMaterialSuggestions, type MaterialRow, type MaterialSuggestion } from "../services/materialSuggestions";
import { fetchStoreCatalog } from "../services/catalog";
import { fetchObiOffer } from "../services/obi";
import type { ObiOffer } from "../lib/obi-offer";
import type { StorePrice } from "../services/prices";
import { getAddressSuggestionError, type ResolvedAddress } from "../services/maps";
import { discoverNearby, type NearbyResult } from "../services/nearby";
import { closestBranch, filterCatalog } from "../lib/catalogView";
import { CHAINS, type Coordinates, type ChainId } from "../lib/stores";
import { getStoreUrl } from "../lib/resolver";

type SearchResult = NearbyResult & { offers: StorePrice[]; observedAt: number; materials: MaterialRow[]; obiOffer?: ObiOffer | null; obiMaterialId?: string | null };
const POPULAR_MATERIALS = ["Rigips", "Dämmung", "Rotband", "Acryl", "Tiefengrund"];

export default function Finder() {
  const [address, setAddress] = useState("");
  const [addressSelection, setAddressSelection] = useState<ResolvedAddress | null>(null);
  const [addressPending, setAddressPending] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [product, setProduct] = useState("");
  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialSuggestion | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [status, setStatus] = useState("");
  const [failedSearch, setFailedSearch] = useState<{ address: string; product: string } | null>(null);
  const [addressError, setAddressError] = useState("");
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingKey, setPendingKey] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filterIds, setFilterIds] = useState<string[]>([]);
  const [chain, setChain] = useState("all");
  const [sort, setSort] = useState("distance");
  const [offerLimit, setOfferLimit] = useState(24);
  const [comparisonQuery, setComparisonQuery] = useState("");
  const [comparisonMaterial, setComparisonMaterial] = useState<MaterialRow | null>(null);
  const busy = useRef(false);
  const locationBusy = useRef(false);
  const addressBusy = useRef(false);
  const googleRetryAt = useRef(0);
  const searchGeneration = useRef(0);
  const activeSearchKey = useRef("");
  const obiRequest = useRef<AbortController | null>(null);
  const searchKey = JSON.stringify([address.trim(), coordinates, product.trim(), selectedMaterial?.id]);

  useEffect(() => { void warmMaterialSuggestions(); }, []);
  useEffect(() => () => { searchGeneration.current++; obiRequest.current?.abort(); }, []);
  useEffect(() => {
    if (!product.trim() || selectedMaterial) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { const found = await getMaterialSuggestions(product); if (!cancelled) setSuggestions(found); }
      catch { if (!cancelled) setSuggestions([]); }
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [product, selectedMaterial]);

  function changeMaterial(value: string) { setProduct(value); setSelectedMaterial(null); setSuggestions([]); }
  async function useCurrentLocation() {
    if (busy.current || locationBusy.current || addressBusy.current) return;
    if (!navigator.geolocation) { setStatus("Dein Browser unterstützt keine Standortbestimmung. Bitte gib eine Adresse in Deutschland ein."); return; }
    locationBusy.current = true; setLocationLoading(true); setStatus("Standort wird ermittelt …");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Die Standortfreigabe dauert zu lange. Bitte gib deine Adresse ein.")), 15_000);
        navigator.geolocation.getCurrentPosition(
          (value) => { window.clearTimeout(timer); resolve(value); },
          (error) => { window.clearTimeout(timer); reject(error); },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
      });
      setCoordinates({ lat: position.coords.latitude, lng: position.coords.longitude });
      setAddress("Mein aktueller Standort"); setAddressSelection(null); setAddressError(""); setStatus("Standort übernommen. Du kannst jetzt die Märkte suchen.");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      setStatus(code === 1 ? "Standortfreigabe wurde abgelehnt. Bitte gib deine Adresse ein." : error instanceof Error ? error.message : "Dein Standort ist momentan nicht verfügbar. Bitte gib deine Adresse ein.");
    } finally { locationBusy.current = false; setLocationLoading(false); }
  }
  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locationBusy.current || addressBusy.current || (busy.current && activeSearchKey.current === searchKey)) return;
    if (!address.trim()) { setStatus("Bitte gib eine Adresse in Deutschland ein."); return; }
    const generation = ++searchGeneration.current;
    obiRequest.current?.abort();
    const obiController = new AbortController(); obiRequest.current = obiController;
    const current = () => searchGeneration.current === generation;
    activeSearchKey.current = searchKey; setPendingKey(searchKey);
    busy.current = true; setLoading(true); setResult(null); setComparisonMaterial(null); setFailedSearch(null);
    setStatus("Baumärkte und Preise werden geladen …");
    try {
      // Resolve submitted text independently of the debounced dropdown, including immediate Enter.
      const materialCatalog = getMaterialCatalog();
      const preferOpen = googleUnavailable && Date.now() < googleRetryAt.current;
      const discovery = await discoverNearby({ address: address.trim(), origin: addressSelection ?? undefined, location: coordinates ?? undefined, preferOpen }, () => {});
      if (!current()) return;
      const [catalogue, materials, obi] = await Promise.all([fetchStoreCatalog([...new Set(discovery.stores.map((store) => store.id))]), materialCatalog,
        product.trim() && discovery.stores.some(store=>store.id==="obi") ? fetchObiOffer(product.trim(),obiController.signal) : Promise.resolve(null)]);
      if (!current()) return;
      setAddress(discovery.origin.address); setAddressSelection(discovery.origin); setCoordinates(discovery.origin.location);
      if (discovery.origin.provider === "osm" && !preferOpen) { googleRetryAt.current = Date.now() + 60_000; setGoogleUnavailable(true); }
      else if (discovery.origin.provider !== "osm") setGoogleUnavailable(false);
      const preferred = resolvePreferredMaterial(materials, product, selectedMaterial?.id);
      setResult({ ...discovery, offers: catalogue.offers, materials: materials.map((item) => item.material), obiOffer:obi?.offer, obiMaterialId:preferred?.id ?? null,
        warnings: [...discovery.warnings, ...(catalogue.error ? [catalogue.error] : []), ...(obi?.warning ? [obi.warning] : [])], observedAt: Date.now() });
      setComparisonQuery(product.trim()); setComparisonMaterial(preferred);
      setQuery(product.trim()); setFilterIds(preferred ? [preferred.id] : searchMaterialCatalog(materials, product).map((item) => item.id));
      setChain("all"); setSort("distance"); setOfferLimit(24); setSuggestions([]);
      setStatus(discovery.stores.length ? "" : "Keine unterstützten Baumärkte in Deutschland im Umkreis von 35 km gefunden.");
      window.requestAnimationFrame(() => { if (current()) document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    } catch (error) {
      if (!current()) return;
      setResult(null); setStatus(error instanceof Error ? error.message : "Die Suche konnte nicht abgeschlossen werden. Bitte versuche es erneut.");
      setFailedSearch({ address: coordinates ? `${coordinates.lat},${coordinates.lng}` : address.trim(), product: product.trim() });
    } finally { if (current()) { busy.current = false; setLoading(false); setPendingKey(""); } }
  }
  const stores = result ? [...result.stores].sort((a, b) => a.airDistanceMeters - b.airDistanceMeters) : [];
  const chains = [...new Set(stores.map((store) => store.id))];
  const matchingOffers = result ? filterCatalog(result.offers, stores, query, chain, filterIds) : [];
  const comparable = matchingOffers.length > 0 && new Set(matchingOffers.map((offer) => offer.material_id)).size === 1;
  const offers = [...matchingOffers].sort((a, b) => {
    if (sort === "price" && comparable) return a.price - b.price;
    if (sort === "name") return a.product_name.localeCompare(b.product_name, "de");
    return (closestBranch(stores, a.store_id)?.airDistanceMeters ?? Infinity) - (closestBranch(stores, b.store_id)?.airDistanceMeters ?? Infinity) || a.product_name.localeCompare(b.product_name, "de");
  });
  function browseChain(id: ChainId) { setChain(id); setOfferLimit(24); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return <main className="site">
    <header className="header">
      <a className="brand" href="#search"><span className="brandIcon" aria-hidden="true">⌂</span><span>BAUMARKT</span><strong>FINDER</strong></a>
      <nav className="nav" aria-label="Hauptnavigation"><a href="#search">Märkte & Material</a><a href="#about">So funktioniert’s</a><span className="countryLabel">Deutschland</span></nav>
    </header>
    <section className="hero" id="search" aria-label="Baumärkte und Material suchen">
      <div className="heroCopy"><div className="eyebrow">DEINE ADRESSE. DEINE BAUMÄRKTE.</div><h1>Material finden.<br />Ganz in deiner Nähe.</h1><p>Gib deine Adresse ein. Wir finden die nächsten Baumärkte und zeigen dir ihre erfassten Materialien. Du kannst auch direkt nach einem Produkt suchen.</p></div>
      <div className="heroVisual"><Image src="/Material.hero.png" alt="Baumaterialien für dein Projekt" width={520} height={330} priority unoptimized /></div>
      <form onSubmit={handleSearch} className="searchPanel" aria-busy={loading}>
        <div className="locationField">
          <GoogleAddressInput value={address} disabled={locationLoading} hint={addressError}
            onChange={(value) => { setAddress(value); setAddressSelection(null); setCoordinates(null); }}
            onSelect={(item) => { setAddress(item.address); setAddressSelection(item); setCoordinates(item.location); setAddressError(""); setGoogleUnavailable(false); }}
            onPendingChange={(pending) => { addressBusy.current = pending; setAddressPending(pending); }}
            onReady={() => { setAddressError(""); setGoogleUnavailable(false); }}
            onError={(error) => { googleRetryAt.current = Date.now() + 60_000; setGoogleUnavailable(true); setAddressError(getAddressSuggestionError(error)); }} />
          <button type="button" className="currentLocationButton" disabled={loading || locationLoading || addressPending} onClick={useCurrentLocation}><span aria-hidden="true">⌖</span>{locationLoading ? "Standort wird ermittelt …" : "Meinen aktuellen Standort verwenden"}</button>
        </div>
        <SuggestionInput id="material" label="MATERIAL (OPTIONAL)" placeholder="Leer lassen für alle erfassten Materialien" value={product} suggestions={suggestions} disabled={locationLoading}
          onChange={changeMaterial} onSelect={(item) => { setProduct(item.label); setSelectedMaterial(item); setSuggestions([]); }} />
        <button className="searchButton" disabled={(loading && pendingKey === searchKey) || locationLoading || addressPending} type="submit">{loading && pendingKey === searchKey ? "Suche läuft …" : addressPending ? "Adresse wird geprüft …" : "Suchen"}</button>
      </form>
      <div className="popular"><span>Beliebt:</span>{POPULAR_MATERIALS.map((item) => <button type="button" disabled={locationLoading} key={item} onClick={() => { changeMaterial(item); document.getElementById("material")?.focus(); }}>{item}</button>)}</div>
      <div className="searchStatus" role="status" aria-live="polite">{loading && <span className="spinner" aria-hidden="true" />}{status}</div>
      {failedSearch && <div className="searchFallback"><b>Du kannst direkt beim Kartendienst oder Händler weitersuchen:</b><div className="fallbackLinks"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Baumarkt bei ${failedSearch.address}`)}`} target="_blank" rel="noopener noreferrer">Baumärkte auf der Karte suchen ↗</a>{Object.entries(CHAINS).map(([id, info]) => <a key={id} href={getStoreUrl(id, failedSearch.product)} target="_blank" rel="noopener noreferrer">{info.name} ↗</a>)}</div><p>Externe Suche; diese Links bestätigen keine Entfernung und keinen Filialbestand.</p></div>}
    </section>
    {loading && <SearchLoading />}
    {!loading && result && <section className="resultsSection" id="results" aria-label="Suchergebnisse" aria-busy={loading}>
      <div className="sectionHeading"><div><span className="eyebrow">RUND UM DEINE ADRESSE</span><h2>Deine nächsten Baumärkte</h2><p className="originLabel">Ausgangspunkt: {result.origin.address}</p></div><span className="resultCount">{stores.length} Märkte · {chains.length} Händler</span></div>
      {result.warnings.length > 0 && <div className="resultWarnings" role="status">{[...new Set(result.warnings)].map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      {stores.length > 0 && <p className="comparisonNote">Nach Luftlinie sortiert · bis zu 15 Märkte im Umkreis von 35 km · OBI, BAUHAUS, HORNBACH, toom, hagebau, Globus und HELLWEG</p>}
      {comparisonQuery && stores.length > 0 ? <>
        <div className="comparisonSelection">
          <label htmlFor="comparison-material">Wunschprodukt / Vergleichsgröße</label>
          <select id="comparison-material" value={comparisonMaterial?.id ?? ""} onChange={(event) => {
            const material = result.materials.find((item) => item.id === event.target.value) ?? null;
            setComparisonMaterial(material);
            if (material) { const item = { ...material, label: material.suggestion_label ?? material.name }; setSelectedMaterial(item); setProduct(item.label); setSuggestions([]); }
          }}>
            <option value="" disabled>Bitte genaue Ausführung wählen</option>
            {result.materials.map((item) => <option key={item.id} value={item.id}>{item.suggestion_label ?? item.name}</option>)}
          </select>
          <p>{comparisonMaterial ? "Je Händler zuerst die Wunschgröße, sonst die nächste geprüfte, passende Größe. Der große Preis gilt immer für die tatsächlich gezeigte Packung." : result.obiOffer ? `OBI-Angebot für „${comparisonQuery}“. Die Karte zeigt die tatsächliche Ausführung. Für weitere Händler kannst du eine Vergleichsgröße wählen.` : `Für „${comparisonQuery}“ ist die Ausführung noch nicht eindeutig. Wähle das gewünschte Produkt, um geprüfte Preise zu vergleichen.`}</p>
          <button type="button" className="secondaryButton" onClick={() => { setComparisonQuery(""); setComparisonMaterial(null); setQuery(""); setFilterIds([]); }}>Alle Materialien durchstöbern</button>
        </div>
        <ProductComparison stores={stores} origin={result.origin} offers={result.offers} material={comparisonMaterial} catalog={result.materials} searchTerm={comparisonQuery} observedAt={result.observedAt}
          obiOffer={(comparisonMaterial?.id ?? null) === result.obiMaterialId ? result.obiOffer : null} />
      </> : <>
        <StoreRow label="Nächstgelegene Baumärkte">{stores.map((store, index) => <NearbyStoreCard key={store.placeId} store={store} origin={result.origin} count={filterCatalog(result.offers, stores, query, store.id, filterIds).length} query={query} highlighted={index === 0} onBrowse={() => browseChain(store.id)} />)}</StoreRow>
      </>}
      {stores.length > 0 && !comparisonQuery && <div className="catalogSection" id="catalog">
        <div className="sectionHeading"><div><span className="eyebrow">MATERIAL AUS DEINER UMGEBUNG</span><h2>Erfasste Materialien</h2><p>Alle geprüften Angebote der Händler mit einem Markt in deiner Nähe.</p></div><span className="resultCount">{offers.length} {offers.length === 1 ? "Angebot" : "Angebote"}</span></div>
        <div className="catalogFilters">
          <label>Material filtern<input type="search" value={query} placeholder="z. B. Rotband oder 30 kg" onChange={(event) => { setQuery(event.target.value); setFilterIds([]); setOfferLimit(24); setSort("distance"); }} /></label>
          <label>Händler<select value={chain} onChange={(event) => { setChain(event.target.value); setOfferLimit(24); }}><option value="all">Alle Händler in der Nähe</option>{chains.map((id) => <option value={id} key={id}>{CHAINS[id].name}</option>)}</select></label>
          <label>Sortieren<select value={sort === "price" && !comparable ? "distance" : sort} onChange={(event) => setSort(event.target.value)}><option value="distance">Nächster Markt</option><option value="name">Produktname</option>{comparable && <option value="price">Produktpreis</option>}</select></label>
          {(query || chain !== "all") && <button type="button" className="secondaryButton" onClick={() => { setQuery(""); setFilterIds([]); setChain("all"); setOfferLimit(24); }}>Alle Materialien</button>}
        </div>
        <p className="comparisonNote">Der Katalog wächst mit den verfügbaren Händlerdaten. Er enthält noch nicht das vollständige Sortiment aller Filialen. Preise gelten online für die Kette; Filialpreis und Bestand bitte beim Händler prüfen.</p>
        {offers.length ? <><StoreRow className="catalogGrid" label="Geprüfte Materialangebote">{offers.slice(0, offerLimit).map((offer) => <StoreCard key={`${offer.store_id}:${offer.material_id}`} store={closestBranch(stores, offer.store_id)!} origin={result.origin} price={offer} searchTerm={offer.product_name} highlighted={false} observedAt={result.observedAt} />)}</StoreRow>{offers.length > offerLimit && <button type="button" className="secondaryButton" onClick={() => setOfferLimit(offerLimit + 24)}>Weitere Materialien anzeigen</button>}</>
          : <div className="catalogEmpty"><h3>{query ? "Noch kein geprüftes Angebot für diese Suche" : "Für diese Händler sind noch keine geprüften Preise erfasst"}</h3><p>Du kannst das Material über die Links in den Marktkarten direkt im Händlersortiment suchen.</p></div>}
      </div>}
      <p className="googleAttribution">{result.origin.provider === "osm" ? <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Standorte: © OpenStreetMap-Mitwirkende</a> : "Standorte und Routen: Google Maps"}</p>
    </section>}
    <section className="benefits" id="about" aria-label="So funktioniert Baumarktfinder">
      <div><strong aria-hidden="true">1</strong><span><b>Adresse eingeben</b>Oder deinen Standort verwenden</span></div>
      <div><strong aria-hidden="true">2</strong><span><b>Märkte entdecken</b>Die nächsten Filialen im Überblick</span></div>
      <div><strong aria-hidden="true">3</strong><span><b>Material durchstöbern</b>Erfasste Angebote aller nahen Händler</span></div>
      <div><strong aria-hidden="true">4</strong><span><b>Zum Händler oder zur Route</b>Mit Preisquelle und Prüfzeitpunkt</span></div>
    </section>
    <footer className="footer"><span>BAUMARKTFINDER · Deutschland</span><p>Für die Suche wird deine Adresse bzw. dein Standort an Google oder OpenStreetMap (Nominatim/Overpass) übermittelt. Routenlinks öffnen Google Maps.</p></footer>
  </main>;
}
