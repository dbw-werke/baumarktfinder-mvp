import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const materials = JSON.parse(readFileSync(new URL('./canonical-materials.json', import.meta.url), 'utf8'));
const literal = (value) => value === null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
const lines = ['-- Generated from canonical-materials.json. Canonical definitions only: NO prices or availability.', '-- Idempotent, additive: legacy records and all existing IDs are preserved.', 'begin;', `insert into public.stores(id,name,website,active) values\n('obi','OBI','https://www.obi.de',true),('bauhaus','BAUHAUS','https://www.bauhaus.info',true),('hornbach','HORNBACH','https://www.hornbach.de',true),('toom','toom','https://toom.de',true),('hagebau','hagebau','https://www.hagebau.de',true),('globus','Globus Baumarkt','https://www.globus-baumarkt.de',true),('hellweg','HELLWEG','https://www.hellweg.de',true)\non conflict(id) do nothing;`];
for (const material of materials) {
  const id = `(md5(${literal('baumarktfinder:' + material.slug)}))::uuid`;
  const columns = ['slug','name','suggestion_label','store_search_term','category','product_family','brand','base_unit','package_quantity','specs','canonical_version'];
  const values = columns.map(key=>key === 'specs' ? `${literal(JSON.stringify(material.specs))}::jsonb` : ['package_quantity','canonical_version'].includes(key) ? material[key] : literal(material[key]));
  lines.push(`insert into public.materials(id,${columns.join(',')},active,exact_product,match_rules)\nselect ${id},${values.join(',')},true,true,'{}'::jsonb\nwhere not exists(select 1 from public.materials where slug=${literal(material.slug)});`);
  for (const alias of material.aliases) {
    const normalized = alias.toLocaleLowerCase('de-DE').replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss').replace(/[^a-z0-9]+/g,' ').trim();
    lines.push(`insert into public.canonical_material_aliases(material_id,alias,normalized_alias) select id,${literal(alias)},${literal(normalized)} from public.materials where slug=${literal(material.slug)} and canonical_version>=1 on conflict(material_id,normalized_alias) do nothing;`);
  }
}
lines.push("notify pgrst, 'reload schema';", 'commit;', '');
writeFileSync(fileURLToPath(new URL('./seed.sql', import.meta.url)), lines.join('\n'));
console.log(`Generated seed.sql for ${materials.length} canonical materials without retailer prices.`);
