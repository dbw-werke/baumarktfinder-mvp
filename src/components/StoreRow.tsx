"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** One comparison row at every viewport size, with native touch/keyboard scrolling. */
export default function StoreRow({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  const destination = useRef<number | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = row.current;
    if (!element) return;
    destination.current = null;
    const update = () => {
      if (destination.current !== null && Math.abs(element.scrollLeft - destination.current) < 2) destination.current = null;
      const start = element.scrollLeft < 2;
      const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
      setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
    };
    const cancelDestination = () => { destination.current = null; };
    update();
    element.addEventListener("scroll", update, { passive: true });
    element.addEventListener("scrollend", cancelDestination);
    element.addEventListener("wheel", cancelDestination, { passive: true });
    element.addEventListener("pointerdown", cancelDestination, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      element.removeEventListener("scrollend", cancelDestination);
      element.removeEventListener("wheel", cancelDestination);
      element.removeEventListener("pointerdown", cancelDestination);
      observer.disconnect();
    };
  }, [children]);

  function move(direction: -1 | 1 | "start" | "end") {
    const element = row.current;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    const current = Math.min(maximum, Math.max(0, destination.current ?? element.scrollLeft));
    const first = element.firstElementChild?.getBoundingClientRect().left ?? 0;
    const positions = [...new Set([0, ...Array.from(element.children, child =>
      Math.min(maximum, Math.max(0, child.getBoundingClientRect().left - first))), maximum])].sort((a, b) => a - b);
    const target = direction === "start" ? 0 : direction === "end" ? maximum : direction === 1
      ? positions.find(position => position > current + 2) ?? maximum
      : positions.findLast(position => position < current - 2) ?? 0;
    // Consecutive clicks advance from the pending card, even during smooth motion.
    destination.current = target;
    element.scrollTo({ left: target, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Links, details and other controls inside a card retain their native keys.
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const direction = { ArrowLeft: -1, ArrowRight: 1, Home: "start", End: "end" }[event.key] as -1 | 1 | "start" | "end" | undefined;
    if (direction === undefined) return;
    event.preventDefault();
    move(direction);
  }

  return <div className="storeRow">
    <div ref={row} id={id} className={`storeGrid ${className}`} role="region" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
      {children}
    </div>
    <button type="button" className="storeScroll storeScrollPrevious" aria-label="Vorherige Angebote" aria-controls={id} disabled={edges.start} onClick={() => move(-1)}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    <button type="button" className="storeScroll storeScrollNext" aria-label="Weitere Angebote" aria-controls={id} disabled={edges.end} onClick={() => move(1)}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
  </div>;
}
