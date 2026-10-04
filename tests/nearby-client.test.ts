import test from "node:test";
import assert from "node:assert/strict";
import { discoverNearby } from "../src/services/nearby";

test("explicit fallback sends only the submitted address, without material or Google token", async () => {
  const original = globalThis.fetch;
  const expected = { origin: { address: "Test", location: { lat: 50, lng: 8 }, countryCode: "DE", provider: "osm" }, stores: [], warnings: [] };
  let request: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => { assert.equal(url, "/api/nearby"); request = JSON.parse(String(init?.body)); return Response.json(expected); };
  try {
    assert.deepEqual(await discoverNearby({ address: "Testadresse", selection: "unused-google-id", preferOpen: true }, () => {}), expected);
    assert.deepEqual(request, { address: "Testadresse" });
  } finally { globalThis.fetch = original; }
});
test("geolocation uses coordinates alone and upstream errors stay visible", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { location: { lat: 50, lng: 8 } });
    return Response.json({ error: "Die Suche ist nur für Deutschland verfügbar." }, { status: 400 });
  };
  try { await assert.rejects(discoverNearby({ address: "Mein Standort", location: { lat: 50, lng: 8 }, preferOpen: true }, () => {}), /nur für Deutschland/); }
  finally { globalThis.fetch = original; }
});
