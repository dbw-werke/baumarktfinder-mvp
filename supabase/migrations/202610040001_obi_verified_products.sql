-- OBI's generic products have their own SKU. Do not fabricate canonical material IDs.
create table if not exists public.obi_verified_products (
  product_url text primary key check (product_url ~ '^https://(www\.)?obi\.de/p/[0-9]+/[^/?#]+$'),
  product jsonb not null check (jsonb_typeof(product) = 'object'),
  checked_at timestamptz not null,
  verification_status text not null default 'verified' check (verification_status = 'verified')
);
alter table public.obi_verified_products enable row level security;
drop policy if exists obi_verified_read on public.obi_verified_products;
create policy obi_verified_read on public.obi_verified_products for select to anon, authenticated using (verification_status = 'verified');
grant select on public.obi_verified_products to anon, authenticated;
grant all on public.obi_verified_products to service_role;

create or replace function public.record_verified_obi_product(p_product jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare observed timestamptz;
begin
  if p_product->>'priceBasis' is distinct from 'package'
    or p_product->>'currency' is distinct from 'EUR'
    or coalesce(p_product->>'priceSource','') not in ('json-ld-offer','retailer-product-state','obi-rendered-product','manual-admin-verification')
    or coalesce(p_product->>'name','') = ''
    or jsonb_typeof(p_product->'price') is distinct from 'number'
    or (p_product->>'price')::numeric <= 0
    or (p_product->>'price')::numeric > 100000
    or (p_product->>'price')::numeric <> round((p_product->>'price')::numeric,2)
  then raise exception 'Invalid verified OBI product'; end if;
  observed := (p_product->>'retrievedAt')::timestamptz;
  if observed is null or observed > now() + interval '5 minutes' then raise exception 'Invalid observation date'; end if;
  insert into public.obi_verified_products(product_url, product, checked_at)
  values (p_product->>'url',p_product,observed)
  on conflict (product_url) do update set product=excluded.product,checked_at=excluded.checked_at
  where excluded.checked_at > obi_verified_products.checked_at;
end;
$$;
revoke all on function public.record_verified_obi_product(jsonb) from public, anon, authenticated;
grant execute on function public.record_verified_obi_product(jsonb) to service_role;
