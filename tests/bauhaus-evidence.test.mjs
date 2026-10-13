import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalId } from '../scripts/refresh-catalog-snapshot.mjs';
import { prepareLocalManualImport, validateManualRow } from '../scripts/import-store-prices.mjs';
import { getVariantDistance } from '../src/lib/productCompatibility.mjs';
import { buildStandard, evaluateProductMatch } from '../scripts/shop-reader/product-standardizer.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const definitions = await read('../supabase/canonical-materials.json');
const evidence = (await read('../docs/evidence/mvp-obi-bauhaus-additions.json')).observations.filter(row => row.store_id === 'bauhaus' && row.mapping_status !== 'rejected');
const expected = {
  armierungsgewebe: 'armierungsgewebe-1000-10000-v1',
  'cd-profil': 'cd60-27-3000-v1',
  'cw-profil': 'cw50-50-2600-v1',
  direktabhaenger: 'direktabhaenger-cd-125-1-v1',
  feuchtraumplatte: 'gipskarton-feuchtraum-12-5-2000-1250-v1',
  haftgrund: 'haftgrund-5l-v1',
  perlfix: 'knauf-perlfix-25kg-v1',
  'pu-schaum': 'pu-schaum-1k-750ml-v1',
  silikon: 'sanitaer-silikon-weiss-310ml-v1',
  'uw-profil': 'uw50-40-2000-v1',
  zement: 'zement-25kg-v1',
  rollputz: 'rollputz-8kg-v1',
  sockelputz: 'sockelputz-30kg-v1',
  schleifpapier: 'schleifpapier-k180-93-5000-rolle-v1',
};
function importRow(observation) {
  const { unit_price: unitPrice, ...row } = observation;
  return { ...row, material_slug: expected[row.key], base_unit: row.unit, price_basis: 'package',
    verification_note: `${row.verification_method}: ${row.note}`,
    ...(unitPrice === null || unitPrice === undefined ? {} : { unit_price: unitPrice }) };
}
const rows = evidence.map(importRow);

test('documented BAUHAUS offers validate as their actual packages, retaining observed totals and dates', () => {
  assert.deepEqual(new Set(evidence.map(row => row.key)), new Set(Object.keys(expected)));
  for (const row of rows) {
    const definition = definitions.find(value => value.slug === row.material_slug);
    const payload = validateManualRow(row, { ...definition, id: canonicalId(definition.slug) });
    assert.equal(payload.price, row.price, row.key);
    assert.equal(payload.package_quantity, row.package_quantity, row.key);
    assert.equal(payload.checked_at, row.checked_at, row.key);
    assert.equal(payload.product_url, row.product_url, row.key);
    assert.equal(payload.source, 'manual', row.key);
  }
});

test('BAUHAUS package variants stay comparable without relabeling 8 kg or 25 kg as the requested amount', () => {
  for (const [preferredSlug, actualSlug, key, amount] of [
    ['rollputz-12kg-v1', 'rollputz-8kg-v1', 'rollputz', 8],
    ['knauf-perlfix-30kg-v1', 'knauf-perlfix-25kg-v1', 'perlfix', 25],
  ]) {
    const preferred = definitions.find(row => row.slug === preferredSlug);
    const actual = definitions.find(row => row.slug === actualSlug);
    assert.notEqual(getVariantDistance(preferred, actual), null, key);
    const row = rows.find(value => value.key === key);
    assert.equal(row.package_quantity, amount);
    const wrongPackage = { ...row, base_unit: preferred.base_unit, package_quantity: preferred.package_quantity };
    delete wrongPackage.unit_price;
    assert.throws(() => validateManualRow(wrongPackage,
      { ...preferred, id: canonicalId(preferred.slug) }), /exact canonical match/);
  }
});

test('adding BAUHAUS evidence preserves existing verified offers from every other chain', async () => {
  const previous = await read('../src/data/manual-prices.json');
  const merged = prepareLocalManualImport(rows, definitions, previous);
  for (const row of previous.prices.filter(value => value.store_id !== 'bauhaus')) {
    assert.deepEqual(merged.prices.find(value => value.material_id === row.material_id && value.store_id === row.store_id), row);
  }
  assert.equal(rows.length, 14);
});

test('abrasive purpose and backing are hard requirements even when size and grit match', () => {
  const row = rows.find(value => value.key === 'schleifpapier');
  const standard = buildStandard(definitions.find(value => value.slug === row.material_slug));
  const candidate = { name: row.product_name, observedSpecs: row.observed_specs, soldIndividually: true };
  assert.equal(evaluateProductMatch(candidate, standard, { exactPackage: true }).accepted, true);
  for (const incompatible of [
    { name: 'Schleifpapier Nass-/Trockenschliff Holz Metall K180 93 mm x 5 m' },
    { attributes: { Traegermaterial: 'Gewebe' } },
    { metadata: { description: 'Wasserfestes Schleifpapier für den Nassschliff' } },
    { observedSpecs: { ...row.observed_specs, backing: 'cloth' } },
  ]) {
    const result = evaluateProductMatch({ ...candidate, ...incompatible }, standard, { exactPackage: true });
    assert.equal(result.accepted, false);
    assert.match(result.rejectionReason, /incompatible-abrasive/);
  }
  const unproven = evaluateProductMatch({ name: 'Schleifpapier K180 93 mm x 5 m',
    observedSpecs: { length_mm: 5000, width_mm: 93, grit: 180, pieces: 1 } }, standard);
  assert.equal(unproven.rejectionReason, 'unverified-abrasive-purpose:wood-and-metal');
  assert.equal(evaluateProductMatch({ ...candidate, description: 'Nicht für Nassschliff geeignet.' }, standard).accepted, true);
});
