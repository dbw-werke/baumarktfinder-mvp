import test from "node:test";
import assert from "node:assert/strict";
import definitions from "../supabase/canonical-materials.json";
import { bundledMaterialCatalog, resolvePreferredMaterial } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { getCanonicalComparisonCatalog, getVariantDistance, selectChainOffer } from "../src/lib/productComparison";
import { buildStandard, evaluateProductMatch } from "../scripts/shop-reader/product-standardizer.mjs";
import { getStoreUrl } from "../src/lib/resolver";
const materials=bundledMaterialCatalog(),catalog=getCanonicalComparisonCatalog();
const get=(slug:string)=>materials.find(item=>item.material.slug===slug)!.material;
const offers=getCatalogSnapshot(["obi","toom","bauhaus","hornbach","globus","hagebau","hellweg"]);

test("PE/Baufolie resolve to one intent and verified totals retain actual roll areas",()=>{
  const target=get("pe-folie-200-2000-50000-v1");
  for(const alias of ["PE Folie","PE-Baufolie","Baufolie","PE Abdeckfolie","Estrichfolie"]) {
    assert.equal(resolvePreferredMaterial(materials,alias)?.id,target.id,alias);
  }
  for(const [store,total,area] of [["obi",33.99,30],["toom",69.99,100],["bauhaus",44.95,50],["hornbach",29.95,50],["globus",79.99,100]] as const) {
    const selected=selectChainOffer(target,offers,catalog,store);
    assert.equal(selected.price?.price,total,store);
    assert.equal(selected.price?.package_quantity,area,store);
    assert.ok(selected.actualSpecification?.includes(`${area} m²`));
    assert.notEqual(selected.price?.price,selected.price?.unit_price);
  }
  for(const store of ["hagebau","hellweg"])assert.equal(selectChainOffer(target,offers,catalog,store).match,"unavailable");
  const wrong={...target,specs:{...target.specs,thickness_mm:.02}};
  assert.equal(getVariantDistance(target,wrong),null,"thin decorators' film is not heavy PE construction film");
});

test("Dampfbremse keeps fixed sd exact, clearly labels verified variable alternatives and rejects wrong sd",()=>{
  const target=get("dampfbremse-sd2-1500-50000-v1");
  for(const [store,total,area] of [["obi",149.25,75],["bauhaus",149.25,75],["globus",69.99,25],["hagebau",64.99,25],["toom",209.99,60],["hornbach",59.95,30]] as const){
    const selected=selectChainOffer(target,offers,catalog,store);
    assert.equal(selected.price?.price,total,store);
    assert.equal(selected.price?.package_quantity,area,store);
    if(["toom","hornbach"].includes(store)){
      assert.match(selected.actualSpecification!,/sd .*–.*feuchtevariabel/);
      assert.match(selected.specificationWarning!,/Feuchtevariable Alternative/);
    }
  }
  assert.equal(getVariantDistance(target,{...target,specs:{...target.specs,sd_m:100}}),null);
  const variable=get("dampfbremse-variabel-03-5-1500-40000-v1");
  assert.equal(getVariantDistance(target,{...variable,specs:{...variable.specs,sd_min_m:3}}),null);
  const definition=definitions.find(d=>d.slug===target.slug)!;
  assert.equal(buildStandard(definition)!.search,"Dampfbremse");
  assert.match(decodeURIComponent(getStoreUrl("bauhaus",target.name)),/q=Dampfbremse$/);
  assert.equal(evaluateProductMatch({name:"Unterspannbahn 1,5 × 50 m",observedSpecs:target.specs},buildStandard(definition),{exactPackage:true}).accepted,false);
});

test("Randdämmstreifen parses height/thickness separately from roll length and requires a film flap",()=>{
  const target=get("randdaemmstreifen-8-150-25000-v1"),actual=get("randdaemmstreifen-8-150-50000-v1");
  const standard=buildStandard(actual)!;
  assert.equal(standard.search,"Randdämmstreifen");
  assert.equal(evaluateProductMatch({name:"swisspor BOARD Randdämmstreifen mit Lasche 150 mm × 8 mm, 50 m Rolle"},standard,{exactPackage:true}).accepted,true);
  assert.equal(evaluateProductMatch({name:"Randdämmstreifen ohne Folienlasche 150 mm × 8 mm, 50 m Rolle"},standard,{exactPackage:true}).accepted,false);
  for(const [store,total] of [["bauhaus",25.50],["hornbach",28.45]] as const){
    const selected=selectChainOffer(target,offers,catalog,store);
    assert.equal(selected.price?.price,total);
    assert.equal(selected.price?.package_quantity,50);
  }
  assert.notEqual(getVariantDistance(target,{...actual,specs:{...actual.specs,width_mm:120}}),null);
  assert.equal(getVariantDistance(target,{...actual,specs:{...actual.specs,width_mm:100}}),null);
  assert.equal(getVariantDistance(target,{...actual,specs:{...actual.specs,thickness_mm:5}}),null);
});

test("new silicone and foam screenshots preserve chemistry, actual size and retailer identity",()=>{
  const silicone=get("sanitaer-silikon-acetat-weiss-310ml-v1");
  for(const [store,total,id] of [["bauhaus",7.85,"23413872"],["toom",9.99,"2360002"]] as const){
    const selected=selectChainOffer(silicone,offers,catalog,store);
    assert.equal(selected.price?.price,total);
    assert.equal(selected.price?.package_quantity,.31);
    assert.ok(selected.price?.product_url.includes(id));
  }
  const standard=buildStandard(silicone)!;
  assert.equal(evaluateProductMatch({name:"Neutral Sanitär-Silikon weiß310ml",observedSpecs:{volume_l:.31,color:"weiss"}},standard,{exactPackage:true}).accepted,false);
  const foam=get("pu-schaum-1k-b2-genius-750ml-v1");
  const selected=selectChainOffer(foam,offers,catalog,"toom");
  assert.equal(selected.price?.price,13.99);assert.equal(selected.price?.package_quantity,.75);
  assert.match(selected.price!.product_name,/Genius Gun, champagner/);
  assert.ok(selected.price?.product_url.endsWith("/2368047"));
  assert.equal(selectChainOffer(foam,offers,catalog,"bauhaus").price?.product_name.includes("Sika"),undefined);
});

test("both requested 120 mm glasswool rolls use the latest screenshot references without relabeling dimensions",()=>{
  for(const slug of ["glaswolle-035-120-6m2-v1","glaswolle-035-120-5-28m2-v1"]){
    const target=get(slug),hb=selectChainOffer(target,offers,catalog,"hornbach"),bau=selectChainOffer(target,offers,catalog,"bauhaus");
    assert.equal(hb.price?.price,48.38);assert.equal(hb.price?.package_quantity,5.76);
    assert.match(hb.actualSpecification!,/^120 × 1200 × 4800/);
    assert.ok(hb.price?.product_url.includes("/12358612/"));
    assert.equal(bau.price?.price,44);assert.match(bau.actualSpecification!,/^100 ×/);
    assert.match(bau.specificationWarning!,/100 mm statt 120 mm/);
  }
});

