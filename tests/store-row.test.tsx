import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import StoreRow from "../src/components/StoreRow";

async function fixture(run: (fixture: {
  dom: JSDOM; row: HTMLDivElement; previous: HTMLButtonElement; next: HTMLButtonElement;
  scrolls: ScrollToOptions[]; completeScroll: (left: number) => Promise<void>;
  resize: (width: number, contentWidth: number) => Promise<void>;
  setReducedMotion: (value: boolean) => void;
}) => Promise<void>) {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/" });
  let resized = () => {};
  let reducedMotion = false;
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} } };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  Object.defineProperty(dom.window, "matchMedia", { value: () => ({ matches: reducedMotion }) });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(<StoreRow label="Testangebote">{Array.from({ length: 5 }, (_, index) =>
      <article key={index}><a href={`#offer-${index}`}>Angebot {index}</a></article>)}</StoreRow>));
    const row = dom.window.document.querySelector<HTMLDivElement>(".storeGrid")!;
    const previous = dom.window.document.querySelector<HTMLButtonElement>(".storeScrollPrevious")!;
    const next = dom.window.document.querySelector<HTMLButtonElement>(".storeScrollNext")!;
    // Non-integer real-world card widths catch cumulative rounding and viewport-percentage stepping.
    let width = 499, contentWidth = 1271.5;
    Object.defineProperty(row, "clientWidth", { get: () => width });
    Object.defineProperty(row, "scrollWidth", { get: () => contentWidth });
    Array.from(row.children).forEach((child, index) => {
      child.getBoundingClientRect = () => ({ x: 31 + index * 257.5 - row.scrollLeft, y: 0,
        left: 31 + index * 257.5 - row.scrollLeft, right: 272.5 + index * 257.5 - row.scrollLeft,
        top: 0, bottom: 400, width: 241.5, height: 400, toJSON() {} });
    });
    const scrolls: ScrollToOptions[] = [];
    row.scrollTo = ((options: ScrollToOptions) => { scrolls.push(options); }) as typeof row.scrollTo;
    const completeScroll = async (left: number) => act(async () => {
      row.scrollLeft = left;
      row.dispatchEvent(new dom.window.Event("scroll"));
    });
    const resize = async (nextWidth: number, nextContent: number) => act(async () => {
      width = nextWidth; contentWidth = nextContent; resized();
    });
    await resize(width, contentWidth);
    await run({ dom, row, previous, next, scrolls, completeScroll, resize, setReducedMotion: value => { reducedMotion = value; } });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("carousel moves exactly one card, queues rapid clicks and disables actual boundaries", async () => fixture(async ({ row, previous, next, scrolls, completeScroll }) => {
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, false);
  assert.equal(next.getAttribute("aria-controls"), row.id);
  assert.ok(next.querySelector('svg[aria-hidden="true"]'));
  await act(async () => next.click());
  assert.deepEqual(scrolls.at(-1), { left: 257.5, behavior: "smooth" });
  await act(async () => next.click());
  assert.equal(scrolls.at(-1)?.left, 515, "second click advances from the pending card, not the partly animated scroll position");
  await completeScroll(515);
  assert.equal(previous.disabled, false);
  await act(async () => next.click());
  assert.equal(scrolls.at(-1)?.left, 772.5);
  await completeScroll(772.5);
  assert.equal(next.disabled, true);
  await act(async () => previous.click());
  assert.equal(scrolls.at(-1)?.left, 515);
  await completeScroll(0);
  assert.equal(previous.disabled, true);
}));

test("manual wheel and touch scrolling cancel a pending destination and align the next card", async () => fixture(async ({ dom, row, next, previous, scrolls, completeScroll }) => {
  await act(async () => next.click());
  row.dispatchEvent(new dom.window.Event("wheel"));
  await completeScroll(80);
  await act(async () => next.click());
  assert.equal(scrolls.at(-1)?.left, 257.5);
  row.dispatchEvent(new dom.window.Event("pointerdown"));
  await completeScroll(400);
  await act(async () => previous.click());
  assert.equal(scrolls.at(-1)?.left, 257.5);
}));

test("keyboard uses card steps and Home/End, leaves inner links alone, and honors reduced motion", async () => fixture(async ({ dom, row, scrolls, setReducedMotion }) => {
  setReducedMotion(true);
  const key = async (target: Element, value: string) => act(async () => target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
  await key(row, "ArrowRight");
  assert.deepEqual(scrolls.at(-1), { left: 257.5, behavior: "instant" });
  await key(row, "End");
  assert.equal(scrolls.at(-1)?.left, 772.5);
  await key(row, "Home");
  assert.equal(scrolls.at(-1)?.left, 0);
  const count = scrolls.length;
  await key(row.querySelector("a")!, "ArrowRight");
  assert.equal(scrolls.length, count, "keyboard interaction within a card retains its native behavior");
}));

test("resize updates boundaries, including a row that fits without horizontal scrolling", async () => fixture(async ({ previous, next, resize, completeScroll }) => {
  await completeScroll(772.5);
  assert.equal(next.disabled, true);
  await resize(241.5, 1271.5);
  assert.equal(next.disabled, false, "a narrower viewport exposes more remaining cards");
  await completeScroll(0);
  await resize(1271.5, 1271.5);
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, true);
}));
