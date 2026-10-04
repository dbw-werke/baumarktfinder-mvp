export type ObiLookupOptions = { seedProducts?: Record<string, unknown>[]; cacheFile?: string | null;
  reader?: {searchShop: (store: string, query: string, options?: {candidateUrls?: string[]}) => Promise<unknown>} | null; now?: () => number;
  freshMs?: number; retryMs?: number; logger?: (report: Record<string, unknown>) => void;
  loadProducts?: (() => Promise<Record<string, unknown>[]>) | null; saveProducts?: ((products: Record<string, unknown>[]) => Promise<void>) | null };
export function createObiLookup(options?: ObiLookupOptions): {lookup(query: string, options?: {force?: boolean}): Promise<{
  offer: unknown; normalizedQuery: string; cacheStatus: string; warning: string | null; diagnostics: Record<string, unknown>
}>};
export function selectObiOffer(query: string, products: Record<string, unknown>[], now?: number): {offer: unknown; product: unknown; candidates: unknown[]; intent: unknown};
