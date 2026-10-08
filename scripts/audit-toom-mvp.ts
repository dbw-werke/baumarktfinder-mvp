import dotenv from 'dotenv';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundledMaterialCatalog } from '../src/services/materialSuggestions';
import { TOOM_MVP_INTENTS, resolveToomMaterialIntent } from '../src/lib/toomIntent';
import snapshot from '../src/data/verified-catalog-snapshot.json';
import manual from '../src/data/manual-prices.json';
import { filterCatalogSnapshot } from '../src/services/catalogSnapshot';
import { createToomCache } from './shop-reader/toom-cache.mjs';
import { createToomReader } from './shop-reader/toom-reader.mjs';
import { toomSupabaseStorage } from './shop-reader/toom-storage.mjs';
import { runToomMvpAudit } from './shop-reader/toom-audit.mjs';

export async function main(args = process.argv.slice(2)) {
  dotenv.config({ path: '.env.local', quiet: true });
  let reportPath = 'work/toom-mvp-audit.json', recordedFile = '', query = '';
  for (let index = 0; index < args.length; index++) {
    const key = args[index], value = args[++index];
    if (!['--report', '--recorded-candidates', '--query'].includes(key) || !value || value.startsWith('--')) throw new Error(`Invalid audit option ${key}`);
    if (key === '--report') reportPath = value;
    if (key === '--recorded-candidates') recordedFile = value;
    if (key === '--query') query = value;
  }
  const intents = TOOM_MVP_INTENTS.filter(intent => !query || new RegExp(query, 'i').test(`${intent.input} ${intent.aliases.join(' ')}`));
  if (!intents.length) throw new Error('No configured TOOM intent matched.');
  const recorded = recordedFile ? JSON.parse(await readFile(resolve(recordedFile), 'utf8')) : null;
  if (recorded && !Array.isArray(recorded.results)) throw new Error('Invalid recorded-candidate report.');
  const source = [...snapshot.prices, ...manual.prices];
  const seeds = [...filterCatalogSnapshot(snapshot, ['toom']), ...filterCatalogSnapshot(manual, ['toom'])].map(row => ({
    ...source.find(raw => raw.store_id === 'toom' && raw.product_url === row.product_url && raw.checked_at === row.checked_at), ...row, verified: true,
  }));
  const file = resolve(process.env.TOOM_CACHE_PATH || 'work/toom-verified-cache.json');
  await mkdir(dirname(file), { recursive: true });
  const lock = await open(`${file}.lock`, 'wx').catch(() => { throw new Error('Another TOOM updater holds the cache lock.'); });
  let reader: ReturnType<typeof createToomReader> | undefined;
  try {
    await lock.writeFile(String(process.pid));
    reader = createToomReader();
    let storage = null, configurationError: string | null = null;
    try { storage = toomSupabaseStorage(); } catch (error) { configurationError = error instanceof Error ? error.message : 'toom-database-configuration-missing'; }
    const report = await runToomMvpAudit({ intents, catalog: bundledMaterialCatalog(), resolveIntent: resolveToomMaterialIntent,
      cache: createToomCache({ file, seedRows: seeds }), reader, storage, recorded,
      log: row => console.log(JSON.stringify({ query: row.query, product: row.product, price: row.new_active_price,
        package: row.actual_package, cache_updated: row.cache_updated, failure: row.failure_reason, frontend: row.frontend })),
    });
    if (configurationError) report.schema_error = configurationError;
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ report: reportPath, materials: report.total, prices_available: report.prices_available,
      checked_live: report.checked_live, updated: report.updated, failed: report.failed, frontend: report.frontend_status }));
    if (report.failed || report.schema_error) process.exitCode = 2;
    return report;
  } finally {
    try { await reader?.close(); }
    finally { await lock.close(); await unlink(`${file}.lock`); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : 'toom-audit-failed'); process.exitCode = 1; });
}
