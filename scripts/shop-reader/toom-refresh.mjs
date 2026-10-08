import { buildStandard, chooseNormalizedProduct, getProductRejectionReason } from "./product-standardizer.mjs";
import { toomProductId, validToomRecord } from "./toom-cache.mjs";

function select(result, material, stored) {
  const standard = buildStandard(material);
  const candidates = (result.products || []).filter(p => toomProductId(p.url));
  // A live mapped SKU cannot silently become another item through a redirect.
  const same = stored ? candidates.filter(p => toomProductId(p.url) === toomProductId(stored.product_url)) : candidates;
  const selected = chooseNormalizedProduct(same, standard);
  return { selected, candidates: candidates.map(p => ({ name: p.name, url: p.url, price: p.price,
    rejection_reason: stored && toomProductId(p.url) !== toomProductId(stored.product_url) ? "mapped_product_identity_changed" : getProductRejectionReason(p, standard) })) };
}
function recordFor(material, product, method) {
  return { material_id: material.id, canonical_slug: material.slug, canonical_version: material.canonical_version,
    canonical_specs: material.specs, store_id: "toom", product_name: product.name, product_url: product.url,
    price: product.price, package_quantity: product.packageQuantity, unit: product.unit,
    unit_price: Math.round(product.price / product.packageQuantity * 100) / 100,
    declared_unit_price: product.declaredUnitPrice ?? null, old_price: product.oldPrice ?? null,
    currency: "EUR", checked_at: product.retrievedAt, source: "automatic", price_scope: "chain", verified: true,
    fetch_method: method, availability: product.availability ?? null, observed_specs: product.matchEvidence.observed_specs,
    match_evidence: { ...product.matchEvidence, price_context: product.metadata ?? null } };
}
export async function refreshToomProduct({ material, stored, reader, cache, storage, now = () => new Date().toISOString() }) {
  const report = { store: "toom", material_id: material.id, material: material.name,
    product: stored?.product_name ?? null, product_url: stored?.product_url ?? null,
    old_active_price: stored?.price ?? null, new_active_price: stored?.price ?? null,
    old_price: stored?.old_price ?? null, unit_price: stored?.unit_price ?? null, unit: stored?.unit ?? material.base_unit,
    price_changed: false, fetch_method: null, checked_at: stored?.checked_at ?? null, attempted_at: now(),
    cache_updated: false, db_updated: false, failure_reason: null, replacement: false, discovery: !stored, candidates: [] };
  try {
    if (!buildStandard(material)) throw new Error("unsupported_canonical_material");
    let response = stored ? await reader.readProduct(stored.product_url) : await reader.search(material);
    report.fetch_method = response.method;
    report.direct_reason = response.directReason ?? null;
    report.retrieval_errors = response.errors ?? [];
    let match = select(response, material, stored);
    report.candidates.push(...match.candidates);
    if (!match.selected && stored && response.removed && !/blocked|captcha|robots/i.test(response.reason || "")) {
      report.dead_url = stored.product_url;
      response = await reader.search(material);
      report.retrieval_errors.push(...(response.errors || []));
      report.fetch_method = response.method;
      match = select(response, material);
      report.candidates.push(...match.candidates);
      report.replacement = Boolean(match.selected);
    }
    if (!match.selected) throw new Error(response.reason || (report.candidates.length ? "no_valid_product_match" : "no_products"));
    const record = recordFor(material, match.selected, match.selected.retrievalMethod || response.method);
    if (!validToomRecord(record)) throw new Error("invalid_verified_observation");
    if (stored && Date.parse(record.checked_at) <= Date.parse(stored.checked_at)) throw new Error("observation_not_newer");
    report.cache_updated = await cache.save(record);
    if (!report.cache_updated) throw new Error("newer_observation_already_saved");
    Object.assign(report, { product: record.product_name, product_url: record.product_url,
      new_active_price: record.price, old_price: record.old_price, unit_price: record.declared_unit_price ?? record.unit_price,
      unit: record.unit, checked_at: record.checked_at, package_quantity: record.package_quantity,
      fetch_method: record.fetch_method,
      price_changed: Boolean(stored && stored.price !== record.price) });
    if (storage) {
      try { await storage.save(record); report.db_updated = true; }
      catch (error) { report.db_failure_reason = error.message || error.code || "supabase_save_failed"; }
    }
  } catch (error) {
    report.failure_reason = error.code || error.message || "refresh_failed";
    await cache.failure(report);
  }
  return report;
}

export async function runToomRefresh({ materials, cache, reader, storage, discover = false, limit = Infinity, log = () => {} }) {
  const report = { store: "toom", started_at: new Date().toISOString(), storage: "local_cache", schema_error: null, products: [] };
  if (storage) {
    try { await cache.merge(await storage.loadProducts()); }
    catch (error) { report.schema_error = error.message || error.code || "supabase_load_failed"; }
  }
  const state = await cache.load();
  const byId = new Map(materials.map(m => [m.id, m]));
  const entries = state.prices.map(stored => ({ stored, material: byId.get(stored.material_id) }));
  report.refreshable = entries.length;
  // Discovery is explicit. The hourly default only revisits verified stored URLs.
  if (discover) for (const material of materials) if (!state.prices.some(p => p.material_id === material.id)) entries.push({ material });
  for (const entry of entries.slice(0, limit)) {
    let row;
    if (!entry.material) {
      row = { store: "toom", product: entry.stored.product_name, product_url: entry.stored.product_url,
        material_id: entry.stored.material_id, failure_reason: "canonical_definition_missing", cache_updated: false, db_updated: false, price_changed: false };
    } else row = await refreshToomProduct({ ...entry, reader, cache, storage });
    report.products.push(row); log(row);
  }
  report.checked = report.products.length;
  report.changed = report.products.filter(p => p.price_changed).length;
  report.failed = report.products.filter(p => p.failure_reason).length;
  report.verified = report.products.filter(p => p.cache_updated).length;
  report.db_updated = report.products.filter(p => p.db_updated).length;
  report.refreshable_after = (await cache.load()).prices.length;
  report.completed_at = new Date().toISOString();
  return report;
}
