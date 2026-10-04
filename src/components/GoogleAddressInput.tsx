"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createGoogleAddressWidget, resolveAddressPrediction, type ResolvedAddress } from "../services/maps";

type Props = {
  value: string;
  disabled: boolean;
  hint?: string;
  onChange: (value: string) => void;
  onSelect: (address: ResolvedAddress) => void;
  onError: (error: unknown) => void;
  onReady: () => void;
  onPendingChange: (pending: boolean) => void;
};

/** Google owns its input and prediction UI; the plain input only covers loading/failure. */
export default function GoogleAddressInput(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const current = useRef(props);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    current.current = props;
    if (widget.current) {
      widget.current.disabled = props.disabled;
      if (widget.current.value !== props.value) widget.current.value = props.value;
    }
  }, [props]);

  useEffect(() => {
    let disposed = false, revision = 0;
    let pendingValue: string | null = null;
    let teardown: (() => void) | undefined;
    void createGoogleAddressWidget().then((element) => {
      if (disposed || !host.current) return;
      widget.current = element;
      element.id = "address";
      element.className = "googleAddressWidget";
      element.setAttribute("aria-label", "WO IN DEUTSCHLAND?");
      element.value = current.current.value;
      element.disabled = current.current.disabled;
      element.style.width = "100%";
      element.style.minHeight = "56px";
      element.style.colorScheme = "light";
      const input = () => {
        if (disposed || current.current.disabled) return;
        // Some widget updates emit input for the same selected text. Only an
        // actual edit invalidates the details request already being resolved.
        if (pendingValue !== null && element.value === pendingValue) return;
        revision++;
        pendingValue = null;
        current.current.onPendingChange(false);
        current.current.onChange(element.value);
      };
      const select = async (event: google.maps.places.PlacePredictionSelectEvent) => {
        if (disposed || current.current.disabled) return;
        const selectedRevision = ++revision;
        pendingValue = element.value;
        current.current.onChange(element.value);
        current.current.onPendingChange(true);
        try {
          const address = await resolveAddressPrediction(event.placePrediction);
          if (!disposed && selectedRevision === revision) current.current.onSelect(address);
        } catch (error) {
          if (!disposed && selectedRevision === revision) current.current.onError(error);
        } finally {
          if (!disposed && selectedRevision === revision) { pendingValue = null; current.current.onPendingChange(false); }
        }
      };
      const failure = () => {
        if (disposed) return;
        revision++;
        pendingValue = null;
        current.current.onChange(element.value);
        current.current.onPendingChange(false);
        current.current.onError(new Error("Google Places REQUEST_DENIED"));
        teardown?.();
        widget.current = null;
        setReady(false);
      };
      const selectListener: EventListener = (event) => { void select(event as google.maps.places.PlacePredictionSelectEvent); };
      element.addEventListener("input", input);
      element.addEventListener("gmp-select", selectListener);
      element.addEventListener("gmp-error", failure);
      teardown = () => {
        element.removeEventListener("input", input);
        element.removeEventListener("gmp-select", selectListener);
        element.removeEventListener("gmp-error", failure);
        element.remove();
      };
      host.current.appendChild(element);
      setReady(true);
      current.current.onReady();
    }).catch((error: unknown) => {
      if (!disposed) current.current.onError(error);
    });
    return () => { disposed = true; revision++; teardown?.(); widget.current = null; };
  }, []);

  return <div className="fieldBlock googleAddressField">
    <label htmlFor="address">WO IN DEUTSCHLAND?</label>
    <div ref={host} className="googleAddressHost" hidden={!ready} />
    {!ready && <div className="inputShell">
      <span className="inputIcon" aria-hidden="true">⌖</span>
      <input id="address" name="address" value={props.value} disabled={props.disabled}
        placeholder="Straße, Hausnummer, PLZ und Ort" autoComplete="street-address"
        aria-describedby={props.hint ? "address-hint" : undefined}
        onChange={(event) => props.onChange(event.target.value)} />
    </div>}
    {props.hint && <p className="fieldHint" id="address-hint" role="status">{props.hint}</p>}
  </div>;
}
