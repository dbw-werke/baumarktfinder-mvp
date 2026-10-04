import { isChainId, type ChainId } from "./stores";

const STORE_HOSTS: Record<ChainId, string> = {
  obi: "obi.de", hornbach: "hornbach.de", bauhaus: "bauhaus.info", toom: "toom.de", hagebau: "hagebau.de", globus: "globus-baumarkt.de", hellweg: "hellweg.de",
};

export function isSafeStoreUrl(storeId: string, value: string | null | undefined): boolean {
  if (!value || !isChainId(storeId)) return false;
  try {
    const url = new URL(value);
    const host = STORE_HOSTS[storeId];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && (url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function getStoreUrl(storeId: string, searchTerm: string): string {
  if (!isChainId(storeId)) throw new Error("Nicht unterstützte Baumarktkette.");
  if (!searchTerm.trim()) return `https://www.${STORE_HOSTS[storeId]}/`;
  const q = encodeURIComponent(searchTerm.trim().slice(0, 250));
  const urls: Record<ChainId, string> = {
    obi: `https://www.obi.de/search/${q}/`,
    hornbach: `https://www.hornbach.de/s/${q}/`,
    bauhaus: `https://www.bauhaus.info/search?q=${q}`,
    toom: `https://toom.de/s/${q}/`,
    hagebau: `https://www.hagebau.de/search/?q=${q}`,
    globus: `https://www.globus-baumarkt.de/search/result?query=${q}&type=search`,
    hellweg: `https://www.hellweg.de/search?search=${q}`,
  };
  return urls[storeId];
}
