import { supabase } from "../lib/supabase";
import { isChainId, type ChainId } from "../lib/stores";
import { validateStorePrice, type StorePrice } from "./prices";
import { getCatalogSnapshot } from "./catalogSnapshot";

export type StoreCatalogResult = { offers: StorePrice[]; error: string | null };
export type GroupedCatalogOffers = Map<ChainId, Map<string, StorePrice>>;

const PAGE_SIZE = 250;
const MAX_ROWS = 2000;
const COLUMNS = "material_id,store_id,product_name,product_url,price,unit_price,unit,package_quantity,currency,checked_at,source,price_scope,availability,verified";

/** Groups already validated offers by chain AND canonical material; never by product title. */
export function groupCatalogOffers(offers: readonly StorePrice[]): GroupedCatalogOffers {
  const grouped: GroupedCatalogOffers = new Map();
  for (const offer of offers) {
    if (!offer || !isChainId(offer.store_id) || typeof offer.material_id !== "string" || !offer.material_id.trim()) continue;
    // StorePrice is the verified loader's output type and intentionally has no raw `verified` flag.
    // Recheck values here, but reject an explicitly unverified raw row if a caller passes one.
    if ("verified" in offer && offer.verified !== true) continue;
    const valid = validateStorePrice({ ...offer, verified: true }, offer.material_id, [offer.store_id]);
    if (!valid) continue;
    const materials = grouped.get(offer.store_id) ?? new Map<string, StorePrice>();
    const previous = materials.get(offer.material_id);
    if (!previous || Date.parse(valid.checked_at) > Date.parse(previous.checked_at)) materials.set(offer.material_id, valid);
    grouped.set(offer.store_id, materials);
  }
  return grouped;
}

function flatten(grouped: GroupedCatalogOffers): StorePrice[] {
  return [...grouped.values()].flatMap((materials) => [...materials.values()]);
}

export function mergeCatalogSources(chains: ChainId[], databaseOffers: StorePrice[], localOffers: readonly StorePrice[], message: string | null): StoreCatalogResult {
  // Both sources are verified observations. Chain + actual material ID is the key;
  // newest checked_at wins, with the database taking priority on identical timestamps.
  const offers = flatten(groupCatalogOffers([...databaseOffers, ...localOffers.filter((offer) => chains.includes(offer.store_id as ChainId))])).slice(0, MAX_ROWS);
  const usedSnapshot = offers.some((offer) => !databaseOffers.some((database) => database.material_id === offer.material_id && database.store_id === offer.store_id && database.checked_at === offer.checked_at));
  return { offers, error: message && usedSnapshot
    ? `${message} Zuvor geprüfte, gespeicherte Preisbeobachtungen ergänzen den Katalog; das ursprüngliche Prüfdatum bleibt sichtbar.`
    : message };
}

/** Read only the verified cache for nearby chains. The optional client supports isolated tests. */
export async function fetchStoreCatalog(storeIds: string[], client = supabase, localOffers?: readonly StorePrice[]): Promise<StoreCatalogResult> {
  const chains = [...new Set(storeIds)].filter(isChainId);
  if (!chains.length) return { offers: [], error: null };
  const saved = localOffers ?? getCatalogSnapshot(chains);
  if (!client) return mergeCatalogSources(chains, [], saved, "Der Produktkatalog ist noch nicht mit der Preisdatenbank verbunden.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const offers: StorePrice[] = [];
  const result = (error: string | null): StoreCatalogResult => mergeCatalogSources(chains, offers, saved, error);
  try {
    // A final one-row probe distinguishes a full 2000-row catalogue from an actual truncation.
    for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
      const end = offset === MAX_ROWS ? MAX_ROWS : Math.min(offset + PAGE_SIZE, MAX_ROWS) - 1;
      const page = await client.from("verified_store_prices").select(COLUMNS)
        .in("store_id", chains).eq("verified", true)
        .order("material_id").order("store_id").range(offset, end).abortSignal(controller.signal);
      if (page.error) throw page.error;
      const rows = page.data ?? [];
      if (!Array.isArray(rows) || rows.length > end - offset + 1) throw new Error("Invalid catalogue page");
      if (offset === MAX_ROWS) {
        return result(rows.length ? "Der Katalog zeigt die ersten 2.000 Einträge. Weitere Produkte sind vorhanden." : null);
      }
      for (const row of rows) {
        if (!row || typeof row.material_id !== "string" || !row.material_id.trim()) continue;
        const offer = validateStorePrice(row, row.material_id, chains);
        if (offer) offers.push(offer);
      }
      if (rows.length < PAGE_SIZE) return result(null);
    }
    return result(null);
  } catch {
    return mergeCatalogSources(chains, offers, saved, offers.length
      ? "Der Produktkatalog konnte nur teilweise geladen werden. Bereits geprüfte Angebote bleiben sichtbar."
      : "Der Produktkatalog konnte nicht geladen werden. Die gefundenen Märkte bleiben verfügbar.");
  } finally { clearTimeout(timeout); }
}
