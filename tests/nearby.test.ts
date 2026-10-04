import assert from "node:assert/strict";
import test from "node:test";
import { discoverNearby } from "../src/services/nearby";
import type { ResolvedAddress } from "../src/lib/stores";

const origin: ResolvedAddress = { address: "Frankfurt am Main, Deutschland", placeId: "selected-frankfurt", location: { lat: 50.11, lng: 8.68 }, countryCode: "DE", provider: "google" };

function environment(places: unknown, fetcher: typeof fetch) {
  const previous = new Map(["window", "google", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const imported: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "google", { configurable: true, value: { maps: { importLibrary: async (name: string) => {
    imported.push(name);
    if (name === "places") return places;
    throw new Error("REQUEST_DENIED");
  } } } });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetcher });
  return { imported, restore() {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  } };
}

test("a verified widget origin is reused without geocoding or another place-details request", async () => {
  const env = environment({ Place: { searchByText: async ({ textQuery }: { textQuery: string }) => ({ places: textQuery === "OBI Baumarkt" ? [{
    id: "actual-branch", displayName: "OBI", formattedAddress: "Teststraße 1, Frankfurt", location: { toJSON: () => ({ lat: 50.12, lng: 8.68 }) },
    addressComponents: [{ types: ["country"], shortText: "DE" }], businessStatus: "OPERATIONAL", attributions: [],
  }] : [] }) } }, async () => { throw new Error("Must not call fallback"); });
  try {
    const result = await discoverNearby({ address: "older typed query", origin }, () => {});
    assert.equal(result.origin, origin);
    assert.equal(result.stores[0].placeId, "actual-branch");
    assert.equal(result.stores[0].routeStatus, "unavailable");
    assert.equal(env.imported.includes("geocoding"), false);
  } finally { env.restore(); }
});

test("Google store outage uses the selected coordinates for fallback, never the previous typed address", async () => {
  let body: unknown;
  const env = environment({ Place: { searchByText: async () => { throw new Error("REQUEST_DENIED"); } } }, async (url, options) => {
    assert.equal(url, "/api/nearby");
    body = JSON.parse(String(options?.body));
    return Response.json({ origin: { ...origin, provider: "osm" }, stores: [], warnings: ["OpenStreetMap"] });
  });
  try {
    const result = await discoverNearby({ address: "a different earlier city", origin }, () => {});
    assert.deepEqual(body, { location: origin.location });
    assert.equal(result.origin.provider, "osm");
    assert.equal(env.imported.includes("geocoding"), false);
  } finally { env.restore(); }
});

test("plain fallback address still submits without a Google selection and invalid supplied origins fail closed", async () => {
  const requests: unknown[] = [];
  const env = environment({}, async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return Response.json({ origin: { ...origin, provider: "osm" }, stores: [], warnings: [] });
  });
  try {
    await discoverNearby({ address: "60320 Frankfurt am Main", preferOpen: true }, () => {});
    assert.deepEqual(requests, [{ address: "60320 Frankfurt am Main" }]);
    await assert.rejects(discoverNearby({ address: "", origin: { ...origin, location: { lat: NaN, lng: 8 } } }, () => {}), /Deutschland/);
    assert.equal(requests.length, 1);
  } finally { env.restore(); }
});
