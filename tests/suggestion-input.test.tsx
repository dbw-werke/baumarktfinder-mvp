import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";

test("material suggestions retain catalog identities and support highlighted keyboard, mouse and touch selection", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div><button id="outside">Other field</button>', { url: "http://localhost/", pretendToBeVisual: true });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const properties = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const scrolled: string[] = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  const directory = await mkdtemp(resolve("node_modules/.suggestion-test-"));
  let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
  try {
    const definitions = JSON.parse(await readFile(resolve("supabase/canonical-materials.json"), "utf8")) as Array<{ slug: string; name: string; suggestion_label: string }>;
    const snapshot = JSON.parse(await readFile(resolve("src/data/verified-catalog-snapshot.json"), "utf8")) as { canonical_material_ids: Record<string, string> };
    const suggestions = definitions.slice(0, 10).map(material => ({ id: snapshot.canonical_material_ids[material.slug], label: material.suggestion_label || material.name }));
    assert.ok(suggestions.some(item => /gips/i.test(item.label)), "fixture uses existing gypsum catalog entries");
    const selected: typeof suggestions = [];
    const compiled = await build({ entryPoints: [resolve("src/components/SuggestionInput.tsx")], bundle: true, write: false,
      format: "esm", platform: "node", jsx: "automatic", packages: "external" });
    const file = join(directory, "suggestions.mjs"); await writeFile(file, compiled.outputFiles[0].text);
    const SuggestionInput = (await import(pathToFileURL(file).href)).default;
    const { createRoot } = await import("react-dom/client");
    root = createRoot(dom.window.document.getElementById("root")!);
    const props = { id: "material", label: "Material", placeholder: "Material suchen", value: "gIpS", suggestions, disabled: false,
      onChange: () => {}, onSelect: (item: typeof suggestions[number]) => selected.push(item) };
    const render = () => act(async () => root!.render(<SuggestionInput {...props} />));
    await render();
    const input = dom.window.document.querySelector<HTMLInputElement>("#material")!;
    const options = () => [...dom.window.document.querySelectorAll<HTMLElement>('[role="option"]')];
    const focus = () => act(async () => { input.blur(); input.focus(); });
    const key = (key: string) => act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true })); });
    const pointer = (target: Element, type: string, clientY = 10) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY });
      Object.defineProperty(event, "pointerType", { value: "touch" });
      target.dispatchEvent(event);
    };
    await focus();
    assert.deepEqual(options().map(option => option.textContent), suggestions.map(item => item.label), "highlighting never rewrites existing labels");
    assert.ok(dom.window.document.querySelectorAll("mark").length > 0);
    for (const mark of dom.window.document.querySelectorAll("mark")) assert.equal(mark.textContent?.toLowerCase(), "gips");

    await key("ArrowDown");
    await key("ArrowDown");
    assert.equal(input.getAttribute("aria-activedescendant"), options()[1].id);
    assert.ok(scrolled.includes(options()[1].id), "keyboard navigation brings the active option into the scroll viewport");
    await key("Enter");
    assert.equal(selected[0], suggestions[1], "selection preserves the original product ID and object");
    assert.equal(input.getAttribute("aria-expanded"), "false");
    await focus();
    await key("ArrowUp");
    assert.equal(input.getAttribute("aria-activedescendant"), options().at(-1)!.id);
    await key("Escape");
    assert.equal(options().length, 0);
    await focus();
    await key("Tab");
    assert.equal(options().length, 0, "Tab dismisses suggestions without selecting a material");
    assert.equal(selected.length, 1);

    await focus();
    const mouseOption = options()[0];
    await act(async () => {
      mouseOption.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      mouseOption.click();
    });
    assert.equal(selected.at(-1), suggestions[0]);

    await focus();
    const touchOption = options()[2];
    await act(async () => { pointer(touchOption, "pointerdown"); input.blur(); });
    assert.equal(touchOption.isConnected, true, "touch-induced blur must leave the tapped option available for its click");
    await act(async () => { pointer(touchOption, "pointerup"); touchOption.click(); });
    assert.equal(selected.at(-1), suggestions[2]);

    await focus();
    const scrollOption = options()[3];
    const selectionCount = selected.length;
    await act(async () => {
      pointer(scrollOption, "pointerdown"); input.blur();
      pointer(scrollOption, "pointermove", 80); pointer(scrollOption, "pointerup", 80);
    });
    assert.equal(selected.length, selectionCount, "touch scrolling never selects a product on pointer-down or pointer-up");
    await act(async () => pointer(dom.window.document.getElementById("outside")!, "pointerdown"));
    assert.equal(options().length, 0, "an outside touch closes the dropdown even after input blur");

    props.disabled = true;
    await render();
    await focus();
    await key("ArrowDown");
    await key("Enter");
    assert.equal(input.disabled, true);
    assert.equal(options().length, 0);
    assert.equal(selected.length, selectionCount);
  } finally {
    if (root) await act(async () => root!.unmount());
    await rm(directory, { recursive: true, force: true });
    dom.window.close();
    for (const key of Object.keys(properties)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
