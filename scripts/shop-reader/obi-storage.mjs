/** Optional server/worker persistence. Never imported into the client bundle. */
export function obiSupabaseStorage(env=process.env,fetchImpl=fetch) {
  if (env.OBI_USE_SUPABASE!=='true') return {};
  const url=String(env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/,''), readKey=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,writeKey=env.SUPABASE_SERVICE_ROLE_KEY;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !readKey) throw new Error('OBI Supabase URL/Leseschlüssel fehlt');
  async function request(path,key,body) {
    const response=await fetchImpl(`${url}/rest/v1/${path}`,{method:body ? 'POST' : 'GET',signal:AbortSignal.timeout(5000),
      headers:{apikey:key,...(key.startsWith('eyJ') ? {Authorization:`Bearer ${key}`} : {}),'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
    if (!response.ok) throw new Error(`obi-database-http-${response.status}`);
    return response.status===204 ? null : response.json();
  }
  return {
    async loadProducts() { const rows=await request('obi_verified_products?select=product&order=checked_at.desc&limit=500',readKey);return rows.map(row=>row.product); },
    ...(writeKey ? {async saveProducts(products) {for (const product of products) await request('rpc/record_verified_obi_product',writeKey,{p_product:product});}} : {}),
  };
}
