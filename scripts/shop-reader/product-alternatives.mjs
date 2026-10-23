import { getVariantDistance } from "../../src/lib/productCompatibility.mjs";
import { getMaterialSearchTerms } from "../../src/lib/materialSearch.mjs";
import { buildStandard, chooseNormalizedProduct, getProductRejectionReason, evaluateProductMatch } from "./product-standardizer.mjs";

const MAX_AUTOMATIC_QUERIES = 4;

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
  // Scope this cache to one refresh. Different declared sizes often have the
  // same short search term; their specifications still get checked separately.
  const automaticResults = new Map(), directResults = new Map();
  async function collect(material, standard, query, options) {
    const attempt = { material_id: material.id, canonical_slug: material.slug, search_term: query, discovery: options.mappedUrl ? "mapping" : "automatic", reader_products_found: 0, products: [], rejection_reason: null };
    attempts.push(attempt);
    try {
      const result = await reader.searchShop(storeId, query, options);
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
      // Some adapters report access restrictions as data instead of throwing.
      // A synonym must never become a retry around a retailer's access policy.
      const blocked = result.errors?.find(error => ["blocked", "robots-disallowed", "robots-unavailable"].includes(error.code));
      if (blocked) throw Object.assign(new Error(blocked.code), { code: blocked.code });
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
      if (mappedUrl || urls.length) {
        const key = JSON.stringify([mappedUrl || null, [...new Set(urls)].sort()]);
        if (!directResults.has(key)) directResults.set(key, await collect(material, standard, standard.search, { mappedUrl, candidateUrls: urls }));
        const result = directResults.get(key);
        product = chooseNormalizedProduct(result.products, standard);
        // The reader already performed an automatic search when no supplied
        // URL yielded a product. Do not issue that same search a second time.
        if (result.discovery === "automatic") automaticResults.set(standard.search.toLocaleLowerCase("de"), result);
      }
      // Candidate URLs and stale mappings can return the wrong SKU. Continue
      // without those URLs, using short synonyms, rather than accepting them.
      for (const query of getMaterialSearchTerms(material)) {
        if (product) break;
        const key = query.toLocaleLowerCase("de");
        if (!automaticResults.has(key)) {
          if (automaticResults.size >= MAX_AUTOMATIC_QUERIES) continue;
          automaticResults.set(key, await collect(material, standard, query, {}));
        }
        product = chooseNormalizedProduct(automaticResults.get(key).products, standard);
      }
    }
    if (product) return { actualMaterial: material, preferredMaterialId: preferred.id, product,
      matchKind: exact ? "exact" : "alternative", distance, attempts, errors };
  }
  return { product: null, attempts, errors };
}
