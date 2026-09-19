"use client";

import { useEffect, useRef, useState } from "react";
import {
  getMaterialSuggestions,
  warmMaterialSuggestions,
  type MaterialSuggestion,
} from "../services/materialSuggestions";
import { getStoreUrl } from "../lib/resolver";
import { supabase } from "../lib/supabase";
const STORE_LOGOS: Record<string, string> = {
  obi: "/imagesobi.jpg",
  bauhaus: "/bauhaus.png",
  hornbach: "/imageshornbach.png",
  toom: "/toom.webp",
  hagebau: "/hagebau.jpg",
  globus: "/Globus.png",
  hellweg: "/hellweg.png",
};
const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type StoreResult = {
  id: string;
  name: string;
  address: string;
  distance: string;
  duration: string;
  price?: number | null;
  priceProductName?: string | null;
  priceProductUrl?: string | null;
  priceCheckedAt?: string | null;
};

const POPULAR_MATERIALS = [
  "Regips",
  "Dämmung",
  "Rotband",
  "OSB Platte",
  "Dichtband",
];

function getStoreId(name: string) {
  const n = name.toLowerCase();

  if (n.includes("obi")) return "obi";
  if (n.includes("bauhaus")) return "bauhaus";
  if (n.includes("hornbach")) return "hornbach";
  if (n.includes("toom")) return "toom";
  if (n.includes("hagebau")) return "hagebau";
  if (n.includes("globus")) return "globus";
  if (n.includes("hellweg")) return "hellweg";
  return null;
}

let googleMapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if ((window as any).google?.maps?.places) {
    return Promise.resolve();
  }

  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("Google Maps API-Key fehlt in .env.local"));
      return;
    }

    const existingScript =
      document.querySelector<HTMLScriptElement>(
        'script[data-baumarktfinder-google-maps="true"]'
      );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), {
        once: true,
      });

      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google Maps konnte nicht geladen werden")),
        { once: true }
      );

      return;
    }

    const script = document.createElement("script");

    script.dataset.baumarktfinderGoogleMaps = "true";
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}` +
      "&libraries=places" +
      "&language=de" +
      "&region=DE";

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();

    script.onerror = () => {
      googleMapsLoadPromise = null;
      reject(new Error("Google Maps konnte nicht geladen werden"));
    };

    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

function createRouteUrl(origin: string, destination: string) {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    "&travelmode=driving" +
    "&dir_action=navigate"
  );
}

export default function Page() {
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const materialSuggestionsRef = useRef<HTMLDivElement | null>(null);

  const [address, setAddress] = useState("");
  const [product, setProduct] = useState("");
  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [selectedMaterial, setSelectedMaterial] =
    useState<MaterialSuggestion | null>(null);

  const [results, setResults] = useState<StoreResult[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
useEffect(() => {
  warmMaterialSuggestions();
}, []);
  useEffect(() => {
    let autocompleteListener: any = null;
    let cancelled = false;

    async function initializeAddressAutocomplete() {
      try {
        await loadGoogleMaps();

        if (cancelled || !addressInputRef.current) return;

        const google = (window as any).google;

        const autocomplete = new google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            componentRestrictions: { country: "de" },
            fields: ["formatted_address", "geometry", "place_id"],
            types: ["address"],
          }
        );

        autocompleteListener = autocomplete.addListener(
          "place_changed",
          () => {
            const place = autocomplete.getPlace();

            if (place.formatted_address) {
              setAddress(place.formatted_address);
            }
          }
        );
      } catch (error) {
        console.error(error);
      }
    }

    initializeAddressAutocomplete();

    return () => {
      cancelled = true;
      autocompleteListener?.remove();
    };
  }, []);

  useEffect(() => {
    function closeSuggestions(event: MouseEvent) {
      if (
        materialSuggestionsRef.current &&
        !materialSuggestionsRef.current.contains(event.target as Node)
      ) {
        setSuggestions([]);
      }
    }

    document.addEventListener("mousedown", closeSuggestions);

    return () => {
      document.removeEventListener("mousedown", closeSuggestions);
    };
  }, []);

  useEffect(() => {
    if (selectedMaterial && product === selectedMaterial.label) {
      setSuggestions([]);
      return;
    }

    if (product.trim().length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      const foundSuggestions = await getMaterialSuggestions(product);

      if (!cancelled) {
        setSuggestions(foundSuggestions);
      }
   }, 20);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [product, selectedMaterial]);

  function selectMaterial(suggestion: MaterialSuggestion) {
    setProduct(suggestion.label);
    setSelectedMaterial(suggestion);
    setSuggestions([]);
  }
async function useCurrentLocation() {
  if (!navigator.geolocation) {
    setStatus("Dein Browser unterstützt keine Standortbestimmung.");
    return;
  }

  setLocationLoading(true);
  setStatus("Standort wird ermittelt...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        await loadGoogleMaps();

        const google = (window as any).google;
        const geocoder = new google.maps.Geocoder();

        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        geocoder.geocode(
          { location },
          (results: any[], status: string) => {
            if (
              status === "OK" &&
              results?.[0]?.formatted_address
            ) {
              setAddress(results[0].formatted_address);
              setStatus("");
            } else {
              setStatus("Adresse für deinen Standort konnte nicht ermittelt werden.");
            }

            setLocationLoading(false);
          }
        );
      } catch (error) {
        console.error(error);
        setStatus("Standort konnte nicht verarbeitet werden.");
        setLocationLoading(false);
      }
    },
    (error) => {
      if (error.code === 1) {
        setStatus("Standortfreigabe wurde abgelehnt.");
      } else if (error.code === 2) {
        setStatus("Dein Standort ist momentan nicht verfügbar.");
      } else {
        setStatus("Standort konnte nicht ermittelt werden.");
      }

      setLocationLoading(false);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
}
async function attachPricesToStores(
  stores: StoreResult[]
): Promise<StoreResult[]> {
  let material = selectedMaterial;

  if (!material) {
    const found = await getMaterialSuggestions(product.trim());

    if (found.length === 0) {
      return stores;
    }

    material = found[0];
    setSelectedMaterial(material);
  }

  const storeIds = [
    ...new Set(stores.map((store) => store.id)),
  ];

  if (storeIds.length === 0) {
    return stores;
  }

  setStatus("Preise werden geladen...");

  const { data, error } = await supabase
    .from("store_prices")
    .select(`
      store_id,
      price,
      product_name,
      product_url,
      checked_at
    `)
    .eq("material_id", material.id)
    .in("store_id", storeIds)
    .order("checked_at", {
      ascending: false,
    });

  if (error) {
    console.error(
      "store_prices:",
      error
    );

    return stores;
  }

  const pricesByStore = new Map<
    string,
    {
      store_id: string;
      price: number | string;
      product_name: string | null;
      product_url: string | null;
      checked_at: string | null;
    }
  >();

  for (const row of data ?? []) {
    /*
     * Weil checked_at DESC sortiert ist,
     * nehmen wir je Baumarkt nur den
     * neuesten Preis.
     */
    if (
      pricesByStore.has(
        row.store_id
      )
    ) {
      continue;
    }

    const price =
      Number(row.price);

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      continue;
    }

    pricesByStore.set(
      row.store_id,
      row
    );
  }

  return stores.map((store) => {
    const priceData =
      pricesByStore.get(
        store.id
      );

    if (!priceData) {
      return store;
    }

    return {
      ...store,

      price:
        Number(
          priceData.price
        ),

      priceProductName:
        priceData.product_name,

      priceProductUrl:
        priceData.product_url,

      priceCheckedAt:
        priceData.checked_at,
    };
  });
}
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!address.trim()) {
      alert("Bitte Adresse eingeben");
      return;
    }

    if (!product.trim()) {
      alert("Bitte Material eingeben");
      return;
    }

    setSuggestions([]);
    setLoading(true);
    setStatus("Suche Baumärkte in deiner Nähe...");
    setResults([]);

    try {
      await loadGoogleMaps();

      const google = (window as any).google;

      const mapDiv = document.createElement("div");
      const map = new google.maps.Map(mapDiv);
      const geocoder = new google.maps.Geocoder();
      const service = new google.maps.places.PlacesService(map);

      geocoder.geocode(
        {
          address: address.trim(),
          componentRestrictions: { country: "DE" },
        },
        (geoResults: any[], geoStatus: string) => {
          if (geoStatus !== "OK" || !geoResults?.[0]) {
            setStatus("Adresse nicht gefunden");
            setLoading(false);
            return;
          }

          const location = geoResults[0].geometry.location;
service.nearbySearch(
  {
    location,
    rankBy: google.maps.places.RankBy.DISTANCE,
    keyword: "Baumarkt",
  },
  (places: any[], placesStatus: string) => {
    if (
      placesStatus !==
        google.maps.places.PlacesServiceStatus.OK ||
      !places
    ) {
      setStatus("Keine Baumärkte gefunden");
      setLoading(false);
      return;
    }
           const cleanResults = places
  .map((place, index) => {
    const placeName = place.name || "";
    const nameLower = placeName.toLowerCase();

    if (
      nameLower.includes("gartencenter") ||
      nameLower.includes("stadtgarten")
    ) {
      return null;
    }

    const supportedStoreId = getStoreId(placeName);

    return {
      id: supportedStoreId ?? `other-${place.place_id ?? index}`,
      name: place.name || "Baumarkt",
      address:
        place.vicinity ||
        place.formatted_address ||
        place.name ||
        "",
      distance: "",
      duration: "",
    };
  })
  .filter(Boolean) as StoreResult[];

              if (cleanResults.length === 0) {
  setStatus("Keine unterstützten Baumärkte gefunden");
  setResults([]);
  setLoading(false);
  return;
}

const distanceService =
  new google.maps.DistanceMatrixService();

distanceService.getDistanceMatrix(
  {
    origins: [location],
    destinations: cleanResults.map(
      (store) => store.address
    ),
   travelMode: google.maps.TravelMode.DRIVING,

drivingOptions: {
  departureTime: new Date(),
  trafficModel: google.maps.TrafficModel.BEST_GUESS,
},

unitSystem: google.maps.UnitSystem.METRIC,
  },
  (response: any, distanceStatus: string) => {
    if (
      distanceStatus !== "OK" ||
      !response?.rows?.[0]
    ) {
      console.error(
        "Entfernungsberechnung fehlgeschlagen:",
        distanceStatus
      );

      setResults(cleanResults);
      setStatus("");
      setLoading(false);
      return;
    }

    const elements =
      response.rows[0].elements ?? [];

const resultsWithDistance =
  cleanResults
    .map((store, index) => {
      const element = elements[index];

      const trafficDuration =
        element?.duration_in_traffic ??
        element?.duration;

      return {
        ...store,

        distance:
          element?.status === "OK"
            ? element.distance?.text ?? ""
            : "",

        duration:
          element?.status === "OK"
            ? trafficDuration?.text ?? ""
            : "",

        durationValue:
          element?.status === "OK"
            ? trafficDuration?.value ??
              Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.durationValue - b.durationValue)
    .map(({ durationValue, ...store }) => store);
attachPricesToStores(resultsWithDistance)
  .then((resultsWithPrices) => {
    setResults(resultsWithPrices);
    setStatus("");
    setLoading(false);
  })
  .catch((error) => {
    console.error(error);
    setResults(resultsWithDistance);
    setStatus("");
    setLoading(false);
  });
  }
);
            }
          );
        }
      );
    } catch (error) {
      console.error(error);
      setStatus("Fehler bei der Suche");
      setLoading(false);
    }
  }

  const storeSearchTerm =
    selectedMaterial?.store_search_term ?? product;

  const displayedMaterial =
    selectedMaterial?.name ?? product;

  return (
    <main className="site">
      <header className="header">
        <a className="brand" href="#">
          <span className="brandIcon">⌂</span>
          <span>BAUMARKT</span>
          <strong>FINDER</strong>
        </a>

        <nav className="nav">
          <a href="#search">So funktioniert&apos;s</a>
          <a href="#about">Über uns</a>
          <a href="#results">Angebote</a>
        </nav>
      </header>

      <section className="hero" id="search">
  <div className="heroCopy">
    <h1>
      Schnell. Einfach.
      <br />
      Das richtige Material.
    </h1>

    <p>
      Finde passende Materialien und Baumärkte in deiner Nähe.
      Vergleiche Angebote und starte direkt deine Route.
    </p>
  </div>

  <div className="heroVisual">
    <img
      src="/Material.hero.png"
      alt="Material.hero.png"
    />
  </div>

        <form onSubmit={handleSearch} className="searchPanel">
          <div className="fieldBlock">
            <label>WO?</label>

            <div className="inputShell">
              <span className="inputIcon">⌖</span>

              <input
                ref={addressInputRef}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="60320 Frankfurt am Main"
                autoComplete="off"
              />
            </div>
              <button
    type="button"
    className="currentLocationButton"
    onClick={useCurrentLocation}
    disabled={locationLoading}
  >
    <span>⌖</span>
    {locationLoading
      ? "Standort wird ermittelt..."
      : "Meinen aktuellen Standort verwenden"}
  </button>
          </div>

          <div
            className="fieldBlock materialInputWrapper"
            ref={materialSuggestionsRef}
          >
            <label>WAS SUCHST DU?</label>

            <div className="inputShell">
              <span className="inputIcon">⌕</span>

              <input
                value={product}
                onChange={(e) => {
                  setProduct(e.target.value);
                  setSelectedMaterial(null);
                }}
                placeholder="z. B. Regips, Rotband, Dämmung"
                autoComplete="off"
              />
            </div>

            {suggestions.length > 0 && (
              <div className="materialSuggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="materialSuggestion"
                    onClick={() => selectMaterial(suggestion)}
                  >
                    <span className="suggestionIcon">⌕</span>
                    <span>{suggestion.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="searchButton"
            disabled={loading}
            type="submit"
          >
            {loading ? "Suche..." : "Suchen"}
          </button>
        </form>

        <div className="popular">
          <span>Beliebt:</span>

          {POPULAR_MATERIALS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setProduct(item);
                setSelectedMaterial(null);
              }}
            >
              {item}
            </button>
          ))}
        </div>

        {status && <div className="searchStatus">{status}</div>}
      </section>

      {results.length > 0 && (
        <section className="resultsSection" id="results">
          <div className="sectionHeading">
            <div>
              <span className="eyebrow">ERGEBNISSE</span>
              <h2>Baumärkte in deiner Nähe</h2>
              <p>
                Für <strong>{displayedMaterial}</strong>
              </p>
            </div>

            <span className="resultCount">
              {results.length} gefunden
            </span>
          </div>

          <div className="storeGrid">
            {results.map((store, index) => (
              <article
                className={`offerCard ${
                  index === 0 ? "nearestCard" : ""
                }`}
                key={`${store.id}-${index}`}
              >
                {index === 0 && (
                  <span className="nearestBadge">
                    Nächster Baumarkt
                  </span>
                )}

                <div className="logoArea">
                  <img
                  className={`storeLogo storeLogo-${store.id}`}
                    src={STORE_LOGOS[store.id]}
                    alt={`${store.name} Logo`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />

                 
                </div>

                <h3>{store.name}</h3>

                <p className="storeAddress">
                  {store.address}
                </p>

                <div className="availabilityPlaceholder">
                  Angebot verfügbar
                </div>

                <div className="distancePlaceholder">
  <span>⌖</span>

  {store.distance && store.duration
    ? `${store.distance} · ${store.duration}`
    : "Entfernung wird berechnet"}
</div>

              <div className="pricePlaceholder">
  {store.price != null ? (
    <>
      <span>{store.priceProductName ?? "Aktueller Preis"}</span>

      <strong>
        {Number(store.price).toLocaleString("de-DE", {
          style: "currency",
          currency: "EUR",
        })}
      </strong>

      {store.priceCheckedAt && (
        <small>
          Aktualisiert:{" "}
          {new Date(
            store.priceCheckedAt
          ).toLocaleDateString("de-DE")}
        </small>
      )}
    </>
  ) : (
    <>
      <span>Preis</span>
      <strong>–</strong>
    </>
  )}
</div>

                <div className="cardActions">
                  <a
                    className="offerButton"
                    href={
                      store.priceProductUrl ||
                      getStoreUrl(
                        store.id,
                        storeSearchTerm
                      )
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Zum Angebot ↗
                  </a>

                  <a
                    className="routeButton"
                    href={createRouteUrl(
                      address,
                      store.address
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Route →
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
<section className="aiSection">
  <div className="aiHeader">
    <div>
      <span className="aiBadge">✦</span>

      <div>
        <h2>Mit KI geplante Materialliste</h2>
        <p>
          Beispiel: 50 m² Trockenbauwand inkl. Spachteln und Streichen
        </p>
      </div>
    </div>

    <div className="aiTotal">
      <span>Gesamtkosten</span>
      <strong>Preisberechnung folgt</strong>
    </div>
  </div>

  <div className="aiTable">
    <div className="aiTableHead">
      <span>Material</span>
      <span>Menge</span>
      <span>Günstigster Anbieter</span>
      <span>Preis</span>
    </div>

    <div className="aiRow">
      <strong>Gipskartonplatte 12,5 mm</strong>
      <span>50 Stück</span>
      <span>Wird verglichen</span>
      <span>–</span>
    </div>

    <div className="aiRow">
      <strong>UW Profil 50</strong>
      <span>30 Stück</span>
      <span>Wird verglichen</span>
      <span>–</span>
    </div>

    <div className="aiRow">
      <strong>CW Profil 50</strong>
      <span>20 Stück</span>
      <span>Wird verglichen</span>
      <span>–</span>
    </div>

    <div className="aiRow">
      <strong>Tiefengrund</strong>
      <span>1 Eimer</span>
      <span>Wird verglichen</span>
      <span>–</span>
    </div>
  </div>

  <div className="aiFooter">
    <button type="button">
      KI-Materialliste erstellen
    </button>
  </div>
</section>
      <section className="benefits" id="about">
        <div>
          <strong>◷</strong>
          <span>
            <b>Zeit sparen</b>
            Alles an einem Ort finden
          </span>
        </div>

        <div>
          <strong>€</strong>
          <span>
            <b>Geld sparen</b>
            Angebote vergleichen
          </span>
        </div>

        <div>
          <strong>▣</strong>
          <span>
            <b>Große Auswahl</b>
            Führende Baumärkte
          </span>
        </div>

        <div>
          <strong>↻</strong>
          <span>
            <b>Direkte Route</b>
            Sofort zum Baumarkt
          </span>
        </div>
      </section>
    </main>
  );
}