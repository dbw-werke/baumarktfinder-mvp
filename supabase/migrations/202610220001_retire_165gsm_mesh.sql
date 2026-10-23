-- Retire only the explicitly removed 165 g/m², 1 × 10 m comparison option.
-- Keep observations, aliases and history for auditing. Existing RLS policies hide
-- inactive materials, their aliases, mappings and verified prices from clients.
begin;

update public.store_products
set active = false
where material_id in (
  select id from public.materials
  where slug = 'armierungsgewebe-165-1000-10000-v1'
     or id = 'cebcf814-aecb-4a94-5319-d57b54761eea'::uuid
);

update public.materials
set active = false, updated_at = now()
where (slug = 'armierungsgewebe-165-1000-10000-v1'
       or id = 'cebcf814-aecb-4a94-5319-d57b54761eea'::uuid)
  and active is distinct from false;

notify pgrst, 'reload schema';
commit;
