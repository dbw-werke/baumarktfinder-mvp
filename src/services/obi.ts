import { validateObiOffer, type ObiSearchResult } from "../lib/obi-offer";
export async function fetchObiOffer(query: string, signal?: AbortSignal): Promise<ObiSearchResult> {
  try {
    const response = await fetch("/api/obi/search", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query}),
      signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(50_000)]) : AbortSignal.timeout(50_000)});
    if (!response.ok) throw new Error("obi-unavailable");
    const data = await response.json();
    return {offer:validateObiOffer(data.offer),normalizedQuery:typeof data.normalizedQuery === "string" ? data.normalizedQuery : query,
      cacheStatus:typeof data.cacheStatus === "string" ? data.cacheStatus : "unknown",warning:typeof data.warning === "string" ? data.warning : null};
  } catch { return {offer:null,normalizedQuery:query,cacheStatus:"unavailable",warning:"Die OBI-Suche ist momentan nicht erreichbar. Bereits geprüfte Katalogpreise bleiben verfügbar."}; }
}
