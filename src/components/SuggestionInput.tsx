"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type Suggestion = { id: string; label: string };
type Props<T extends Suggestion> = {
  id: string; label: string; placeholder: string; value: string; suggestions: T[];
  disabled: boolean; onChange: (value: string) => void; onSelect: (item: T) => void;
  attribution?: boolean; hint?: string;
};

export default function SuggestionInput<T extends Suggestion>({ id, label, placeholder, value, suggestions, disabled, onChange, onSelect, attribution, hint }: Props<T>) {
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const pointerSelecting = useRef(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = !disabled && focused && suggestions.length > 0;
  const activeIndex = active >= 0 && active < suggestions.length ? active : -1;
  const terms = value.trim().slice(0, 160).split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const highlight = terms.length ? new RegExp(`(${terms.join("|")})`, "gi") : null;
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) {
        pointerSelecting.current = false;
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);
  useEffect(() => {
    if (expanded && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, expanded, listId]);
  function select(item: T) { if (disabled) return; onSelect(item); pointerSelecting.current = false; setFocused(false); setActive(-1); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "Escape" || event.key === "Tab") { pointerSelecting.current = false; setFocused(false); setActive(-1); }
    if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setFocused(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => current < 0 ? (step === 1 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length);
    }
    if (expanded && event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); select(suggestions[activeIndex]); }
  }
  return <div ref={wrapper} className="fieldBlock materialInputWrapper">
    <label htmlFor={id}>{label}</label>
    <div className="inputShell">
      <span className="inputIcon" aria-hidden="true">{id === "address" ? "⌖" : "⌕"}</span>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value} disabled={disabled} placeholder={placeholder} autoComplete="off"
        onChange={(event) => { onChange(event.target.value); setActive(-1); setFocused(true); }}
        onFocus={() => { pointerSelecting.current = false; setFocused(true); }}
        onBlur={() => { if (!pointerSelecting.current) setFocused(false); }} onKeyDown={keyDown} />
    </div>
    {expanded && <div className="materialSuggestions">
      <ul id={listId} role="listbox" aria-label={label} onPointerDownCapture={() => { pointerSelecting.current = true; }}>
        {suggestions.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
          className={`materialSuggestion ${index === activeIndex ? "activeSuggestion" : ""}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(item)} title={item.label}>
          <span className="materialSuggestionLabel">{highlight ? item.label.split(highlight).map((part, partIndex) => partIndex % 2 ? <mark key={partIndex}>{part}</mark> : part) : item.label}</span>
        </li>)}
      </ul>
      {attribution && <div className="googleAttribution">Google Maps</div>}
    </div>}
    {hint && <p className="fieldHint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
