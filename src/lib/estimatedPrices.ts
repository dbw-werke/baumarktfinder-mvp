import type { BaseUnit } from "../services/materialSuggestions";
import { getCatalogSnapshot } from "../services/catalogSnapshot";
import { validateStorePrice, type StorePrice } from "../services/prices";
import { CHAIN_IDS, isChainId } from "./stores";
import { getVariantDistance, selectChainOffer, type CanonicalMaterial } from "./productComparison";
import { hasComparableSpecification, productPurposeConflict } from "./productCompatibility.mjs";
import { preferPrice } from "./requestedProducts";

/** Comparison values are deliberately not StorePrice observations or retailer offers. */
export type EstimatedComparisonPrice = {
  kind: "estimate";
  material_id: string;
  store_id: string;
  price: number;
  unit_price: number;
  unit: BaseUnit;
  package_quantity: number;
  currency: "EUR";
  method: "median-unit-price-v1";
  basis: "exact-material" | "comparable-material";
  sources: Array<{
    material_id: string; store_id: string; product_name: string; product_url: string;
    price: number; unit_price: number; package_quantity: number; unit: BaseUnit;
    checked_at: string;
    /** Area correction for differently sized paper sheets; otherwise 1. */
    normalization_factor: number;
  }>;
};

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-8);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Only sheet-to-sheet abrasive estimates can be scaled by paper area. */
function normalizationFactor(target: CanonicalMaterial, source: CanonicalMaterial): number | null {
  if (target.product_family !== "schleifpapier" || target.id === source.id) return 1;
  if (target.specs.diameter_mm !== source.specs.diameter_mm) return null;
  const area = (material: CanonicalMaterial) => Number(material.specs.width_mm) * Number(material.specs.length_mm);
  const factor = area(target) / area(source);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}

/**
 * Latest validated observations, one vote per chain. No retailer markup, random
 * values, synthetic URLs or new verification dates. The bundled evidence also
 * works when the only nearby chain has no verified observations of its own.
 */
export function estimateComparisonPrice(target: CanonicalMaterial, offers: readonly StorePrice[],
  catalog: readonly CanonicalMaterial[], chainId: string): EstimatedComparisonPrice | null {
  if (!isChainId(chainId) || !hasComparableSpecification(target)) return null;
  const byId = new Map<string, CanonicalMaterial>();
  const duplicates = new Set<string>();
  for (const material of catalog) {
    if (byId.has(material.id)) duplicates.add(material.id);
    byId.set(material.id, material);
  }
  for (const id of duplicates) byId.delete(id);
  const canonical = byId.get(target.id);
  if (!canonical || canonical.canonical_version !== target.canonical_version || getVariantDistance(target, canonical) !== 0) return null;

  // Do not replace any actual offer supplied by the authoritative catalog loader.
  const realOffers = offers.filter(offer => offer && !("verified" in offer && offer.verified !== true)
    && !("kind" in offer && offer.kind === "estimate"));
  if (selectChainOffer(target, realOffers, catalog, chainId).price) return null;
  const latest = new Map<string, StorePrice>();
  for (const offer of [...getCatalogSnapshot(CHAIN_IDS), ...offers]) {
    if (!offer || ("verified" in offer && offer.verified !== true) || ("kind" in offer && offer.kind === "estimate")) continue;
    const material = byId.get(offer.material_id);
    if (!material || !hasComparableSpecification(material) || offer.unit !== target.base_unit
      || offer.unit !== material.base_unit || !close(offer.package_quantity, material.package_quantity)
      || productPurposeConflict(target, offer)) continue;
    const valid = validateStorePrice({ ...offer, verified: true }, material.id, CHAIN_IDS);
    if (!valid) continue;
    const key = `${valid.material_id}:${valid.store_id}`;
    const previous = latest.get(key);
    if (preferPrice(valid, previous) || (previous && valid.checked_at === previous.checked_at
      && valid.product_url.localeCompare(previous.product_url) < 0)) latest.set(key, valid);
  }
  type Candidate = { offer: StorePrice; distance: number; factor: number };
  const candidates: Candidate[] = [];
  for (const offer of latest.values()) {
    const material = byId.get(offer.material_id)!;
    let distance = getVariantDistance(target, material);
    // The verified selector already checks the legacy CD-hanger's actual profile
    // using its product evidence; this is not permission to mix other specs.
    if (distance === null && target.product_family === "direktabhaenger"
      && material.product_family === target.product_family
      && target.specs.profile === "cd60/27" && material.specs.profile === "cd"
      && selectChainOffer(target, [offer], catalog, offer.store_id).price) {
      distance = getVariantDistance(target, { ...material, specs: { ...material.specs, profile: "cd60/27" } });
    }
    const factor = normalizationFactor(target, material);
    if (distance !== null && factor !== null) candidates.push({ offer, distance, factor });
  }
  const exact = candidates.filter(({ offer }) => offer.material_id === target.id);
  const basis = exact.length ? "exact-material" : "comparable-material";
  const perChain = new Map<string, Candidate>();
  for (const candidate of (exact.length ? exact : candidates).sort((a, b) => a.distance - b.distance
    || a.offer.material_id.localeCompare(b.offer.material_id))) {
    if (!perChain.has(candidate.offer.store_id)) perChain.set(candidate.offer.store_id, candidate);
  }
  if (!perChain.size) return null;
  const selected = [...perChain.values()].sort((a, b) => a.offer.store_id.localeCompare(b.offer.store_id));
  // Use full precision during conversion; round only the final package price.
  const values = selected.map(({ offer, factor }) => offer.price / offer.package_quantity * factor).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const price = cents(median * target.package_quantity);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    kind: "estimate", material_id: target.id, store_id: chainId, price,
    unit_price: cents(price / target.package_quantity), unit: target.base_unit,
    package_quantity: target.package_quantity, currency: "EUR", method: "median-unit-price-v1", basis,
    sources: selected.map(({ offer, factor }) => ({ material_id: offer.material_id, store_id: offer.store_id,
      product_name: offer.product_name, product_url: offer.product_url, price: offer.price,
      unit_price: offer.price / offer.package_quantity, package_quantity: offer.package_quantity,
      unit: offer.unit, checked_at: offer.checked_at, normalization_factor: factor })),
  };
}
