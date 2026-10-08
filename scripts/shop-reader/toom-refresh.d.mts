import type { ToomCacheRecord, createToomCache } from "./toom-cache.mjs";
export type ToomRefreshReport = { store: string; started_at: string; completed_at: string; storage: string;
  schema_error: string | null; products: (Record<string, unknown> & { db_failure_reason?: string })[];
  refreshable: number; refreshable_after: number; checked: number; changed: number; failed: number; verified: number; db_updated: number };
export function runToomRefresh(options: {
  materials: Record<string, unknown>[]; cache: ReturnType<typeof createToomCache>;
  reader: { readProduct(url: string): Promise<unknown>; search(query: unknown): Promise<unknown> };
  storage?: { loadProducts(): Promise<ToomCacheRecord[]>; save(record: ToomCacheRecord): Promise<unknown> } | null;
  discover?: boolean; limit?: number; log?: (row: Record<string, unknown>) => void;
}): Promise<ToomRefreshReport>;
