import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import Script from "next/script";
import { JSDOM } from "jsdom";
import { umamiAnalyticsConfig } from "../src/lib/analytics";

test("Next loads Umami only once across rerenders and remounts, without blocking the page", async () => {
  // No resources are loaded: test visits never reach the real analytics account.
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://baumarktfinder-app.de/" });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
  try {
    const { createRoot } = await import("react-dom/client");
    root = createRoot(dom.window.document.getElementById("root")!);
    const config = umamiAnalyticsConfig({ NODE_ENV: "production", VERCEL_ENV: "production" })!;
    const render = (page: string, key: string) => act(async () => {
      root!.render(<><main>{page}</main><Script key={key} {...config} /></>);
    });
    await render("Materialsuche", "initial");
    assert.equal(dom.window.document.querySelector("main")?.textContent, "Materialsuche");
    const scripts = () => dom.window.document.querySelectorAll<HTMLScriptElement>(`script[src="${config.src}"]`);
    assert.equal(scripts().length, 1);
    const script = scripts()[0];
    assert.equal(script.getAttribute("data-website-id"), config["data-website-id"]);
    assert.equal(script.getAttribute("data-domains"), "baumarktfinder-app.de");
    assert.equal(script.getAttribute("data-exclude-search"), "true");
    assert.equal(script.getAttribute("data-exclude-hash"), "true");
    assert.equal(script.getAttribute("data-do-not-track"), "true");
    assert.equal(script.getAttribute("data-nscript"), "afterInteractive");
    await render("Preisvergleich", "initial");
    await render("Weitere Seite", "remounted-while-loading");
    assert.equal(scripts().length, 1, "pending script must not be inserted again");
    await act(async () => script.dispatchEvent(new dom.window.Event("load")));
    await render("Materialsuche", "remounted-after-loading");
    assert.equal(scripts().length, 1, "loaded script must not initialize again");
    assert.equal(dom.window.document.querySelector("main")?.textContent, "Materialsuche");
    assert.equal(dom.window.document.cookie, "");
  } finally {
    if (root) await act(async () => root!.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
