import intents from "../data/toom-material-intents.json";
import { getMaterialSearchTerms } from "./materialSearch.mjs";
import { bundledMaterialCatalog, withCorrectedProductMetadata, normalizeMaterialSearch, resolvePreferredMaterial, type CachedMaterial, type MaterialRow } from "../services/materialSuggestions";

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
  return material ? { material, searchTerm: getMaterialSearchTerms(material)[0], definition } : null;
}

/** Local verified prices also need their authored metadata when an older database lacks new rows. */
export function withMvpMaterialMetadata(items: CachedMaterial[]): CachedMaterial[] {
  items = withCorrectedProductMetadata(items);
  const ids = new Set(items.map(item => item.material.id));
  const slugs = new Set(items.map(item => item.material.slug));
  const defaults = new Set([...TOOM_MVP_INTENTS.map(intent => intent.canonical_slug), "osb3-18-2500-1250-v1",
    "ud28-27-3000-v1", "trennwandband-30-3-30000-v1", "dichtungsband-50-3-30000-v1", "nonius-unterteil-cd60-130-1-v1",
    "rigips-vario-25kg-v1", "mem-super-haftgrund-5l-v1", "knauf-uniflott-finish-8kg-v1",
    "dampfbremse-sd2-1500-50000-v1", "pe-folie-200-2000-50000-v1", "randdaemmstreifen-8-150-25000-v1",
    "sanitaer-silikon-acetat-weiss-310ml-v1"]);
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
