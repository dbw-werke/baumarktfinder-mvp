export type ToomCacheRecord = Record<string, unknown>;
export type ToomCacheState = { version: 1; prices: ToomCacheRecord[]; history: ToomCacheRecord[]; failures: ToomCacheRecord[] };
export function toomProductId(value: unknown): string | null;
export function validToomRecord(row: unknown, now?: number): boolean;
export function readToomCache(file: string, seedRows?: ToomCacheRecord[]): Promise<ToomCacheState>;
export function createToomCache(options: { file: string; seedRows?: ToomCacheRecord[] }): {
  load(): Promise<ToomCacheState>;
  merge(rows: ToomCacheRecord[]): Promise<void>;
  save(row: ToomCacheRecord): Promise<boolean>;
  failure(report: ToomCacheRecord): Promise<void>;
};
