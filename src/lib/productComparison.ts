import definitions from "../../supabase/canonical-materials.json";
import snapshot from "../data/verified-catalog-snapshot.json";
import type { BaseUnit } from "../services/materialSuggestions";
import { validateStorePrice, type StorePrice } from "../services/prices";
import { getVariantDistance, hasComparableSpecification, productPurposeConflict } from "./productCompatibility.mjs";
import { isRequestedScreenshotPrice, preferPrice, requestedProduct } from "./requestedProducts";

export { getVariantDistance } from "./productCompatibility.mjs";

export type CanonicalMaterial = {
  slug?: string;
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
  specificationWarning?: string;
  requestedProduct?: boolean;
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
  if (material.product_family === "schleifpapier" && diameter) {
    parts.push(`Ø ${number(diameter)} mm`);
  } else if (length) {
    const dimensions = diameter ? [diameter, length] : width ? [thickness ?? height, width, length].filter((value): value is number => value !== undefined) : [length];
    parts.push(`${dimensions.map(number).join(" × ")} mm`);
  }
  const unit = material.base_unit === "piece" ? "Stück" : material.base_unit === "m2" ? "m²" : material.base_unit;
  parts.push(material.base_unit === "l" && quantity < 1 ? `${number(quantity * 1000)} ml` : `${number(quantity)} ${unit}`);
  if (pieces > 1 && material.base_unit !== "piece") parts[parts.length - 1] += " gesamt";
  if (material.product_family === "dampfbremse") parts.push(numeric("sd_m") ? `sd ${number(numeric("sd_m")!)} m`
    : `sd ${number(numeric("sd_min_m")!)}–${number(numeric("sd_max_m")!)} m · feuchtevariabel`);
  if (Array.isArray(specs.grits)) parts.push(`K${specs.grits.join("/")}`);
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
      || productPurposeConflict(target, offer)
      || offer.unit !== material.base_unit || Math.abs(offer.package_quantity - material.package_quantity) > Math.max(1e-8, material.package_quantity * 1e-8)) continue;
    // StorePrice is an already verified service result; validate its transport fields again.
    const price = validateStorePrice({ ...offer, verified: true }, material.id, [chain]);
    if (!price) continue;
    const previous = latest.get(material.id);
    if (preferPrice(price, previous)
      || (previous && price.checked_at === previous.checked_at && price.product_url.localeCompare(previous.product_url) < 0)) latest.set(material.id, price);
  }
  const requested = requestedProduct(preferred.id, chain);
  const requestedPrice = requested && latest.get(requested.material_id);
  const requestedMaterial = requested && byId.get(requested.material_id);
  if (requested && requestedPrice && requestedMaterial && isRequestedScreenshotPrice(requestedPrice)
    && requestedMaterial.product_family === preferred.product_family) {
    return { price: requestedPrice, match: requestedMaterial.id === preferred.id ? "exact" : "alternative", requestedProduct: true,
      actualSpecification: formatMaterialSpecification(requestedMaterial), preferredSpecification,
      explanation: "Ausgewähltes Produkt", specificationWarning: requested.note || undefined };
  }
  const exact = latest.get(preferred.id);
  if (exact) return { price: exact, match: "exact", actualSpecification: formatMaterialSpecification(preferred), preferredSpecification, explanation: "Wunschgröße" };

  const alternatives = [...latest.values()].flatMap((price) => {
    const material = byId.get(price.material_id)!;
    // Legacy CD-hanger metadata omitted the section. The user's verified TOOM SKU
    // remains the same product when the hourly reader returns its shorter title.
    // Evidence: docs/evidence/profiles-bands-hangers-20261017.json (3153733).
    const verifiedToomHanger = chain === "toom" && material.specs.length_mm === 125 && material.package_quantity === 1
      && /\/p\/direktabhaenger-fuer-cd-profile\/3153733\/?$/.test(price.product_url)
      && /Direktabhänger für CD-Profile/i.test(price.product_name)
      && !/Nonius|\b(?:CW|UW|UD)\b|\bCD\s*(?!60\b)\d/i.test(price.product_name);
    const confirmedCdSection = preferred.product_family === "direktabhaenger" && material.product_family === "direktabhaenger"
      && preferred.specs.profile === "cd60/27" && material.specs.profile === "cd"
      && (/\bcd(?:[ -]?profil[e]?)?\s*60\s*(?:mm)?\s*\/\s*27\s*(?:mm)?\b/i.test(price.product_name) || verifiedToomHanger);
    const distance = getVariantDistance(preferred, confirmedCdSection ? { ...material, specs: { ...material.specs, profile: "cd60/27" } } : material);
    if (distance !== null) return [{ price, material, distance, specificationWarning: preferred.product_family === "dampfbremse"
      && preferred.specs.sd_m && material.specs.sd_min_m ? "Feuchtevariable Alternative · Eignung für den Aufbau prüfen" : undefined as string | undefined }];
    // Explicit user-selected screenshot alternatives only; insulation matching otherwise stays strict.
    const referenceTarget = preferred.product_family === "mineralwolle" && preferred.specs.type === "glaswolle-klemmfilz"
      && preferred.specs.thickness_mm === 120 && preferred.specs.width_mm === 1200 && preferred.specs.thermal_conductivity === .035
      && material.specs.type === "glaswolle-klemmfilz" && material.specs.width_mm === 1200 && material.specs.pieces === 1 && price.source === "manual";
    const bauhausRoll = referenceTarget && chain === "bauhaus" && /\/p\/33169235\/?$/.test(price.product_url)
      && material.specs.thickness_mm === 100 && material.specs.length_mm === 5600 && material.package_quantity === 6.72 && material.specs.thermal_conductivity === .035;
    const hornbachRoll = referenceTarget && chain === "hornbach" && /\/12358612\/?$/.test(price.product_url)
      && material.specs.thickness_mm === 120 && material.specs.length_mm === 4800 && material.package_quantity === 5.76 && material.specs.thermal_conductivity === .034;
    return bauhausRoll || hornbachRoll ? [{ price, material, distance: 10, specificationWarning: bauhausRoll
      ? "100 mm statt 120 mm · abweichende Dämmstärke" : "WLG 034 · 5,76 m² pro Rolle" }] : [];
  }).sort((left, right) => left.distance - right.distance || left.price.unit_price - right.price.unit_price
    || Date.parse(right.price.checked_at) - Date.parse(left.price.checked_at) || left.material.id.localeCompare(right.material.id));
  const alternative = alternatives[0];
  return alternative ? { price: alternative.price, match: "alternative", actualSpecification: formatMaterialSpecification(alternative.material), preferredSpecification,
    explanation: "Alternative Größe – kein geprüftes Angebot der Wunschgröße", specificationWarning: alternative.specificationWarning } : unavailable;
}
