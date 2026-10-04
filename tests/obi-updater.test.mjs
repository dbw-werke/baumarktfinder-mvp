import test from 'node:test';
import assert from 'node:assert/strict';
import {parseObiRenderedProduct,obiHardBlock} from '../scripts/shop-reader/obi-rendered.mjs';
import {createObiUpdaterReader} from '../scripts/shop-reader/obi-updater.mjs';
import {createObiLookup,selectObiOffer} from '../scripts/shop-reader/obi-lookup.mjs';
import {obiSupabaseStorage} from '../scripts/shop-reader/obi-storage.mjs';
const product={name:'Maleracryl 310 ml',url:'https://www.obi.de/p/1000001/fixture',price:10,currency:'EUR',priceBasis:'package',priceSource:'obi-rendered-product',retrievedAt:new Date().toISOString()};
const page={url:product.url,name:'Gipskarton 2000 x 1250 x 12,5 mm',text:'Gipskarton 2000 x 1250 x 12,5 mm\n5,20 € / m²\n12,99 € / Verkaufseinheit\nGesamtpreis:\n12,99 €\nLieferung nach Hause\nzzgl. 4,95 € Versand\nVerkäufer: OBI E-Commerce GmbH\nProduktübersicht\nAndere Kunden kauften: 0,10 €'};
test('rendered OBI buybox separates total/unit price and rejects seller, market, conditional and unit-only evidence',()=>{
 const result=parseObiRenderedProduct(page);assert.equal(result.products[0].price,12.99);assert.equal(result.products[0].declaredUnitPrice,5.2);
 for(const text of [page.text.replace('OBI E-Commerce GmbH','Marketplace Seller'),page.text.replace('Lieferung nach Hause','Lieferung nach Hause\nDerzeit nicht möglich'),page.text.replace('Gesamtpreis:','heyOBI Vorteil\nGesamtpreis:'),page.text.replace('12,99 € / Verkaufseinheit\nGesamtpreis:\n12,99 €\n','')])
  assert.equal(parseObiRenderedProduct({...page,text}).products.length,0);
 const simple=parseObiRenderedProduct({url:product.url,name:product.name,text:`${product.name}\n10,00 €\nLieferung nach Hause\nVerkäufer: OBI E-Commerce GmbH`});
 assert.equal(simple.products[0].price,10);
});
test('404/empty/invalid direct candidates fall back to Chromium and matcher chooses a valid product',async()=>{
 for(const response of [{products:[],errors:[{code:'not-found'}]},{products:[],errors:[]},{products:[{...product,name:'Silikon 310 ml'}],errors:[]}]) {
  let browserCalls=0;
  const reader=createObiUpdaterReader({direct:{searchShop:async()=>response},browser:{searchShop:async()=>{browserCalls++;return {products:[{...product,name:'Silikon 310 ml',price:1},product],errors:[]}}}});
  const result=await createObiLookup({reader}).lookup('Acryl');
  assert.equal(browserCalls,1);assert.equal(result.offer.product_name,'Maleracryl 310 ml');assert.equal(result.offer.price,10);
  assert.equal(result.diagnostics.retrieval.direct.status,'failure');assert.equal(result.diagnostics.retrieval.playwright.status,'success');
 }
});
test('fresh verified data skips both readers; successful lightweight retrieval skips Chromium',async()=>{
 let direct=0,browser=0;
 const reader=createObiUpdaterReader({direct:{searchShop:async()=>{direct++;return {products:[product],errors:[]}}},browser:{searchShop:async()=>{browser++;throw new Error('not expected')}}});
 await createObiLookup({reader,seedProducts:[product]}).lookup('Acryl');assert.equal(direct,0);assert.equal(browser,0);
 await createObiLookup({reader}).lookup('Acryl');assert.equal(direct,1);assert.equal(browser,0);
});
test('hard blocks stop the session and preserve old verified prices and observation dates',async()=>{
 assert.equal(obiHardBlock(200,'','Please solve the CAPTCHA'),'captcha');assert.equal(obiHardBlock(403),'hard_bot_block');assert.equal(obiHardBlock(404),null);
 let calls=0;
 const reader=createObiUpdaterReader({direct:{searchShop:async()=>({products:[],errors:[{code:'not-found'}]})},browser:{searchShop:async()=>{calls++;return {products:[],errors:[{code:'FETCH_BLOCKED',reason:'captcha'}]}}}});
 const service=createObiLookup({reader,seedProducts:[product]});
 const result=await service.lookup('Acryl',{force:true});
 assert.equal(result.offer.price,10);assert.equal(result.offer.checked_at,product.retrievedAt);assert.equal(result.diagnostics.cacheUpdated,false);
 await service.lookup('Acryl 300 ml',{force:true});assert.equal(calls,1);
});

test('rendered package dimensions exclude shipping dimensions and unrelated products',()=>{
 const mesh={url:product.url,name:'Glasfasergewebe 1 m x 50 m',text:'Glasfasergewebe 1 m x 50 m\n104,99 €\n2,10 € / m²\nGesamtpreis:\n104,99 €\nLieferung nach Hause\nVerkäufer: OBI E-Commerce GmbH\nProduktübersicht\nProduktdaten\nInhalt\n50 m²\nMaße & Gewicht\nBreite\n15 cm\nHöhe\n100 cm'};
 const parsed=parseObiRenderedProduct(mesh).products[0];assert.ok(parsed);
 assert.deepEqual(parsed.attributes,[{name:'Inhalt',value:'50 m²'}]);
});

test('an explicit visible insulation package area is used without deriving it from the price',()=>{
 const name='Trennwandplatte Steinwolle WLG 40 40 mm';
 const parsed=parseObiRenderedProduct({url:product.url,name,text:`${name}\n4,39 € / m²\n32,92 € / Verkaufseinheit\nLieferung nach Hause\nVerkäufer: OBI E-Commerce GmbH\nProduktübersicht\nStärke: 40 mm, Format: 62,5 cm x 100 cm\nPaketinhalt: 7,5 m²\nProduktbeschreibung`});
 const selected=selectObiOffer('Mineralwolle WLG 040 40 mm',parsed.products).offer;
 assert.ok(selected);assert.equal(selected.price,32.92);assert.equal(selected.package_quantity,7.5);
 assert.match(selected.actual_size,/1.000 × 625 × 40 mm/);
});

test('optional Supabase persistence separates public reads and service-only atomic writes',async()=>{
 const calls=[];
 const storage=obiSupabaseStorage({OBI_USE_SUPABASE:'true',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'service-fixture'},async(url,options)=>{calls.push({url,...options});return Response.json(options.method==='GET' ? [{product}] : null);});
 assert.deepEqual(await storage.loadProducts(),[product]);await storage.saveProducts([product]);
 assert.equal(calls[0].headers.apikey,'public-fixture');assert.equal(calls[1].headers.apikey,'service-fixture');
 assert.match(calls[1].url,/rpc\/record_verified_obi_product$/);assert.equal(JSON.parse(calls[1].body).p_product.retrievedAt,product.retrievedAt);
 assert.deepEqual(obiSupabaseStorage({}),{});
});
