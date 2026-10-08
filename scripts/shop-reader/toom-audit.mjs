/** Acceptance orchestration only: pricing, matching and persistence stay in the existing updater. */
import { rankCanonicalVariants } from './product-alternatives.mjs';
import { buildStandard, chooseNormalizedProduct, evaluateProductMatch, getProductRejectionReason } from './product-standardizer.mjs';
import { refreshToomProduct } from './toom-refresh.mjs';
import { toomProductId, validToomRecord } from './toom-cache.mjs';

function storedProduct(row) {
  return { name: row.product_name, url: row.product_url, price: row.price, currency: row.currency,
    priceBasis: 'package', priceSource: row.source === 'manual' ? 'manual-admin-verification' : 'retailer-product-state',
    retrievedAt: row.checked_at, observedSpecs: row.observed_specs || {}, soldIndividually: true,
    declaredUnitPrice: row.declared_unit_price, oldPrice: row.old_price, retrievalMethod: row.fetch_method };
}
function choose(products, choices) {
  for (const { material, distance } of choices) {
    const product = chooseNormalizedProduct(products, buildStandard(material));
    if (product) return { material, distance, product };
  }
  return null;
}
function retained(row, reason = null) {
  return { store: 'toom', material_id: row.material_id, product: row.product_name, product_url: row.product_url,
    old_active_price: row.price, new_active_price: row.price, old_price: row.old_price ?? null,
    unit_price: row.declared_unit_price ?? row.unit_price, unit: row.unit, package_quantity: row.package_quantity,
    checked_at: row.checked_at, fetch_method: row.fetch_method ?? row.source, price_changed: false,
    cache_updated: false, db_updated: false, failure_reason: reason, retained_verified_cache: true };
}

export async function runToomMvpAudit({ intents, catalog, resolveIntent, cache, reader, storage = null,
  recorded = null, log = () => {} }) {
  const report = { store: 'toom', started_at: new Date().toISOString(), input_mode: recorded ? 'recorded-official-observations' : 'live-reader',
    schema_error: null, frontend_status: 'pending', products: [] };
  if (storage) {
    try { await cache.merge(await storage.loadProducts()); }
    catch (error) { report.schema_error = error.message || 'supabase_load_failed'; }
  }
  const materials = catalog.map(entry => entry.material);
  const recordedProducts = (recorded?.results || []).flatMap(result => result.products || []);
  for (const intent of intents) {
    const resolved = resolveIntent(catalog, intent.input);
    const base = { query: intent.input, intent: intent.key, canonical_target: resolved?.material.name ?? null,
      preferred_material_id: resolved?.material.id ?? null, search_term: resolved?.searchTerm ?? intent.search_term,
      frontend: { status: 'pending', verified: false }, checked_this_run: false };
    if (!resolved) {
      const row = { ...base, store: 'toom', failure_reason: 'intent_not_resolved', cache_updated: false, db_updated: false };
      report.products.push(row); log(row); continue;
    }
    const choices = [{ material: resolved.material, distance: 0 }, ...rankCanonicalVariants(resolved.material, materials)];
    const state = await cache.load();
    const validStored = state.prices.filter(row => validToomRecord(row) && choices.some(choice => choice.material.id === row.material_id));
    const storedChoice = choices.flatMap(choice => {
      const row = validStored.find(value => value.material_id === choice.material.id);
      return row && chooseNormalizedProduct([storedProduct(row)], buildStandard(choice.material)) ? [{ ...choice, row }] : [];
    })[0];
    let candidates = [], result, actual, source;
    if (recorded) {
      candidates = recordedProducts;
      const selection = choose(candidates, choices);
      // A replay is not a new observation. It cannot replace a newer cached price
      // or remap an existing live SKU without confirming that URL has disappeared.
      const existing = selection && validStored.find(row => row.material_id === selection.material.id);
      if (storedChoice && (!selection || choices.findIndex(choice => choice.material.id === storedChoice.material.id)
        < choices.findIndex(choice => choice.material.id === selection.material.id))) {
        result = retained(storedChoice.row); actual = storedChoice.material; source = 'verified-cache';
      } else if (existing && (Date.parse(existing.checked_at) >= Date.parse(selection.product.retrievedAt)
        || toomProductId(existing.product_url) !== toomProductId(selection.product.url))) {
        result = retained(existing); actual = selection.material; source = 'verified-cache';
      } else if (selection) {
        actual = selection.material; source = 'recorded-official-observation';
        const replay = { products: candidates, method: selection.product.retrievalMethod || 'direct' };
        result = await refreshToomProduct({ material: actual, stored: existing, cache, storage,
          reader: { readProduct: async () => replay, search: async () => replay } });
      } else if (storedChoice) {
        result = retained(storedChoice.row); actual = storedChoice.material; source = 'verified-cache';
      } else result = { store: 'toom', failure_reason: 'no_valid_product_match', cache_updated: false, db_updated: false };
    } else if (storedChoice) {
      actual = storedChoice.material; source = 'live-exact-url';
      result = await refreshToomProduct({ material: actual, stored: storedChoice.row, reader, cache, storage });
      base.checked_this_run = true;
    } else {
      source = 'live-discovery'; base.checked_this_run = true;
      const response = await reader.search(resolved.searchTerm);
      candidates = response.products || [];
      const selection = choose(candidates, choices);
      if (selection) {
        actual = selection.material;
        result = await refreshToomProduct({ material: actual, cache, storage, reader: { search: async () => response } });
      } else result = { store: 'toom', failure_reason: response.reason || 'no_valid_product_match',
        retrieval_errors: response.errors || [], fetch_method: response.method, cache_updated: false, db_updated: false };
    }
    const preferredStandard = buildStandard(resolved.material);
    const row = { ...base, ...result, observation_source: source ?? null,
      actual_material_id: actual?.id ?? null, actual_canonical_slug: actual?.slug ?? null,
      actual_package: actual ? { quantity: actual.package_quantity, unit: actual.base_unit, specs: actual.specs } : null,
      candidate_count: candidates.length || result.candidates?.length || 0,
      candidate_diagnostics: candidates.map(product => {
        const match = evaluateProductMatch(product, preferredStandard);
        return { name: product.name, url: product.url, price: product.price, checked_at: product.retrievedAt,
          detected_family: match.detectedFamily, requested_family: match.requestedFamily,
          hard_exclusion: match.hardExclusion, match_score: match.score,
          preferred_rejection: getProductRejectionReason(product, preferredStandard),
          actual_rejection: actual ? getProductRejectionReason(product, buildStandard(actual)) : null };
      }),
    };
    const latest = actual && (await cache.load()).prices.find(value => value.material_id === actual.id);
    row.price_available = Boolean(latest && validToomRecord(latest));
    report.products.push(row); log(row);
  }
  report.completed_at = new Date().toISOString();
  report.total = report.products.length;
  report.prices_available = report.products.filter(row => row.price_available).length;
  report.checked_live = report.products.filter(row => row.checked_this_run).length;
  report.updated = report.products.filter(row => row.cache_updated).length;
  report.failed = report.products.filter(row => row.failure_reason).length;
  report.frontend_verified = 0;
  return report;
}
