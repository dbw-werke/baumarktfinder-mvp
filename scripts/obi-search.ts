/** Run the same OBI pipeline outside customer requests; no other retailer is visited. */
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createObiLookup } from "./shop-reader/obi-lookup.mjs";
import { obiSeedProducts } from "../src/lib/obi-server";
import { createObiUpdaterReader } from "./shop-reader/obi-updater.mjs";
import { obiSupabaseStorage } from "./shop-reader/obi-storage.mjs";
import { config } from "dotenv";
config({path:".env.local",quiet:true});

const regressionQueries = ["Acryl","Armierungsgewebe","CD Profil 60/27","CW Profil 50","Direktabhänger","Feuchtraumplatte","Haftgrund","Perlfix","Rotband","Uniflott","PU-Schaum","Rigips","Gipskarton","Rollputz","Schleifpapier","Schnellbauschrauben","Silikon","Sockelputz","Dämmung","Mineralwolle","Tiefengrund","UW Profil","Zement","OSB","Fliesenkleber","Estrich","Spachtelmasse","Grundierung","Dämmplatte","Trockenbauschrauben","Farbe"];
async function main() {
const args = process.argv.slice(2), reportArg=args.find(arg=>arg.startsWith("--report="));
const fallbackQueries=["Direktabhänger","Armierungsgewebe","Acryl","Silikon","Zement","Sockelputz","PU-Schaum","Rotband","Rigips","Tiefengrund","Perlfix","CD Profil 60/27"];
const queries=args.includes("--regression") ? regressionQueries : args.includes("--fallback-regression") ? fallbackQueries : [args.filter(arg=>!arg.startsWith("--")).join(" ")];
if (!queries[0]) throw new Error("Suchbegriff oder --regression angeben.");
const reader=createObiUpdaterReader({browserOptions:{headless:process.env.OBI_BROWSER_HEADLESS!=="false",
  marketUrl:process.env.OBI_TEST_MARKET_URL || null,storageState:process.env.OBI_BROWSER_STORAGE_STATE || null}});
const service=createObiLookup({seedProducts:obiSeedProducts,reader,...obiSupabaseStorage(),cacheFile:resolve(process.env.OBI_CACHE_PATH || "work/obi-query-cache.json")});
const reports:Record<string,unknown>[]=[];
try {
for (const query of queries) {
  const result=await service.lookup(query,{force:args.includes("--refresh")});
  reports.push(result.diagnostics);
  console.log(JSON.stringify({query,product:result.offer,cache:result.cacheStatus,cacheUpdated:result.diagnostics.cacheUpdated,retrieval:result.diagnostics.retrieval,productsFound:result.diagnostics.productsFound,errors:result.diagnostics.errors}));
}
} finally {await reader.close();}
const report=resolve(reportArg?.slice(9) || "work/obi-search-last.json");
const allowedRoots=[resolve("work")+"/",resolve("docs/evidence")+"/"];
if (!allowedRoots.some(root=>report.replaceAll("\\","/").startsWith(root.replaceAll("\\","/"))) || !report.endsWith(".json")) throw new Error("Bericht nur als JSON unter work oder docs/evidence speichern.");
await mkdir(dirname(report),{recursive:true});
await writeFile(report,JSON.stringify({testedAt:new Date().toISOString(),queries:queries.length,reports},null,2)+"\n");
}
void main().catch(error=>{console.error(error instanceof Error ? error.message : "OBI-Prüfung fehlgeschlagen");process.exitCode=1;});
