import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GET } from "../src/app/api/toom/prices/route";
import { fetchStoreCatalog } from "../src/services/catalog";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { validateStorePrice } from "../src/services/prices";

// Synthetic observations are isolated in a temporary test file, never published as real prices.
const fixture = (price = 40, checkedAt = "2026-01-01T00:00:00Z") => ({
  material_id: "toom-runtime-fixture", store_id: "toom", product_name: "Synthetic test filler 25 kg",
  product_url: "https://toom.de/p/testprodukt/1234567", price, unit_price: price / 25,
  unit: "kg", package_quantity: 25, currency: "EUR", checked_at: checkedAt,
  source: "automatic", price_scope: "chain", availability: "OnlineOnly", verified: true,
});
const json = (prices: unknown) => Response.json({ prices });

test("toom API rereads an externally refreshed file on the next request without restarting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "toom-runtime-"));
  const file = join(directory, "cache.json");
  const previousPath = process.env.TOOM_CACHE_PATH;
  process.env.TOOM_CACHE_PATH = file;
  try {
    const save = (row: ReturnType<typeof fixture>) => writeFile(file, JSON.stringify({ version: 1, prices: [row], history: [], failures: [] }));
    await save(fixture());
    const first = await GET();
    assert.equal(first.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await first.json()).prices.find((row: ReturnType<typeof fixture>) => row.material_id === "toom-runtime-fixture")?.price, 40);
    await save(fixture(35, "2026-01-01T01:00:00Z"));
    const second = await GET();
    const changed = (await second.json()).prices.find((row: ReturnType<typeof fixture>) => row.material_id === "toom-runtime-fixture");
    assert.equal(changed?.price, 35);
    assert.equal(changed?.checked_at, "2026-01-01T01:00:00Z");
    await writeFile(file, "{broken-json");
    const safe = await GET();
    assert.deepEqual((await safe.json()).prices.map((row: Record<string, unknown>) => validateStorePrice(row, String(row.material_id), ["toom"])), getCatalogSnapshot(["toom"]));
  } finally {
    if (previousPath === undefined) delete process.env.TOOM_CACHE_PATH;
    else process.env.TOOM_CACHE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test("customer catalog chooses newer worker prices and refetches on each search", async () => {
  let requests = 0;
  const saved = validateStorePrice(fixture(), "toom-runtime-fixture", ["toom"])!;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "/api/toom/prices");
    assert.equal(init?.cache, "no-store");
    requests++;
    return json([fixture(requests === 1 ? 35 : 30, `2026-01-01T0${requests}:00:00Z`)]);
  };
  const first = await fetchStoreCatalog(["toom"], null, [saved], fetcher);
  const second = await fetchStoreCatalog(["toom"], null, [saved], fetcher);
  assert.equal(first.offers[0]?.price, 35);
  assert.equal(second.offers[0]?.price, 30);
  assert.equal(requests, 2);
});

test("current database observations beat an older local toom worker observation", async () => {
  const database = createClient("https://catalog-test.invalid", "test-public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => Response.json([fixture(25, "2026-01-01T03:00:00Z")]) },
  });
  const result = await fetchStoreCatalog(["toom"], database, [], async () => json([fixture(35, "2026-01-01T01:00:00Z")]));
  assert.equal(result.offers[0]?.price, 25);
  assert.equal(result.offers.length, 1);
});

test("failed or malformed runtime responses preserve bundled verified prices", async () => {
  const saved = getCatalogSnapshot(["toom"]);
  assert.ok(saved.length);
  const fetchers: (typeof fetch)[] = [
    async () => { throw new Error("offline"); },
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("bad-json"),
    async () => json("not-an-array"),
    async () => json([null, { ...fixture(), verified: false }, { ...fixture(), price: -1 }, { ...fixture(), store_id: "obi" }, { ...fixture(), product_url: "https://evil.invalid/product" }]),
  ];
  for (const fetcher of fetchers) {
    const response = await fetchStoreCatalog(["toom"], null, saved, fetcher);
    assert.deepEqual(response.offers, saved);
  }
  let calls = 0;
  await fetchStoreCatalog(["hornbach"], null, [], async () => { calls++; return json([]); });
  assert.equal(calls, 0);
});
