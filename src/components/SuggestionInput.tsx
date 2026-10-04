"use client";

import { useId, useState, type KeyboardEvent } from "react";

type Suggestion = { id: string; label: string };
type Props<T extends Suggestion> = {
  id: string; label: string; placeholder: string; value: string; suggestions: T[];
  disabled: boolean; onChange: (value: string) => void; onSelect: (item: T) => void;
  attribution?: boolean; hint?: string;
};

export default function SuggestionInput<T extends Suggestion>({ id, label, placeholder, value, suggestions, disabled, onChange, onSelect, attribution, hint }: Props<T>) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = !disabled && focused && suggestions.length > 0;
  const activeIndex = active >= 0 && active < suggestions.length ? active : -1;
  function select(item: T) { if (disabled) return; onSelect(item); setFocused(false); setActive(-1); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "Escape") { setFocused(false); setActive(-1); }
    if (suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setFocused(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => current < 0 ? (step === 1 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length);
    }
    if (expanded && event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); select(suggestions[activeIndex]); }
  }
  return <div className="fieldBlock materialInputWrapper">
    <label htmlFor={id}>{label}</label>
    <div className="inputShell">
      <span className="inputIcon" aria-hidden="true">{id === "address" ? "⌖" : "⌕"}</span>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value} disabled={disabled} placeholder={placeholder} autoComplete="off"
        onChange={(event) => { onChange(event.target.value); setActive(-1); setFocused(true); }}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={keyDown} />
    </div>
    {expanded && <div className="materialSuggestions">
      <ul id={listId} role="listbox" aria-label={label}>
        {suggestions.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
          className={`materialSuggestion ${index === activeIndex ? "activeSuggestion" : ""}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => select(item)}>{item.label}</li>)}
      </ul>
      {attribution && <div className="googleAttribution">Google Maps</div>}
    </div>}
    {hint && <p className="fieldHint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
