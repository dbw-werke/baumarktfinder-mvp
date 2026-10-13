import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildStandard,chooseNormalizedProduct,evaluateProductMatch,getProductRejectionReason} from '../scripts/shop-reader/product-standardizer.mjs';
import {getVariantDistance} from '../src/lib/productCompatibility.mjs';
const definitions=JSON.parse(await readFile(new URL('../supabase/canonical-materials.json',import.meta.url),'utf8'));
const standard=slug=>buildStandard(definitions.find(row=>row.slug===slug));
const product={name:'Knauf Direktabhänger 125 mm für CD Profil 60 mm / 27 mm',price:0.58,currency:'EUR',priceBasis:'package',priceSource:'json-ld-offer',soldIndividually:true};
test('hanger leg length remains independent of the explicitly compatible profile section',()=>{
 const spec=standard('direktabhaenger-cd-125-1-v1');
 const accepted=chooseNormalizedProduct([product],spec);
 assert.equal(accepted.matchEvidence.observed_specs.length_mm,125);
 assert.equal(accepted.packageQuantity,1);
 assert.match(getProductRejectionReason({...product,name:product.name.replace('125 mm','200 mm')},spec),/wrong-specification:length_mm/);
 assert.match(getProductRejectionReason({...product,observedSpecs:{length_mm:200}},spec),/conflicting-specifications:length_mm/);
 assert.equal(chooseNormalizedProduct([{...product,name:'Knauf Noniusabhänger 125 mm für CD Profil 60/27'}],spec),null);
});
test('a Gipsplattenschraube is a screw rather than its board substrate; missing package-price proof still rejects',()=>{
 const requested=definitions.find(row=>row.slug==='tn-3-5-25-1000-v1');
 const actual=buildStandard({...requested,package_quantity:250,specs:{...requested.specs,pieces:250}});
 const screw={...product,name:'Knauf Schnellbauschraube Feingewinde TN 3,5 mm x 25 mm Pack = 250 St',price:5.15,
  attributes:[{name:'Ausführung',value:'Gipsplattenschraube'}]};
 assert.equal(evaluateProductMatch(screw,actual).detectedFamily,'tn-schrauben');
 assert.equal(chooseNormalizedProduct([screw],actual).packageQuantity,250);
 assert.equal(getProductRejectionReason({...screw,priceBasis:null},actual),'missing-package-price-basis');
 assert.equal(chooseNormalizedProduct([{...screw,name:screw.name.replace('Feingewinde','Grobgewinde')}],actual),null);
});
test('authored close packages use actual quantities without changing technical identity or converting totals',()=>{
 for(const[preferred,actual,name,price,quantity]of[
  ['pu-schaum-1k-750ml-v1','pu-schaum-1k-500ml-v1','PRECIT 1K Pistolenschaum B2 beige 500 ml',8.95,0.5],
  ['rollputz-12kg-v1','rollputz-15kg-v1','MODULAN 5003 Rollputz weiß 15 kg',37.95,15],
  ['sockelputz-30kg-v1','sockelputz-25kg-v1','Baumit Zementsockelputz 25 kg',10.35,25],
 ]){
  assert.notEqual(getVariantDistance(definitions.find(row=>row.slug===preferred),definitions.find(row=>row.slug===actual)),null);
  const result=chooseNormalizedProduct([{...product,name,price}],standard(actual));
  assert.equal(result.packageQuantity,quantity);assert.equal(result.price,price);
 }
});
