import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { materials } from "../src/data/materials";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

function normalize(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log("Import startet...");

  const materialRows = materials.map((m: any) => ({
    id: m.id,
    slug: m.slug ?? null,
    name: m.name,
    store_search_term:
      m.storeSearchTerm ?? m.searchTerm ?? m.name,
    trade: m.trade ?? null,
    category: m.category ?? null,
    subcategory: m.subcategory ?? null,
    price_range: m.priceRange ?? null,
    active: m.active ?? true,
  }));

  const { error: materialError } = await supabase
    .from("materials")
    .upsert(materialRows, { onConflict: "id" });

  if (materialError) throw materialError;

  const materialIds = materials.map((m: any) => m.id);

  await supabase
    .from("material_aliases")
    .delete()
    .in("material_id", materialIds);

  const aliasRows = materials.flatMap((m: any) =>
    m.aliases.map((alias: string) => ({
      material_id: m.id,
      alias,
      normalized_alias: normalize(alias),
    }))
  );

  const { error: aliasError } = await supabase
    .from("material_aliases")
    .insert(aliasRows);

  if (aliasError) throw aliasError;

  console.log("Import erfolgreich.");
  console.log(`${materialRows.length} Materialien importiert.`);
  console.log(`${aliasRows.length} Aliase importiert.`);
}

run().catch(console.error);