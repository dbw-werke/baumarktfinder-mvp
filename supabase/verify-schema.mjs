/** Optional integration check: node supabase/verify-schema.mjs [file:///.../pglite/dist/index.js]
 * Uses an isolated in-memory PostgreSQL database and synthetic fixtures only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const migration = readFileSync(new URL('./migrations/202609220001_canonical_prices.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('./seed.sql', import.meta.url), 'utf8');
const definitionCount = JSON.parse(readFileSync(new URL('./canonical-materials.json', import.meta.url), 'utf8')).length;
const db = new PGlite();
const counts = async () => (await db.query(`select (select count(*)::int from materials) materials, (select count(*)::int from canonical_material_aliases) aliases, (select count(*)::int from stores) stores`)).rows[0];
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.materials(id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,store_search_term text not null,suggestion_label text,active boolean default true,brand text,category text,product_family text,exact_product boolean not null default false,match_rules jsonb not null default '{}'::jsonb);
    insert into materials(id,slug,name,store_search_term) values('11111111-1111-4111-8111-111111111111','legacy','Legacy unreviewed material','legacy');
    create table public.material_aliases(id bigint generated always as identity primary key,material_id uuid references materials(id),alias text,normalized_alias text unique);
    insert into material_aliases(material_id,alias,normalized_alias) values('11111111-1111-4111-8111-111111111111','Rigips','rigips');
    create table public.store_prices(id uuid primary key default gen_random_uuid(),material_id uuid references materials(id),store_id text,price numeric);
    insert into store_prices(material_id,store_id,price) values('11111111-1111-4111-8111-111111111111','obi',1);
    create table public.analytics_events(id bigint generated always as identity primary key,event text);
    insert into analytics_events(event) values('preserve_fixture');
    grant all on public.materials,public.store_prices to anon,authenticated;
    alter table materials enable row level security;
    create policy legacy_broad_read on materials for select to anon using(true);
  `);
  await db.exec(migration);
  await db.exec(seed);
  const initial = await counts();
  assert.equal(initial.materials, definitionCount + 1);
  assert.equal(initial.stores, 7);
  assert.ok(initial.aliases > 70);
  await db.exec(migration);
  await db.exec(seed);
  assert.deepEqual(await counts(), initial);
  assert.equal((await db.query('select count(*)::int as total from store_prices')).rows[0].total, 1);
  assert.equal((await db.query('select count(*)::int as total from material_aliases')).rows[0].total, 1);
  assert.equal((await db.query('select count(*)::int as total from analytics_events')).rows[0].total, 1);
  console.log('PASS: additive migration and seed twice; legacy UUIDs, aliases, prices, analytics preserved.');

  const material = (await db.query("select * from materials where slug='knauf-rotband-30kg-v1'")).rows[0];
  const payload = {material_id:material.id,store_id:'hornbach',product_name:'SYNTHETIC TEST ONLY Knauf Rotband 30 kg',product_url:'https://www.hornbach.de/p/synthetic-test-only/0000/',price:11.59,package_quantity:30,base_unit:'kg',source:'automatic',checked_at:new Date(Date.now()-60000).toISOString(),match_evidence:{test_fixture:true,canonical_version:material.canonical_version,specs:material.specs}};
  const save = (value) => db.query('select public.save_verified_price($1::jsonb) id', [JSON.stringify(value)]);
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  const saved = await save(payload);
  assert.ok(saved.rows[0].id);
  let stored = (await db.query('select * from verified_store_prices')).rows[0];
  assert.equal(Number(stored.price),11.59);
  assert.equal(Number(stored.unit_price),0.39);
  assert.equal((await db.query('select count(*)::int n from price_history')).rows[0].n,1);
  for (const override of [
    {package_quantity:25}, {base_unit:'piece'}, {price:0}, {price:-1}, {price:'NaN'}, {price:11.595},
    {unit_price:11.59}, {currency:'USD'}, {source:'mock'}, {price_scope:'branch'}, {checked_at:'infinity'},
    {checked_at:new Date(Date.now()+3600000).toISOString()}, {store_id:'unknown'},
    {product_url:'https://hornbach.de.evil.test/p/test'}, {product_url:'https://www.hornbach.de/search?q=test'},
    {product_url:'https://www.hornbach.de/s/rotband'}, {product_url:'https://www.hornbach.de/'},
    {material_id:'11111111-1111-4111-8111-111111111111'}, {match_evidence:{}},
    {match_evidence:{...payload.match_evidence,canonical_version:0}},
    {match_evidence:{...payload.match_evidence,canonical_version:String(material.canonical_version)}},
    {match_evidence:{...payload.match_evidence,specs:{...material.specs,type:'wrong-functional-type'}}}
  ]) await assert.rejects(save({...payload,...override}),undefined,JSON.stringify(override));
  assert.equal((await db.query('select count(*)::int n from price_history')).rows[0].n,1);
  assert.equal(Number((await db.query('select price from verified_store_prices')).rows[0].price),11.59);
  console.log('PASS: matching package, exact official URL, EUR, source, observation time and numeric validation; rejected updates preserve cache.');

  await save({...payload,price:9.99,checked_at:new Date(Date.now()-3600000).toISOString()});
  assert.equal(Number((await db.query('select price from verified_store_prices')).rows[0].price),11.59);
  assert.equal((await db.query('select count(*)::int n from price_history')).rows[0].n,1);
  await save({...payload,price:12.59,source:'manual',checked_at:new Date(Date.now()-30000).toISOString()});
  stored = (await db.query('select * from verified_store_prices')).rows[0];
  assert.equal(stored.source,'manual');
  assert.equal(Number(stored.price),12.59);
  assert.equal((await db.query('select count(*)::int n from price_history')).rows[0].n,2);
  await db.exec(`create function fail_history_fixture() returns trigger language plpgsql as $$ begin if new.price=999.99 then raise exception 'fixture history failure'; end if; return new; end $$;
    create trigger fail_history_fixture before insert on price_history for each row execute function fail_history_fixture();`);
  await assert.rejects(save({...payload,price:999.99,checked_at:new Date().toISOString()}),/fixture history failure/);
  assert.equal(Number((await db.query('select price from verified_store_prices')).rows[0].price),12.59);
  console.log('PASS: newer cache protected from stale requests; manual fallback; history failure rolls back product/cache transaction.');

  // PGlite serializes its requests on one backend. This verifies competing inputs and uniqueness;
  // actual multi-backend lock scheduling remains PostgreSQL deployment integration coverage.
  await Promise.all([0,1,2].map(index => save({...payload,price:13+index,checked_at:new Date(Date.now()+index*1000).toISOString()})));
  assert.equal((await db.query('select count(*)::int n from verified_store_prices')).rows[0].n,1);
  assert.equal(Number((await db.query('select price from verified_store_prices')).rows[0].price),15);
  assert.equal((await db.query('select count(*)::int n from store_products')).rows[0].n,1);
  console.log('PASS: competing updates maintain one material/chain mapping and newest observation.');

  await db.exec("set role anon; select set_config('request.jwt.claim.role','anon',false)");
  assert.equal((await db.query('select count(*)::int n from materials')).rows[0].n,definitionCount);
  assert.equal((await db.query('select count(*)::int n from verified_store_prices')).rows[0].n,1);
  await assert.rejects(db.query('select * from store_prices'),/permission denied/);
  await assert.rejects(db.query('select * from price_history'),/permission denied/);
  await assert.rejects(db.query("update materials set name='tampered'"),/permission denied/);
  await assert.rejects(save(payload),/permission denied/);
  await db.exec('reset role');
  const snapshot = async () => ({
    prices: (await db.query('select * from verified_store_prices order by id')).rows,
    products: (await db.query('select * from store_products order by id')).rows,
    history: (await db.query('select * from price_history order by id')).rows,
  });
  const beforeDefinitionChange = await snapshot();
  const changedSpecs = {...material.specs,type:'renovierungsspachtel'};
  await db.query('update materials set specs=$1::jsonb where id=$2',[JSON.stringify(changedSpecs),material.id]);
  await db.exec('set role anon');
  assert.equal((await db.query('select count(*)::int n from verified_store_prices')).rows[0].n,0);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from verified_store_prices')).rows[0].n,1);
  console.log('PASS: anonymous canonical read only, no legacy/history access or writes/RPC; canonical spec change hides outdated mapping without deletion.');

  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  // Quantity and unit still match: a stale functional-type validation must fail
  // instead of being silently restamped with the newly changed specifications.
  assert.equal(Number((await db.query('select package_quantity from materials where id=$1',[material.id])).rows[0].package_quantity),payload.package_quantity);
  await assert.rejects(save({...payload,price:16,checked_at:new Date().toISOString()}),/Product validation is stale or missing/);
  assert.deepEqual(await snapshot(),beforeDefinitionChange);
  // A version-only change also invalidates the worker's earlier validation.
  await db.query('update materials set specs=$1::jsonb,canonical_version=canonical_version+1 where id=$2',[JSON.stringify(material.specs),material.id]);
  await assert.rejects(save({...payload,price:16,checked_at:new Date().toISOString()}),/Product validation is stale or missing/);
  assert.deepEqual(await snapshot(),beforeDefinitionChange);
  await db.query('update materials set canonical_version=$1 where id=$2',[material.canonical_version,material.id]);
  await save({...payload,price:16,checked_at:new Date(Date.now()+3000).toISOString()});
  assert.equal(Number((await db.query('select price from verified_store_prices')).rows[0].price),16);
  console.log('PASS: stale same-quantity functional specifications and stale versions reject atomically; correctly validated current metadata remains accepted.');
  console.log('All local schema checks passed. No live database mutations were made.');
} finally { await db.close(); }
