import {
  CHAINS, CHAIN_IDS, SEARCH_RADIUS_METERS, detectChain, isDepartment,
  isGermanAddress, isValidCoordinates, prepareStores, routeFallback,
  sortRoutedStores, formatDistance, formatDuration,
  type Coordinates, type ResolvedAddress, type StoreCandidate, type RoutedStore,
} from "../lib/stores";

export type { Coordinates, ResolvedAddress, StoreCandidate, RoutedStore } from "../lib/stores";
export type AddressSuggestion = { placeId: string; label: string };
export type StoreSearchResult = { stores: StoreCandidate[]; warnings: string[] };
let mapsLoadPromise: Promise<void> | null = null;
let mapsAuthorizationError: Error | null = null;
// Predictions are kept only in this browser session so toPlace() preserves Google billing sessions.
const predictions = new Map<string, { prediction: google.maps.places.PlacePrediction; token?: google.maps.places.AutocompleteSessionToken }>();

function withTimeout<T>(promise: Promise<T>, label: string, milliseconds = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label}: Zeitüberschreitung. Bitte erneut versuchen.`)), milliseconds);
    promise.then((result) => { clearTimeout(timeout); resolve(result); }, (error: unknown) => { clearTimeout(timeout); reject(error); });
  });
}

async function retryTransient<T>(operation: () => Promise<T>, label: string): Promise<T> {
  try { return await withTimeout(operation(), label); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/UNKNOWN_ERROR|INTERNAL|UNAVAILABLE|NETWORK|fetch|Zeitüberschreitung/i.test(message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return withTimeout(operation(), label);
  }
}

/** Uses the supported Places (New) and Routes libraries; no legacy DistanceMatrix dependency. */
export async function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") throw new Error("Google Maps ist nur im Browser verfügbar.");
  if (mapsAuthorizationError) throw mapsAuthorizationError;
  if (mapsLoadPromise) return mapsLoadPromise;
  if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") return;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("Die Standortsuche ist noch nicht eingerichtet (Google Maps API-Schlüssel fehlt).");
  mapsLoadPromise = new Promise<void>((resolve, reject) => {
    const target = window as Window & { __baumarktMapsReady?: () => void; gm_authFailure?: () => void };
    const script = document.createElement("script");
    const previousAuthFailure = target.gm_authFailure;
    let complete = false;
    const timer = window.setTimeout(() => finish(new Error("Google Maps lädt zu lange. Bitte prüfe deine Verbindung und versuche es erneut.")), 12_000);
    function finish(error?: Error) {
      if (complete) return;
      complete = true;
      window.clearTimeout(timer);
      delete target.__baumarktMapsReady;
      // Authentication can fail after the script-ready callback. Keep its handler
      // installed on success so subsequent Places calls cannot mistake that for readiness.
      if (error && !mapsAuthorizationError) target.gm_authFailure = previousAuthFailure;
      if (error) { script.remove(); reject(error); } else resolve();
    }
    target.__baumarktMapsReady = () => finish();
    target.gm_authFailure = () => {
      mapsAuthorizationError = new Error("Google Maps konnte nicht autorisiert werden. Bitte API-Aktivierung, Abrechnung und Domainfreigabe prüfen und die Seite neu laden.");
      finish(mapsAuthorizationError);
      previousAuthFailure?.();
    };
    script.dataset.baumarktfinderGoogleMaps = "true";
    const params = new URLSearchParams({ key, v: "quarterly", loading: "async", language: "de", region: "DE", callback: "__baumarktMapsReady" });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => finish(new Error("Google Maps konnte nicht geladen werden. Bitte prüfe deine Verbindung."));
    document.head.appendChild(script);
  }).catch((error: unknown) => { mapsLoadPromise = null; throw error; });
  return mapsLoadPromise;
}

/** Keep diagnostic hints actionable without exposing raw provider URLs or credentials. */
export function getAddressSuggestionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Bitte verwende eine Adresse oder einen Standort in Deutschland.") return message;
  if (message === "Die Adresse konnte nicht eindeutig ermittelt werden." || message === "Die ausgewählte Adresse hat keine gültige Google-Place-ID.") return "Die ausgewählte Adresse konnte nicht eindeutig ermittelt werden. Bitte wähle einen anderen Adressvorschlag.";
  if (/konnte nicht autorisiert/i.test(message)) return "Google-Adressvorschläge konnten nicht autorisiert werden. Bitte Google-API-Aktivierung, Abrechnung und Domainfreigabe prüfen und die Seite neu laden.";
  if (/REFERRER|REFERER/i.test(message)) return "Google-Adressvorschläge sind für diese Website nicht freigegeben. Bitte die Google-API-Domainfreigabe prüfen.";
  if (/BILLING|Abrechnung/i.test(message)) return "Google-Adressvorschläge benötigen ein aktives Google-Cloud-Abrechnungskonto.";
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QUOTA/i.test(message)) return "Das Google-Kontingent für Adressvorschläge ist momentan ausgeschöpft. Bitte später erneut versuchen.";
  if (/API_KEY|API.*ACTIVAT|API.*BLOCK|PERMISSION_DENIED|REQUEST_DENIED|not authorized|not enabled|autorisiert|API-Aktivierung/i.test(message)) return "Google-Adressvorschläge sind nicht freigegeben. Bitte Maps JavaScript API, Places API (New) und die Schlüsselbeschränkungen prüfen.";
  if (/Schlüssel fehlt/i.test(message)) return "Google-Adressvorschläge sind noch nicht eingerichtet: Der Google-Maps-Schlüssel fehlt.";
  return "Google-Adressvorschläge sind gerade nicht erreichbar. Bitte die vollständige Adresse eingeben und die Suche starten.";
}

async function placesLibrary(): Promise<google.maps.PlacesLibrary> {
  await loadGoogleMaps();
  return withTimeout(google.maps.importLibrary("places"), "Adress- und Marktsuche") as Promise<google.maps.PlacesLibrary>;
}

/** Official Places UI; prediction rendering and billing sessions belong to Google. */
export async function createGoogleAddressWidget(): Promise<google.maps.places.PlaceAutocompleteElement> {
  // The installed Google typings expose the element class but omit it from
  // PlacesLibrary; the official importLibrary("places") contract includes it.
  const { PlaceAutocompleteElement } = await placesLibrary() as google.maps.PlacesLibrary & {
    PlaceAutocompleteElement: typeof google.maps.places.PlaceAutocompleteElement;
  };
  if (typeof PlaceAutocompleteElement !== "function") throw new Error("Das offizielle Google-Adressfeld konnte nicht geladen werden.");
  return new PlaceAutocompleteElement({ includedRegionCodes: ["de"], requestedLanguage: "de", requestedRegion: "de",
    placeholder: "Straße, Hausnummer, PLZ und Ort", name: "address", maxlength: 250,
    description: "Adresse oder Ort in Deutschland", });
}

export async function resolveAddressPrediction(prediction: Pick<google.maps.places.PlacePrediction, "toPlace">): Promise<ResolvedAddress> {
  const place = prediction.toPlace();
  await retryTransient(() => place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents", "id"] }), "Adresse");
  if (!place.id?.trim()) throw new Error("Die ausgewählte Adresse hat keine gültige Google-Place-ID.");
  return { ...verifiedAddress(place.formattedAddress, place.location?.toJSON(), place.addressComponents, place.id), provider: "google" };
}

export async function createAutocompleteSession(): Promise<google.maps.places.AutocompleteSessionToken> {
  const { AutocompleteSessionToken } = await placesLibrary();
  return new AutocompleteSessionToken();
}

export async function fetchAddressSuggestions(query: string, sessionToken?: google.maps.places.AutocompleteSessionToken): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];
  const { AutocompleteSuggestion } = await placesLibrary();
  const { suggestions } = await withTimeout(AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query.trim().slice(0, 250), includedRegionCodes: ["de"], language: "de", region: "de", sessionToken,
  }), "Adressvorschläge", 7_000);
  const result: AddressSuggestion[] = [];
  for (const suggestion of suggestions) {
    const prediction = suggestion.placePrediction;
    if (!prediction) continue;
    predictions.set(prediction.placeId, { prediction, token: sessionToken });
    result.push({ placeId: prediction.placeId, label: prediction.text.toString() });
  }
  while (predictions.size > 40) predictions.delete(predictions.keys().next().value!);
  return result.slice(0, 5);
}

function verifiedAddress(address: string | null | undefined, location: Coordinates | null | undefined, components: Parameters<typeof isGermanAddress>[0], placeId?: string): ResolvedAddress {
  if (!isGermanAddress(components)) throw new Error("Bitte verwende eine Adresse oder einen Standort in Deutschland.");
  if (!address || !location || !isValidCoordinates(location)) throw new Error("Die Adresse konnte nicht eindeutig ermittelt werden.");
  return { address, location, placeId, countryCode: "DE" };
}

export async function resolveAddress(address: string | { placeId: string }, sessionToken?: google.maps.places.AutocompleteSessionToken): Promise<ResolvedAddress> {
  if (typeof address !== "string") {
    const { Place } = await placesLibrary();
    const cached = predictions.get(address.placeId);
    const place = cached && (!sessionToken || cached.token === sessionToken)
      ? cached.prediction.toPlace()
      : new Place({ id: address.placeId, requestedLanguage: "de", requestedRegion: "de" });
    predictions.delete(address.placeId);
    await retryTransient(() => place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents", "id"] }), "Adresse");
    return verifiedAddress(place.formattedAddress, place.location?.toJSON(), place.addressComponents, place.id);
  }
  if (!address.trim()) throw new Error("Bitte gib eine Adresse in Deutschland ein.");
  await loadGoogleMaps();
  const { Geocoder } = await withTimeout(google.maps.importLibrary("geocoding"), "Adresssuche") as google.maps.GeocodingLibrary;
  const { results } = await retryTransient(() => new Geocoder().geocode({ address: address.trim().slice(0, 250), componentRestrictions: { country: "DE" }, region: "DE" }), "Adresssuche");
  const result = results[0];
  if (results.length !== 1 || !result || result.partial_match) throw new Error("Adresse nicht eindeutig gefunden. Bitte wähle einen Adressvorschlag in Deutschland.");
  return verifiedAddress(result.formatted_address, result.geometry.location.toJSON(), result.address_components, result.place_id);
}

export async function reverseGeocode(location: Coordinates): Promise<ResolvedAddress> {
  if (!isValidCoordinates(location)) throw new Error("Ungültige Standortkoordinaten.");
  await loadGoogleMaps();
  const { Geocoder } = await withTimeout(google.maps.importLibrary("geocoding"), "Standortsuche") as google.maps.GeocodingLibrary;
  const { results } = await retryTransient(() => new Geocoder().geocode({ location, region: "DE" }), "Standortsuche");
  const result = results[0];
  if (!result) throw new Error("Für diesen Standort wurde keine Adresse gefunden.");
  return verifiedAddress(result.formatted_address, location, result.address_components, result.place_id);
}

export async function findNearbyStores(origin: ResolvedAddress, onStatus?: (message: string) => void): Promise<StoreSearchResult> {
  if (origin.countryCode !== "DE" || !isValidCoordinates(origin.location)) throw new Error("Die Suche ist nur für Standorte in Deutschland verfügbar.");
  const { Place } = await placesLibrary();
  const latDelta = SEARCH_RADIUS_METERS / 110_500;
  const lngDelta = SEARCH_RADIUS_METERS / (111_000 * Math.cos(origin.location.lat * Math.PI / 180));
  const bounds = { north: origin.location.lat + latDelta, south: origin.location.lat - latDelta, east: origin.location.lng + lngDelta, west: origin.location.lng - lngDelta };
  let completed = 0;
  const results = await Promise.allSettled(CHAIN_IDS.map(async (chainId) => {
    try {
      const { places } = await retryTransient(() => Place.searchByText({
        textQuery: CHAINS[chainId].searchName, language: "de", region: "de", locationRestriction: bounds,
        maxResultCount: 20, rankPreference: "DISTANCE", includedType: "hardware_store", useStrictTypeFiltering: false,
        fields: ["id", "displayName", "formattedAddress", "location", "addressComponents", "businessStatus", "attributions"],
      }), `${CHAINS[chainId].name}-Suche`);
      const stores: StoreCandidate[] = [];
      for (const place of places) {
        const name = place.displayName ?? "";
        if (detectChain(name) !== chainId || isDepartment(name) || !isGermanAddress(place.addressComponents)) continue;
        if (!place.location || !place.formattedAddress || !place.id || place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") continue;
        stores.push({
          id: chainId, placeId: place.id, name, address: place.formattedAddress, location: place.location.toJSON(), countryCode: "DE", airDistanceMeters: 0,
          attributions: (place.attributions ?? []).map((item) => ({ provider: item.provider ?? "", providerURI: item.providerURI ?? undefined })),
        });
      }
      return stores;
    } finally { completed += 1; onStatus?.(`${completed} von ${CHAIN_IDS.length} Baumarktketten geprüft …`); }
  }));
  const stores: StoreCandidate[] = [];
  const warnings: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") stores.push(...result.value);
    else warnings.push(`${CHAINS[CHAIN_IDS[index]].name} konnte gerade nicht geprüft werden.`);
  });
  if (results.every((result) => result.status === "rejected")) throw new Error("Die Baumarktsuche ist gerade nicht verfügbar. Bitte Verbindung, Google-API-Freigaben und Kontingent prüfen.");
  return { stores: prepareStores(stores, origin.location), warnings };
}

export async function getRoutes(origin: ResolvedAddress, stores: StoreCandidate[]): Promise<RoutedStore[]> {
  if (origin.countryCode !== "DE" || !isValidCoordinates(origin.location)) throw new Error("Die Routenberechnung benötigt einen Standort in Deutschland.");
  const destinations = prepareStores(stores, origin.location);
  if (!destinations.length) return [];
  // Public OSM fallback has no road-routing provider; never pass its internal IDs to Google.
  if (origin.provider === "osm" || destinations.some((store) => store.provider === "osm" || store.placeId.startsWith("osm/"))) return destinations.map(routeFallback);
  try {
    await loadGoogleMaps();
    const [routesLibrary, coreLibrary] = await withTimeout(Promise.all([
      google.maps.importLibrary("routes"), google.maps.importLibrary("core"),
    ]), "Routenberechnung");
    const { RouteMatrix } = routesLibrary as google.maps.RoutesLibrary;
    const { UnitSystem } = coreLibrary as google.maps.CoreLibrary;
    const { matrix } = await retryTransient(() => RouteMatrix.computeRouteMatrix({
      origins: [origin.location], destinations: destinations.map((store) => `places/${store.placeId}`),
      travelMode: "DRIVING", routingPreference: "TRAFFIC_AWARE", language: "de", region: "DE", units: UnitSystem.METRIC,
      fields: ["condition", "distanceMeters", "durationMillis", "fallbackInfo", "error"],
    }), "Routenberechnung");
    return sortRoutedStores(destinations.map((store, index) => {
      const route = matrix.rows[0]?.items[index];
      if (!route || route.error || route.condition !== "ROUTE_EXISTS" || typeof route.distanceMeters !== "number" || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || typeof route.durationMillis !== "number" || !Number.isFinite(route.durationMillis) || route.durationMillis < 0) return routeFallback(store);
      const seconds = route.durationMillis / 1000;
      return {
        ...store, distance: formatDistance(route.distanceMeters), duration: formatDuration(seconds),
        distanceMeters: route.distanceMeters, durationSeconds: seconds,
        routeStatus: route.fallbackInfo && route.fallbackInfo.routingMode !== "TRAFFIC_AWARE" ? "driving" : "traffic",
      } satisfies RoutedStore;
    }));
  } catch {
    // A failed Routes entitlement/quota must never hide genuine nearby stores or invent driving times.
    return destinations.map(routeFallback);
  }
}

export function createRouteUrl(origin: ResolvedAddress, store: StoreCandidate): string {
  const osm = store.provider === "osm" || store.placeId.startsWith("osm/");
  const params = new URLSearchParams({ api: "1", origin: `${origin.location.lat},${origin.location.lng}`, destination: `${store.location.lat},${store.location.lng}`, travelmode: "driving", dir_action: "navigate" });
  if (!osm && store.placeId.trim()) params.set("destination_place_id", store.placeId);
  return `https://www.google.com/maps/dir/?${params}`;
}
