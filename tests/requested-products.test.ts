import test from 'node:test';
import assert from 'node:assert/strict';
import evidence from '../docs/evidence/screenshot-corrections-20261021.json';
import definitions from '../supabase/canonical-materials.json';
import requested from '../src/data/requested-products.json';
import { getCatalogSnapshot } from '../src/services/catalogSnapshot';
import { mergeCatalogSources } from '../src/services/catalog';
import { getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer } from '../src/lib/productComparison';
import { buildStandard, evaluateProductMatch } from '../scripts/shop-reader/product-standardizer.mjs';
import { isRequestedScreenshotPrice } from '../src/lib/requestedProducts';
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

test('screenshot priority survives newer API/database prices without freezing unrelated products', async () => {
  const offers=getCatalogSnapshot(['toom']);
  const perlfix=offers.find(r=>r.product_url.endsWith('/3053281'))!;
  const unrelated=offers.find(r=>r.product_url.endsWith('/1752697'))!;
  const newer=(row:typeof perlfix)=>({...row,source:'automatic' as const,checked_at:new Date().toISOString(),price:20,unit_price:Math.round(20/row.package_quantity*100)/100});
  const result=mergeCatalogSources(['toom'],[newer(perlfix),newer(unrelated)],offers,null);
  assert.equal(result.offers.find(r=>r.material_id===perlfix.material_id)?.price,10.49);
  assert.equal(result.offers.find(r=>r.material_id===unrelated.material_id)?.price,20);
  assert.equal(isRequestedScreenshotPrice({...perlfix,price:11.49}),false);
  assert.equal(isRequestedScreenshotPrice({...perlfix,product_url:perlfix.product_url.replace('3053281','9999999')}),false);
  const api=await (await GET()).json();
  assert.equal(api.prices.find((r:typeof perlfix)=>r.material_id===perlfix.material_id)?.price,10.49);
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
