import test from "node:test";
import assert from "node:assert/strict";
import { bundledMaterialCatalog } from "../src/services/materialSuggestions";
import { TOOM_MVP_INTENTS, resolveToomMaterialIntent, resolveToomPreferredMaterial, withToomMaterialMetadata } from "../src/lib/toomIntent";

test("all 21 toom MVP intents and their simple aliases resolve authored technical specifications", () => {
  const items = bundledMaterialCatalog();
  assert.equal(TOOM_MVP_INTENTS.length, 21);
  for (const intent of TOOM_MVP_INTENTS) {
    for (const input of [intent.input, ...intent.aliases]) {
      const resolved = resolveToomMaterialIntent(items, input);
      assert.equal(resolved?.material.slug, intent.canonical_slug, `${input} must resolve to ${intent.canonical_slug}`);
      assert.equal(resolved?.searchTerm, intent.search_term);
    }
  }
  assert.equal(resolveToomPreferredMaterial(items, "Uniflott")?.package_quantity, 25);
  assert.equal(resolveToomPreferredMaterial(items, "Dämmung")?.specs.thickness_mm, 40);
  assert.equal(resolveToomPreferredMaterial(items, "Tiefgrund")?.product_family, "tiefengrund");
  assert.notEqual(resolveToomPreferredMaterial(items, "Silikon")?.product_family, resolveToomPreferredMaterial(items, "Acryl")?.product_family);
});

test("toom defaults never erase explicit package, technical identity or a selected material", () => {
  const items = bundledMaterialCatalog();
  for (const input of ["Uniflott 5 kg", "Uniflott 80 kg", "Acryl grau", "Silikon neutralvernetzend", "Mineralwolle 120 mm", "CD Profil 75/40", "Rigips Brandschutz", "Schleifpapier K120"]) {
    assert.equal(resolveToomMaterialIntent(items, input), null, input);
  }
  assert.equal(resolveToomPreferredMaterial(items, "Uniflott 5 kg")?.package_quantity, 5);
  assert.equal(resolveToomPreferredMaterial(items, "Uniflott 80 kg"), null);
  const selected = items.find(item => item.material.slug === "knauf-uniflott-5kg-v1")!.material;
  assert.equal(resolveToomPreferredMaterial(items, "Uniflott", selected.id)?.id, selected.id);
});

test("verified local toom cache remains usable when database material metadata predates the MVP additions", () => {
  const items = bundledMaterialCatalog();
  const old = items.filter(item => item.material.product_family === "uniflott");
  const combined = withToomMaterialMetadata(old);
  for (const intent of TOOM_MVP_INTENTS) assert.ok(resolveToomMaterialIntent(combined, intent.input), intent.input);
  assert.equal(new Set(combined.map(item => item.material.id)).size, combined.length);
  const inactive = { ...old[0], material: { ...old[0].material, active: false } };
  const preserved = withToomMaterialMetadata([inactive]);
  assert.equal(preserved.find(item => item.material.id === inactive.material.id)?.material.active, false);
});
