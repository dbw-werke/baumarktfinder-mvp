"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** One comparison row at every viewport size, with native touch/keyboard scrolling. */
export default function StoreRow({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const update = () => setEdges({ start: element.scrollLeft < 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [children]);

  function scroll(direction: number) {
    const element = row.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return <div className="storeRow">
    <div ref={row} id={id} className={`storeGrid ${className}`} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
    <button type="button" className="storeScroll storeScrollPrevious" aria-label="Vorherige Angebote" aria-controls={id} disabled={edges.start} onClick={() => scroll(-1)}><span aria-hidden="true">‹</span></button>
    <button type="button" className="storeScroll storeScrollNext" aria-label="Weitere Angebote" aria-controls={id} disabled={edges.end} onClick={() => scroll(1)}><span aria-hidden="true">›</span></button>
  </div>;
}
