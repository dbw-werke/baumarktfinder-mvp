import { supabase } from "../lib/supabase";

export type MaterialSuggestion = {
  id: string;
  label: string;
  name: string;
  store_search_term: string;
};

type AliasRow = {
  material_id: string;
  alias: string;
};

type MaterialRow = {
  id: string;
  name: string;
  suggestion_label: string | null;
  store_search_term: string;
  active: boolean;
};

type CachedMaterial = {
  material: MaterialRow;
  aliases: string[];
};

/*
  Wird nur EINMAL aus Supabase geladen.
  Danach läuft die Vorschlagssuche lokal im Browser.
*/
let materialCache: CachedMaterial[] | null = null;

let loadingPromise: Promise<CachedMaterial[]> | null = null;

async function loadMaterialCache(): Promise<CachedMaterial[]> {
  // Schon geladen
  if (materialCache) {
    return materialCache;
  }

  // Wird gerade geladen
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const [aliasResult, materialResult] = await Promise.all([
      supabase
        .from("material_aliases")
        .select("material_id, alias"),

      supabase
        .from("materials")
        .select(
          "id, name, suggestion_label, store_search_term, active"
        )
        .eq("active", true),
    ]);

    if (aliasResult.error) {
      console.log(
        "Alias error:",
        aliasResult.error.message
      );

      return [];
    }

    if (materialResult.error) {
      console.log(
        "Material error:",
        materialResult.error.message
      );

      return [];
    }

    const aliasRows = (aliasResult.data ?? []) as AliasRow[];
    const materials = (materialResult.data ?? []) as MaterialRow[];

    const aliasesByMaterial = new Map<string, string[]>();

    for (const row of aliasRows) {
      const aliases =
        aliasesByMaterial.get(row.material_id) ?? [];

      aliases.push(row.alias.toLowerCase());

      aliasesByMaterial.set(
        row.material_id,
        aliases
      );
    }

    materialCache = materials.map((material) => ({
      material,
      aliases:
        aliasesByMaterial.get(material.id) ?? [],
    }));

    return materialCache;
  })();

  return loadingPromise;
}


/*
  Kann beim Laden der Seite gestartet werden,
  damit der User später nicht warten muss.
*/
export async function warmMaterialSuggestions() {
  try {
    await loadMaterialCache();
  } catch (error) {
    console.log(
      "Material cache konnte nicht vorgeladen werden:",
      error
    );
  }
}


export async function getMaterialSuggestions(
  input: string
): Promise<MaterialSuggestion[]> {
  const query = input.trim().toLowerCase();

  if (query.length < 1) {
    return [];
  }

  const cachedMaterials = await loadMaterialCache();

  const directMatches: MaterialSuggestion[] = [];

  for (const item of cachedMaterials) {
    const material = item.material;

    const canonicalLabel =
      material.suggestion_label ?? material.name;

    const labelMatches = canonicalLabel
      .toLowerCase()
      .startsWith(query);

    const nameMatches = material.name
      .toLowerCase()
      .startsWith(query);

    if (labelMatches || nameMatches) {
      directMatches.push({
        id: material.id,
        label: canonicalLabel,
        name: material.name,
        store_search_term: material.store_search_term,
      });
    }

    if (directMatches.length >= 8) {
      break;
    }
  }

  // Wenn normale Treffer da sind, nur diese anzeigen
  if (directMatches.length > 0) {
    return directMatches;
  }

  // Nur wenn nichts direkt passt, Aliase/Tippfehler prüfen
  const aliasMatches: MaterialSuggestion[] = [];

  for (const item of cachedMaterials) {
    const material = item.material;

    const matchesAlias = item.aliases.some((alias) =>
      alias.startsWith(query)
    );

    if (!matchesAlias) continue;

    aliasMatches.push({
      id: material.id,
      label: material.suggestion_label ?? material.name,
      name: material.name,
      store_search_term: material.store_search_term,
    });

    if (aliasMatches.length >= 8) {
      break;
    }
  }

  return aliasMatches;
}