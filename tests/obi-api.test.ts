import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../src/app/api/obi/search/route';
import {validateObiOffer} from '../src/lib/obi-offer';

test('OBI endpoint rejects invalid/cross-origin requests before lookup',async()=>{
 for(const [body,status] of [[JSON.stringify({query:'https://evil.invalid'}),400],['{',400],[JSON.stringify({query:'A'}),400],[JSON.stringify({query:'Acryl',url:'https://evil.invalid'}),400],['x'.repeat(1025),413]] as const) {
  const response=await POST(new Request('http://localhost/api/obi/search',{method:'POST',body}));assert.equal(response.status,status);
 }
 const external=await POST(new Request('http://localhost/api/obi/search',{method:'POST',headers:{origin:'https://evil.invalid'},body:'{"query":"Acryl"}'}));
 assert.equal(external.status,403);
});
test('OBI client validation rejects foreign links, contradictory unit prices and invalid totals',()=>{
 const valid={store_id:'obi',product_name:'Synthetic acrylic 300 ml',product_url:'https://www.obi.de/p/1000001/test',actual_size:'300 ml',price:6,currency:'EUR',source:'automatic',price_scope:'chain',checked_at:new Date().toISOString(),package_quantity:.3,unit:'l',unit_price:20};
 assert.ok(validateObiOffer(valid));
 for(const bad of [{...valid,price:0},{...valid,price:3.333},{...valid,unit_price:6},{...valid,product_url:'https://evil.invalid/p/1000001/test'},{...valid,actual_size:''}]) assert.equal(validateObiOffer(bad),null);
});
