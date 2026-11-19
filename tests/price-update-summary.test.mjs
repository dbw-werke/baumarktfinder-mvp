import test from 'node:test';
import assert from 'node:assert/strict';
import { priceUpdateSummary } from '../scripts/price-update-summary.mjs';

test('summary exposes partial failures and unusual changes without leaking error payloads', () => {
  const summary = priceUpdateSummary({ verified: 1, products: [
    { price_changed: true, old_active_price: 5, new_active_price: 50 },
    { failure_reason: 'https://secret.test?token=private' },
    { failure_reason: 'blocked' },
  ] });
  assert.match(summary, /verified this run: 1/);
  assert.match(summary, /failures: 2/);
  assert.match(summary, /previous price\): 1/);
  assert.match(summary, /blocked: 1/);
  assert.doesNotMatch(summary, /secret|token|private/);
});

test('missing configuration is visible even when no retailer was contacted', () => {
  const summary = priceUpdateSummary({ verified: 0, materials: [], failure: { missing_environment: ['SUPABASE_SERVICE_ROLE_KEY'] } });
  assert.match(summary, /verified this run: 0/);
  assert.match(summary, /configuration\/database failure/);
  assert.match(summary, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('daily summary counts rejected observations and transport errors without treating absent products as failures', () => {
  const summary = priceUpdateSummary({ verified: 1, materials: [{ stores: [
    { status: 'saved', saved_to_supabase: true },
    { status: 'invalid-observation', rejection_reason: 'invalid-observation-time' },
    { status: 'no-exact-verified-offer', errors: [{ code: 'network-error' }, { code: 'network-error' }, { code: 'not-found' }] },
    { status: 'no-exact-verified-offer', errors: [{ code: 'not-found' }] },
    { status: 'no-exact-verified-offer', errors: [{ code: 'https://secret.test?token=private' }] },
    { status: 'save-failed' },
  ] }] });
  assert.match(summary, /failures: 4/);
  assert.match(summary, /database writes: 1/);
  assert.match(summary, /invalid-observation-time: 1/);
  assert.match(summary, /network-error: 1/);
  assert.match(summary, /save-failed: 1/);
  assert.doesNotMatch(summary, /not-found|secret|token|private/);
});
