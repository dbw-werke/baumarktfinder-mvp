import intents from "../data/toom-material-intents.json";
import { bundledMaterialCatalog, normalizeMaterialSearch, resolvePreferredMaterial, type CachedMaterial, type MaterialRow } from "../services/materialSuggestions";

export type ToomMaterialIntent = { key: string; input: string; canonical_slug: string; search_term: string; aliases: string[] };
export type ResolvedToomMaterialIntent = { material: MaterialRow; searchTerm: string; definition: ToomMaterialIntent };
export const TOOM_MVP_INTENTS: readonly ToomMaterialIntent[] = intents;
export const MVP_MATERIAL_INTENTS = TOOM_MVP_INTENTS;

/** Share authored technical defaults between the price updater and simple customer searches. */
export function resolveToomMaterialIntent(items: CachedMaterial[], input: string, selectedId?: string): ResolvedToomMaterialIntent | null {
  const query = normalizeMaterialSearch(input);
  if (!query || selectedId) return null; // An explicit dropdown choice always stays authoritative.
  const definition = TOOM_MVP_INTENTS.find(intent => [intent.input, ...intent.aliases].some(alias => normalizeMaterialSearch(alias) === query));
  if (!definition) return null; // Never erase an unrecognized color, package size or technical requirement.
  const material = items.find(item => item.material.slug === definition.canonical_slug && item.material.active && item.material.canonical_version >= 1)?.material;
  return material ? { material, searchTerm: definition.search_term, definition } : null;
}

/** Local verified prices also need their authored metadata when an older database lacks new rows. */
export function withMvpMaterialMetadata(items: CachedMaterial[]): CachedMaterial[] {
  const ids = new Set(items.map(item => item.material.id));
  const slugs = new Set(items.map(item => item.material.slug));
  const defaults = new Set(TOOM_MVP_INTENTS.map(intent => intent.canonical_slug));
  const bundled = bundledMaterialCatalog();
  const families = new Set(bundled.filter(item => defaults.has(item.material.slug)).map(item => item.material.product_family));
  return [...items, ...bundled.filter(item => !ids.has(item.material.id) && !slugs.has(item.material.slug) && families.has(item.material.product_family))];
}

export function resolveMvpPreferredMaterial(items: CachedMaterial[], input: string, selectedId?: string): MaterialRow | null {
  return resolveToomMaterialIntent(items, input, selectedId)?.material ?? resolvePreferredMaterial(items, input, selectedId);
}

// Keep the existing updater imports compatible with the shared customer defaults.
export const withToomMaterialMetadata = withMvpMaterialMetadata;
export const resolveToomPreferredMaterial = resolveMvpPreferredMaterial;
