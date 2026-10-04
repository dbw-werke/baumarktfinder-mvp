import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import definitions from "../supabase/canonical-materials.json";
import { bundledMaterialCatalog, createMaterialCatalogLoader, resolvePreferredMaterial, searchMaterialCatalog } from "../src/services/materialSuggestions";

const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const failure = () => new Response(JSON.stringify({ code: "PGRST205", message: "schema not installed" }), { status: 400 });
function client(handler: (url: URL) => Response | Promise<Response>) {
  return createClient("https://material-test.invalid", "test-public-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input) => Promise.resolve(handler(new URL(String(input)))) },
  });
}
const fixture = { ...bundledMaterialCatalog()[0].material, id: "database-fixture", name: "Datenbankmaterial", suggestion_label: "Datenbankmaterial" };

test("all bundled canonical IDs match the SQL seed's MD5 UUID formula exactly", () => {
  const catalog = bundledMaterialCatalog();
  assert.equal(catalog.length, definitions.length);
  for (const definition of definitions) {
    const hex = createHash("md5").update(`baumarktfinder:${definition.slug}`).digest("hex");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const entry = catalog.find((item) => item.material.id === id);
    assert.ok(entry, definition.slug);
    assert.deepEqual(entry.material.specs, definition.specs);
    assert.equal(Object.hasOwn(entry.material, "price"), false);
  }
});

test("missing database still resolves GK and Regips to explicit separate variants", async () => {
  const catalog = await createMaterialCatalogLoader(null)();
  const gk = searchMaterialCatalog(catalog, "GK");
  const regips = searchMaterialCatalog(catalog, "Regips");
  assert.ok(gk.length >= 2);
  assert.ok(regips.length >= 2);
  const standardBoards = catalog.filter((entry) => entry.material.name.startsWith("Gipskartonplatte Standard"));
  assert.equal(standardBoards.length, 2);
  for (const entry of standardBoards) {
    assert.ok(gk.some((item) => item.id === entry.material.id));
    assert.ok(regips.some((item) => item.id === entry.material.id));
  }
});

test("a failed database request uses one shared fallback cache for five minutes then retries", async () => {
  let time = 1_000, calls = 0, healthy = false;
  const load = createMaterialCatalogLoader(client((url) => {
    calls++;
    return healthy ? json(url.pathname.endsWith("/materials") ? [fixture] : []) : failure();
  }), () => time);
  const [first, same] = await Promise.all([load(), load()]);
  assert.equal(calls, 2);
  assert.equal(first, same);
  assert.equal(first.length, definitions.length);
  time += 299_999;
  assert.equal(await load(), first);
  assert.equal(calls, 2);
  healthy = true;
  time += 2;
  assert.deepEqual((await load()).map((entry) => entry.material.id), [fixture.id]);
  assert.equal(calls, 4);
});

test("healthy empty or inactive database catalogues never resurrect bundled materials", async () => {
  for (const data of [[], [{ ...fixture, active: false }]]) {
    const load = createMaterialCatalogLoader(client((url) => json(url.pathname.endsWith("/materials") ? data : [])));
    assert.deepEqual(await load(), []);
  }
});

test("healthy database remains authoritative when only aliases are unavailable", async () => {
  const load = createMaterialCatalogLoader(client((url) => url.pathname.endsWith("/materials") ? json([fixture]) : failure()));
  const catalog = await load();
  assert.deepEqual(catalog.map((entry) => entry.material.id), [fixture.id]);
  assert.deepEqual(catalog[0].aliases, []);
});

test("recent healthy cache survives outages without retrying for every keystroke", async () => {
  let time = 100, calls = 0, healthy = true;
  const load = createMaterialCatalogLoader(client((url) => {
    calls++;
    return healthy ? json(url.pathname.endsWith("/materials") ? [fixture] : []) : failure();
  }), () => time);
  const original = await load();
  healthy = false;
  time += 300_001;
  assert.equal(await load(), original);
  assert.equal(calls, 4);
  time += 100;
  assert.equal(await load(), original);
  assert.equal(calls, 4);
});

test("a previously healthy empty catalogue also stays empty during a brief outage", async () => {
  let time = 0, healthy = true;
  const load = createMaterialCatalogLoader(client(() => healthy ? json([]) : failure()), () => time);
  assert.deepEqual(await load(), []);
  healthy = false;
  time += 300_001;
  assert.deepEqual(await load(), []);
});

test("broad material searches resolve explicit preferred specifications while unknown sizes remain unresolved", () => {
  const catalog = bundledMaterialCatalog();
  for (const [input, quantity] of [["Rigips", .72], ["Tiefengrund", 5], ["Tiefengrund 5L", 5], ["Uniflott", 25], ["Rotband", 30], ["Rotband 30kg", 30], ["Acryl", .31]] as const) {
    assert.equal(resolvePreferredMaterial(catalog, input)?.package_quantity, quantity, input);
  }
  assert.equal(resolvePreferredMaterial(catalog, "Tiefengrund 999 L"), null);
  assert.equal(resolvePreferredMaterial(catalog, "Rotband 3 kg"), null);
  assert.equal(resolvePreferredMaterial(catalog, "quantenbeton"), null);
  assert.equal(resolvePreferredMaterial([], "Rigips"), null);
  const selected = catalog.find((entry) => entry.material.package_quantity === 2.5)!;
  assert.equal(resolvePreferredMaterial(catalog, "Rigips", selected.material.id)?.id, selected.material.id);
  assert.equal(resolvePreferredMaterial(catalog, "Rigips", "removed-id"), null);
  const existingIds = catalog.map((entry) => ({ ...entry, material: { ...entry.material, id: `existing-${entry.material.id}` } }));
  assert.equal(resolvePreferredMaterial(existingIds, "Rigips")?.package_quantity, .72);
  assert.ok(resolvePreferredMaterial(existingIds, "Rigips")?.id.startsWith("existing-"));
});
