import { createHash } from "node:crypto";
import {
  CHAINS, SEARCH_RADIUS_METERS, airDistanceMeters, detectChain, isDepartment,
  isValidCoordinates, prepareStores, routeFallback,
  type Coordinates, type ResolvedAddress, type RoutedStore, type StoreCandidate,
} from "./stores";

export type NearbyInput = { address: string; location?: never } | { location: Coordinates; address?: never };
export type NearbyResult = { origin: ResolvedAddress; stores: RoutedStore[]; warnings: string[] };
export class OsmError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); this.name = "OsmError"; }
}
const OSM_ATTRIBUTION = { provider: "© OpenStreetMap-Mitwirkende", providerURI: "https://www.openstreetmap.org/copyright" };
const PUBLIC_NOMINATIM = "https://nominatim.openstreetmap.org/";
const PUBLIC_OVERPASS = "https://overpass-api.de/api/interpreter";
const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL = 30 * 60_000;

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue { return typeof value === "object" && value !== null && !Array.isArray(value); }
function string(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function coordinate(value: unknown): Coordinates | null {
  if (!record(value) || typeof value.lat !== "number" || typeof value.lng !== "number") return null;
  const location = { lat: value.lat, lng: value.lng };
  return isValidCoordinates(location) ? location : null;
}
export function parseNearbyInput(value: unknown): NearbyInput {
  if (!record(value) || Object.keys(value).some((key) => key !== "address" && key !== "location")) throw new OsmError("Bitte gib eine Adresse oder einen Standort an.", 400);
  if (value.address !== undefined && value.location !== undefined) throw new OsmError("Bitte nur eine Adresse oder einen Standort senden.", 400);
  if (value.location !== undefined) {
    const location = coordinate(value.location);
    if (!location) throw new OsmError("Ungültige Standortkoordinaten.", 400);
    return { location };
  }
  const address = string(value.address);
  if (address.length < 3 || address.length > 250 || /[\u0000-\u001f]/.test(address)) throw new OsmError("Bitte gib eine vollständige Adresse oder eine deutsche Postleitzahl ein.", 400);
  return { address };
}

/** The country comes from Nominatim's boundary assignment, never from the display text or a bounding box. */
export function parseNominatimOrigin(payload: unknown, location?: Coordinates): ResolvedAddress {
  const results = Array.isArray(payload) ? payload : [payload];
  if (!results.length || !record(results[0])) throw new OsmError("Adresse nicht gefunden. Bitte Straße, Ort und Postleitzahl genauer angeben.", 404);
  const first = results[0];
  const address = record(first.address) ? first.address : {};
  if (string(address.country_code).toLowerCase() !== "de") throw new OsmError("Die Suche ist nur für Adressen und Standorte in Deutschland verfügbar.", 400);
  const point = { lat: Number(first.lat), lng: Number(first.lon) };
  if (!isValidCoordinates(point) || !string(first.display_name)) throw new OsmError("Der Standortdienst hat keine nutzbare Adresse geliefert.");
  if (!location && ["country", "state", "county", "region"].includes(string(first.addresstype))) throw new OsmError("Bitte gib einen Ort, eine Postleitzahl oder eine vollständige Adresse an.", 400);
  if (!location && results.slice(1).some((item) => record(item) && isValidCoordinates({ lat: Number(item.lat), lng: Number(item.lon) }) && airDistanceMeters(point, { lat: Number(item.lat), lng: Number(item.lon) }) > 500)) throw new OsmError("Die Adresse ist mehrdeutig. Bitte ergänze Ort und Postleitzahl.", 400);
  return { address: string(first.display_name), location: location ?? point, countryCode: "DE", provider: "osm" };
}

export function buildOverpassQuery(location: Coordinates): string {
  if (!isValidCoordinates(location)) throw new OsmError("Ungültige Standortkoordinaten.", 400);
  // Both filters are essential: nearby on its own would include markets across the border.
  return `[out:json][timeout:18][maxsize:33554432];\narea["ISO3166-1"="DE"]["admin_level"="2"]->.germany;\nnwr(around:${SEARCH_RADIUS_METERS},${location.lat.toFixed(6)},${location.lng.toFixed(6)})["shop"~"^(doityourself|hardware)$"][~"^(name|brand|operator)$"~"OBI|BAUHAUS|HORNBACH|toom|hagebau|Globus|HELLWEG",i]->.nearby;\nnwr.nearby(area.germany);\nout center tags;`;
}

export function storesFromOverpass(payload: unknown, origin: Coordinates): StoreCandidate[] {
  if (!record(payload) || !Array.isArray(payload.elements) || payload.remark) throw new OsmError("Die offene Baumarktkarte konnte gerade nicht vollständig geladen werden.");
  const stores: StoreCandidate[] = [];
  for (const element of payload.elements) {
    if (!record(element) || !["node", "way", "relation"].includes(string(element.type)) || typeof element.id !== "number" || !Number.isSafeInteger(element.id) || element.id <= 0 || !record(element.tags)) continue;
    const tags = element.tags;
    if (!["doityourself", "hardware"].includes(string(tags.shop))) continue;
    const country = string(tags["addr:country"]).toLowerCase();
    if (country && !["de", "deutschland", "germany"].includes(country)) continue;
    const rawName = string(tags.name);
    if (isDepartment(rawName)) continue;
    const brands = [rawName, string(tags.brand), string(tags.operator)];
    let chain = brands.map(detectChain).find((id) => id !== null) ?? null;
    if (!chain && brands.some((name) => /^globus$/i.test(name))) chain = "globus";
    if (!chain) continue;
    const name = detectChain(rawName) === chain ? rawName : [CHAINS[chain].name, rawName].filter(Boolean).join(" · ");
    const center = record(element.center) ? element.center : element;
    const location = { lat: Number(center.lat), lng: Number(center.lon) };
    if (!isValidCoordinates(location)) continue;
    const street = string(tags["addr:street"]) || string(tags["addr:place"]);
    const house = string(tags["addr:housenumber"]);
    const city = string(tags["addr:city"]) || string(tags["addr:town"]) || string(tags["addr:village"]);
    const postcode = string(tags["addr:postcode"]);
    const address = [[street, house].filter(Boolean).join(" "), [postcode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Straßenadresse bei OpenStreetMap nicht hinterlegt";
    stores.push({ id: chain, name, placeId: `osm/${element.type}/${element.id}`, address, location, countryCode: "DE", provider: "osm", addressIncomplete: !street || !house, airDistanceMeters: 0, attributions: [OSM_ATTRIBUTION] });
  }
  return prepareStores(stores, origin);
}

/** Start reservations enforce <=1 request/second in one server process, with bounded waiting. */
export function createRequestGate(now: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let nextStart = 0;
  let waiting = 0;
  return {
    async enter() {
      if (waiting >= 3) throw new OsmError("Die Standortsuche ist gerade ausgelastet. Bitte in einer Minute erneut versuchen.", 429);
      waiting += 1;
      try {
        // Recheck after every wait: delayed timers must not start several requests together.
        while (nextStart > now()) {
          const wait = nextStart - now();
          if (wait > 2500) throw new OsmError("Die Standortsuche ist gerade ausgelastet. Bitte in einer Minute erneut versuchen.", 429);
          await sleep(wait);
        }
        nextStart = now() + 1100;
      } finally { waiting -= 1; }
    },
    cooldown(milliseconds = 60_000) { nextStart = Math.max(nextStart, now() + milliseconds); },
  };
}

type ServiceOptions = { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; nominatimUrl?: string; overpassUrl?: string };
type CacheEntry = { expires: number; result?: NearbyResult; error?: OsmError };
export function createOsmService(options: ServiceOptions = {}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const geocodeGate = createRequestGate(now, options.sleep);
  const overpassGate = createRequestGate(now, options.sleep);
  const cache = new Map<string, CacheEntry>();
  const geocodeCache = new Map<string, { origin: ResolvedAddress; expires: number }>();
  const pending = new Map<string, Promise<NearbyResult>>();

  async function getJson(url: string, init: RequestInit, timeout: number, gate: ReturnType<typeof createRequestGate>): Promise<unknown> {
    await gate.enter();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: controller.signal, headers: { "User-Agent": process.env.OSM_USER_AGENT || "Baumarktfinder/1.0 (local development)", "Accept": "application/json", "Accept-Language": "de", ...init.headers } });
      if (response.status === 429 || response.status === 403) { gate.cooldown(); throw new OsmError("Der offene Kartendienst begrenzt gerade die Anfragen. Bitte später erneut versuchen.", 429); }
      if (!response.ok) throw new OsmError("Der offene Kartendienst ist gerade nicht erreichbar. Bitte später erneut versuchen.");
      if (Number(response.headers.get("content-length")) > 4_000_000) throw new OsmError("Die Antwort des Kartendienstes ist zu groß.");
      const content = await response.text();
      if (content.length > 4_000_000) throw new OsmError("Die Antwort des Kartendienstes ist zu groß.");
      try { return JSON.parse(content) as unknown; } catch { throw new OsmError("Der offene Kartendienst hat keine gültigen Daten geliefert."); }
    } catch (error) {
      if (error instanceof OsmError) throw error;
      throw new OsmError("Der offene Kartendienst antwortet gerade nicht rechtzeitig. Bitte später erneut versuchen.");
    } finally { clearTimeout(timer); }
  }

  function endpoint(value: string): URL {
    try {
      const url = new URL(value);
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
      return url;
    } catch { throw new OsmError("Der offene Standortdienst ist nicht richtig konfiguriert."); }
  }

  async function run(input: NearbyInput, nominatimBase: URL, overpassUrl: URL): Promise<NearbyResult> {
    const nominatim = new URL(input.location ? "reverse" : "search", `${nominatimBase.href.replace(/\/$/, "")}/`);
    nominatim.searchParams.set("format", "jsonv2");
    nominatim.searchParams.set("addressdetails", "1");
    nominatim.searchParams.set("accept-language", "de");
    if (input.location) {
      nominatim.searchParams.set("lat", String(input.location.lat));
      nominatim.searchParams.set("lon", String(input.location.lng));
      nominatim.searchParams.set("zoom", "18");
    } else {
      nominatim.searchParams.set("q", input.address);
      nominatim.searchParams.set("countrycodes", "de");
      nominatim.searchParams.set("layer", "address");
      nominatim.searchParams.set("limit", "3");
    }
    const geocodeKey = createHash("sha256").update(nominatim.href).digest("hex");
    const savedOrigin = geocodeCache.get(geocodeKey);
    const origin = savedOrigin && savedOrigin.expires > now() ? savedOrigin.origin
      : parseNominatimOrigin(await getJson(nominatim.href, {}, 10_000, geocodeGate), input.location);
    geocodeCache.set(geocodeKey, { origin, expires: now() + 24 * 60 * 60_000 });
    while (geocodeCache.size > MAX_CACHE_ENTRIES) geocodeCache.delete(geocodeCache.keys().next().value!);
    // Public Overpass may queue for 15 seconds before its own execution timeout starts.
    const payload = await getJson(overpassUrl.href, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: buildOverpassQuery(origin.location) }).toString() }, 40_000, overpassGate);
    const stores = storesFromOverpass(payload, origin.location).map(routeFallback);
    return { origin, stores, warnings: ["Standorte aus OpenStreetMap; die Kartendaten können unvollständig sein. Entfernungen sind Luftlinien, keine Fahrstrecken. Fahrzeiten und Verkehrsdaten sind hier nicht verfügbar."] };
  }

  return async (rawInput: unknown): Promise<NearbyResult> => {
    const input = parseNearbyInput(rawInput);
    const nominatim = endpoint(options.nominatimUrl ?? process.env.OSM_NOMINATIM_URL ?? PUBLIC_NOMINATIM);
    const overpass = endpoint(options.overpassUrl ?? process.env.OSM_OVERPASS_URL ?? PUBLIC_OVERPASS);
    if (nominatim.hostname === "nominatim.openstreetmap.org" && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
      throw new OsmError("Die öffentliche Standortsuche ist in dieser verteilten Hosting-Umgebung nicht aktiviert. Bitte einen eigenen oder vertraglich gebuchten Nominatim-Dienst konfigurieren.");
    }
    // Raw addresses are never cache keys or log output. Only OSM responses enter this bounded memory cache.
    const key = createHash("sha256").update(JSON.stringify([input, nominatim.href, overpass.href])).digest("hex");
    const cached = cache.get(key);
    if (cached && cached.expires > now()) {
      if (cached.error) throw cached.error;
      return cached.result!;
    }
    if (pending.has(key)) return pending.get(key)!;
    if (pending.size >= 4) throw new OsmError("Die Standortsuche ist gerade ausgelastet. Bitte später erneut versuchen.", 429);
    const task = run(input, nominatim, overpass).then((result) => {
      cache.set(key, { result, expires: now() + CACHE_TTL });
      return result;
    }).catch((error: unknown) => {
      const failure = error instanceof OsmError ? error : new OsmError("Die offene Standortsuche ist gerade nicht verfügbar.");
      cache.set(key, { error: failure, expires: now() + 30_000 });
      throw failure;
    }).finally(() => {
      pending.delete(key);
      while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    });
    pending.set(key, task);
    return task;
  };
}

// This public-service mode is for one low-traffic server process, not a distributed deployment.
export const findOsmNearby = createOsmService();
