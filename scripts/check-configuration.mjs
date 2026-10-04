import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
let failed = false;
const requireDatabase = process.argv.includes("--database");
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"]) {
  const present = Boolean(process.env[key]?.trim());
  const maps = key === "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";
  console.log(`${key}: ${present ? "konfiguriert" : maps ? "FEHLT – für Google-Suche und Routen später ergänzen" : "optional, lokaler Katalog wird verwendet"}`);
  failed ||= !present && (maps || requireDatabase);
}
console.log(`SUPABASE_SERVICE_ROLE_KEY (nur Preis-Worker): ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "konfiguriert" : "nicht gesetzt"}`);
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    for (const table of ["materials", "canonical_material_aliases", "verified_store_prices"]) {
      let query = client.from(table).select(table === "materials" ? "id,canonical_version" : table === "verified_store_prices" ? "material_id,store_id" : "material_id", { count: "exact" }).limit(1);
      if (table === "materials") query = query.gte("canonical_version", 1).eq("active", true);
      const { count, error } = await query.abortSignal(AbortSignal.timeout(10000));
      if (error) { console.log(`${table}: nicht bereit (${error.code || "Anfrage fehlgeschlagen"}) – für zentralen Betrieb Migration und RLS prüfen. Lokaler Ersatzkatalog bleibt verfügbar.`); failed ||= requireDatabase; }
      else { console.log(`${table}: ${count ?? 0} öffentlich lesbare Datensätze`); if (table === "materials" && !count) failed ||= requireDatabase; }
    }
  } catch { console.log("Supabase konnte nicht erreicht werden; der lokale Ersatzkatalog bleibt verfügbar."); failed ||= requireDatabase; }
}
console.log("Google-API-Aktivierung und Domainfreigaben müssen zusätzlich im Browser geprüft werden.");
console.log("Optionale zentrale Datenbank als Pflicht prüfen: npm run check:config -- --database");
process.exitCode = failed ? 1 : 0;
