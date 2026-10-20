import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundledMaterialCatalog } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { formatMaterialSpecification, selectChainOffer } from "../src/lib/productComparison";
import { MVP_MATERIAL_INTENTS, resolveMvpPreferredMaterial } from "../src/lib/toomIntent";

type VerifiedGlobusRow = {
  key: string;
  material_slug: string;
  store_id: string;
  product_name: string;
  product_url: string;
  price: number;
  package_quantity: number;
  base_unit: string;
  currency: string;
  checked_at: string;
  price_basis: string;
  observed_specs: Record<string, unknown>;
  verification_note: string;
};

const evidence = JSON.parse(readFileSync(new URL("../docs/evidence/globus-import-20261013.json", import.meta.url), "utf8")) as VerifiedGlobusRow[];
const screenshotCorrections = JSON.parse(readFileSync(new URL("../docs/evidence/screenshot-product-corrections-20261018.json", import.meta.url), "utf8")) as VerifiedGlobusRow[];
const catalog = bundledMaterialCatalog();
const materials = catalog.map(entry => entry.material);
const offers = getCatalogSnapshot(["globus"]);

test("all 21 simple searches select the independently observed current Globus package and exact URL", () => {
  assert.equal(evidence.length, 21);
  assert.deepEqual(new Set(evidence.map(row => row.key)), new Set(MVP_MATERIAL_INTENTS.map(intent => intent.key)));
  for (const intent of MVP_MATERIAL_INTENTS) {
    const observed = intent.key === "haftgrund"
      ? screenshotCorrections.find(row => row.store_id === "globus" && row.material_slug === "mem-super-haftgrund-10l-v1")!
      : evidence.find(row => row.key === intent.key)!;
    const target = resolveMvpPreferredMaterial(catalog, intent.input);
    assert.ok(target, intent.input);
    const actualMaterial = materials.find(row => row.slug === observed.material_slug);
    assert.ok(actualMaterial, `${intent.input}: actual package metadata exists`);
    const selected = selectChainOffer(target, offers, materials, "globus");
    assert.ok(selected.price, `${intent.input}: Globus verified price is customer-accessible`);
    assert.equal(selected.price.product_name, observed.product_name, intent.input);
    assert.equal(selected.price.product_url, observed.product_url, intent.input);
    assert.equal(selected.price.price, observed.price, `${intent.input}: actual selling total, never a normalized or old price`);
    assert.equal(selected.price.package_quantity, observed.package_quantity, intent.input);
    assert.equal(selected.price.unit, observed.base_unit, intent.input);
    assert.equal(selected.price.checked_at, observed.checked_at, intent.input);
    assert.equal(selected.price.material_id, actualMaterial.id, `${intent.input}: actual package retained`);
    assert.equal(selected.actualSpecification, formatMaterialSpecification(actualMaterial), intent.input);
    assert.equal(observed.store_id, "globus");
    assert.equal(observed.currency, "EUR");
    assert.equal(observed.price_basis, "package");
    const url = new URL(observed.product_url);
    assert.equal(url.hostname, "www.globus-baumarkt.de");
    assert.match(url.pathname, /^\/p\/.+-\d+\/$/);
  }
});

test("Globus drywall abrasive proof and customer selection reject an incompatible wet-sanding product", () => {
  const observed = evidence.find(row => row.key === "schleifpapier")!;
  const purpose = `${observed.product_name} ${JSON.stringify(observed.observed_specs)} ${observed.verification_note}`;
  assert.match(purpose, /trockenbau|gipskarton|spachtel/i, "official proof must establish drywall/spackle use beyond grit alone");
  const target = resolveMvpPreferredMaterial(catalog, "Schleifpapier");
  assert.ok(target);
  const selected = selectChainOffer(target, offers, materials, "globus");
  assert.ok(selected.price);
  const wrongPurpose = { ...selected.price, product_name: "Nass-/Trockenschleifpapier K180 für Holz und Metall" };
  assert.equal(selectChainOffer(target, [wrongPurpose], materials, "globus").match, "unavailable");
});
