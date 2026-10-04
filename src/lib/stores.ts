export const CHAIN_IDS = ["obi", "bauhaus", "hornbach", "toom", "hagebau", "globus", "hellweg"] as const;
export type ChainId = (typeof CHAIN_IDS)[number];

export const CHAINS: Record<ChainId, { name: string; searchName: string; logo: string }> = {
  obi: { name: "OBI", searchName: "OBI Baumarkt", logo: "/imagesobi.jpg" },
  bauhaus: { name: "BAUHAUS", searchName: "BAUHAUS", logo: "/bauhaus.png" },
  hornbach: { name: "HORNBACH", searchName: "HORNBACH Baumarkt", logo: "/imageshornbach.png" },
  toom: { name: "toom", searchName: "toom Baumarkt", logo: "/toom.webp" },
  hagebau: { name: "hagebau", searchName: "hagebaumarkt", logo: "/hagebau.jpg" },
  globus: { name: "Globus Baumarkt", searchName: "Globus Baumarkt", logo: "/Globus.png" },
  hellweg: { name: "HELLWEG", searchName: "HELLWEG Baumarkt", logo: "/hellweg.png" },
};
export const SEARCH_RADIUS_METERS = 35_000;
export const MAX_STORES = 15;
export type Coordinates = { lat: number; lng: number };
export type ResolvedAddress = { address: string; location: Coordinates; placeId?: string; countryCode: "DE"; provider?: "google" | "osm" };
export type StoreAttribution = { provider: string; providerURI?: string };
export type StoreCandidate = {
  id: ChainId;
  placeId: string;
  name: string;
  address: string;
  location: Coordinates;
  countryCode: "DE";
  airDistanceMeters: number;
  attributions: StoreAttribution[];
  provider?: "google" | "osm";
  addressIncomplete?: boolean;
};
export type RoutedStore = StoreCandidate & {
  distance: string;
  duration: string;
  distanceMeters: number;
  durationSeconds: number | null;
  routeStatus: "traffic" | "driving" | "unavailable";
};
type AddressComponent = { types: readonly string[]; shortText?: string | null; short_name?: string };

/** Both Places (New) and Geocoder components; a bounding box is not proof of country. */
export function isGermanAddress(components: readonly AddressComponent[] | null | undefined): boolean {
  const country = components?.find((component) => component.types.includes("country"));
  return (country?.shortText ?? country?.short_name)?.toUpperCase() === "DE";
}
export function isChainId(value: string): value is ChainId {
  return CHAIN_IDS.some((id) => id === value);
}
function normalize(value: string): string {
  return value.toLocaleLowerCase("de-DE").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss");
}
export function detectChain(name: string): ChainId | null {
  const value = normalize(name);
  if (/\bobi\b/.test(value)) return "obi";
  if (/\bbauhaus\b/.test(value)) return "bauhaus";
  if (/\bhornbach\b/.test(value)) return "hornbach";
  if (/\btoom\b/.test(value)) return "toom";
  if (/\bhagebau(?:markt)?\b/.test(value)) return "hagebau";
  if (/\bglobus\b/.test(value) && /\bbaumarkt\b/.test(value)) return "globus";
  if (/\bhellweg\b/.test(value)) return "hellweg";
  return null;
}
export function isDepartment(name: string): boolean {
  const value = normalize(name);
  if (/\b(museum|universitat|universitaet|hochschule|archiv|stiftung)\b/.test(value)) return true;
  if (/(kuchenplaner|kuechenplaner|badplaner|gartenplaner|renovierungsservice|projektservice|profi[ -]?depot|nautic)/.test(value)) return true;
  if (/(holzz?uschnitt|holzschnitt|zuschnitt|mietgerate|mietgeraete|gerateverleih|geraeteverleih|verleih|farbmisch|mischservice|schluessel|schlussel|kuche[n]?studio|kueche[n]?studio|baderwelt|baederwelt|fliesenabteilung|abteilung|handwerkervermittlung|montageservice|tankstelle|bistro|backerei|baeckerei|restaurant|logistik|zentrallager)/.test(value)) return true;
  return /(gartencenter|gartenparadies|stadtgarten)/.test(value) && !/\bbaumarkt\b/.test(value);
}
export function isValidCoordinates(location: Coordinates): boolean {
  return Number.isFinite(location.lat) && Number.isFinite(location.lng) && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}
export function airDistanceMeters(a: Coordinates, b: Coordinates): number {
  const radians = Math.PI / 180;
  const sinLat = Math.sin((b.lat - a.lat) * radians / 2);
  const sinLng = Math.sin((b.lng - a.lng) * radians / 2);
  const haversine = sinLat ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * sinLng ** 2;
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}
function addressKey(address: string): string {
  return normalize(address).replace(/\b(deutschland|germany)\b/g, "").replace(/strasse\b/g, "str").replace(/[^a-z0-9]/g, "");
}
function mainStoreScore(store: StoreCandidate): number {
  const name = normalize(store.name);
  return (name === normalize(CHAINS[store.id].name) ? 100 : 0) + (/\bbaumarkt\b|hagebaumarkt/.test(name) ? 40 : 0) - name.length / 1000;
}
/** Select the main entry and cap destinations BEFORE requesting a route matrix. */
export function prepareStores(stores: readonly StoreCandidate[], origin: Coordinates): StoreCandidate[] {
  const candidates = stores
    .filter((store) => store.countryCode === "DE" && isChainId(store.id) && detectChain(store.name) === store.id && !isDepartment(store.name) && store.address.trim() && store.placeId && isValidCoordinates(store.location))
    .map((store) => ({ ...store, airDistanceMeters: airDistanceMeters(origin, store.location) }))
    .filter((store) => store.airDistanceMeters <= SEARCH_RADIUS_METERS)
    .sort((a, b) => mainStoreScore(b) - mainStoreScore(a) || a.placeId.localeCompare(b.placeId));
  const unique: StoreCandidate[] = [];
  for (const store of candidates) {
    const duplicate = unique.some((other) => other.placeId === store.placeId || (other.id === store.id && ((!other.addressIncomplete && !store.addressIncomplete && addressKey(other.address) === addressKey(store.address)) || airDistanceMeters(other.location, store.location) < 180)));
    if (!duplicate) unique.push(store);
  }
  return unique.sort((a, b) => a.airDistanceMeters - b.airDistanceMeters || a.name.localeCompare(b.name, "de")).slice(0, MAX_STORES);
}
export function formatDistance(meters: number): string {
  return `${(meters / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes} Min.` : `${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}
export function routeFallback(store: StoreCandidate): RoutedStore {
  return { ...store, distance: `${formatDistance(store.airDistanceMeters)} Luftlinie`, duration: "Fahrzeit nicht verfügbar", distanceMeters: store.airDistanceMeters, durationSeconds: null, routeStatus: "unavailable" };
}
export function sortRoutedStores(stores: RoutedStore[]): RoutedStore[] {
  return [...stores].sort((a, b) => {
    if (a.durationSeconds === null && b.durationSeconds === null) return a.airDistanceMeters - b.airDistanceMeters;
    if (a.durationSeconds === null) return 1;
    if (b.durationSeconds === null) return -1;
    return a.durationSeconds - b.durationSeconds || a.distanceMeters - b.distanceMeters;
  });
}
