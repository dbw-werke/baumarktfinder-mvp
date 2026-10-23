import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";

test("Google address suggestions load on use, preserve input and focus, and retain a usable error fallback", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div><button id="other">Other field</button>', { url: "http://localhost/", pretendToBeVisual: true });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const properties = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const requests: Array<(element: HTMLInputElement) => void> = [];
  const harness = { create: () => new Promise<HTMLInputElement>(resolve => requests.push(resolve)) };
  Object.defineProperty(globalThis, "__addressHarness", { value: harness, configurable: true });
  const directory = await mkdtemp(resolve("node_modules/.address-test-"));
  let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
  try {
    const compiled = await build({ entryPoints: [resolve("src/components/GoogleAddressInput.tsx")], bundle: true, write: false,
      format: "esm", platform: "node", jsx: "automatic", packages: "external", plugins: [{ name: "controlled-google-io", setup(plugin) {
        plugin.onResolve({ filter: /services\/maps$/ }, () => ({ path: "maps", namespace: "fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const createGoogleAddressWidget=()=>globalThis.__addressHarness.create(); export const resolveAddressPrediction=async()=>{throw new Error('unused');};" }));
      } }] });
    const file = join(directory, "address.mjs"); await writeFile(file, compiled.outputFiles[0].text);
    const Address = (await import(pathToFileURL(file).href)).default;
    const { createRoot } = await import("react-dom/client");
    root = createRoot(dom.window.document.getElementById("root")!);
    let ready = 0, failures = 0;
    const changes: string[] = [];
    const props = { value: "Frankfurt", disabled: false, onChange: (value: string) => changes.push(value),
      onSelect: () => {}, onError: () => failures++, onReady: () => ready++, onPendingChange: () => {} };
    const render = (key = "first") => act(async () => root!.render(<Address key={key} {...props} />));
    await render();
    assert.equal(requests.length, 0, "mounting the page must not contact Google");
    assert.match(dom.window.document.getElementById("address-provider")!.textContent!, /Google/);
    await act(async () => dom.window.document.getElementById("address")!.focus());
    assert.equal(requests.length, 1, "focusing the address field activates the provider");
    props.value = "Frankfurt am Main";
    await render();
    const widget = dom.window.document.createElement("input");
    await act(async () => requests[0](widget));
    assert.equal(widget.value, "Frankfurt am Main", "text changed during loading is retained");
    assert.equal(dom.window.document.activeElement, widget, "typing focus survives the async replacement");
    assert.equal(ready, 1);
    assert.equal(widget.getAttribute("aria-describedby"), "address-provider");
    widget.value = "Frankfurt Bornheim";
    await act(async () => widget.dispatchEvent(new dom.window.Event("input")));
    assert.equal(changes.at(-1), "Frankfurt Bornheim");
    props.value = "Frankfurt Bornheim";
    props.disabled = true;
    await render();
    assert.equal(widget.disabled, true);
    props.disabled = false;
    await render();
    await act(async () => widget.dispatchEvent(new dom.window.Event("gmp-error")));
    assert.equal(failures, 1);
    assert.equal(widget.isConnected, false);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>("#address")!.value, "Frankfurt Bornheim");
    await act(async () => dom.window.document.getElementById("address")!.focus());
    assert.equal(requests.length, 1, "a failed provider does not create an automatic reload loop");

    await render("second");
    await act(async () => dom.window.document.getElementById("address")!.focus());
    await act(async () => dom.window.document.getElementById("other")!.focus());
    const secondWidget = dom.window.document.createElement("input");
    await act(async () => requests[1](secondWidget));
    assert.equal(dom.window.document.activeElement?.id, "other", "loading completion never steals focus from another field");

    await render("unmounted");
    await act(async () => dom.window.document.getElementById("address")!.focus());
    await act(async () => root!.unmount()); root = undefined;
    const lateWidget = dom.window.document.createElement("input");
    await act(async () => requests[2](lateWidget));
    assert.equal(lateWidget.isConnected, false, "an abandoned request must not attach a widget after unmount");
  } finally {
    if (root) await act(async () => root!.unmount());
    await rm(directory, { recursive: true, force: true });
    dom.window.close();
    for (const key of [...Object.keys(properties), "__addressHarness"]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
