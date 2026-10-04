import { getVariantDistance } from "../../src/lib/productCompatibility.mjs";
import { buildStandard, chooseNormalizedProduct, getProductRejectionReason, evaluateProductMatch } from "./product-standardizer.mjs";

/** Alternatives are complete canonical definitions, never rewritten preferred specifications. */
export function rankCanonicalVariants(preferred, catalog = []) {
  const seen = new Set([preferred.id]);
  return catalog.flatMap((material) => {
    if (!material?.id || seen.has(material.id) || !buildStandard(material)) return [];
    seen.add(material.id);
    const distance = getVariantDistance(preferred, material);
    return distance !== null ? [{ material, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.material.id.localeCompare(b.material.id));
}

/**
 * Refresh the exact preferred product first, then the closest declared valid size.
 * Every discovered product still passes the strict actual variant matcher and package-price check.
 * A blocked source throws immediately; no alternate URL/provider is used to bypass it.
 */
export async function findStoreProduct(preferred, { storeId, repository, reader, canonicalMaterials = [], candidateUrls = [], candidateUrlsByMaterial = {} }) {
  const choices = [{ material: preferred, distance: 0 }, ...rankCanonicalVariants(preferred, canonicalMaterials)];
  const products = [], errors = [], attempts = [];
  async function collect(material, standard, options) {
    const attempt = { material_id: material.id, canonical_slug: material.slug, discovery: options.mappedUrl ? "mapping" : "automatic", reader_products_found: 0, products: [], rejection_reason: null };
    attempts.push(attempt);
    try {
      const result = await reader.searchShop(storeId, standard.search, options);
      attempt.discovery = result.discovery || attempt.discovery;
      attempt.reader_products_found = result.products?.length || 0;
      attempt.products = (result.products || []).map((product) => {
        const match = evaluateProductMatch(product, buildStandard(preferred));
        const rejection = getProductRejectionReason(product, standard);
        return { store: storeId, name: product.name, url: product.url, price: product.price,
          price_basis: product.priceBasis ?? null, detected_family: match.detectedFamily, requested_family: match.requestedFamily,
          hard_exclusion: match.hardExclusion, requested_specs: match.requestedSpecs, observed_specs: match.observedSpecs,
          match_score: match.score, family_match_result: match.accepted ? "ACCEPT" : "REJECT",
          result: rejection ? "REJECT" : "ACCEPT", rejection_reason: rejection };
      });
      if (!attempt.reader_products_found) attempt.rejection_reason = result.errors?.map((error) => error.code).join(",") || "no-structured-product-offer";
      products.push(...(result.products || [])); errors.push(...(result.errors || []));
      return result;
    } catch (error) {
      attempt.rejection_reason = error.code || "collection-error";
      error.collectionAttempts = attempts;
      throw error;
    }
  }
  for (const { material, distance } of choices) {
    const standard = buildStandard(material);
    if (!standard) continue;
    const exact = material.id === preferred.id;
    const urls = exact ? candidateUrls : (candidateUrlsByMaterial[material.slug] || candidateUrlsByMaterial[material.id] || {})[storeId] || [];
    // Reuse observations from the same retailer, but validate against this actual variant.
    let product = chooseNormalizedProduct(products, standard);
    if (!product) {
      const mappedUrl = await repository.mapping(material.id, storeId);
      let result = await collect(material, standard, { mappedUrl, candidateUrls: urls });
      product = chooseNormalizedProduct(result.products, standard);
      // A changed mapped SKU cannot prevent discovery of an exact replacement.
      if (!product && mappedUrl && result.discovery === "mapping") {
        result = await collect(material, standard, { candidateUrls: urls });
        product = chooseNormalizedProduct(result.products, standard);
      }
    }
    if (product) return { actualMaterial: material, preferredMaterialId: preferred.id, product,
      matchKind: exact ? "exact" : "alternative", distance, attempts, errors };
  }
  return { product: null, attempts, errors };
}
