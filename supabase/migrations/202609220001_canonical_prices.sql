-- Additive migration. Existing material UUIDs, legacy prices, aliases, and analytics stay intact.
-- Run with the Supabase database owner, then run seed.sql. Never expose service_role in a browser.
begin;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  name text not null, store_search_term text not null, suggestion_label text,
  active boolean default true, brand text, category text, product_family text,
  exact_product boolean not null default false, match_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.materials add column if not exists specs jsonb not null default '{}'::jsonb;
alter table public.materials add column if not exists base_unit text;
alter table public.materials add column if not exists package_quantity numeric;
alter table public.materials add column if not exists canonical_version integer not null default 0;
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.materials'::regclass and conname='materials_canonical_definition_check') then
    alter table public.materials add constraint materials_canonical_definition_check check (
      canonical_version = 0 or (canonical_version > 0 and jsonb_typeof(specs) = 'object' and specs <> '{}'::jsonb
        and base_unit is not null and base_unit in ('kg','l','m','m2','piece')
        and package_quantity is not null and package_quantity > 0 and package_quantity < 1000000)
    );
  end if;
end $$;
-- Legacy definitions remain version 0 until explicitly reviewed; do not automatically accept them.
create index if not exists materials_canonical_active_idx on public.materials(canonical_version, active);

create table if not exists public.stores (
  id text primary key, name text not null, website text, active boolean default true
);
create table if not exists public.canonical_material_aliases (
  material_id uuid not null references public.materials(id),
  alias text not null check(length(alias) between 1 and 160),
  normalized_alias text not null,
  primary key(material_id, normalized_alias)
);
create index if not exists canonical_material_aliases_search_idx on public.canonical_material_aliases(normalized_alias);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id),
  store_id text not null references public.stores(id),
  product_name text not null, product_url text not null, external_id text,
  package_quantity numeric not null check(package_quantity > 0),
  base_unit text not null check(base_unit in ('kg','l','m','m2','piece')),
  match_evidence jsonb not null default '{}'::jsonb,
  validated_at timestamptz not null, last_success_at timestamptz not null,
  active boolean not null default true,
  unique(material_id, store_id)
);
-- Separate from unreviewed legacy store_prices; no bulk copying of legacy prices.
create table if not exists public.verified_store_prices (
  id uuid primary key default gen_random_uuid(),
  store_product_id uuid not null references public.store_products(id),
  material_id uuid not null references public.materials(id),
  store_id text not null references public.stores(id),
  product_name text not null, product_url text not null,
  price numeric(12,2) not null check(price > 0 and price <= 100000),
  unit_price numeric(14,2) not null check(unit_price >= 0),
  unit text not null check(unit in ('kg','l','m','m2','piece')),
  package_quantity numeric not null check(package_quantity > 0),
  currency text not null default 'EUR' check(currency = 'EUR'),
  price_scope text not null default 'chain' check(price_scope = 'chain'),
  source text not null check(source in ('automatic','manual')),
  availability text,
  checked_at timestamptz not null,
  verified boolean not null default true check(verified),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(material_id, store_id),
  check(abs(unit_price - round(price / package_quantity, 2)) <= 0.01)
);
create table if not exists public.price_history (
  id bigint generated always as identity primary key,
  store_product_id uuid not null references public.store_products(id),
  material_id uuid not null references public.materials(id),
  store_id text not null references public.stores(id),
  product_name text not null, product_url text not null,
  price numeric(12,2) not null, unit_price numeric(14,2) not null,
  package_quantity numeric not null, unit text not null,
  currency text not null default 'EUR', source text not null,
  checked_at timestamptz not null, recorded_at timestamptz not null default now(),
  match_evidence jsonb not null default '{}'::jsonb
);
create index if not exists price_history_material_chain_idx on public.price_history(material_id,store_id,checked_at desc);

alter table public.materials enable row level security;
alter table public.stores enable row level security;
alter table public.canonical_material_aliases enable row level security;
alter table public.store_products enable row level security;
alter table public.verified_store_prices enable row level security;
alter table public.price_history enable row level security;
-- Restrictive read policy also constrains any existing broad legacy SELECT policy.
drop policy if exists canonical_material_read_guard on public.materials;
create policy canonical_material_read_guard on public.materials as restrictive for select to anon,authenticated using(active and canonical_version >= 1);
drop policy if exists canonical_material_read on public.materials;
create policy canonical_material_read on public.materials for select to anon,authenticated using(active and canonical_version >= 1);
drop policy if exists supported_store_read_guard on public.stores;
create policy supported_store_read_guard on public.stores as restrictive for select to anon,authenticated using(active and id in ('obi','bauhaus','hornbach','toom','hagebau','globus','hellweg'));
drop policy if exists supported_store_read on public.stores;
create policy supported_store_read on public.stores for select to anon,authenticated using(active);
drop policy if exists canonical_alias_read on public.canonical_material_aliases;
create policy canonical_alias_read on public.canonical_material_aliases for select to anon,authenticated using(exists(select 1 from public.materials m where m.id = material_id and m.active and m.canonical_version >= 1));
drop policy if exists verified_price_read on public.verified_store_prices;
create policy verified_price_read on public.verified_store_prices for select to anon,authenticated using(
  verified and exists(select 1 from public.materials m where m.id = verified_store_prices.material_id and m.active and m.canonical_version >= 1
    and m.package_quantity = verified_store_prices.package_quantity and m.base_unit = verified_store_prices.unit)
  and exists(select 1 from public.store_products p where p.id = verified_store_prices.store_product_id and p.active
    and p.material_id = verified_store_prices.material_id and p.store_id = verified_store_prices.store_id
    and p.product_url = verified_store_prices.product_url)
);
-- Read-only projection for public product mappings; match evidence/history remain server-owned.
drop policy if exists verified_product_read on public.store_products;
create policy verified_product_read on public.store_products for select to anon,authenticated using(active and exists(
  select 1 from public.materials m where m.id = store_products.material_id and m.active and m.canonical_version >= 1
    and m.package_quantity = store_products.package_quantity and m.base_unit = store_products.base_unit
    and store_products.match_evidence->'canonical_specs' = m.specs
    and store_products.match_evidence->>'canonical_version' = m.canonical_version::text
) and exists(select 1 from public.stores s where s.id = store_products.store_id and s.active));

revoke all on public.materials,public.stores,public.canonical_material_aliases,public.store_products,public.verified_store_prices,public.price_history from public,anon,authenticated;
grant select on public.materials,public.stores,public.canonical_material_aliases,public.store_products,public.verified_store_prices to anon,authenticated;
grant all on public.materials,public.stores,public.canonical_material_aliases,public.store_products,public.verified_store_prices,public.price_history to service_role;
grant usage,select on sequence public.price_history_id_seq to service_role;
-- Existing, unverified records are preserved but no longer served to public clients.
do $$ begin
  if to_regclass('public.store_prices') is not null then
    execute 'revoke all on public.store_prices from public,anon,authenticated';
  end if;
end $$;

create or replace function public.save_verified_price(payload jsonb)
returns uuid language plpgsql security definer set search_path = public,pg_temp as $$
declare
  material public.materials%rowtype;
  product_id uuid;
  price_id uuid;
  chain text := payload->>'store_id';
  expected_host text;
  amount numeric := (payload->>'price')::numeric;
  quantity numeric := (payload->>'package_quantity')::numeric;
  observed_at timestamptz := (payload->>'checked_at')::timestamptz;
  origin text := payload->>'source';
  url text := payload->>'product_url';
  title text := trim(payload->>'product_name');
  evidence jsonb := coalesce(payload->'match_evidence','{}'::jsonb);
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into material from public.materials where id = (payload->>'material_id')::uuid for share;
  if not found or not coalesce(material.active,false) or material.canonical_version < 1 or material.specs = '{}'::jsonb or material.base_unit is null or material.package_quantity is null then
    raise exception 'Material requires an active canonical definition';
  end if;
  if jsonb_typeof(evidence) <> 'object' then raise exception 'Match evidence must be an object'; end if;
  -- Validate the worker's actual snapshot before attaching current metadata. The
  -- row's SHARE lock prevents a concurrent definition change until this save ends.
  if evidence->'canonical_version' is distinct from to_jsonb(material.canonical_version)
    or evidence->'specs' is distinct from material.specs then
    raise exception 'Product validation is stale or missing; revalidate the current canonical definition';
  end if;
  if quantity is null or quantity <= 0 or quantity <> material.package_quantity or payload->>'base_unit' is distinct from material.base_unit then
    raise exception 'Package does not match the canonical material';
  end if;
  if amount is null or amount <= 0 or amount > 100000 or amount <> round(amount,2) or amount::text = 'NaN' then raise exception 'Invalid package price'; end if;
  if origin is null or origin not in ('automatic','manual') or coalesce(payload->>'currency','EUR') <> 'EUR' then raise exception 'Invalid source or currency'; end if;
  if coalesce(payload->>'price_scope','chain') <> 'chain' then raise exception 'Only chain prices are supported'; end if;
  if title is null or length(title) < 3 or length(title) > 500 then raise exception 'Invalid product name'; end if;
  if observed_at is null or not isfinite(observed_at) or observed_at > now() + interval '5 minutes' then raise exception 'Invalid observation time'; end if;
  if payload ? 'unit_price' and payload->>'unit_price' is not null and abs((payload->>'unit_price')::numeric-round(amount/quantity,2)) > 0.011 then raise exception 'Unit price does not match package price'; end if;
  expected_host := case chain when 'obi' then 'obi.de' when 'bauhaus' then 'bauhaus.info' when 'hornbach' then 'hornbach.de' when 'toom' then 'toom.de' when 'hagebau' then 'hagebau.de' when 'globus' then 'globus-baumarkt.de' when 'hellweg' then 'hellweg.de' end;
  if expected_host is null or url is null or url !~ ('^https://(www\.)?' || replace(expected_host,'.','\.') || '/[^[:space:]]+') or url ~* '^https://[^/]+/(search|suche|s)(/|\?|$)' then
    raise exception 'An exact product URL on the official German retailer host is required';
  end if;
  if not exists(select 1 from public.stores where id=chain and active) then raise exception 'Unsupported or inactive chain'; end if;
  -- Serialize a chain/material pair. Failed or older updates never erase the last valid price.
  perform pg_advisory_xact_lock(hashtextextended(material.id::text || ':' || chain,0));
  select id into price_id from public.verified_store_prices where material_id=material.id and store_id=chain and checked_at > observed_at;
  if found then return price_id; end if;
  evidence := evidence || jsonb_build_object('canonical_version',material.canonical_version,'canonical_specs',material.specs);
  insert into public.store_products(material_id,store_id,product_name,product_url,external_id,package_quantity,base_unit,match_evidence,validated_at,last_success_at)
  values(material.id,chain,title,url,payload->>'external_id',quantity,material.base_unit,evidence,observed_at,observed_at)
  on conflict(material_id,store_id) do update set product_name=excluded.product_name,product_url=excluded.product_url,external_id=excluded.external_id,package_quantity=excluded.package_quantity,base_unit=excluded.base_unit,match_evidence=excluded.match_evidence,validated_at=excluded.validated_at,last_success_at=excluded.last_success_at,active=true
  returning id into product_id;
  insert into public.verified_store_prices(store_product_id,material_id,store_id,product_name,product_url,price,unit_price,unit,package_quantity,checked_at,source,availability)
  values(product_id,material.id,chain,title,url,amount,round(amount/quantity,2),material.base_unit,quantity,observed_at,origin,payload->>'availability')
  on conflict(material_id,store_id) do update set store_product_id=excluded.store_product_id,product_name=excluded.product_name,product_url=excluded.product_url,price=excluded.price,unit_price=excluded.unit_price,unit=excluded.unit,package_quantity=excluded.package_quantity,checked_at=excluded.checked_at,source=excluded.source,availability=excluded.availability,verified=true,updated_at=now()
  returning id into price_id;
  insert into public.price_history(store_product_id,material_id,store_id,product_name,product_url,price,unit_price,package_quantity,unit,source,checked_at,match_evidence)
  values(product_id,material.id,chain,title,url,amount,round(amount/quantity,2),quantity,material.base_unit,origin,observed_at,evidence);
  return price_id;
end;
$$;
revoke all on function public.save_verified_price(jsonb) from public,anon,authenticated;
grant execute on function public.save_verified_price(jsonb) to service_role;
comment on table public.verified_store_prices is 'Verified German retail gross package prices; chain-wide online price is not a branch stock or local price guarantee.';
comment on function public.save_verified_price(jsonb) is 'Atomic validated price/cache/history update. Call only after canonical product matching. A manual caller attests equivalence; no automatic promotion of legacy prices.';
notify pgrst, 'reload schema';
commit;
