import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRepository, main, summarizeReport, updateMaterial } from "../scripts/update-store-prices.mjs";

// Synthetic fixtures only; never written to the application price catalog.
const material = { id: "fixture-material", slug: "fixture-rotband", name: "Knauf Rotband 30 kg", canonical_version: 1,
  base_unit: "kg", package_quantity: 30, specs: { weight_kg: 30, required_terms: ["knauf", "rotband"] } };
const offer = { name: "Knauf Rotband Haftputzgips 30 kg", price: 12, currency: "EUR", priceBasis: "package",
  priceSource: "json-ld-offer", availability: "InStock", url: "https://www.hornbach.de/p/fixture/123456/",
  retrievedAt: "2020-01-01T00:00:00.000Z" };

async function reportDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "retailer-price-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const originalExitCode = process.exitCode;
  t.after(() => { process.exitCode = originalExitCode; });
  return directory;
}

test("missing Actions credentials fail before retrieval and produce a useful report", async (t) => {
  const directory = await reportDirectory(t), reportPath = join(directory, "report.json");
  const script = fileURLToPath(new URL("../scripts/update-store-prices.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--report", reportPath], {
    cwd: directory, encoding: "utf8", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.status, "failed");
  assert.equal(report.failure.code, "missing-configuration");
  assert.deepEqual(report.failure.missing_environment, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  assert.equal(report.verified, 0);
  assert.deepEqual(report.materials, []);
  assert.ok(Object.values(report.stores).every((store) => store.attempted === 0));
});

test("database startup failures are reported without serializing connection details", async (t) => {
  const directory = await reportDirectory(t), reportPath = join(directory, "report.json"), logs = [];
  const secret = "fixture-secret-not-for-logs";
  const report = await main(["--report", reportPath], {
    repositoryFactory: () => ({ materials: async () => { throw new Error(`connection failed: ${secret}`); } }),
    readerFactory: () => { assert.fail("No retailer should be accessed before the database is ready."); },
    log: (value) => logs.push(value),
  });
  assert.equal(process.exitCode, 1);
  assert.equal(report.failure.code, "initialization-failed");
  assert.doesNotMatch(await readFile(reportPath, "utf8"), new RegExp(secret));
  assert.ok(logs.every((line) => !line.includes(secret)));
});

test("one verified retailer cannot hide another retailer's blocked retrieval", async (t) => {
  const directory = await reportDirectory(t), reportPath = join(directory, "report.json"), saves = [];
  const report = await main(["--stores", "bauhaus,hornbach", "--report", reportPath], {
    repositoryFactory: () => ({ materials: async () => [material], mapping: async () => null,
      save: async (payload) => saves.push(payload) }),
    readerFactory: () => ({ searchShop: async (store) => {
      if (store === "bauhaus") throw Object.assign(new Error("blocked"), { code: "blocked" });
      return { products: [offer] };
    } }), log: () => {},
  });
  assert.equal(report.verified, 1);
  assert.equal(report.collection_failures, 1);
  assert.equal(report.status, "partial-failure");
  assert.equal(process.exitCode, 1);
  assert.equal(report.stores.bauhaus.verified, 0);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].checked_at, offer.retrievedAt);
  const blocked = report.materials[0].stores.find((row) => row.store === "bauhaus");
  assert.equal(blocked.saved_to_supabase, false);
  assert.equal(blocked.retained_previous_price, true);
  assert.equal(blocked.checked_at, undefined);
});

test("file-based dry run requires no database and never claims to have saved prices", async (t) => {
  const directory = await reportDirectory(t), materialPath = join(directory, "materials.json");
  await writeFile(materialPath, JSON.stringify([material]));
  const report = await main(["--dry-run", "--materials-file", materialPath, "--stores", "hornbach", "--report", join(directory, "report.json")], {
    repositoryFactory: () => { assert.fail("Read-only file mode must not create a database client."); },
    readerFactory: () => ({ searchShop: async () => ({ products: [offer] }) }), log: () => {},
  });
  assert.equal(report.status, "ok");
  assert.equal(process.exitCode, 0);
  assert.equal(report.materials[0].stores[0].status, "verified-dry-run");
  assert.equal(report.materials[0].stores[0].saved_to_supabase, false);
  assert.equal(report.materials[0].stores[0].checked_at, offer.retrievedAt);
});

test("no-match gaps and failed retrievals have distinct run outcomes", () => {
  const summarize = (rows) => summarizeReport({ requested_stores: ["hornbach", "bauhaus"], materials: [{ stores: rows }] });
  const noMatch = { store: "bauhaus", status: "no-exact-verified-offer", errors: [{ code: "not-found" }] };
  assert.equal(summarize([noMatch]).exit_code, 2);
  const partial = summarize([{ store: "hornbach", status: "saved" }, noMatch]);
  assert.equal(partial.status, "partial");
  assert.equal(partial.exit_code, 0);
  const failure = summarize([{ store: "hornbach", status: "saved" }, { ...noMatch, errors: [{ code: "network-error" }] }]);
  assert.equal(failure.status, "partial-failure");
  assert.equal(failure.exit_code, 1);
});

test("missing, invalid or future retrieval timestamps cannot become fresh observations", async () => {
  for (const retrievedAt of [undefined, "not-a-date", new Date(Date.now() + 600000).toISOString()]) {
    const previous = { price: 10, checked_at: "2000-01-01T00:00:00Z", history: [10], product_url: offer.url };
    const before = structuredClone(previous);
    const result = await updateMaterial(material, { stores: ["hornbach"],
      repository: { mapping: async () => previous.product_url, save: async () => { assert.fail("Invalid timestamp must not reach the database."); } },
      reader: { searchShop: async () => ({ products: [{ ...offer, retrievedAt }] }) },
    });
    assert.equal(result.stores[0].status, "invalid-observation");
    assert.equal(result.stores[0].rejection_reason, "invalid-observation-time");
    assert.equal(result.stores[0].saved_to_supabase, false);
    assert.deepEqual(previous, before);
  }
});

test("empty or malformed RPC acknowledgements never count as a successful save", async () => {
  for (const data of [null, undefined, "", "ok", {}]) {
    const repository = createRepository({ rpc: async () => ({ data }) });
    repository.mapping = async () => null;
    const result = await updateMaterial(material, { repository, stores: ["hornbach"],
      reader: { searchShop: async () => ({ products: [offer] }) },
    });
    assert.equal(result.stores[0].status, "save-failed");
    assert.equal(result.stores[0].saved_to_supabase, false);
    assert.equal(result.stores[0].checked_at, undefined);
  }
});
