import definitions from "../../supabase/canonical-materials.json";
import snapshot from "../data/verified-catalog-snapshot.json";
import type { BaseUnit } from "../services/materialSuggestions";
import { validateStorePrice, type StorePrice } from "../services/prices";
import { getVariantDistance, hasComparableSpecification } from "./productCompatibility.mjs";

export { getVariantDistance } from "./productCompatibility.mjs";

export type CanonicalMaterial = {
  id: string;
  name: string;
  product_family: string;
  brand: string | null;
  base_unit: BaseUnit;
  package_quantity: number;
  specs: Record<string, unknown>;
  active?: boolean;
  canonical_version: number;
};
export type ChainOfferSelection = {
  price?: StorePrice;
  match: "exact" | "alternative" | "unavailable";
  actualSpecification: string | null;
  preferredSpecification: string;
  explanation: string;
};

/** Canonical definitions and their seed IDs only; this does not generate offers. */
export function getCanonicalComparisonCatalog(): CanonicalMaterial[] {
  const ids: Record<string, string> = snapshot.canonical_material_ids;
  return definitions.flatMap((definition) => {
    const id = ids[definition.slug];
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return [];
    return [{ ...definition, id, active: true, base_unit: definition.base_unit as BaseUnit }];
  });
}

const number = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 6, useGrouping: false });
export function formatMaterialSpecification(material: CanonicalMaterial): string {
  const quantity = material.package_quantity, specs = material.specs;
  const numeric = (key: string) => typeof specs[key] === "number" && Number.isFinite(specs[key]) && specs[key] > 0 ? specs[key] as number : undefined;
  const parts: string[] = [];
  const pieces = numeric("pieces") ?? 1;
  if (pieces > 1 && material.base_unit !== "piece") parts.push(`${number(pieces)} Stück`);
  const length = numeric("length_mm"), width = numeric("width_mm"), thickness = numeric("thickness_mm"), height = numeric("height_mm"), diameter = numeric("diameter_mm");
  if (length) {
    const dimensions = diameter ? [diameter, length] : width ? [thickness ?? height, width, length].filter((value): value is number => value !== undefined) : [length];
    parts.push(`${dimensions.map(number).join(" × ")} mm`);
  }
  const unit = material.base_unit === "piece" ? "Stück" : material.base_unit === "m2" ? "m²" : material.base_unit;
  parts.push(material.base_unit === "l" && quantity < 1 ? `${number(quantity * 1000)} ml` : `${number(quantity)} ${unit}`);
  if (pieces > 1 && material.base_unit !== "piece") parts[parts.length - 1] += " gesamt";
  return parts.join(" · ");
}

/**
 * Select independently for each nearby branch using its chain ID. Chain observations
 * are reusable across branches; they never establish stock at a physical branch.
 * Without chainId, callers must supply offers from one chain only.
 */
export function selectChainOffer(target: CanonicalMaterial, offers: readonly StorePrice[], catalogMeta: readonly CanonicalMaterial[], chainId?: string): ChainOfferSelection {
  const preferredSpecification = formatMaterialSpecification(target);
  const unavailable: ChainOfferSelection = { match: "unavailable", actualSpecification: null, preferredSpecification,
    explanation: "Kein geprüftes Angebot für diese Materialauswahl" };
  if (!hasComparableSpecification(target)) return unavailable;
  const chains = new Set(offers.map((offer) => offer.store_id));
  const chain = chainId ?? (chains.size === 1 ? [...chains][0] : undefined);
  if (!chain) return unavailable;

  const byId = new Map<string, CanonicalMaterial>();
  const duplicateIds = new Set<string>();
  for (const material of catalogMeta) {
    if (byId.has(material.id)) duplicateIds.add(material.id);
    byId.set(material.id, material);
  }
  for (const id of duplicateIds) byId.delete(id);
  const preferred = byId.get(target.id);
  if (!preferred || target.canonical_version !== preferred.canonical_version || getVariantDistance(target, preferred) !== 0) return unavailable;

  const latest = new Map<string, StorePrice>();
  for (const offer of offers) {
    const material = byId.get(offer.material_id);
    if (!material || !hasComparableSpecification(material) || offer.store_id !== chain
      || offer.unit !== material.base_unit || Math.abs(offer.package_quantity - material.package_quantity) > Math.max(1e-8, material.package_quantity * 1e-8)) continue;
    // StorePrice is an already verified service result; validate its transport fields again.
    const price = validateStorePrice({ ...offer, verified: true }, material.id, [chain]);
    if (!price) continue;
    const previous = latest.get(material.id);
    if (!previous || Date.parse(price.checked_at) > Date.parse(previous.checked_at)
      || (price.checked_at === previous.checked_at && price.product_url.localeCompare(previous.product_url) < 0)) latest.set(material.id, price);
  }
  const exact = latest.get(preferred.id);
  if (exact) return { price: exact, match: "exact", actualSpecification: formatMaterialSpecification(preferred), preferredSpecification, explanation: "Wunschgröße" };

  const alternatives = [...latest.values()].flatMap((price) => {
    const material = byId.get(price.material_id)!;
    const distance = getVariantDistance(preferred, material);
    return distance !== null ? [{ price, material, distance }] : [];
  }).sort((left, right) => left.distance - right.distance || left.price.unit_price - right.price.unit_price
    || Date.parse(right.price.checked_at) - Date.parse(left.price.checked_at) || left.material.id.localeCompare(right.material.id));
  const alternative = alternatives[0];
  return alternative ? { price: alternative.price, match: "alternative", actualSpecification: formatMaterialSpecification(alternative.material), preferredSpecification,
    explanation: "Alternative Größe – kein geprüftes Angebot der Wunschgröße" } : unavailable;
}
