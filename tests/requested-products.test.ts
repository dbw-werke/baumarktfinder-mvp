import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import evidence from '../docs/evidence/screenshot-corrections-20261021.json';
import definitions from '../supabase/canonical-materials.json';
import requested from '../src/data/requested-products.json';
import manual from '../src/data/manual-prices.json';
import { filterCatalogSnapshot, getCatalogSnapshot } from '../src/services/catalogSnapshot';
import { mergeCatalogSources } from '../src/services/catalog';
import type { StorePrice } from '../src/services/prices';
import type { ChainId } from '../src/lib/stores';
import { getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer } from '../src/lib/productComparison';
import { buildStandard, evaluateProductMatch } from '../scripts/shop-reader/product-standardizer.mjs';
import { isRequestedProductPrice, isRequestedScreenshotPrice } from '../src/lib/requestedProducts';
import { GET } from '../src/app/api/toom/prices/route';

test('all selected screenshot products retain their actual identity, package total, size and retailer', () => {
  const catalog=getCanonicalComparisonCatalog(), offers=getCatalogSnapshot(['hornbach','bauhaus','obi','toom']);
  assert.equal(requested.length,8);
  for(const row of requested) for(const target of row.target_ids) {
    const result=selectChainOffer(catalog.find(m=>m.id===target)!,offers,catalog,row.store_id);
    assert.equal(result.price?.material_id,row.material_id);
    assert.equal(result.price?.product_url,row.product_url);
    assert.equal(result.price?.price,row.price);
    assert.equal(result.price?.package_quantity,row.package_quantity);
    assert.equal(result.requestedProduct,true);
  }
});

// Synthetic observations only; the saved production evidence remains unchanged.
const refreshed = (row: StorePrice, checked_at = '2026-11-05T10:00:00.000Z', price = 20): StorePrice => ({
  ...row, source: 'automatic', checked_at, price, unit_price: Math.round(price / row.package_quantity * 100) / 100,
});

test('newest verified selected SKU survives database/local/snapshot merges in any input order', () => {
  const catalog = getCanonicalComparisonCatalog();
  for (const row of requested) {
    const chain = row.store_id as ChainId, saved = getCatalogSnapshot([chain]);
    const original = filterCatalogSnapshot(manual, [chain]).find(price => isRequestedScreenshotPrice(price) && price.material_id === row.material_id)!;
    const current = refreshed(original), intermediate = refreshed(original, '2026-11-01T10:00:00.000Z', 18);
    // Even a newer different SKU, or an equal-time URL that sorts first, must not displace the selected package.
    const different = { ...refreshed(original, '2026-11-06T10:00:00.000Z'), product_url: new URL('/p/aaa-other/9999999', original.product_url).href };
    const tiedDifferent = { ...different, checked_at: current.checked_at };
    for (const observations of [[original, intermediate, current], [original, current, intermediate],
      [intermediate, original, current], [intermediate, current, original], [current, original, intermediate], [current, intermediate, original]]) {
      for (const inputs of [observations, [...observations, different, tiedDifferent], [different, tiedDifferent, ...observations]]) {
        const merged = mergeCatalogSources([chain], inputs.slice(0, 1), [...inputs.slice(1), ...saved], null).offers;
        const remerged = mergeCatalogSources([chain], merged, saved, null).offers;
        assert.deepEqual(remerged.find(price => price.material_id === row.material_id), current);
        for (const target of row.target_ids) {
          for (const offers of [inputs, remerged]) {
            const selected = selectChainOffer(catalog.find(material => material.id === target)!, offers, catalog, chain);
            assert.deepEqual(selected.price, current);
            assert.equal(selected.requestedProduct, true);
          }
        }
      }
    }
    assert.equal(isRequestedProductPrice(current), true);
    assert.equal(isRequestedScreenshotPrice(current), false);
    assert.equal(isRequestedScreenshotPrice(original), true);
  }
});

test('selected-product priority requires the same store, material, URL, quantity and unit', () => {
  const offers = getCatalogSnapshot(['toom']);
  const perlfix = offers.find(row => row.product_url.endsWith('/3053281'))!;
  for (const changes of [{ store_id: 'obi' }, { material_id: 'another-material' },
    { product_url: perlfix.product_url.replace('3053281', '9999999') }, { package_quantity: 30 }, { unit: 'l' as const }]) {
    assert.equal(isRequestedProductPrice({ ...refreshed(perlfix), ...changes }), false);
  }
  const rejected = { ...refreshed(perlfix), verified: false };
  assert.equal(mergeCatalogSources(['toom'], [rejected], offers, null).offers.find(row => row.material_id === perlfix.material_id)?.checked_at, perlfix.checked_at);
  const unrelated = offers.find(row => row.product_url.endsWith('/1752697'))!;
  const current = refreshed(unrelated);
  assert.deepEqual(mergeCatalogSources(['toom'], [current], offers, null).offers.find(row => row.material_id === unrelated.material_id), current);
});

test('TOOM API exposes refreshed selected products from its verified cache with their actual timestamps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'requested-product-prices-'));
  const cachePath = join(directory, 'cache.json');
  const oldPath = process.env.TOOM_CACHE_PATH, oldVercel = process.env.VERCEL;
  try {
    const current = filterCatalogSnapshot(manual, ['toom']).filter(isRequestedScreenshotPrice).map(row => ({ ...refreshed(row), verified: true }));
    assert.equal(current.length, 3);
    await writeFile(cachePath, JSON.stringify({ version: 1, prices: current, history: [], failures: [] }));
    process.env.TOOM_CACHE_PATH = cachePath;
    delete process.env.VERCEL;
    const api = await (await GET()).json();
    for (const row of current) assert.deepEqual(api.prices.find((price: StorePrice) => price.material_id === row.material_id), row);
  } finally {
    if (oldPath === undefined) delete process.env.TOOM_CACHE_PATH; else process.env.TOOM_CACHE_PATH = oldPath;
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
    await unlink(cachePath).catch(() => {});
    await rmdir(directory);
  }
});

test('mixed grit packs cannot become single K180 sheets and Sika300 cannot replace SoudalGenius750', () => {
  const catalog=getCanonicalComparisonCatalog();
  const mixed=catalog.find(r=>r.slug==='schleifpapier-sortiment-230-280-15-v1')!;
  const sheet=catalog.find(r=>r.slug==='schleifpapier-k180-230-280-1-v1')!;
  assert.equal(getVariantDistance(sheet,mixed),null);
  const row=evidence.find(r=>r.material_slug===mixed.slug)!;
  const standard=buildStandard(definitions.find(r=>r.slug===mixed.slug));
  const candidate={name:row.product_name,observedSpecs:row.observed_specs,soldIndividually:true};
  assert.equal(evaluateProductMatch(candidate,standard,{exactPackage:true}).accepted,true);
  assert.equal(evaluateProductMatch({...candidate,name:'Schleifpapier Holz K180, 230 x 280 mm, 15 Stück'},standard,{exactPackage:true}).accepted,false);
  const target=catalog.find(r=>r.slug==='pu-schaum-1k-b2-genius-750ml-v1')!;
  const sika=getCatalogSnapshot(['bauhaus']).filter(r=>r.product_url.endsWith('/29340206'));
  assert.equal(selectChainOffer(target,sika,catalog,'bauhaus').match,'unavailable');
});
