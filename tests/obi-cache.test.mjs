import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createObiLookup} from '../scripts/shop-reader/obi-lookup.mjs';
const stamp='2026-10-03T10:00:00Z', now=()=>Date.parse(stamp);
const product={name:'Flex-Fliesenkleber 25 kg',url:'https://www.obi.de/p/1000001/testprodukt',price:10,currency:'EUR',priceBasis:'package',priceSource:'json-ld-offer',retrievedAt:stamp};
test('generic noncanonical OBI result persists, coalesces requests and survives a failed refresh/restart',async()=>{
 const dir=await mkdtemp(resolve('node_modules/.obi-cache-test-'));
 try {
  let calls=0;
  const service=createObiLookup({cacheFile:join(dir,'cache.json'),now,reader:{searchShop:async()=>{calls++;return {products:[product],errors:[]}}}});
  const results=await Promise.all([service.lookup('Fliesenkleber'),service.lookup('FLIESENKLEBER')]);
  assert.equal(calls,1);assert.equal(results[0].offer.price,10);assert.equal(results[0].offer.actual_size,'25 kg');
  assert.equal('material_id' in results[0].offer,false);
  const restarted=createObiLookup({cacheFile:join(dir,'cache.json'),now:()=>now()+2*86400000,reader:{searchShop:async()=>{throw Object.assign(new Error('HTTP 404'),{code:'not-found'})}}});
  const fallback=await restarted.lookup('Fliesenkleber');
  assert.equal(fallback.offer.price,10);assert.equal(fallback.offer.checked_at,stamp);assert.equal(fallback.cacheStatus,'stale-verified-cache');
  assert.equal(fallback.diagnostics.errors[0].code,'not-found');
 } finally {assert.ok(dir.startsWith(resolve('node_modules/.obi-cache-test-')));await rm(dir,{recursive:true,force:true});}
});
test('OBI rejects unit-only, wrong family, wrong host and unknown size without inventing an offer',async()=>{
 for(const bad of [{...product,priceBasis:'kg'},{...product,name:'Silikon 310 ml'},{...product,url:'https://evil.invalid/p/1/fake'},{...product,name:'Fliesenkleber'}]){
  const service=createObiLookup({now,reader:{searchShop:async()=>({products:[bad],errors:[]})}});
  assert.equal((await service.lookup('Fliesenkleber')).offer,null);
 }
});
test('a fresh verified OBI observation skips network and rejects user-supplied URLs',async()=>{
 const service=createObiLookup({now,seedProducts:[product],reader:{searchShop:async()=>{throw new Error('must not fetch')}}});
 assert.equal((await service.lookup('Fliesenkleber')).cacheStatus,'fresh-verified-cache');
 await assert.rejects(service.lookup('https://other.invalid'),/invalid-query/);
});

test('a fresh close variant does not prevent discovery of the explicitly requested exact package',async()=>{
 let calls=0;
 const service=createObiLookup({now,seedProducts:[product],reader:{searchShop:async()=>{calls++;return {products:[{...product,name:'Flex-Fliesenkleber 5 kg',url:'https://www.obi.de/p/1000002/five',price:6}],errors:[]}}}});
 const result=await service.lookup('Fliesenkleber 5 kg');
 assert.equal(calls,1);assert.equal(result.offer.actual_size,'5 kg');assert.equal(result.offer.price,6);
});

test('running customer service reloads a separately updated file; database failures retain its verified data',async()=>{
 const dir=await mkdtemp(resolve('node_modules/.obi-reload-test-')),file=join(dir,'cache.json');let time=now();
 try {
  const service=createObiLookup({now:()=>time,seedProducts:[product],cacheFile:file,loadProducts:async()=>{throw new Error('external DB unavailable')},reader:{searchShop:async()=>({products:[],errors:[]})}});
  assert.equal((await service.lookup('Fliesenkleber')).offer.price,10);
  time+=4000;
  await writeFile(file,JSON.stringify({version:1,products:[{...product,price:11,retrievedAt:new Date(time).toISOString()}]}));
  const fresh=await service.lookup('Fliesenkleber');assert.equal(fresh.offer.price,11);assert.equal(fresh.diagnostics.errors[0].code,'database-read-failed');
 } finally {assert.ok(dir.startsWith(resolve('node_modules/.obi-reload-test-')));await rm(dir,{recursive:true,force:true});}
});

test('a newer malformed database observation cannot mask an older valid same-SKU fallback',async()=>{
 const good={...product,name:'Tiefgrund 5 l'};
 const service=createObiLookup({now,seedProducts:[good],loadProducts:async()=>[{...good,price:1,attributes:[{name:'Inhalt (l)',value:'10 l'}],retrievedAt:new Date(now()+1000).toISOString()}],reader:{searchShop:async()=>{throw new Error('fresh valid fallback must avoid network')}}});
 const result=await service.lookup('Tiefengrund');assert.equal(result.offer.price,10);assert.equal(result.offer.checked_at,stamp);
});
