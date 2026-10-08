-- Additive extension of the existing canonical price model. Apply 202609220001 first.
-- Never copies legacy/unverified store_prices into the verified price layer.
begin;

alter table public.verified_store_prices add column if not exists old_price numeric(12,2);
alter table public.verified_store_prices add column if not exists fetch_method text;
alter table public.price_history add column if not exists old_price numeric(12,2);
alter table public.price_history add column if not exists fetch_method text;

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.verified_store_prices'::regclass and conname='verified_store_prices_old_price_check') then
    alter table public.verified_store_prices add constraint verified_store_prices_old_price_check
      check(old_price is null or (old_price > price and old_price <= 100000));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.price_history'::regclass and conname='price_history_old_price_check') then
    alter table public.price_history add constraint price_history_old_price_check
      check(old_price is null or (old_price > price and old_price <= 100000));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.verified_store_prices'::regclass and conname='verified_store_prices_fetch_method_check') then
    alter table public.verified_store_prices add constraint verified_store_prices_fetch_method_check
      check(fetch_method is null or fetch_method in ('direct','playwright','manual'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.price_history'::regclass and conname='price_history_fetch_method_check') then
    alter table public.price_history add constraint price_history_fetch_method_check
      check(fetch_method is null or fetch_method in ('direct','playwright','manual'));
  end if;
end $$;

-- Existing generic writers do not know these optional fields. Do not carry a sale
-- label into a newer observation when that writer cannot attest it.
create or replace function public.clear_previous_sale_metadata()
returns trigger language plpgsql set search_path = public,pg_temp as $$
begin
  if new.checked_at is distinct from old.checked_at then
    new.old_price := null;
    new.fetch_method := null;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_previous_sale_metadata on public.verified_store_prices;
create trigger clear_previous_sale_metadata before update on public.verified_store_prices
for each row execute function public.clear_previous_sale_metadata();

create or replace function public.refresh_verified_toom_price(payload jsonb)
returns uuid language plpgsql security definer set search_path = public,pg_temp as $$
declare
  requested_material_id uuid := (payload->>'material_id')::uuid;
  observed_at timestamptz := (payload->>'checked_at')::timestamptz;
  prior public.verified_store_prices%rowtype;
  previous_evidence jsonb;
  price_id uuid;
  crossed_out numeric := (payload->>'old_price')::numeric;
  method text := payload->>'fetch_method';
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  if payload->>'store_id' is distinct from 'toom' then raise exception 'This refresh only supports toom'; end if;
  if method is null or method not in ('direct','playwright','manual') then raise exception 'Invalid fetch method'; end if;
  if crossed_out is not null and (crossed_out::text = 'NaN' or crossed_out <= (payload->>'price')::numeric or crossed_out > 100000 or crossed_out <> round(crossed_out,2)) then
    raise exception 'Invalid old/crossed-out price';
  end if;
  -- Same lock as save_verified_price: one transaction owns mapping, current price and history.
  perform pg_advisory_xact_lock(hashtextextended(requested_material_id::text || ':toom',0));
  select * into prior from public.verified_store_prices p where p.material_id = requested_material_id and p.store_id = 'toom';
  if found and prior.checked_at >= observed_at then return prior.id; end if;
  if prior.id is not null then
    select match_evidence into previous_evidence from public.store_products where id = prior.store_product_id;
    -- Preserve pre-updater observations even when an older import did not create history.
    insert into public.price_history(store_product_id,material_id,store_id,product_name,product_url,price,unit_price,package_quantity,unit,currency,source,checked_at,match_evidence,old_price,fetch_method)
    select prior.store_product_id,prior.material_id,prior.store_id,prior.product_name,prior.product_url,prior.price,prior.unit_price,prior.package_quantity,prior.unit,prior.currency,prior.source,prior.checked_at,coalesce(previous_evidence,'{}'::jsonb),prior.old_price,prior.fetch_method
    where not exists(select 1 from public.price_history h where h.store_product_id=prior.store_product_id and h.checked_at=prior.checked_at and h.product_url=prior.product_url and h.price=prior.price);
  end if;
  -- Reuse canonical family/package, URL, timestamp, service-role and currency validation.
  price_id := public.save_verified_price(payload);
  update public.verified_store_prices set old_price=crossed_out,fetch_method=method where id=price_id;
  update public.price_history h set old_price=crossed_out,fetch_method=method
    where h.material_id=requested_material_id and h.store_id='toom' and h.checked_at=observed_at;
  return price_id;
end;
$$;
revoke all on function public.refresh_verified_toom_price(jsonb) from public,anon,authenticated;
grant execute on function public.refresh_verified_toom_price(jsonb) to service_role;
comment on function public.refresh_verified_toom_price(jsonb) is 'Atomic toom exact-URL refresh: retains previous observations, validates canonical mapping, records current/old prices separately, ignores duplicate/older updates.';
notify pgrst, 'reload schema';
commit;
