import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { getCanonicalComparisonCatalog } from "../src/lib/productComparison";
import { getCatalogSnapshot } from "../src/services/catalogSnapshot";
import { CHAIN_IDS, CHAINS, routeFallback } from "../src/lib/stores";

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
  const materials = getCanonicalComparisonCatalog().map(material => ({ ...material, material, label: material.name }));
  const requests: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
  const harness = { materials, offers: getCatalogSnapshot(CHAIN_IDS), catalogCalls: 0,
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
          if (args.path === "catalog") return { resolveDir: resolve("."), contents: "export const fetchStoreCatalog=async()=>{globalThis.__finderHarness.catalogCalls++;return {offers:globalThis.__finderHarness.offers,error:null}};" };
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
    const complete = async (index: number) => act(async () => { requests[index].resolve({ origin, stores, warnings: [] }); });
    const names = () => [...dom.window.document.querySelectorAll(".productName")].map(node => node.textContent).join(" ");
    const loading = () => {
      assert.equal(dom.window.document.querySelectorAll(".productOfferCard").length, 0, "old product/price cards disappear immediately");
      assert.equal(dom.window.document.querySelectorAll(".skeletonCard").length, 5);
      assert.match(dom.window.document.querySelector(".loadingResults")!.textContent!, /Baumärkte und Preise werden geladen/);
    };
    await input('[aria-label="Adresse"]', "Frankfurt"); await input("#material", "Acryl 310 ml"); await submit(); loading(); await complete(0);
    assert.match(names(), /Acryl/i); assert.equal(dom.window.document.querySelectorAll(".skeletonCard").length, 0);
    await input("#material", "Tiefengrund"); await submit(); loading(); await complete(1);
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
