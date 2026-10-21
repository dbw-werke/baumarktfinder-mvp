import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { selectChainOffer } from "../src/lib/productComparison";
import { bundledMaterialCatalog } from "../src/services/materialSuggestions";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { CHAIN_IDS, CHAINS, routeFallback } from "../src/lib/stores";
import { fetchStoreCatalog } from "../src/services/catalog";
import { GET as getToomPrices } from "../src/app/api/toom/prices/route";
import { MVP_MATERIAL_INTENTS } from "../src/lib/toomIntent";
import { POST as getObiPrices } from "../src/app/api/obi/search/route";
import type { ObiSearchResult } from "../src/lib/obi-offer";
import type { StorePrice } from "../src/services/prices";

test("real Finder hides old cards, renders skeletons, and never commits an older search", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/", pretendToBeVisual: true });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const properties = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} } };
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.scrollBy = () => {};
  dom.window.requestAnimationFrame = () => 0;
  const origin = { address: "Synthetischer DOM-Teststandort", location: { lat: 50.12, lng: 8.68 }, countryCode: "DE" };
  const stores = CHAIN_IDS.map((id, index) => routeFallback({ id, placeId: `fixture-${id}`, name: `${CHAINS[id].name} Testfiliale`,
    address: "Synthetische Testadresse", location: { lat: 50.13 + index * .01, lng: 8.68 }, countryCode: "DE", airDistanceMeters: 1000 + index * 100, attributions: [] }));
  // The shortest air line is deliberately not the shortest available driving route.
  Object.assign(stores[0], { distanceMeters: 9000, distance: "9 km", durationSeconds: 900, duration: "15 Min.", routeStatus: "driving" });
  const materials = bundledMaterialCatalog();
  const requests: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  let pendingCatalog: Promise<unknown> | null = null;
  let pendingObi: Promise<unknown> | null = null;
  const harness = { materials, offers: getCatalogSnapshot(CHAIN_IDS), catalogCalls: 0,
    catalog: () => {
      harness.catalogCalls++;
      const request = fetchStoreCatalog([...CHAIN_IDS], null, undefined, async () => getToomPrices()).then(result => {
        harness.offers = result.offers;
        return { offers: result.offers, error: null };
      });
      pendingCatalog = request;
      return request;
    },
    obi: (() => Promise.resolve({offer:null,warning:null})) as (query:string,signal:AbortSignal)=>Promise<unknown>,
    nearby: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) };
  Object.defineProperty(globalThis, "__finderHarness", { value: harness, configurable: true });
  const directory = await mkdtemp(resolve("node_modules/.finder-test-"));
  let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
  try {
    const compiled = await build({ entryPoints: [resolve("src/components/Finder.tsx")], bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
      packages: "external", plugins: [{ name: "controlled-search-io", setup(plugin) {
        plugin.onResolve({ filter: /GoogleAddressInput$/ }, () => ({ path: "address", namespace: "fixture" }));
        plugin.onResolve({ filter: /next\/image$/ }, () => ({ path: "image", namespace: "fixture" }));
        plugin.onResolve({ filter: /services\/(nearby|catalog|materialSuggestions|obi)$/ }, args => args.importer.endsWith("Finder.tsx") ? { path: args.path.split("/").at(-1)!, namespace: "fixture" } : undefined);
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
          if (args.path === "address") return { resolveDir: resolve("."), loader: "jsx", contents: 'import React from "react"; export default function Address(p){return <label>Adresse<input aria-label="Adresse" value={p.value} onChange={e=>p.onChange(e.target.value)} /></label>}' };
          if (args.path === "image") return { resolveDir: resolve("."), loader: "jsx", contents: 'import React from "react"; export default function Image({unoptimized,priority,...p}){return <img {...p}/>}' };
          if (args.path === "nearby") return { resolveDir: resolve("."), contents: "export const discoverNearby=(...args)=>globalThis.__finderHarness.nearby(...args);" };
          if (args.path === "obi") return { resolveDir: resolve("."), contents: "export const fetchObiOffer=(...args)=>globalThis.__finderHarness.obi(...args);" };
          if (args.path === "catalog") return { resolveDir: resolve("."), contents: "export const fetchStoreCatalog=()=>globalThis.__finderHarness.catalog();" };
          return { resolveDir: resolve("."), contents: `import {searchMaterialCatalog} from "./src/services/materialSuggestions.ts"; export {resolvePreferredMaterial,searchMaterialCatalog} from "./src/services/materialSuggestions.ts"; export const getMaterialCatalog=async()=>globalThis.__finderHarness.materials; export const getMaterialSuggestions=async(q)=>searchMaterialCatalog(globalThis.__finderHarness.materials,q); export const warmMaterialSuggestions=async()=>{};` };
        });
      } }] });
    const file = join(directory, "finder.mjs"); await writeFile(file, compiled.outputFiles[0].text);
    const Finder = (await import(pathToFileURL(file).href)).default;
    const { createRoot } = await import("react-dom/client");
    root = createRoot(dom.window.document.getElementById("root")!);
    await act(async () => root!.render(<Finder />));
    const input = async (selector: string, value: string) => act(async () => {
      const element = dom.window.document.querySelector(selector) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const submit = async () => act(async () => { dom.window.document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const complete = async (index: number) => act(async () => {
      requests[index].resolve({ origin, stores, warnings: index === 0 ? ["Produktkatalog konnte nicht geladen werden: parser failed"] : [] });
      // Local API performs a real file read; let that response arrive while React's act scope is open.
      await new Promise(resolve => setTimeout(resolve, 0));
      await pendingCatalog;
      await pendingObi;
    });
    const names = () => [...dom.window.document.querySelectorAll(".productName")].map(node => node.textContent).join(" ");
    const loading = () => {
      assert.equal(dom.window.document.querySelectorAll(".productOfferCard").length, 0, "old product/price cards disappear immediately");
      assert.equal(dom.window.document.querySelectorAll(".skeletonCard").length, 5);
      assert.match(dom.window.document.querySelector(".loadingResults")!.textContent!, /Baumärkte und Preise werden geladen/);
    };
    await input('[aria-label="Adresse"]', "Frankfurt"); await input("#material", "Acryl 310 ml"); await submit(); loading(); await complete(0);
    assert.match(names(), /Acryl/i); assert.equal(dom.window.document.querySelectorAll(".skeletonCard").length, 0);
    assert.equal(dom.window.document.querySelector('h1')?.textContent, 'Baumarktpreise in deiner Nähe vergleichen');
    assert.equal(dom.window.document.querySelector('.nearestBadge')?.textContent, 'Nächste Filiale');
    assert.equal(dom.window.document.querySelector('.nearestBadge')?.closest('article')?.getAttribute('data-store-id'), `fixture-${stores[1].id}`, 'real route distance takes precedence over the nearer air line');
    assert.doesNotMatch(dom.window.document.body.textContent!, /Geringste Luftlinie|Produktkatalog konnte nicht geladen|parser failed/);
    await input("#material", "Tiefengrund");
    assert.equal(dom.window.document.querySelectorAll(".productOfferCard").length, 0, "typing a new material clears the old price before submit");
    await submit(); loading(); await complete(1);
    assert.match(names(), /Tiefengrund/i); assert.doesNotMatch(names(), /acryl/i);
    await input("#material", "Acryl 310 ml"); await submit(); loading();
    await input("#material", "Rotband 30 kg"); await submit(); loading();
    await complete(3); assert.match(names(), /Rotband/i);
    const html = dom.window.document.querySelector("#results")!.innerHTML;
    await complete(2); assert.equal(dom.window.document.querySelector("#results")!.innerHTML, html, "late Acryl response cannot replace Rotband");
    assert.equal(harness.catalogCalls, 3, "obsolete discovery never triggers a redundant catalog request");
    assert.equal(dom.window.document.querySelectorAll(".productOfferCard").length, 7);
    for (const link of dom.window.document.querySelectorAll<HTMLAnchorElement>(".offerButton")) assert.ok(link.href.startsWith("https://"));
    for (const link of dom.window.document.querySelectorAll<HTMLAnchorElement>(".routeButton")) assert.match(link.href, /google\.com\/maps\/dir/);
    const obiRequests: Array<{query:string;signal:AbortSignal;resolve:(value:unknown)=>void}> = [];
    harness.obi=(query,signal)=>new Promise(resolve=>obiRequests.push({query,signal,resolve}));
    stores.push({...stores[0],placeId:'fixture-obi-second',name:'OBI zweite Testfiliale'});
    await input('#material','Direktabhänger');await submit();await complete(4);loading();
    await input('#material','Fliesenkleber');await submit();await complete(5);loading();
    assert.equal(obiRequests[0].signal.aborted,true);
    const generic={store_id:'obi',product_name:'Test Flex-Fliesenkleber 25 kg',product_url:'https://www.obi.de/p/1000001/test-fliesenkleber',actual_size:'25 kg',price:12.99,unit_price:.5196,package_quantity:25,unit:'kg',source:'automatic',price_scope:'chain',currency:'EUR',checked_at:new Date().toISOString(),family:'tile-adhesive',match_score:123};
    await act(async()=>obiRequests[1].resolve({offer:generic,warning:null}));
    const obiCards=[...dom.window.document.querySelectorAll('.productOfferCard')].filter(card=>card.querySelector('img')?.alt==='OBI');
    assert.equal(obiCards.length,2);
    for(const card of obiCards) {
      assert.equal(card.querySelector('.productName')?.textContent,generic.product_name);
      assert.match(card.querySelector('.packagePrice')!.textContent!,/12,99/);
      assert.match(card.querySelector('.actualSpecification')!.textContent!,/25 kg/);
      assert.equal(card.querySelector<HTMLAnchorElement>('.offerButton')!.href,generic.product_url);
      assert.match(card.querySelector<HTMLAnchorElement>('.routeButton')!.href,/google\.com\/maps\/dir/);
    }
    assert.equal(dom.window.document.querySelectorAll('.comparisonGrid').length,1);
    assert.equal([...dom.window.document.querySelectorAll('.productName')].filter(n=>n.textContent===generic.product_name).length,2,'dynamic offer only belongs to OBI');
    const current=dom.window.document.querySelector('#results')!.innerHTML;
    await act(async()=>obiRequests[0].resolve({offer:{...generic,product_name:'Old hanger'},warning:null}));
    assert.equal(dom.window.document.querySelector('#results')!.innerHTML,current,'late OBI price cannot replace the latest query');
    const obiResults = new Map<string, ObiSearchResult>();
    harness.obi=query=>{
      pendingObi=getObiPrices(new Request('http://localhost/api/obi/search',{method:'POST',body:JSON.stringify({query})}))
        .then(async response=>{assert.equal(response.status,200);const result=await response.json() as ObiSearchResult;obiResults.set(query,result);return result;});
      return pendingObi;
    };
    const evidence: Record<string, unknown>[] = [];
    let requestIndex=6;
    for (const intent of MVP_MATERIAL_INTENTS) {
      await input('#material',intent.input);
      assert.equal(dom.window.document.querySelectorAll('.productOfferCard').length,0);
      await submit();loading();await complete(requestIndex++);
      const target=materials.find(item=>item.material.slug===intent.canonical_slug)!.material;
      const obi=obiResults.get(target.name);
      assert.ok(obi?.offer,`${intent.input}: actual OBI API returns a verified price`);
      assert.equal((dom.window.document.querySelector('#comparison-material') as HTMLSelectElement).value,target.id,intent.input);
      assert.equal(dom.window.document.querySelectorAll('.comparisonGrid').length,1);
      for (const store of stores) {
        const selection=selectChainOffer(target,harness.offers,materials.map(item=>item.material),store.id);
        if (['bauhaus','obi','globus'].includes(store.id)) assert.ok(selection.price, `${intent.input}: ${store.id} must have a verified comparable offer`);
        const expectedPrice: StorePrice | NonNullable<ObiSearchResult['offer']> | null | undefined = store.id==='obi' ? obi.offer : selection.price;
        const expectedPackage: string | null = store.id==='obi' ? obi.offer.actual_size : selection.actualSpecification;
        const card=dom.window.document.querySelector(`[data-store-id="${store.placeId}"]`)!;
        assert.ok(card,`${intent.input}: ${store.id} branch card`);
        if(expectedPrice) {
          assert.equal(card.querySelector('.productName')?.textContent,expectedPrice.product_name);
          assert.equal(card.querySelector('.packagePrice')?.textContent,new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(expectedPrice.price));
          assert.equal(card.querySelector('.actualSpecification')?.textContent,expectedPackage);
          assert.equal(card.querySelector<HTMLAnchorElement>('.offerButton')?.href,expectedPrice.product_url);
        } else assert.ok(card.querySelector('.missingPrice'),`${intent.input}: never fabricate missing ${store.id} price`);
        assert.match(card.querySelector<HTMLAnchorElement>('.routeButton')!.href,/google\.com\/maps\/dir/);
        evidence.push({input:intent.input,canonical_slug:intent.canonical_slug,store:store.id,rendered:Boolean(expectedPrice),
          product:expectedPrice?.product_name??null,package:expectedPackage,price:expectedPrice?.price??null,
          product_url:expectedPrice?.product_url??null,checked_at:expectedPrice?.checked_at??null});
      }
      if(intent.key==='uniflott') {
        const toom=dom.window.document.querySelector('[data-store-id="fixture-toom"]')!;
        assert.match(toom.querySelector('.productName')!.textContent!,/Uniflott/i);
        assert.match(toom.querySelector('.actualSpecification')!.textContent!,/25 kg/);
        assert.ok(toom.querySelector('.packagePrice'),'simple Uniflott displays the verified TOOM cache observation');
      }
    }
    for (const [query, price, productId, dimensions] of [
      ['CD Profil', '6,65', '20489120', '27 × 60 × 3000 mm · 3 m'],
      ['Feuchtraumplatte', '15,95', '13874329', '12,5 × 1250 × 2000 mm · 2,5 m²'],
      ['OSB', '15,14', '20121495', '18 × 675 × 2500 mm · 1,6875 m²'],
      ['OSB Platte', '15,14', '20121495', '18 × 675 × 2500 mm · 1,6875 m²'],
      ['OSB Verlegeplatte', '15,14', '20121495', '18 × 675 × 2500 mm · 1,6875 m²'],
    ]) {
      await input('#material',query); await submit(); loading(); await complete(requestIndex++);
      const card=dom.window.document.querySelector('[data-store-id="fixture-bauhaus"]')!;
      assert.ok(card, `${query}: BAUHAUS card rendered`);
      assert.ok(card.querySelector('.packagePrice')?.textContent?.includes(price), query);
      assert.equal(card.querySelector('.actualSpecification')?.textContent,dimensions,query);
      assert.ok(card.querySelector<HTMLAnchorElement>('.offerButton')?.href.endsWith(`/p/${productId}`),query);
    }
    for (const [query, expected] of [
      ['Uniflott Finish', [['toom', '17,99', '8 kg', '2356740']]],
      ['Perlfix', [['toom', '10,49', '25 kg', '3053281']]],
      ['Glaswolle', [['bauhaus', '44,00', '100 × 1200 × 5600 mm · 6,72 m²', '33169235'], ['hornbach', '48,38', '120 × 1200 × 4800 mm · 5,76 m²', '12358612']]],
      ['Randdämmstreifen', [['bauhaus', '25,50', '8 × 150 × 50000 mm · 50 m', '26668592'], ['hornbach', '28,45', '8 × 150 × 50000 mm · 50 m', '12501330']]],
      ['Sanitär-Silikon weiß, essigvernetzend, 310 ml', [['bauhaus', '7,85', '310 ml', '23413872'], ['toom', '9,99', '310 ml', '2360002']]],
      ['Soudal PU-Bauschaum 1K B2 Genius Gun beige, 750 ml', [['toom', '13,99', '750 ml', '2368047']]],
      ['Super Haftgrund', [['toom', '29,99', '5 l', '3351128'], ['obi', '29,99', '5 l', '2373454'], ['bauhaus', '26,95', '5 l', '13881776'], ['globus', '37,99', '10 l', '0779050060']]],
      ['Haftgrund', [['toom', '29,99', '5 l', '3351128'], ['obi', '29,99', '5 l', '2373454'], ['bauhaus', '26,95', '5 l', '13881776'], ['globus', '37,99', '10 l', '0779050060']]],
    ] as const) {
      await input('#material',query); await submit(); loading(); await complete(requestIndex++);
      for (const [store,price,pack,id] of expected) {
        const card=dom.window.document.querySelector(`[data-store-id="fixture-${store}"]`)!;
        assert.ok(card.querySelector('.packagePrice')?.textContent?.includes(price), `${query}/${store}: screenshot package total`);
        assert.equal(card.querySelector('.actualSpecification')?.textContent,pack,`${query}/${store}: actual package`);
        assert.ok(card.querySelector<HTMLAnchorElement>('.offerButton')?.href.includes(id), `${query}/${store}: exact product URL`);
        if(query.includes('Haftgrund')) assert.match(card.querySelector('.productName')!.textContent!, /MEM Super[- ]Haftgrund/);
        if(query==='Glaswolle') assert.match(card.textContent!, store==='bauhaus' ? /100 mm statt 120 mm/ : /WLG 034/);
        if(query.startsWith('Soudal')) {
          assert.match(card.querySelector('.productName')!.textContent!,/Genius Gun, champagner/);
          assert.doesNotMatch(card.textContent!,/Sika|300 ml/);
        }
      }
      const options=dom.window.document.querySelector('#comparison-material')!.textContent!;
      assert.doesNotMatch(options,/Haftgrund mit Quarzsand|VARIO Fugenspachtel, (?:5|8) kg/);
    }
    const filmCases = [
      ['PE Folie', [['bauhaus','44,95','50 m²','13862355'],['hornbach','29,95','50 m²','8582101'],
        ['obi','33,99','30 m²','1016732'],['toom','69,99','100 m²','8350160'],['globus','79,99','100 m²','0779600036']]],
      ['Baufolie', [['bauhaus','44,95','50 m²','13862355'],['hornbach','29,95','50 m²','8582101'],
        ['obi','33,99','30 m²','1016732'],['toom','69,99','100 m²','8350160'],['globus','79,99','100 m²','0779600036']]],
      ['Dampfbremse', [['bauhaus','149,25','75 m²','20678201'],['obi','149,25','75 m²','2472678'],
        ['toom','209,99','60 m²','3150288'],['hornbach','59,95','30 m²','6047598'],
        ['globus','69,99','25 m²','0779201398'],['hagebau','64,99','25 m²','anV1151865']]],
    ] as const;
    for(const [query,expected] of filmCases) {
      await input('#material',query);await submit();loading();await complete(requestIndex++);
      for(const [store,price,pack,id] of expected) {
        const card=dom.window.document.querySelector(`[data-store-id="fixture-${store}"]`)!;
        assert.ok(card.querySelector('.packagePrice')?.textContent?.includes(price),`${query}/${store}: full roll total`);
        assert.ok(card.querySelector('.actualSpecification')?.textContent?.includes(pack),`${query}/${store}: roll area`);
        assert.ok(card.querySelector<HTMLAnchorElement>('.offerButton')?.href.includes(id),`${query}/${store}: exact link`);
        if(query==='Dampfbremse' && ['toom','hornbach'].includes(store))assert.match(card.textContent!,/feuchtevariabel|Feuchtevariable/);
      }
    }
    await input('#material','VARIO'); await submit(); loading(); await complete(requestIndex++);
    const vario=materials.find(item=>item.material.slug==='rigips-vario-25kg-v1')!.material;
    assert.equal((dom.window.document.querySelector('#comparison-material') as HTMLSelectElement).value,vario.id);
    assert.doesNotMatch(names(),/VARIO[^,]*, (?:5|8) kg/);
    for (const [store, price] of [['bauhaus', '36,05'], ['obi', '29,99']]) {
      const card = dom.window.document.querySelector(`[data-store-id="fixture-${store}"]`)!;
      assert.ok(card.querySelector('.packagePrice')?.textContent?.includes(price));
      assert.match(card.querySelector('.actualSpecification')!.textContent!, /25 kg/);
    }
    stores.splice(stores.findIndex(store=>store.id==='toom'),1);
    await input('#material','Dämmung');await submit();await complete(requestIndex++);
    const insulation=materials.find(item=>item.material.slug==='steinwolle-sonorock-040-40-7-5m2-v1')!.material;
    assert.equal((dom.window.document.querySelector('#comparison-material') as HTMLSelectElement).value,insulation.id,'shared defaults work without a TOOM branch');
    await input('#material', 'Acryl'); await submit(); loading();
    const cancelledAddressRequest = requestIndex++;
    await input('[aria-label="Adresse"]', 'Hamburg');
    assert.equal(dom.window.document.querySelectorAll('.productOfferCard,.skeletonCard').length, 0, 'editing the address immediately clears old results and cancels loading');
    await complete(cancelledAddressRequest);
    assert.equal(dom.window.document.querySelectorAll('.productOfferCard').length, 0, 'an old address response must not restore old cards');
    if(process.env.FRONTEND_AUDIT_REPORT) await writeFile(resolve(process.env.FRONTEND_AUDIT_REPORT),JSON.stringify({
      checked_at:new Date().toISOString(),flow:'Actual Finder/components in JSDOM with real OBI/TOOM API and verified catalog; address/nearby services simulated. Not a live browser test.',
      queries:MVP_MATERIAL_INTENTS.length,observations:evidence,
    },null,2));
  } finally {
    if (root) await act(async () => root!.unmount());
    dom.window.close();
    for (const key of [...Object.keys(properties), "__finderHarness"]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key);
    }
    // Only this freshly-created test directory is removed.
    assert.ok(directory.startsWith(resolve("node_modules/.finder-test-")));
    await rm(directory, { recursive: true, force: true });
  }
});
