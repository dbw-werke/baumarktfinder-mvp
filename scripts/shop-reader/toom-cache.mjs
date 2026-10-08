import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function toomProductId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["toom.de", "www.toom.de"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) return null;
    return url.pathname.match(/^\/p\/[^/]+\/(\d+)\/?$/)?.[1] || null;
  } catch { return null; }
}
export function validToomRecord(row, now = Date.now()) {
  if (!row || row.store_id !== "toom" || row.verified !== true || row.currency !== "EUR" || row.price_scope !== "chain") return false;
  if (typeof row.material_id !== "string" || !row.material_id.trim() || typeof row.product_name !== "string" || !row.product_name.trim() || !toomProductId(row.product_url)) return false;
  if (!["automatic", "manual"].includes(row.source) || !["kg", "l", "m", "m2", "piece"].includes(row.unit)) return false;
  if (!Number.isFinite(row.price) || row.price <= 0 || row.price > 100000 || Math.abs(row.price * 100 - Math.round(row.price * 100)) > 0.000001) return false;
  if (!Number.isFinite(row.package_quantity) || row.package_quantity <= 0 || typeof row.checked_at !== "string" || !Number.isFinite(Date.parse(row.checked_at)) || Date.parse(row.checked_at) > now + 300000) return false;
  if (row.unit_price != null && (!Number.isFinite(row.unit_price) || Math.abs(row.unit_price - Math.round(row.price / row.package_quantity * 100) / 100) > 0.011)) return false;
  if (row.old_price != null && (!Number.isFinite(row.old_price) || row.old_price <= row.price)) return false;
  return true;
}
const newest = (rows) => {
  const map = new Map();
  for (const row of rows) {
    if (!validToomRecord(row)) continue;
    const old = map.get(row.material_id);
    if (!old || Date.parse(row.checked_at) > Date.parse(old.checked_at)) map.set(row.material_id, structuredClone(row));
  }
  return [...map.values()];
};
const observationKey = (r) => `${r.material_id}:${r.product_url}:${r.checked_at}:${r.price}`;
function historyRows(rows) {
  return [...new Map(rows.filter(r => validToomRecord(r)).map(r => [observationKey(r), r])).values()];
}

/** Read-only, shared by the updater and web server; no retailer requests in this module. */
export async function readToomCache(file, seedRows = []) {
  let stored = { version: 1, prices: [], history: [], failures: [] };
  try {
    const data = await readFile(/* turbopackIgnore: true */ file, "utf8");
    if (data.length > 32_000_000) throw new Error("toom_cache_too_large");
    stored = JSON.parse(data);
    if (stored.version !== 1 || !Array.isArray(stored.prices) || !Array.isArray(stored.history) || !Array.isArray(stored.failures)) throw new Error("toom_cache_invalid");
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("toom_cache_unreadable", { cause: error });
  }
  return { version: 1, prices: newest([...stored.prices, ...seedRows]), history: historyRows(stored.history), failures: stored.failures };
}

/** Atomic local snapshot + append-only observations. A failed check never mutates a valid offer. */
export function createToomCache({ file, seedRows = [] }) {
  let state;
  const load = async () => state ??= await readToomCache(file, seedRows);
  async function write(next) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, file);
    state = next;
  }
  return {
    async load() { return structuredClone(await load()); },
    async merge(rows) {
      const previous = await load();
      await write({ ...previous, prices: newest([...previous.prices, ...rows]),
        history: historyRows([...previous.history, ...previous.prices.filter(old => rows.some(r => validToomRecord(r) && r.material_id === old.material_id && Date.parse(r.checked_at) > Date.parse(old.checked_at) && r.price !== old.price))]) });
    },
    async save(row) {
      if (!validToomRecord(row)) throw new Error("invalid_verified_toom_record");
      const previous = await load(), old = previous.prices.find(p => p.material_id === row.material_id);
      if (old && Date.parse(old.checked_at) >= Date.parse(row.checked_at)) return false;
      const changed = !old || old.price !== row.price || old.product_url !== row.product_url || old.old_price !== row.old_price;
      await write({ ...previous, prices: newest([...previous.prices, row]),
        history: historyRows([...previous.history, ...(changed ? [...(old ? [old] : []), row] : [])]) });
      return true;
    },
    async failure(report) {
      const previous = await load();
      await write({ ...previous, failures: [...previous.failures.filter(r => r.material_id !== report.material_id), report] });
    },
  };
}
