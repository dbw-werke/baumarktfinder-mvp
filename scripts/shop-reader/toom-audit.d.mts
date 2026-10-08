import type { CachedMaterial } from '../../src/services/materialSuggestions';
import type { ToomMaterialIntent, resolveToomMaterialIntent } from '../../src/lib/toomIntent';
import type { createToomCache, ToomCacheRecord } from './toom-cache.mjs';
export type ToomAuditRow = Record<string, unknown> & { price_available?: boolean; failure_reason?: string | null; cache_updated?: boolean; checked_this_run?: boolean };
export type ToomAuditReport = { store: string; started_at: string; completed_at: string; input_mode: string;
  schema_error: string | null; frontend_status: string; products: ToomAuditRow[]; total: number;
  prices_available: number; checked_live: number; updated: number; failed: number; frontend_verified: number };
export function runToomMvpAudit(options: {
  intents: ToomMaterialIntent[]; catalog: CachedMaterial[]; resolveIntent: typeof resolveToomMaterialIntent;
  cache: ReturnType<typeof createToomCache>;
  reader: { readProduct(url: string): Promise<unknown>; search(query: unknown): Promise<unknown> };
  storage?: { loadProducts(): Promise<ToomCacheRecord[]>; save(record: ToomCacheRecord): Promise<unknown> } | null;
  recorded?: { results: { query: string; products?: Record<string, unknown>[] }[] } | null;
  log?: (row: ToomAuditRow) => void;
}): Promise<ToomAuditReport>;
