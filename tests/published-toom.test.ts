import assert from "node:assert/strict";
import test from "node:test";
import manual from "../src/data/manual-prices.json";
import { publicToomSnapshot } from "../scripts/publish-toom-prices";
import { createPublishedToomReader } from "../src/services/publishedToomPrices";

const original = manual.prices.find(row => row.store_id === "toom")!;
test("published observations contain only canonical public price fields", () => {
  const output = publicToomSnapshot([{ ...original, secret: "not-public", match_evidence: { token: "not-public" } },
    { ...original, material_id: "unknown", price: 1 }, { ...original, verified: false }]);
  assert.equal(output.prices.length, 1);
  assert.equal(output.prices[0].checked_at, original.checked_at);
  assert.equal(output.prices[0].price, original.price);
  assert.doesNotMatch(JSON.stringify(output), /secret|token|not-public/);
  assert.throws(() => publicToomSnapshot([{ ...original, package_quantity: 999 }]));
});

test("serverless reader coalesces requests, rejects invalid data and retains last verified observations", async () => {
  let clock = Date.now(), calls = 0;
  let response = publicToomSnapshot([{ ...original, price: 10, unit_price: Math.round(10 / original.package_quantity * 100) / 100 }]);
  const read = createPublishedToomReader(async url => {
    assert.equal(url, "https://raw.githubusercontent.com/dbw-werke/baumarktfinder-mvp/main/src/data/toom-published-prices.json");
    calls++;
    return Response.json(response);
  }, () => clock);
  const results = await Promise.all([read(), read(), read()]);
  assert.equal(calls, 1);
  assert.equal(results[0][0].price, 10);
  response = { ...response, prices: response.prices.map(row => ({ ...row, package_quantity: 999, price: 1 })) };
  clock += 300_001;
  assert.equal((await read())[0].price, 10);
  assert.equal(calls, 2);
  response = publicToomSnapshot([{ ...original, price: 9, unit_price: Math.round(9 / original.package_quantity * 100) / 100,
    checked_at: new Date(clock - 1000).toISOString() }]);
  clock += 300_001;
  assert.equal((await read())[0].price, 9);
});

test("unavailable public source falls back without creating a price", async () => {
  for (const fetcher of [async () => { throw new Error("offline"); }, async () => new Response("bad-json"),
    async () => new Response("unavailable", { status: 503 })]) {
    assert.deepEqual(await createPublishedToomReader(fetcher)(), []);
  }
});
