/** Read-only 21 × 7 coverage, using the same actual-package selector as the application. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCoverageAudit, safeAuditReportPath } from './audit-price-coverage.mjs';
import { buildStandard, chooseNormalizedProduct } from './shop-reader/product-standardizer.mjs';
import { selectObiOffer } from './shop-reader/obi-lookup.mjs';
import { readToomCache, validToomRecord } from './shop-reader/toom-cache.mjs';
import { bundledMaterialCatalog } from '../src/services/materialSuggestions.ts';
import { getCatalogSnapshot } from '../src/services/catalogSnapshot.ts';
import { validateStorePrice } from '../src/services/prices.ts';
import { TOOM_MVP_INTENTS } from '../src/lib/toomIntent.ts';
import { CHAIN_IDS, CHAINS } from '../src/lib/stores.ts';

const key = row => `${row.store_id}:${row.material_id}:${row.product_url}:${row.checked_at}`;
const readJson = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } };

/** Generic OBI cache is included only after BOTH its own proof validator and exact actual canonical matching. */
export function canonicalObiObservations(products, materials, now = Date.now()) {
  const newest = new Map(), rejected = [];
  for (const raw of products) {
    const checked = selectObiOffer(raw?.name || '', [raw], now);
    if (!checked.offer || !checked.product) { rejected.push({ product_url: raw?.url ?? null, reason: 'obi-observation-validation-failed' }); continue; }
    const product = checked.product, old = newest.get(product.url);
    if (!old || Date.parse(product.retrievedAt) > Date.parse(old.retrievedAt)) newest.set(product.url, product);
  }
  const offers = [], provenance = new Map();
  for (const material of materials) {
    const standard = buildStandard(material); if (!standard) continue;
    // The generic matcher uses the common retailer-state label. Keep the original
    // OBI extractor in evidence after its separate source/size/price checks passed.
    const candidates = [...newest.values()].map(product => ({ ...product, originalPriceSource: product.priceSource,
      priceSource: product.priceSource === 'obi-rendered-product' ? 'retailer-product-state' : product.priceSource }));
    const product = chooseNormalizedProduct(candidates, standard); if (!product) continue;
    const row = validateStorePrice({ material_id: material.id, store_id: 'obi', product_name: product.name, product_url: product.url,
      price: product.price, unit_price: Math.round(product.price / product.packageQuantity * 100) / 100,
      package_quantity: product.packageQuantity, unit: product.unit, currency: 'EUR', checked_at: product.retrievedAt,
      source: product.originalPriceSource === 'manual-admin-verification' ? 'manual' : 'automatic',
      verified: true, price_scope: 'chain', availability: product.availability ?? null }, material.id, ['obi'], now);
    if (!row) continue;
    offers.push(row); provenance.set(key(row), { origin: 'obi-verified-cache-canonical-match',
      method: product.retrievalMethod || (row.source === 'manual' ? 'manual' : 'structured-http'),
      extraction: product.originalPriceSource, match_evidence: product.matchEvidence });
  }
  return { offers, provenance, rejected };
}

export function buildMvpPriceMatrix({ materials, offers, provenance = new Map(), intents = TOOM_MVP_INTENTS,
  updateReports = [], now = Date.now() }) {
  const combined = { materials: updateReports.flatMap(report => report.materials || report.reports || []) };
  const audit = buildCoverageAudit({ materials, offers, materialSlugs: intents.map(intent => intent.canonical_slug), updateReport: combined, now });
  const cells = audit.rows.map(row => {
    const intent = intents.find(value => value.canonical_slug === row.requested_material_slug);
    const origin = row.product_url ? provenance.get(key({ store_id: row.chain_id, material_id: row.material_id,
      product_url: row.product_url, checked_at: row.checked_at })) : null;
    const toomAttempt = row.chain_id === 'toom' ? updateReports.flatMap(report => report.products || [])
      .find(value => value.query === intent.input || value.preferred_material_id === row.requested_material_id) : null;
    return { ...row, query: intent.input, intent: intent.key,
      status: row.package_price !== null ? 'verified_cached_offer' : 'missing_verified_offer',
      frontend_verified: false, frontend_status: 'not-tested-by-data-audit',
      method: origin?.method || (row.source === 'manual' ? 'manual' : row.source ? 'automatic-method-not-recorded' : null),
      data_origin: origin?.origin || (row.package_price !== null ? 'verified-catalog-snapshot' : null),
      evidence: origin?.match_evidence || null,
      failure_reason: row.package_price !== null ? null : toomAttempt?.failure_reason || row.no_offer_reason,
    };
  });
  return { ...audit, scope: 'Verified existing observations matched to all 21 MVP intents and seven chains. No retailer requests, database writes, timestamp refresh or frontend acceptance claim.',
    rows: cells, missing: cells.filter(row => row.package_price === null).map(row => ({ query: row.query, chain: row.chain_id, reason: row.failure_reason })) };
}

const escape = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
export function renderMvpPriceMatrix(report) {
  const price = value => value === null ? '—' : `${value.toFixed(2).replace('.', ',')} €`;
  const lines = ['# MVP-Preisabdeckung', '', `Stand: ${report.audited_at}. ${report.summary.exact + report.summary.alternative}/${report.summary.matrix_rows} Kombinationen mit geprüftem gespeichertem Preis.`,
    '', 'Dies ist eine Prüfung vorhandener Preisdaten. Abrufdatum bleibt unverändert; Frontend-Abnahme und aktuelle Filialverfügbarkeit werden damit nicht bestätigt.', '',
    '| Suche | ' + CHAIN_IDS.map(chain => CHAINS[chain].name).join(' | ') + ' |',
    '|---|' + CHAIN_IDS.map(() => '---').join('|') + '|'];
  for (const query of [...new Set(report.rows.map(row => row.query))]) {
    lines.push(`| ${escape(query)} | ${CHAIN_IDS.map(chain => {
      const cell = report.rows.find(row => row.query === query && row.chain_id === chain);
      return cell.package_price === null ? 'offen' : `${price(cell.package_price)}${cell.match === 'alternative' ? ' (andere Größe)' : ''}`;
    }).join(' | ')} |`);
  }
  lines.push('', '## Einzelbelege', '', '| Suche | Laden | Produkt / Link | Tatsächliches Paket | Paketpreis | Quelle / Methode | Geprüft am | Fehler bei fehlendem Preis |', '|---|---|---|---|---|---|---|---|');
  for (const row of report.rows) lines.push(`| ${escape(row.query)} | ${CHAINS[row.chain_id].name} | ${row.product_url ? `[${escape(row.product_name)}](${row.product_url})` : '—'} | ${escape(row.actual_specification)} | ${price(row.package_price)} | ${escape([row.source, row.method].filter(Boolean).join(' / '))} | ${escape(row.checked_at)} | ${escape(row.failure_reason)} |`);
  return lines.join('\n') + '\n';
}

export async function main(args = process.argv.slice(2)) {
  let reportFile = 'docs/evidence/mvp-price-matrix.json'; const reportInputs = [];
  for (let index = 0; index < args.length; index++) {
    const flag = args[index], value = args[++index];
    if (!['--report', '--update-report'].includes(flag) || !value || value.startsWith('--')) throw new Error('Usage: audit-mvp-price-matrix.mjs [--report file.json] [--update-report reader-report.json]');
    if (flag === '--report') reportFile = value; else reportInputs.push(value);
  }
  const materials = bundledMaterialCatalog().map(item => item.material), offers = getCatalogSnapshot(CHAIN_IDS), provenance = new Map();
  const cache = await readToomCache(resolve(process.env.TOOM_CACHE_PATH || 'work/toom-verified-cache.json'));
  for (const row of cache.prices) {
    const material = materials.find(value => value.id === row.material_id);
    if (!material || !validToomRecord(row)) continue;
    const product = chooseNormalizedProduct([{ name: row.product_name, url: row.product_url, price: row.price, currency: 'EUR',
      priceBasis: 'package', priceSource: 'retailer-product-state', observedSpecs: row.observed_specs || {}, soldIndividually: true,
      retrievedAt: row.checked_at, declaredUnitPrice: row.declared_unit_price }], buildStandard(material));
    const valid = product && validateStorePrice(row, material.id, ['toom']);
    if (valid) { offers.push(valid); provenance.set(key(valid), { origin: 'toom-hourly-cache', method: row.fetch_method || row.source }); }
  }
  const [obiCache, obiManual] = await Promise.all([
    readJson(resolve(process.env.OBI_CACHE_PATH || 'work/obi-query-cache.json'), { products: [] }),
    readJson('src/data/obi-verified-products.json', { products: [] }),
  ]);
  const obi = canonicalObiObservations([...(obiCache.products || []), ...(obiManual.products || [])], materials);
  offers.push(...obi.offers); for (const [id, proof] of obi.provenance) provenance.set(id, proof);
  const updateReports = await Promise.all(reportInputs.map(file => readJson(file, null)));
  const report = buildMvpPriceMatrix({ materials, offers, provenance, updateReports: updateReports.filter(Boolean) });
  report.obi_rejected_observations = obi.rejected;
  const target = safeAuditReportPath(reportFile, reportInputs);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile('docs/MVP-PREISABDECKUNG.md', renderMvpPriceMatrix(report), 'utf8');
  console.log(JSON.stringify({ report: reportFile, summary: report.summary, coverage_by_chain: report.coverage_by_chain }, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
