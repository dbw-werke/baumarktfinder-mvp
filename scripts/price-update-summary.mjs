import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const code = value => /^[a-z0-9_-]{1,80}$/i.test(value || '') ? value : 'retrieval-or-storage-failure';
function failureReasons(row) {
  const reasons = [];
  if (row.failure_reason || row.db_failure_reason || row.error || row.status === 'save-failed')
    reasons.push(row.failure_reason || row.db_failure_reason || row.status);
  if (row.status === 'invalid-observation') reasons.push(row.rejection_reason || row.status);
  if (row.status === 'no-exact-verified-offer')
    reasons.push(...(row.errors || []).filter(error => error.code !== 'not-found').map(error => error.code));
  return [...new Set(reasons.map(code))];
}
export function priceUpdateSummary(report) {
  const rows = report.products || report.materials?.flatMap(material => material.stores) || [];
  const failures = rows.map(failureReasons).filter(reasons => reasons.length);
  const codes = new Map();
  for (const reasons of failures) {
    for (const reason of reasons) codes.set(reason, (codes.get(reason) || 0) + 1);
  }
  const changes = rows.filter(row => row.price_changed && row.old_active_price > 0
    && (row.new_active_price / row.old_active_price > 2 || row.new_active_price / row.old_active_price < .5));
  return [
    '## Verified price update',
    `- Checked: ${rows.length}; verified this run: ${count(report.verified)}; database writes: ${count(report.db_updated ?? rows.filter(row => row.saved_to_supabase).length)}.`,
    `- Retrieval/storage failures: ${failures.length}${report.failure || report.schema_error ? '; configuration/database failure also present' : ''}.`,
    `- Unusual price changes (>2× or <½ previous price): ${changes.length}; inspect the diagnostic artifact.`,
    ...(report.failure?.missing_environment || []).filter(name => /^[A-Z_]{1,80}$/.test(name)).map(name => `- Missing configuration: \`${name}\`.`),
    ...[...codes].map(([reason,total]) => `- ${reason}: ${total}.`),
    '- Failed checks retain the previous price and its original checked_at. A dry run does not publish prices.',
    '- Detailed per-product/per-retailer outcomes are in the retained diagnostic artifact.',
    '',
  ].join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const summary = priceUpdateSummary(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  else console.log(summary);
}
