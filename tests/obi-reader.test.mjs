import test from 'node:test';
import assert from 'node:assert/strict';
import {extractStructuredProducts,discoverProductLinks,createShopReader} from '../scripts/shop-reader/shops.mjs';
const url='https://www.obi.de/p/1000001/testprodukt';
const fixture=(change=()=>{})=>{const product={'@type':'Product',sku:'1000001',url,name:'Bauzement 25 kg',offers:{'@type':'Offer',url,price:10,priceCurrency:'EUR',unitCode:'C62',seller:{name:'OBI E-Commerce GmbH'},availability:'https://schema.org/InStock'}};change(product);return `<script type="application/ld+json">${JSON.stringify(product)}</script>`;};
test('OBI requires its own product SKU, seller and independent package offer',()=>{
 assert.equal(extractStructuredProducts(fixture(),url,'obi')[0].price,10);
 for(const change of [p=>{p.sku='2000002'},p=>{p.offers.seller.name='Marketplace'},p=>{p.offers.unitCode='KGM'},p=>{p.offers.availableAtOrFrom={name:'Local store'}},p=>{p.offers.validForMemberTier='card'}]) assert.deepEqual(extractStructuredProducts(fixture(change),url,'obi'),[]);
});
test('OBI search discovers product URLs even when retailer names differ from the query',async()=>{
 const page='<a href="/p/1000001/testprodukt">Portlandzement</a>';
 assert.deepEqual(discoverProductLinks(page,'https://www.obi.de/search/bauzement/','obi','Bauzement'),[url]);
 const http={get:async link=>({url:link,body:link===url?fixture():page}),getRobots:async()=>({sitemaps:[]})};
 const result=await createShopReader({http}).searchShop('obi','Bauzement');
 assert.equal(result.products[0].price,10);assert.equal(result.products[0].url,url);
});

test('OBI never turns referenceQuantity unitText into a total package price',()=>{
 const unit=fixture(p=>{delete p.offers.unitCode;p.offers.price=.4;p.offers.priceSpecification={'@type':'UnitPriceSpecification',price:.4,referenceQuantity:{value:1,unitText:'kg'}}});
 assert.deepEqual(extractStructuredProducts(unit,url,'obi'),[]);
 const total=fixture(p=>{p.offers.priceSpecification={'@type':'UnitPriceSpecification',price:.4,referenceQuantity:{value:1,unitText:'kg'}}});
 assert.equal(extractStructuredProducts(total,url,'obi')[0].price,10);
});
