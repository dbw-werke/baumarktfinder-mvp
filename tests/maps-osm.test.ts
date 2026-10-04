import assert from "node:assert/strict";
import test from "node:test";
import { buildOverpassQuery, createOsmService, createRequestGate, OsmError, parseNearbyInput, parseNominatimOrigin, storesFromOverpass } from "../src/lib/osm-server";
import { createRouteUrl, getRoutes } from "../src/services/maps";
import { POST } from "../src/app/api/nearby/route";

const point = { lat: 50.11, lng: 8.68 };
const geocode = { lat: "50.11", lon: "8.68", display_name: "60320 Frankfurt am Main, Deutschland", address: { country_code: "de" }, addresstype: "postcode" };
function element(id: number, tags: Record<string, string> = {}, lat = 50.11) {
  return { type: "node", id, lat, lon: 8.68, tags: { name: "OBI", shop: "doityourself", "addr:street": "Teststraße", "addr:housenumber": String(id), ...tags } };
}

test("OSM request validates exactly one input and rejects foreign or ambiguous origins", () => {
  assert.deepEqual(parseNearbyInput({ address: "  60320 Frankfurt  " }), { address: "60320 Frankfurt" });
  assert.throws(() => parseNearbyInput({ address: "Berlin", location: point }), /nur eine/);
  assert.throws(() => parseNearbyInput({ location: { lat: 999, lng: 8 } }), /Ungültige/);
  assert.throws(() => parseNearbyInput({ address: "Berlin", endpoint: "https://evil.test" }), /Adresse/);
  assert.throws(() => parseNominatimOrigin({ ...geocode, address: { country_code: "ch" } }, point), /Deutschland/);
  assert.throws(() => parseNominatimOrigin([{ ...geocode, address: {} }]), /Deutschland/);
  assert.throws(() => parseNominatimOrigin([geocode, { ...geocode, lat: "52.34", lon: "14.55" }]), /mehrdeutig/);
  assert.equal(parseNominatimOrigin([geocode]).provider, "osm");
  assert.equal(parseNominatimOrigin([{ ...geocode, addresstype: "city", place_rank: 12 }]).provider, "osm");
  assert.throws(() => parseNominatimOrigin([{ ...geocode, addresstype: "state" }]), /einen Ort/);
});

test("Overpass query intersects Germany boundary with radius and filters unsupported stores", () => {
  const query = buildOverpassQuery(point);
  assert.match(query, /ISO3166-1.*DE/);
  assert.match(query, /nwr\(around:35000/);
  assert.match(query, /->\.nearby;\s*nwr\.nearby\(area\.germany\)/);
  const stores = storesFromOverpass({ elements: [
    element(1), element(2, { name: "OBI Holzzuschnitt" }),
    element(3, { "addr:country": "CH" }), element(4, { name: "BayWa" }),
    element(5, { name: "Globus", shop: "supermarket" }), element(6, { name: "OBI" }, 51.1),
    { ...element(7), type: "way", center: { lat: 50.1101, lon: 8.68 } },
  ] }, point);
  assert.equal(stores.length, 1);
  assert.equal(stores[0].provider, "osm");
  assert.match(stores[0].placeId, /^osm\//);
  assert.equal(stores[0].attributions[0].providerURI, "https://www.openstreetmap.org/copyright");
  assert.throws(() => storesFromOverpass({ elements: [], remark: "runtime error: timeout" }, point), /nicht vollständig/);
});

test("OSM missing addresses do not merge distinct branches; brand-tagged franchises remain", () => {
  const tags = { "addr:street": "", "addr:housenumber": "" };
  const stores = storesFromOverpass({ elements: [element(1, tags), element(2, tags, 50.15), element(3, { name: "Müller", brand: "hagebau" }, 50.2)] }, point);
  assert.equal(stores.length, 3);
  assert.equal(stores.filter((store) => store.addressIncomplete).length, 2);
  assert.equal(stores[2].id, "hagebau");
});

test("OSM IDs are never sent as Google Place IDs or fabricated traffic routes", async () => {
  const origin = parseNominatimOrigin([geocode]);
  const stores = storesFromOverpass({ elements: [element(1)] }, point);
  const route = new URL(createRouteUrl(origin, stores[0]));
  assert.equal(route.searchParams.has("destination_place_id"), false);
  assert.equal(route.searchParams.get("destination"), "50.11,8.68");
  const routed = await getRoutes(origin, stores);
  assert.equal(routed[0].durationSeconds, null);
  assert.equal(routed[0].routeStatus, "unavailable");
  assert.match(routed[0].distance, /Luftlinie/);
});

test("public request gate spaces starts and respects upstream cooldown", async () => {
  let now = 0;
  const waits: number[] = [];
  const gate = createRequestGate(() => now, async (ms) => { waits.push(ms); now += ms; });
  await gate.enter(); await gate.enter(); await gate.enter();
  assert.deepEqual(waits, [1100, 1100]);
  gate.cooldown();
  await assert.rejects(gate.enter(), (error: unknown) => error instanceof OsmError && error.status === 429);
});

test("OSM service performs submit geocode once, caches and coalesces repeated material searches", async () => {
  const urls: string[] = [];
  const service = createOsmService({ fetch: async (url, init) => {
    urls.push(String(url));
    assert.match(new Headers(init?.headers).get("User-Agent") ?? "", /Baumarktfinder/);
    if (String(url).includes("nominatim")) {
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get("countrycodes"), "de");
      assert.equal(parsed.searchParams.get("q"), "60320 Frankfurt");
      return Response.json([geocode]);
    }
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /area/);
    return Response.json({ elements: [element(1)] });
  } });
  const [first, second] = await Promise.all([service({ address: "60320 Frankfurt" }), service({ address: "60320 Frankfurt" })]);
  assert.equal(first, second);
  assert.equal(first.stores.length, 1);
  await service({ address: "60320 Frankfurt" });
  assert.equal(urls.length, 2);
  assert.match(first.warnings[0], /unvollständig/);
});

test("API rejects invalid and cross-site requests without querying upstream", async () => {
  const invalid = await POST(new Request("http://localhost/api/nearby", { method: "POST", body: JSON.stringify({ location: { lat: 999, lng: 1 } }) }));
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get("cache-control") ?? "", /no-store/);
  const crossSite = await POST(new Request("http://localhost/api/nearby", { method: "POST", headers: { origin: "https://other.example" }, body: JSON.stringify({ address: "Berlin" }) }));
  assert.equal(crossSite.status, 403);
  const localHostAlias = await POST(new Request("http://localhost:3000/api/nearby", { method: "POST", headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, body: JSON.stringify({ location: { lat: 999, lng: 1 } }) }));
  assert.equal(localHostAlias.status, 400, "same browser Host reaches input validation despite internal Next hostname");
  const forgedForwardedHost = await POST(new Request("http://localhost:3000/api/nearby", { method: "POST", headers: { origin: "https://other.example", host: "localhost:3000", "x-forwarded-host": "other.example" }, body: "{}" }));
  assert.equal(forgedForwardedHost.status, 403, "untrusted forwarded headers cannot widen origin access");
});

test("public Nominatim is blocked on known distributed deployments before any network call", async () => {
  const priorVercel = process.env.VERCEL;
  const priorLambda = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const service = createOsmService({ nominatimUrl: "https://nominatim.openstreetmap.org/", fetch: async () => { throw new Error("No network call expected"); } });
  try {
    process.env.VERCEL = "1";
    await assert.rejects(service({ address: "Frankfurt" }), /verteilten Hosting/);
    delete process.env.VERCEL;
    process.env.AWS_LAMBDA_FUNCTION_NAME = "nearby";
    await assert.rejects(service({ address: "Frankfurt" }), /verteilten Hosting/);
  } finally {
    if (priorVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = priorVercel;
    if (priorLambda === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME; else process.env.AWS_LAMBDA_FUNCTION_NAME = priorLambda;
  }
});
