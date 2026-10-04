import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { fetchStoreCatalog, groupCatalogOffers, mergeCatalogSources } from "../src/services/catalog";
import type { StorePrice } from "../src/services/prices";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";

// Synthetic regression fixtures only; never imported into a running application.
function row(material = "material-a", chain = "hornbach", checkedAt = "2026-01-01T00:00:00Z") {
  return { material_id: material, store_id: chain, product_name: `Fixture ${material}`,
    product_url: chain === "obi" ? "https://www.obi.de/p/12345/fixture" : "https://www.hornbach.de/p/fixture/12345/",
    price: 12, unit_price: 0.4, unit: "kg", package_quantity: 30, currency: "EUR", checked_at: checkedAt,
    source: "automatic", price_scope: "chain", availability: null, verified: true };
}
function client(handler: (url: URL) => Response | Promise<Response>) {
  return createClient("https://catalog-test.invalid", "test-public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input) => Promise.resolve(handler(new URL(String(input)))) },
  });
}
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

test("catalogue restricts reads to supported nearby chains and preserves several materials", async () => {
  const queries: URL[] = [];
  const response = await fetchStoreCatalog(["hornbach", "unknown", "obi", "hornbach"], client((url) => {
    queries.push(url); return json([row("board-a"), row("board-b"), row("board-a", "obi")]);
  }), []);
  assert.equal(response.error, null);
  assert.equal(response.offers.length, 3);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].pathname, "/rest/v1/verified_store_prices");
  assert.equal(queries[0].searchParams.get("store_id"), "in.(hornbach,obi)");
  assert.equal(queries[0].searchParams.get("verified"), "eq.true");
  assert.equal(queries[0].searchParams.has("material_id"), false);
  const groups = groupCatalogOffers(response.offers);
  assert.equal(groups.get("hornbach")?.size, 2);
  assert.equal(groups.get("obi")?.size, 1);
  assert.ok(groups.get("hornbach")?.has("board-b"));
});

test("unsupported-only chains and missing configuration return stable results", async () => {
  assert.deepEqual(await fetchStoreCatalog(["unsupported"], null), { offers: [], error: null });
  const missing = await fetchStoreCatalog(["obi"], null);
  assert.deepEqual(missing.offers, getCatalogSnapshot(["obi"]));
  assert.match(missing.error!, /noch nicht/);
});

test("saved real observations fill an empty database and retain their original timestamps", async () => {
  const saved = getCatalogSnapshot(["hornbach"]);
  assert.ok(saved.length > 0, "The bundled real observations must remain valid");
  const missing = await fetchStoreCatalog(["hornbach"], null);
  assert.deepEqual(missing.offers, saved);
  assert.match(missing.error!, /ursprüngliche Prüfdatum/);
  const healthyEmpty = await fetchStoreCatalog(["hornbach"], client(() => json([])));
  assert.deepEqual(healthyEmpty, { offers: saved, error: null });
});

test("corrupt, unverified, wrong-chain and wrong-currency records are rejected independently", async () => {
  const response = await fetchStoreCatalog(["hornbach"], client(() => json([
    null, row(), { ...row("bad-price"), price: -1 }, { ...row("bad-unit"), unit_price: 1 },
    { ...row("unverified"), verified: false }, row("wrong-chain", "obi"),
    { ...row("wrong-currency"), currency: "CHF" }, { ...row("bad-link"), product_url: "https://evil.test/product" },
    { ...row(), material_id: " " }, { ...row(), material_id: null },
  ])), []);
  assert.deepEqual(response.offers.map((offer) => offer.material_id), ["material-a"]);
});

test("pages are bounded and keep deterministic material/chain order", async () => {
  const offsets: string[] = [];
  const response = await fetchStoreCatalog(["hornbach"], client((url) => {
    offsets.push(url.searchParams.get("offset")!);
    assert.equal(url.searchParams.get("order"), "material_id.asc,store_id.asc");
    assert.equal(url.searchParams.get("limit"), "250");
    const offset = Number(url.searchParams.get("offset"));
    return json(Array.from({ length: offset === 0 ? 250 : 2 }, (_, index) => row(`material-${offset + index}`)));
  }), []);
  assert.equal(response.error, null);
  assert.equal(response.offers.length, 252);
  assert.deepEqual(offsets, ["0", "250"]);
});

test("a truncated catalogue is explicit and never loads more than 2000 plus one probe", async () => {
  let calls = 0;
  const response = await fetchStoreCatalog(["hornbach"], client((url) => {
    calls++;
    const offset = Number(url.searchParams.get("offset")), limit = Number(url.searchParams.get("limit"));
    return json(Array.from({ length: limit }, (_, index) => row(`material-${offset + index}`)));
  }));
  assert.equal(calls, 9);
  assert.equal(response.offers.length, 2000);
  assert.match(response.error!, /2.000/);
});

test("a malformed oversized page cannot bypass the catalogue limit", async () => {
  const response = await fetchStoreCatalog(["hornbach"], client(() => json(
    Array.from({ length: 251 }, (_, index) => row(`oversized-${index}`)))));
  assert.deepEqual(response.offers, getCatalogSnapshot(["hornbach"]));
  assert.match(response.error!, /nicht geladen/);
});

test("transport failures preserve the response shape and earlier verified pages", async () => {
  const offline = await fetchStoreCatalog(["hornbach"], client(() => { throw new Error("offline"); }));
  assert.deepEqual(offline.offers, getCatalogSnapshot(["hornbach"]));
  assert.match(offline.error!, /nicht geladen/);
  const partial = await fetchStoreCatalog(["hornbach"], client((url) => {
    if (Number(url.searchParams.get("offset"))) throw new Error("offline");
    return json(Array.from({ length: 250 }, (_, index) => row(`material-${index}`)));
  }));
  assert.equal(partial.offers.length, 250 + getCatalogSnapshot(["hornbach"]).length);
  assert.match(partial.error!, /teilweise/);
});

test("newest valid observation wins per material and chain after a partial failure", async () => {
  const saved = getCatalogSnapshot(["hornbach"])[0];
  assert.ok(saved);
  const databasePrice = 17;
  const database = { ...saved, verified: true, price: databasePrice,
    unit_price: Math.round(databasePrice / saved.package_quantity * 100) / 100, checked_at: "2025-01-01T00:00:00Z" };
  const partial = await fetchStoreCatalog(["hornbach"], client((url) => {
    if (Number(url.searchParams.get("offset"))) return new Response(JSON.stringify({ message: "database unavailable" }), { status: 400 });
    return json([database, ...Array.from({ length: 249 }, (_, index) => row(`fixture-${index}`))]);
  }));
  const matching = partial.offers.filter((offer) => offer.material_id === saved.material_id && offer.store_id === saved.store_id);
  assert.equal(matching.length, 1);
  assert.equal(matching[0].price, saved.price);
  assert.equal(matching[0].checked_at, saved.checked_at);
});

test("source merging keeps newer database prices, fills missing pairs and never substitutes a different chain", () => {
  const local = [{ ...row("a"), source: "manual" }, row("b"), row("a", "obi")] as StorePrice[];
  const database = [{ ...row("a", "hornbach", "2026-02-01T00:00:00Z"), price: 15, unit_price: 0.5 }] as StorePrice[];
  const merged = mergeCatalogSources(["hornbach"], database, local, null);
  assert.equal(merged.offers.length, 2); assert.equal(merged.error, null);
  assert.equal(merged.offers.find((offer) => offer.material_id === "a")?.price, 15);
  assert.ok(merged.offers.every((offer) => offer.store_id === "hornbach"));
});

test("grouping selects newest per exact material/chain pair and rechecks malformed values", () => {
  const raw = [row("variant-a"), { ...row("variant-a", "hornbach", "2026-02-01T00:00:00Z"), price: 15, unit_price: 0.5 },
    row("variant-b"), row("variant-a", "obi"), { ...row("invalid"), price: -1 }];
  const groups = groupCatalogOffers(raw as StorePrice[]);
  assert.equal(groups.get("hornbach")?.get("variant-a")?.price, 15);
  assert.equal(groups.get("hornbach")?.get("variant-b")?.price, 12);
  assert.equal(groups.get("obi")?.get("variant-a")?.price, 12);
  assert.equal(groups.get("hornbach")?.has("invalid"), false);
});
