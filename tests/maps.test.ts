import assert from "node:assert/strict";
import test from "node:test";
import { createAutocompleteSession, createGoogleAddressWidget, createRouteUrl, fetchAddressSuggestions, findNearbyStores, getAddressSuggestionError, getRoutes, resolveAddress, resolveAddressPrediction, reverseGeocode } from "../src/services/maps";
import { type ResolvedAddress, type StoreCandidate } from "../src/lib/stores";

const origin: ResolvedAddress = { address: "Frankfurt am Main", location: { lat: 50.11, lng: 8.68 }, countryCode: "DE" };
function candidate(patch: Partial<StoreCandidate> = {}): StoreCandidate {
  return { id: "obi", name: "OBI", placeId: "main", address: "Teststraße 1, Frankfurt", location: origin.location, countryCode: "DE", airDistanceMeters: 0, attributions: [], ...patch };
}
function mockGoogle(libraries: Record<string, unknown>) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldGoogle = Object.getOwnPropertyDescriptor(globalThis, "google");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "google", { configurable: true, value: { maps: { importLibrary: async (name: string) => { if (name === "core") return { UnitSystem: { METRIC: 0 } }; const library = libraries[name]; if (!library) throw new Error("REQUEST_DENIED"); return library; } } } });
  return () => {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
    if (oldGoogle) Object.defineProperty(globalThis, "google", oldGoogle); else Reflect.deleteProperty(globalThis, "google");
  };
}

test("seven chain requests return partial results, excluding foreign border stores and departments", async () => {
  const queries: string[] = [];
  const restore = mockGoogle({ places: { Place: { searchByText: async (request: { textQuery: string; fields: string[] }) => {
    queries.push(request.textQuery);
    assert.ok(request.fields.includes("addressComponents"));
    if (request.textQuery === "HELLWEG Baumarkt") throw new Error("REQUEST_DENIED");
    if (request.textQuery !== "OBI Baumarkt") return { places: [] };
    const place = { displayName: "OBI", formattedAddress: "Teststraße 1", location: { toJSON: () => origin.location }, businessStatus: "OPERATIONAL", attributions: [] };
    return { places: [
      { ...place, id: "de", addressComponents: [{ types: ["country"], shortText: "DE" }] },
      { ...place, id: "ch", addressComponents: [{ types: ["country"], shortText: "CH" }] },
      { ...place, id: "missing-country", addressComponents: [] },
      { ...place, id: "department", displayName: "OBI Mietgeräte", addressComponents: [{ types: ["country"], shortText: "DE" }] },
    ] };
  } } } });
  try {
    const result = await findNearbyStores(origin);
    assert.equal(queries.length, 7);
    assert.deepEqual(result.stores.map((s) => s.placeId), ["de"]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /HELLWEG/);
  } finally { restore(); }
});

test("route matrix receives deduplicated main store IDs and sorts by traffic duration", async () => {
  let seenDestinations: string[] = [];
  const restore = mockGoogle({ routes: { RouteMatrix: { computeRouteMatrix: async (request: { destinations: string[]; routingPreference: string }) => {
    seenDestinations = request.destinations;
    assert.equal(request.routingPreference, "TRAFFIC_AWARE");
    return { matrix: { rows: [{ items: [
      { condition: "ROUTE_EXISTS", distanceMeters: 4000, durationMillis: 600000 },
      { condition: "ROUTE_EXISTS", distanceMeters: 5000, durationMillis: 300000, fallbackInfo: { routingMode: "TRAFFIC_UNAWARE" } },
    ] }] } };
  } } } });
  try {
    const stores = [candidate({ placeId: "department", name: "OBI Zuschnitt" }), candidate({ placeId: "alias", name: "OBI Filiale" }), candidate(), candidate({ id: "toom", name: "toom Baumarkt", placeId: "toom", address: "Andere Straße 1", location: { lat: 50.12, lng: 8.68 } })];
    const result = await getRoutes(origin, stores);
    assert.deepEqual(seenDestinations, ["places/main", "places/toom"]);
    assert.deepEqual(result.map((s) => s.placeId), ["toom", "main"]);
    assert.equal(result[0].durationSeconds, 300);
    assert.equal(result[0].routeStatus, "driving");
    assert.equal(result[1].routeStatus, "traffic");
  } finally { restore(); }
});

test("Routes permission failures retain stores with clearly marked air distance", async () => {
  const restore = mockGoogle({});
  try {
    const result = await getRoutes(origin, [candidate()]);
    assert.equal(result.length, 1);
    assert.equal(result[0].routeStatus, "unavailable");
    assert.match(result[0].distance, /Luftlinie/);
    assert.equal(result[0].durationSeconds, null);
  } finally { restore(); }
});

test("geocoding and reverse geocoding refuse a foreign or missing country component", async () => {
  const restore = mockGoogle({ geocoding: { Geocoder: class {
    async geocode() { return { results: [{ formatted_address: "Basel, Schweiz", address_components: [{ types: ["country"], short_name: "CH" }], geometry: { location: { toJSON: () => ({ lat: 47.56, lng: 7.59 }) } }, place_id: "basel" }] }; }
  } } });
  try {
    await assert.rejects(resolveAddress("Basel"), /Deutschland/);
    await assert.rejects(reverseGeocode({ lat: 47.56, lng: 7.59 }), /Deutschland/);
  } finally { restore(); }
});

test("ambiguous typed addresses require a selection instead of using the first city", async () => {
  const restore = mockGoogle({ geocoding: { Geocoder: class {
    async geocode() { return { results: ["Frankfurt am Main", "Frankfurt (Oder)"].map((city, index) => ({
      formatted_address: `${city}, Deutschland`, address_components: [{ types: ["country"], short_name: "DE" }],
      geometry: { location: { toJSON: () => ({ lat: 50.11 + index, lng: 8.68 + index }) } }, place_id: `frankfurt-${index}`,
    })) }; }
  } } });
  try { await assert.rejects(resolveAddress("Frankfurt"), /nicht eindeutig/); }
  finally { restore(); }
});

test("route URL preserves origin snapshot and cannot inject parameters through address", () => {
  const url = new URL(createRouteUrl(origin, candidate({ address: "A & travelmode=walking # Straße 1", placeId: "id&origin=attacker" })));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("origin"), "50.11,8.68");
  assert.equal(url.searchParams.get("travelmode"), "driving");
  assert.equal(url.searchParams.get("destination_place_id"), "id&origin=attacker");
  assert.equal(url.searchParams.get("destination"), "50.11,8.68");
});

test("same-chain branches route to their own coordinates with or without Google Place IDs", () => {
  const first = new URL(createRouteUrl(origin, candidate({ placeId: "branch-a", location: { lat: 50.14, lng: 8.73 } })));
  const second = new URL(createRouteUrl(origin, candidate({ placeId: "branch-b", location: { lat: 50.19, lng: 8.79 } })));
  const coordinatesOnly = new URL(createRouteUrl(origin, candidate({ placeId: "", location: { lat: 50.14, lng: 8.73 } })));
  assert.equal(first.searchParams.get("destination"), "50.14,8.73");
  assert.equal(second.searchParams.get("destination"), "50.19,8.79");
  assert.equal(second.searchParams.get("destination_place_id"), "branch-b");
  assert.equal(coordinatesOnly.searchParams.has("destination_place_id"), false);
  assert.equal(coordinatesOnly.searchParams.get("destination"), "50.14,8.73");
});

test("German autocomplete uses the selected prediction's billing session and verifies its country", async () => {
  let expectedToken: google.maps.places.AutocompleteSessionToken;
  let toPlaceCalls = 0;
  const restore = mockGoogle({ places: {
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: async (request: google.maps.places.AutocompleteRequest) => {
      assert.equal(request.input, "Frankfurt");
      assert.deepEqual(request.includedRegionCodes, ["de"]);
      assert.equal(request.language, "de");
      assert.equal(request.sessionToken, expectedToken);
      return { suggestions: [{ placePrediction: { placeId: "frankfurt-selected", text: { toString: () => "Frankfurt am Main, Deutschland" }, toPlace: () => {
        toPlaceCalls++;
        return { id: "frankfurt-selected", formattedAddress: "Frankfurt am Main, Deutschland", location: { toJSON: () => origin.location }, addressComponents: [{ types: ["country"], shortText: "DE" }],
          fetchFields: async ({ fields }: { fields: string[] }) => { assert.ok(fields.includes("addressComponents")); } };
      } } }, { queryPrediction: {} }] };
    } },
    Place: class { constructor() { throw new Error("Must use prediction.toPlace for this session"); } },
  } });
  try {
    expectedToken = await createAutocompleteSession();
    const suggestions = await fetchAddressSuggestions(" Frankfurt ", expectedToken);
    assert.deepEqual(suggestions, [{ placeId: "frankfurt-selected", label: "Frankfurt am Main, Deutschland" }]);
    const selected = await resolveAddress(suggestions[0], expectedToken);
    assert.equal(selected.countryCode, "DE");
    assert.equal(selected.placeId, "frankfurt-selected");
    assert.equal(toPlaceCalls, 1);
  } finally { restore(); }
});

test("autocomplete diagnostic hints identify configuration failures without echoing provider credentials", () => {
  assert.match(getAddressSuggestionError(new Error("API_KEY_HTTP_REFERRER_BLOCKED")), /Domainfreigabe/);
  assert.match(getAddressSuggestionError(new Error("REQUEST_DENIED")), /Places API \(New\)/);
  assert.match(getAddressSuggestionError(new Error("BILLING_DISABLED")), /Abrechnungskonto/);
  assert.match(getAddressSuggestionError(new Error("RESOURCE_EXHAUSTED")), /Kontingent/);
  assert.doesNotMatch(getAddressSuggestionError(new Error("REQUEST_DENIED https://provider.test/?key=synthetic-sensitive-value")), /synthetic-sensitive-value|provider\.test/);
});

test("official Google autocomplete widget owns the UI and is restricted to Germany", async () => {
  let options: google.maps.places.PlaceAutocompleteElementOptions | undefined;
  const restore = mockGoogle({ places: { PlaceAutocompleteElement: class {
    constructor(value: google.maps.places.PlaceAutocompleteElementOptions) { options = value; }
  } } });
  try {
    const widget = await createGoogleAddressWidget();
    assert.ok(widget);
    assert.deepEqual(options?.includedRegionCodes, ["de"]);
    assert.equal(options?.requestedLanguage, "de");
    assert.equal(options?.requestedRegion, "de");
    assert.equal(options?.name, "address");
    assert.equal(options?.maxlength, 250);
  } finally { restore(); }
});

test("official widget selection resolves exact address, coordinates and ID and rejects foreign/incomplete places", async () => {
  const requested: string[][] = [];
  const prediction = (patch: Record<string, unknown> = {}) => ({ toPlace: () => ({
    id: "selected-frankfurt", formattedAddress: "Frankfurt am Main, Deutschland",
    location: { toJSON: () => origin.location }, addressComponents: [{ types: ["country"], shortText: "DE" }],
    fetchFields: async ({ fields }: { fields: string[] }) => { requested.push(fields); }, ...patch,
  }) as unknown as google.maps.places.Place });
  const selected = await resolveAddressPrediction(prediction());
  assert.deepEqual(selected, { address: "Frankfurt am Main, Deutschland", location: origin.location, placeId: "selected-frankfurt", countryCode: "DE", provider: "google" });
  assert.deepEqual(requested[0], ["formattedAddress", "location", "addressComponents", "id"]);
  for (const patch of [
    { addressComponents: [{ types: ["country"], shortText: "AT" }] },
    { addressComponents: [] }, { location: undefined }, { formattedAddress: undefined }, { id: "" }, { id: " " },
  ]) await assert.rejects(resolveAddressPrediction(prediction(patch)), /Deutschland|Adresse|Place-ID/);
  assert.match(getAddressSuggestionError(new Error("Bitte verwende eine Adresse oder einen Standort in Deutschland.")), /Deutschland/);
});

test("route destinations are capped at 15 and item failures remain distinct from real routes", async () => {
  let count = 0;
  const restore = mockGoogle({ routes: { RouteMatrix: { computeRouteMatrix: async (request: { destinations: string[] }) => {
    count = request.destinations.length;
    return { matrix: { rows: [{ items: request.destinations.map((_, index) => index === 0
      ? { condition: "ROUTE_NOT_FOUND" }
      : { condition: "ROUTE_EXISTS", distanceMeters: 1000 + index * 500, durationMillis: 60000 + index * 60000 }) }] } };
  } } } });
  try {
    const stores = Array.from({ length: 20 }, (_, index) => candidate({ placeId: `id-${index}`, address: `Straße ${index}`, location: { lat: origin.location.lat + index * 0.003, lng: origin.location.lng } }));
    const result = await getRoutes(origin, stores);
    assert.equal(count, 15);
    assert.equal(result.length, 15);
    assert.equal(result[0].routeStatus, "traffic");
    assert.equal(result.at(-1)?.routeStatus, "unavailable");
    assert.equal(result.at(-1)?.durationSeconds, null);
  } finally { restore(); }
});

test("all failed chain lookups report an outage rather than no stores", async () => {
  const restore = mockGoogle({ places: { Place: { searchByText: async () => { throw new Error("REQUEST_DENIED"); } } } });
  try { await assert.rejects(findNearbyStores(origin), /nicht verfügbar/); }
  finally { restore(); }
});
