import { supabase } from "../lib/supabase";
import definitions from "../../supabase/canonical-materials.json";
import snapshot from "../data/verified-catalog-snapshot.json";

export type BaseUnit = "kg" | "l" | "m" | "m2" | "piece";
export type MaterialSuggestion = {
  id: string;
  label: string;
  name: string;
  store_search_term: string;
  base_unit?: BaseUnit;
  package_quantity?: number;
  specs?: Record<string, unknown>;
};
export type MaterialRow = {
  id: string;
  slug: string;
  name: string;
  suggestion_label: string | null;
  store_search_term: string;
  active: boolean;
  canonical_version: number;
  base_unit: BaseUnit;
  package_quantity: number;
  specs: Record<string, unknown>;
  product_family: string;
  brand: string | null;
};
export type CachedMaterial = { material: MaterialRow; aliases: string[] };

const CACHE_TTL = 5 * 60_000;
const MAX_STALE = 24 * 60 * 60_000;

/** Authored definitions only; this fallback contains no product offers or prices. */
export function bundledMaterialCatalog(): CachedMaterial[] {
  const ids: Record<string, string> = snapshot.canonical_material_ids;
  return definitions.flatMap((definition) => {
    const id = ids[definition.slug];
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return [];
    return [{ material: { id, slug: definition.slug, name: definition.name, suggestion_label: definition.suggestion_label,
      store_search_term: definition.store_search_term, active: true, canonical_version: definition.canonical_version,
      base_unit: definition.base_unit as BaseUnit, package_quantity: definition.package_quantity,
      specs: definition.specs, product_family: definition.product_family, brand: definition.brand }, aliases: definition.aliases }];
  });
}

export function normalizeMaterialSearch(value: string): string {
  return value.toLocaleLowerCase("de-DE").replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/,/g, ".")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ").replace(/\b(cd|ud|cw|uw|tn|gk)(?=\d)/g, "$1 ")
    .replace(/(\d)(?=[a-z])/g, "$1 ").replace(/\s+/g, " ").trim();
}

// At most one edit, including a transposition, and never a fuzzy dimension match.
function oneEditApart(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1 || /\d/.test(left + right)) return false;
  let a = 0, b = 0, edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++edits > 1) return false;
    if (left[a] === right[b + 1] && left[a + 1] === right[b] && left.length === right.length) { a += 2; b += 2; }
    else if (left.length > right.length) a++;
    else if (right.length > left.length) b++;
    else { a++; b++; }
  }
  return edits + (a < left.length || b < right.length ? 1 : 0) <= 1;
}

export function searchMaterialCatalog(items: CachedMaterial[], input: string): MaterialSuggestion[] {
  const query = normalizeMaterialSearch(input).slice(0, 160);
  if (!query) return [];
  const queryTokens = query.split(" ");
  return items.filter(({ material }) => material.active && material.canonical_version >= 1)
    .map(({ material, aliases }) => {
      const candidates = [material.suggestion_label ?? material.name, material.name, material.store_search_term, ...aliases, ...aliases.map((alias) => `${alias} ${material.name}`)]
        .map(normalizeMaterialSearch);
      let score = 0;
      for (const candidate of candidates) {
        const words = candidate.split(" ");
        if (candidate === query) score = Math.max(score, 100);
        else if (candidate.startsWith(query) && (!/\d/.test(queryTokens.at(-1)!) || candidate[query.length] === " ")) score = Math.max(score, 90);
        else if (queryTokens.every((token) => words.some((word) => /\d/.test(token) ? word === token : word.startsWith(token)))) score = Math.max(score, 75);
        else if (queryTokens.every((token) => words.some((word) => word === token || (token.length >= 5 && oneEditApart(token, word))))) score = Math.max(score, 40);
      }
      return { material, score };
    }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.material.suggestion_label ?? a.material.name).localeCompare(b.material.suggestion_label ?? b.material.name, "de"))
    .slice(0, 10).map(({ material }) => ({
      id: material.id, label: material.suggestion_label ?? material.name, name: material.name,
      store_search_term: material.store_search_term, base_unit: material.base_unit,
      package_quantity: material.package_quantity, specs: material.specs,
    }));
}

/** A loader instance shares in-flight requests and backs off after database failures. */
export function createMaterialCatalogLoader(client = supabase, now: () => number = Date.now) {
  let cache: { items: CachedMaterial[]; loadedAt: number; retryAt: number; database: boolean } | null = null;
  let loadingPromise: Promise<CachedMaterial[]> | null = null;
  return async function load(): Promise<CachedMaterial[]> {
    if (cache && now() < cache.retryAt) return cache.items;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        if (!client) throw new Error("Missing material database");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const [materials, aliases] = await Promise.all([
            client.from("materials").select("id,slug,name,suggestion_label,store_search_term,active,canonical_version,base_unit,package_quantity,specs,product_family,brand")
              .eq("active", true).gte("canonical_version", 1).order("name").limit(1000).abortSignal(controller.signal),
            client.from("canonical_material_aliases").select("material_id,alias").limit(5000).abortSignal(controller.signal),
          ]);
          if (materials.error) throw new Error("Material database unavailable");
          // A healthy material query remains authoritative even when aliases alone are unavailable.
          const aliasesById = new Map<string, string[]>();
          for (const row of aliases.data ?? []) aliasesById.set(row.material_id, [...(aliasesById.get(row.material_id) ?? []), row.alias]);
          const items = (materials.data ?? []).filter((material) => material.active && material.canonical_version >= 1)
            .map((material) => ({ material: material as MaterialRow, aliases: aliasesById.get(material.id) ?? [] }));
          // Empty/inactive catalogues are a valid database decision, never a fallback trigger.
          cache = { items, loadedAt: now(), retryAt: now() + CACHE_TTL, database: true };
          return items;
        } finally { clearTimeout(timeout); }
      } catch {
        if (cache?.database && now() - cache.loadedAt < MAX_STALE) {
          cache.retryAt = now() + CACHE_TTL;
          return cache.items;
        }
        const items = bundledMaterialCatalog();
        cache = { items, loadedAt: now(), retryAt: now() + CACHE_TTL, database: false };
        return items;
      }
    })();
    try { return await loadingPromise; }
    finally { loadingPromise = null; }
  };
}

const loadMaterialCache = createMaterialCatalogLoader();

/** Shares the authoritative metadata and request cache with autocomplete. */
export const getMaterialCatalog = loadMaterialCache;

// Explicit starting specifications for broad material names; never prices.
const preferredSlugs = [
  "gipskarton-standard-12-5-1200-600-v1", "knauf-tiefengrund-5l-v1",
  "cd60-27-3000-v1", "knauf-rotband-30kg-v1", "knauf-uniflott-25kg-v1",
  "acryl-weiss-310ml-v1", "glaswolle-035-120-6m2-v1",
];
export function resolvePreferredMaterial(items: CachedMaterial[], input: string, selectedId?: string): MaterialRow | null {
  const active = items.filter(({ material }) => material.active && material.canonical_version >= 1);
  if (selectedId) return active.find(({ material }) => material.id === selectedId)?.material ?? null;
  const matches = searchMaterialCatalog(active, input);
  if (matches.length === 1) return active.find(({ material }) => material.id === matches[0].id)!.material;
  const query = normalizeMaterialSearch(input);
  const defaults = preferredSlugs.flatMap((slug) => {
    const definition = definitions.find((item) => item.slug === slug);
    if (!definition || !definition.aliases.some((alias) => normalizeMaterialSearch(alias) === query)) return [];
    const entry = active.find(({ material }) => material.slug === slug && matches.some((match) => match.id === material.id));
    return entry ? [entry.material] : [];
  });
  // Ambiguous types or an unknown requested size require an explicit choice.
  return defaults.length === 1 ? defaults[0] : null;
}

export async function warmMaterialSuggestions(): Promise<void> {
  await loadMaterialCache();
}

export async function getMaterialSuggestions(input: string): Promise<MaterialSuggestion[]> {
  if (!input.trim()) return [];
  return searchMaterialCatalog(await loadMaterialCache(), input);
}
