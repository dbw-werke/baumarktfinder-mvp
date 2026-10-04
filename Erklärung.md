# Erklärung zum Baumarktfinder

Stand: 03.10.2026. Das bestehende Projekt wurde weitergeführt; Gestaltung, Logos und funktionierende Teile bleiben erhalten.

## Implementierung

Die Kundensuche liest geprüfte Preise aus Supabase und dem gespeicherten Ersatzkatalog. Sie startet keine Händler-Scraper. Ein separater Worker aktualisiert die Preise; fehlgeschlagene Abrufe erhalten vorherige gültige Angebote und deren ursprüngliche Prüfzeit.

Der Matcher prüft Produktfamilie, harte Ausschlüsse und technische Merkmale vor Größenähnlichkeit und Bewertung. Acryl/Maleracryl/Anschlussacryl gehören zusammen; Silikon, Hybrid, PU-Dichtstoffe und Montagekleber bleiben getrennt. Gipskarton-Synonyme, Tiefgrund, Profiltypen, deutsche Ausschlusswörter und Mengen wie „1.000 Stück“ sind berücksichtigt. Wunschgröße zuerst, dann die nächste geprüfte vergleichbare Ausführung. 300 ml und 280 ml bleiben eigene Varianten; die große Kartenangabe bleibt der echte Gesamtpreis der angezeigten Packung.

Die vorhandenen Karten stehen weiterhin horizontal: 210 px am Desktop, 250 px auf kleinen Bildschirmen. Details sind aufklappbar. Eine neue Suche entfernt alte Karten sofort und zeigt fünf Ladeplatzhalter. Verspätete Antworten überschreiben keine neueren Ergebnisse. Produktlinks gehören zum angezeigten Produkt, Route zur jeweiligen Filiale.

34 Materialvarianten und 59 unterschiedliche geprüfte Material-/Kettenangebote aus sechs Ketten sind enthalten. Acryl 310 ml hat Preise bei OBI, BAUHAUS, HORNBACH, toom und Globus; hagebau liefert andere Materialien. Bei HELLWEG fehlt weiterhin ein belastbarer Preis. Das ist kein vollständiges Sortiment und keine Filialbestandszusage. [Abdeckung und Lücken](docs/PREISABDECKUNG.md).

## Start und Einrichtung

Im Projektordner `npm install`, dann `npm run dev`. Lokal: http://127.0.0.1:3000/ — abschließend HTTP 200 bestätigt. Produktion lokal: `npm run build`, danach `npm start`.

**Google:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` setzen. Maps JavaScript API, Places API (New), Geocoding API, Routes API und Billing aktivieren. Die tatsächlich benutzten Website-Referrer freigeben: insbesondere `http://127.0.0.1:3000/*`, gegebenenfalls `http://localhost:3000/*`. Server nach Änderungen neu starten; öffentliche Variablen für Produktion neu einbauen. Verwendet wird das offizielle, auf Deutschland begrenzte `PlaceAutocompleteElement`. [Google-Anleitung](docs/GOOGLE-EINRICHTEN.md).

**Supabase:** Im SQL Editor mit Owner-Zugang zuerst `supabase/migrations/202609220001_canonical_prices.sql`, danach `supabase/seed.sql` ausführen. URL und öffentlichen Schlüssel in `.env.local` eintragen. Der Service-Role-Schlüssel gehört ausschließlich zum Preis-Worker. [Vollständige Einrichtung](README.md#supabase-einrichten). Der gebündelte Preisbestand funktioniert auch ohne zentrale Datenbank.

**Preise:** `npm run prices:dry-run -- --stores hornbach Rotband` prüft ohne Schreibzugriff; `npm run prices:update -- --stores hornbach Rotband` schreibt geprüfte Angebote zentral. Manuell beobachtete echte Packungspreise: `npm run prices:import -- meine-preise.json --local --write`. Ohne `--local` erfolgt der Import nach Supabase. [Importformat und Aktualisierung](docs/PREISDATEN.md).

## Prüfungen und Grenzen

163 Tests, ESLint, TypeScript im Produktionsbuild und `npm run build` bestehen. 198 gespeicherte Händlerseiten wurden mit ursprünglichen Abrufzeiten erneut ausgewertet. Isoliertes PostgreSQL prüft die 59 Preise, RPC und RLS; elf Materialauswahlen und 88 Karten mit produktiven Komponenten prüfen Preise, Größen, Links und Routen. Der DOM-Test bestätigt Ladezustand und überlappende Suchen. Filialdaten dieser Integrationstests sind ausdrücklich Testfixtures.

- **Google live:** Letzter konkreter Befund: `API_KEY_HTTP_REFERRER_BLOCKED`. Eine erfolgreiche reale Autocomplete-Sitzung ist noch nicht bestätigt.
- **Supabase live:** Frühere Abfragen meldeten fehlende Schemaobjekte (42703/PGRST205); die Abschlussprüfung erhielt keine nutzbaren Antworten. Die externe Instanz wurde nicht migriert. Owner-Zugang/Freischaltung fehlen weiterhin.
- **Visuelle Live-Abnahme:** Die Browsersteuerung wurde von der Browser-Sicherheitsrichtlinie abgewiesen. Die abschließende Sichtprüfung auf Desktop/Mobilgerät und mit echten Google-Vorschlägen bleibt offen. HTTP-, DOM- und Komponentenprüfungen ersetzen diese nicht.
- **Weitere Preise:** Für 155 der 238 Material-/Kettenkombinationen fehlt ein geprüftes Angebot. Ohne belastbaren Beleg bleibt „Preis nicht verfügbar“.

GitHub und Vercel wurden nicht verändert. Die ZIP enthält keine lokale Schlüsseldatei. [Prüfnachweise](docs/ABNAHME.md). Gesamtfortschritt: 98 %; die genannten externen Abnahmen bleiben offen.
