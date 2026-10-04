import assert from "node:assert/strict";
import test from "node:test";
import { airDistanceMeters, CHAIN_IDS, detectChain, isDepartment, isGermanAddress, prepareStores, routeFallback, sortRoutedStores, type StoreCandidate } from "../src/lib/stores";
import { getStoreUrl, isSafeStoreUrl } from "../src/lib/resolver";

const origin = { lat: 50.11, lng: 8.68 };
function store(patch: Partial<StoreCandidate> = {}): StoreCandidate {
  return { id: "obi", name: "OBI", placeId: "main", address: "Teststraße 1, 60311 Frankfurt am Main", location: origin, countryCode: "DE", airDistanceMeters: 0, attributions: [], ...patch };
}

test("only seven exact chains; no substring matches and no Globus grocery", () => {
  assert.equal(CHAIN_IDS.length, 7);
  for (const name of ["Tobias Möbel", "Globus Markthalle", "BayWa"]) assert.equal(detectChain(name), null);
  assert.equal(prepareStores([store({ id: "bauhaus", name: "Bauhaus Museum" })], origin).length, 0);
  assert.equal(detectChain("hagebaumarkt Frankfurt"), "hagebau");
  assert.equal(detectChain("Globus Baumarkt"), "globus");
});

test("country verification needs an explicit DE country component", () => {
  assert.equal(isGermanAddress([{ types: ["country"], shortText: "DE" }]), true);
  assert.equal(isGermanAddress([{ types: ["country"], short_name: "DE" }]), true);
  assert.equal(isGermanAddress([{ types: ["country"], shortText: "CH" }]), false);
  assert.equal(isGermanAddress([{ types: ["locality"], shortText: "DE" }]), false);
  assert.equal(isGermanAddress([]), false);
  assert.equal(isGermanAddress(undefined), false);
});

test("department listings are rejected while main Baumarkt with garden remains", () => {
  for (const name of ["OBI Holzzuschnitt", "OBI Holzschnitt", "BAUHAUS Mietgeräte", "HELLWEG Mietgeraete", "toom Farbmischservice", "OBI Gartencenter", "BAUHAUS Stadtgarten", "HORNBACH Küchenstudio", "OBI Küchenplaner", "OBI Badplaner", "BAUHAUS PROFI DEPOT"]) assert.equal(isDepartment(name), true, name);
  assert.equal(isDepartment("OBI Baumarkt & Gartencenter"), false);
});

test("main store wins near duplicate; different chains and distant branches survive", () => {
  const results = prepareStores([
    store({ name: "OBI Filiale", placeId: "other", location: { lat: 50.1105, lng: 8.68 }, address: "Andere Schreibweise 2" }),
    store({ name: "OBI Holzzuschnitt", placeId: "department" }), store(),
    store({ id: "toom", name: "toom Baumarkt", placeId: "toom" }),
    store({ placeId: "far", address: "Anderer Markt 10", location: { lat: 50.15, lng: 8.68 } }),
  ], origin);
  assert.deepEqual(results.map((s) => s.placeId).sort(), ["far", "main", "toom"]);
});

test("address normalization catches duplicates beyond 180m; 35km radius and 15 cap hold", () => {
  assert.equal(prepareStores([store(), store({ placeId: "address-alias", address: "Teststr. 1, 60311 Frankfurt am Main, Deutschland", location: { lat: 50.12, lng: 8.68 } })], origin).length, 1);
  const stores = Array.from({ length: 25 }, (_, index) => store({ placeId: `id-${index}`, address: `Straße ${index}`, location: { lat: origin.lat + index * 0.003, lng: origin.lng } }));
  stores.push(store({ placeId: "too-far", address: "Fernstraße 1", location: { lat: 51, lng: 8.68 } }));
  const results = prepareStores(stores, origin);
  assert.equal(results.length, 15);
  assert.equal(results.some((s) => s.placeId === "too-far"), false);
  assert.ok(results.every((s) => s.airDistanceMeters <= 35_000));
  assert.equal(airDistanceMeters(origin, origin), 0);
});

test("failed routes never claim driving distance or fastest position", () => {
  const unavailable = routeFallback(store());
  assert.match(unavailable.distance, /Luftlinie/);
  assert.equal(unavailable.durationSeconds, null);
  const routed = { ...routeFallback(store({ placeId: "routed" })), durationSeconds: 120, routeStatus: "traffic" as const };
  assert.equal(sortRoutedStores([unavailable, routed])[0].placeId, "routed");
});

test("store links encode input, reject other chains, and reject forged product hosts", () => {
  for (const id of CHAIN_IDS) assert.equal(isSafeStoreUrl(id, getStoreUrl(id, "Rotband & 30 kg/#")), true);
  assert.throws(() => getStoreUrl("baywa", "Rotband"));
  for (const url of ["javascript:alert(1)", "https://www.obi.de.evil.example/p", "https://evil.example/obi.de", "https://user:pass@www.obi.de/p", "http://www.obi.de/p", "https://www.obi.de:444/p"]) assert.equal(isSafeStoreUrl("obi", url), false);
  assert.equal(isSafeStoreUrl("obi", "https://www.obi.de/p/123"), true);
  assert.match(getStoreUrl("obi", "A&B#C"), /A%26B%23C/);
  assert.equal(new URL(getStoreUrl("hagebau", "Rotband")).pathname, "/search/");
  assert.equal(new URL(getStoreUrl("globus", "Rotband")).searchParams.get("query"), "Rotband");
});
