/** Optional shared storage using the existing canonical tables; never imported by a browser. */
export function toomSupabaseStorage(env = process.env, fetchImpl = fetch) {
  if (env.TOOM_USE_SUPABASE !== 'true') return null;
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const readKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const writeKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !readKey) throw new Error('toom-database-configuration-missing');
  async function request(path, key, payload) {
    const response = await fetchImpl(`${url}/rest/v1/${path}`, {
      method: payload ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      let code;
      try { code = (await response.json()).code; } catch { /* Do not expose backend response text or credentials. */ }
      throw Object.assign(new Error(`toom-database-http-${response.status}${/^[A-Z0-9]+$/.test(code || '') ? `-${code}` : ''}`), { code: 'database-error', status: response.status });
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    async loadProducts() {
      const products = [], limit = 500;
      for (let offset = 0; ; offset += limit) {
        const rows = await request(`verified_store_prices?select=*&store_id=eq.toom&verified=eq.true&order=material_id.asc&limit=${limit}&offset=${offset}`, readKey);
        if (!Array.isArray(rows)) throw new Error('toom-database-invalid-response');
        products.push(...rows);
        if (rows.length < limit) return products;
      }
    },
    async save(record) {
      if (!writeKey) throw new Error('toom-database-write-key-missing');
      if (record.store_id !== 'toom' || record.verified !== true) throw new Error('toom-database-unverified-product');
      return request('rpc/refresh_verified_toom_price', writeKey, { payload: { ...record, base_unit: record.unit, price_scope: 'chain' } });
    },
  };
}
