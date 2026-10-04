import assert from "node:assert/strict";
import test from "node:test";
import { loadGoogleMaps } from "../src/services/maps";

test("script load is shared until its ready callback and late authentication failures stay visible", async () => {
  const previous = new Map(["window", "document", "google"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const previousKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  let previousAuthCalls = 0, appended = 0;
  const browser: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; gm_authFailure: () => void; __baumarktMapsReady?: () => void } = {
    setTimeout, clearTimeout, gm_authFailure: () => { previousAuthCalls++; },
  };
  const script = { dataset: {}, src: "", async: false, onerror: null, remove() {} };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => script, head: { appendChild: () => { appended++; } } } });
  Reflect.deleteProperty(globalThis, "google");
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "synthetic-loader-test-key";
  try {
    const first = loadGoogleMaps();
    // A partial Google bootstrap is not equivalent to its script-ready callback.
    Object.defineProperty(globalThis, "google", { configurable: true, value: { maps: { importLibrary: async () => ({}) } } });
    let earlyCompletion = false;
    const second = loadGoogleMaps().then(() => { earlyCompletion = true; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(earlyCompletion, false);
    assert.equal(appended, 1);
    const url = new URL(script.src);
    assert.equal(url.searchParams.get("loading"), "async");
    assert.equal(url.searchParams.get("language"), "de");
    browser.__baumarktMapsReady?.();
    await Promise.all([first, second]);
    browser.gm_authFailure();
    await assert.rejects(loadGoogleMaps(), /nicht autorisiert/);
    assert.equal(previousAuthCalls, 1);
    assert.equal(appended, 1);
  } finally {
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = previousKey;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
