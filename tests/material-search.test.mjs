import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getMaterialDisplayName, getMaterialOptionLabel, getMaterialSearchTerms } from "../src/lib/materialSearch.mjs";

const definitions = JSON.parse(readFileSync(new URL("../supabase/canonical-materials.json", import.meta.url), "utf8"));
const material = slug => {
  const result = definitions.find(item => item.slug === slug);
  assert.ok(result, slug);
  return result;
};

test("short option labels still distinguish every declared size, profile and material identity", () => {
  const labels = definitions.map(getMaterialOptionLabel);
  assert.equal(new Set(labels).size, definitions.length);
  assert.match(getMaterialOptionLabel(material("sanitaer-silikon-acetat-weiss-310ml-v1")), /essigvernetzend/);
  assert.match(getMaterialOptionLabel(material("glaswolle-034-120-5-76m2-v1")), /WLG 034/);
  assert.match(getMaterialOptionLabel(material("pu-schaum-1k-b2-genius-champagner-750ml-v1")), /^Bauschaum 1K.*750 ml.*Genius Gun.*champagner/);
});

test("natural discovery starts with the customer's simple vocabulary, retaining original technical metadata", () => {
  const samples = [
    ["Knauf Haftputzgips Rotband 30 kg", "Rotband"],
    ["Soudal PU-Bauschaum 1K B2 Genius Gun champagner, 750 ml", "Bauschaum 1K"],
    ["PE-Baufolie 200 µm, 2 × 50 m, 100 m²/Rolle", "PE Baufolie"],
    ["Randdämmstreifen 8 × 150 mm × 25 m, mit Folienlasche", "Randdämmstreifen"],
    ["Glaswolle-Klemmfilz WLG 035, 120 × 1200 × 4400 mm", "Glaswolle 120 mm"],
    ["Rigips VARIO Fugenspachtel 25 kg", "Vario Fugenspachtel"],
    ["Knauf Perlfix Ansetzgips 25 kg", "Perlfix"],
    ["Sanitär-Silikon weiß, essigvernetzend, 310 ml", "Sanitär Silikon weiß"],
  ];
  for (const [query, expected] of samples) {
    assert.equal(getMaterialDisplayName(query), expected, query);
    assert.equal(getMaterialSearchTerms(query)[0], expected, query);
  }
  for (const definition of definitions) {
    const before = JSON.stringify(definition);
    getMaterialSearchTerms(definition);
    getMaterialDisplayName(definition);
    assert.equal(JSON.stringify(definition), before, definition.slug);
  }
});

test("every existing family gets short bounded queries without full package dimensions", () => {
  for (const definition of definitions) {
    const terms = getMaterialSearchTerms(definition);
    assert.ok(terms.length >= 1 && terms.length <= 8, definition.slug);
    assert.equal(new Set(terms.map(term => term.toLowerCase())).size, terms.length, definition.slug);
    assert.equal(terms[0], getMaterialDisplayName(definition));
    for (const term of terms) {
      assert.ok(term.length <= 80, `${definition.slug}: ${term}`);
      assert.doesNotMatch(term, /\d\s*[×x]\s*\d|\b\d+(?:[.,]\d+)?\s*(?:kg|ml|m²|Stück)\b/i, `${definition.slug}: ${term}`);
    }
  }
});

test("search attempts include retailer synonyms, brand recognition and German spelling alternatives", () => {
  const rand = getMaterialSearchTerms("Randdämmstreifen 8 × 150 mm × 25 m, mit Folienlasche");
  assert.ok(rand.includes("Estrichrandstreifen"));
  assert.ok(rand.includes("Randdaemmstreifen"));
  assert.ok(getMaterialSearchTerms("PE-Folie 0,2 mm").includes("Baufolie"));
  assert.ok(getMaterialSearchTerms("Perlfix").includes("Perflix"));
  assert.ok(getMaterialSearchTerms("Sanitaer Silikon weiss 310 ml").includes("Sanitärsilikon weiß"));
  assert.ok(getMaterialSearchTerms({ name: "Tiefengrund 5 l", brand: "Knauf", product_family: "tiefengrund" }).includes("Knauf Tiefengrund"));
});

test("simplifying search never turns two-component foam into one-component foam", () => {
  for (const input of ["Bauschaum 2K 400 ml", "Zweikomponenten PU-Schaum 400 ml",
    { name: "Montageschaum", product_family: "pu-schaum", specs: { type: "2k" } }]) {
    const terms = getMaterialSearchTerms(input);
    assert.equal(terms[0], "Bauschaum 2K");
    assert.ok(terms.every(term => term.includes("2K") && !term.includes("1K")));
  }
  const oneK = getMaterialSearchTerms(material("pu-schaum-1k-500ml-v1"));
  assert.ok(oneK.every(term => term.includes("1K") && !term.includes("2K")));
  assert.equal(getMaterialDisplayName("Bauschaum"), "Bauschaum");
});

test("critical product identities survive short search names", () => {
  assert.equal(getMaterialDisplayName("Knauf Uniflott Finish Fertigspachtel 8 kg"), "Uniflott Finish");
  assert.equal(getMaterialDisplayName("Knauf Uniflott Fugenspachtel 25 kg"), "Uniflott");
  assert.ok(getMaterialSearchTerms("Nonius Oberteil 200 mm").every(term => /Oberteil/.test(term)));
  assert.ok(getMaterialSearchTerms("Nonius Unterteil CD 60/27 130 mm").every(term => /Unterteil/.test(term)));
  assert.ok(getMaterialSearchTerms("Feuchtraum Gipskartonplatte 12,5 × 1250 × 2000 mm").every(term => /Feuchtraum|imprägniert|impraegniert|grün|gruen|GKBI/.test(term)));
  assert.ok(getMaterialSearchTerms("Schleifpapier K180 230 × 280 mm").every(term => /K180/.test(term)));
  assert.equal(getMaterialDisplayName("Schleifpapier K60/80/120/180/240 15 Blatt"), "Schleifpapier Sortiment");
  assert.equal(getMaterialDisplayName("Schleifpapierrolle K180 93 mm × 5 m"), "Schleifpapierrolle K180");
  assert.equal(getMaterialDisplayName("CD-Deckenprofil 60/27 × 3000 mm"), "CD Profil");
  assert.equal(getMaterialDisplayName("UD-Wandprofil 28/27 × 3000 mm"), "UD Profil");
  assert.ok(getMaterialSearchTerms("Dampfbremse sd 2 m").every(term => !/Dampfsperre|Baufolie/.test(term)));
});

test("new product families have a reusable compact fallback and optional aliases", () => {
  const future = { name: "Beispiel Fliesenkleber C2 TE S1, 25 kg", product_family: "fliesenkleber",
    brand: "Beispiel", specs: { weight_kg: 25 }, aliases: ["Flexkleber", "Fliesenkleber 25 kg"] };
  assert.equal(getMaterialDisplayName(future), "Beispiel Fliesenkleber C2 TE S1");
  const terms = getMaterialSearchTerms(future);
  assert.ok(terms.includes("Fliesenkleber C2 TE S1"));
  assert.ok(terms.includes("Flexkleber"));
  assert.ok(terms.includes("Fliesenkleber"));
  assert.ok(terms.every(term => !term.includes("25 kg")));
  for (const value of [undefined, null, "", "   ", {}]) {
    assert.equal(getMaterialDisplayName(value), "");
    assert.deepEqual(getMaterialSearchTerms(value), []);
  }
});
