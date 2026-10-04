import { findNearbyStores, getRoutes, resolveAddress, reverseGeocode } from "./maps";
import { isValidCoordinates, type Coordinates, type ResolvedAddress, type RoutedStore } from "../lib/stores";

export type NearbyResult = { origin: ResolvedAddress; stores: RoutedStore[]; warnings: string[] };
export async function discoverNearby(input: { address: string; origin?: ResolvedAddress; selection?: string; location?: Coordinates; preferOpen?: boolean; sessionToken?: google.maps.places.AutocompleteSessionToken }, onStatus: (message: string) => void): Promise<NearbyResult> {
  if (input.origin && (input.origin.countryCode !== "DE" || !isValidCoordinates(input.origin.location))) throw new Error("Die Suche benötigt einen geprüften Standort in Deutschland.");
  if (!input.preferOpen) {
    try {
      const origin = input.origin ?? (input.location ? await reverseGeocode(input.location) : await resolveAddress(input.selection ? { placeId: input.selection } : input.address, input.sessionToken));
      onStatus("Baumärkte im Umkreis von 35 km werden gesucht …");
      const discovery = await findNearbyStores(origin, onStatus);
      if (discovery.stores.length) {
        onStatus("Routen werden berechnet …");
        const stores = await getRoutes(origin, discovery.stores);
        const warnings = [...discovery.warnings];
        if (stores.some((store) => store.routeStatus === "unavailable")) warnings.push("Für einige Märkte zeigen wir die Luftlinie, da keine Fahrzeit verfügbar ist.");
        return { origin, stores, warnings };
      }
    } catch { /* The independent location provider remains available after a Google outage. */ }
  }
  onStatus("Adresse und nächstgelegene Märkte werden über OpenStreetMap gesucht …");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65_000);
  try {
    const response = await fetch("/api/nearby", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.origin || input.location ? { location: input.origin?.location ?? input.location } : { address: input.address }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Die Standortsuche ist gerade nicht erreichbar. Bitte versuche es erneut.");
    if (!data.origin || !Array.isArray(data.stores) || !Array.isArray(data.warnings)) throw new Error("Die Standortsuche hat keine lesbare Antwort geliefert.");
    return data as NearbyResult;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Die Standortsuche dauert zu lange. Bitte versuche es in einem Moment erneut.");
    throw error;
  } finally { clearTimeout(timer); }
}
