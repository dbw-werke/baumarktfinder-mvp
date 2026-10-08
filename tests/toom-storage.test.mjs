import test from 'node:test';
import assert from 'node:assert/strict';
import { toomSupabaseStorage } from '../scripts/shop-reader/toom-storage.mjs';

const env = { TOOM_USE_SUPABASE: 'true', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key' };
test('toom storage is optional and rejects incomplete enabled configuration', () => {
  assert.equal(toomSupabaseStorage({}), null);
  assert.throws(() => toomSupabaseStorage({ TOOM_USE_SUPABASE: 'true' }), /configuration-missing/);
});
test('toom inventory reads every verified page and never asks for another store', async () => {
  const requests = [];
  const storage = toomSupabaseStorage(env, async (url, options) => {
    requests.push({ url, options });
    return Response.json(requests.length === 1 ? Array.from({ length: 500 }, (_, i) => ({ material_id: String(i), store_id: 'toom' })) : [{ material_id: 'last', store_id: 'toom' }]);
  });
  assert.equal((await storage.loadProducts()).length, 501);
  assert.match(requests[0].url, /store_id=eq.toom&verified=eq.true/);
  assert.match(requests[1].url, /offset=500$/);
  assert.equal(requests[0].options.headers.apikey, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
});
test('toom writes one atomic canonical RPC, keeping active/old/unit prices separate', async () => {
  let request;
  const storage = toomSupabaseStorage(env, async (url, options) => { request = { url, options }; return Response.json('row-id'); });
  const record = { material_id: 'uuid', store_id: 'toom', verified: true, price: 38.99, old_price: 43.99, unit_price: 1.56, unit: 'kg', package_quantity: 25, fetch_method: 'direct' };
  assert.equal(await storage.save(record), 'row-id');
  assert.match(request.url, /rpc\/refresh_verified_toom_price$/);
  assert.equal(request.options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(JSON.parse(request.options.body), { payload: { ...record, base_unit: 'kg', price_scope: 'chain' } });
  await assert.rejects(storage.save({ ...record, store_id: 'obi' }), /unverified-product/);
  await assert.rejects(storage.save({ ...record, verified: false }), /unverified-product/);
});
test('missing schema and invalid service key are reported without exposing response secrets', async () => {
  const storage = toomSupabaseStorage(env, async () => Response.json({ code: 'PGRST205', message: 'sensitive-backend-message' }, { status: 404 }));
  await assert.rejects(storage.loadProducts(), /^Error: toom-database-http-404-PGRST205$/);
  const noWriter = toomSupabaseStorage({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, async () => Response.json([]));
  await assert.rejects(noWriter.save({}), /toom-database-write-key-missing/);
  const alias = toomSupabaseStorage({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-test-key' }, async (_url, options) => {
    assert.equal(options.headers.apikey, 'legacy-test-key');
    return Response.json([]);
  });
  assert.deepEqual(await alias.loadProducts(), []);
});
