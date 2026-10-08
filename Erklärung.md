# Erklärung zum Baumarktfinder

Stand: 06.10.2026. Das bestehende Projekt wurde weitergeführt; Gestaltung, Logos und funktionierende Teile bleiben erhalten. Der aktuelle Auftrag betrifft ausschließlich die stündliche toom-Aktualisierung.

## Implementierung

Die Kundensuche liest geprüfte Katalogpreise aus Supabase und gespeicherten Beobachtungen. Für toom ergänzt `/api/toom/prices` bei jeder Suche den aktuellen lokalen Worker-Cache. Dieser Kundenpfad startet weder Händlerabrufe noch Playwright. Der separate toom-Worker prüft zuerst jede gespeicherte Produkt-URL und die aktuelle offizielle Preisquelle; bei Bedarf folgt normales Chromium. Fehlgeschlagene Abrufe erhalten vorherige gültige Angebote und deren ursprüngliche Prüfzeit. Erfolgreiche Preisänderungen erhalten die alte Beobachtung in der Historie.

Der Matcher prüft Produktfamilie, harte Ausschlüsse und technische Merkmale vor Größenähnlichkeit und Bewertung. Acryl/Maleracryl/Anschlussacryl gehören zusammen; Silikon, Hybrid, PU-Dichtstoffe und Montagekleber bleiben getrennt. Gipskarton-Synonyme, Tiefgrund, Profiltypen, deutsche Ausschlusswörter und Mengen wie „1.000 Stück“ sind berücksichtigt. Wunschgröße zuerst, dann die nächste geprüfte vergleichbare Ausführung. 300 ml und 280 ml bleiben eigene Varianten; die große Kartenangabe bleibt der echte Gesamtpreis der angezeigten Packung.

Die vorhandenen Karten stehen weiterhin horizontal: 210 px am Desktop, 250 px auf kleinen Bildschirmen. Details sind aufklappbar. Eine neue Suche entfernt alte Karten sofort und zeigt fünf Ladeplatzhalter. Verspätete Antworten überschreiben keine neueren Ergebnisse. Produktlinks gehören zum angezeigten Produkt, Route zur jeweiligen Filiale.

Der bisherige gebündelte Händlerbestand bleibt erhalten. Für die toom-Prüfung wurden Zement und Sockelputz als Materialdefinitionen ergänzt, ohne Preise zu erfinden. Aktuell enthält der lokale toom-Cache 13 automatisch erneut prüfbare Produkte. Ein Onlinepreis ist keine Filialbestandszusage. [Aktuelle toom-Ergebnisse und Lücken](docs/TOOM-ABNAHME.md).

## Start und Einrichtung

Im Projektordner `npm install`, dann `npm run dev`. Lokal: http://127.0.0.1:3000/. Produktion lokal: `npm run build`, danach `npm start`. Die gebaute Anwendung wurde auf einem separaten Testport erfolgreich geprüft.

**Google:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local` setzen. Maps JavaScript API, Places API (New), Geocoding API, Routes API und Billing aktivieren. Die tatsächlich benutzten Website-Referrer freigeben: insbesondere `http://127.0.0.1:3000/*`, gegebenenfalls `http://localhost:3000/*`. Server nach Änderungen neu starten; öffentliche Variablen für Produktion neu einbauen. Verwendet wird das offizielle, auf Deutschland begrenzte `PlaceAutocompleteElement`. [Google-Anleitung](docs/GOOGLE-EINRICHTEN.md).

**Supabase für toom:** Im SQL Editor mit Owner-Zugang zuerst `supabase/migrations/202609220001_canonical_prices.sql`, danach `supabase/seed.sql` und `supabase/migrations/202610050001_toom_hourly_prices.sql` ausführen. Gültige URL und öffentlichen Schlüssel in `.env.local` eintragen; der Service-Role-Schlüssel gehört ausschließlich zum Worker. Anschließend `TOOM_USE_SUPABASE=true` setzen. Die echte Instanz wurde nicht migriert; derzeit werden toom-Aktualisierungen nur lokal gespeichert.

**toom:** Einmal `npx playwright install chromium`, dann `npm run toom:refresh`. Neue fehlende Zuordnungen bei Bedarf mit `npm run toom:refresh -- --discover` suchen. Der normale Stundenlauf besucht ausschließlich bekannte URLs; neue Suche nur bei bestätigter Entfernung. Cache und Historie: `work/toom-verified-cache.json`, alternativ `TOOM_CACHE_PATH` auf einem gemeinsamen dauerhaften Volume. Aktionspreis, durchgestrichener Preis und Grundpreis werden separat gespeichert. Manuell beobachtete echte Packungspreise können weiterhin über den bestehenden Import hinzugefügt werden. [Vollständige toom-Einrichtung](docs/TOOM-UPDATER.md).

**Stundenplan:** `.github/workflows/toom-refresh.yml` ist für jede Stunde vorbereitet, aber noch nicht aktiv. Es wurde nichts gepusht oder deployt. Vor Aktivierung werden die veröffentlichte Workflow-Datei, freigeschaltete Actions und für gemeinsame Website-Preise die gültige Supabase-Einrichtung benötigt. GitHub-Cache-Artefakte allein aktualisieren keine lokale oder auf Vercel laufende Webapp.

## Prüfungen und Grenzen

247 Tests, ESLint, TypeScript und `npm run build` bestehen. Zunächst wurden elf vorhandene toom-Produkte geprüft; zwei Preise änderten sich. Sechs zusätzliche Materialprüfungen lieferten zwei neue Zuordnungen und vier dokumentierte Ablehnungen. Der Wiederholungslauf prüfte alle 13 gespeicherten Produkte erfolgreich. Die Produktions-API und die produktive Kartenkomponente zeigen den aktuellen Uniflott-Packungspreis 38,99 € mit korrektem Produkt- und Routenlink. Die frühere aktive Beobachtung 43,99 € bleibt in der Historie. Ein isolierter PostgreSQL-Test prüft die neue Migration, RPC, Historie, Rollback und Zugriffsrechte. Filialdaten in Komponententests sind ausdrücklich Testfixtures.

- **Google live:** Letzter konkreter Befund: `API_KEY_HTTP_REFERRER_BLOCKED`. Eine erfolgreiche reale Autocomplete-Sitzung ist noch nicht bestätigt.
- **Supabase live:** `store_products`, `verified_store_prices` und `price_history` sind über den Schema-Cache nicht vorhanden (PGRST205); `materials.canonical_version` fehlt (42703). Der konfigurierte Service-Schlüssel wird mit HTTP 401 abgewiesen. Owner-Migration und gültiger Schlüssel sind erforderlich.
- **Visuelle Live-Abnahme:** Die Browsersteuerung wurde von der Browser-Sicherheitsrichtlinie abgewiesen. Die abschließende Sichtprüfung auf Desktop/Mobilgerät und mit echten Google-Vorschlägen bleibt offen. HTTP-, DOM- und Komponentenprüfungen ersetzen diese nicht.
- **toom-Lücken:** Direktabhänger ohne vollständigen Profilnachweis, Silikon ohne nachgewiesene Essigvernetzung, Perlfix nur in anderer Packung sowie PU-Schaum ohne vollständigen Nachweis der verlangten Genius-750-ml-Ausführung. Es wird kein falscher Ersatzpreis gespeichert. [Einzelbefunde](docs/TOOM-ABNAHME.md).

GitHub und Vercel wurden nicht verändert. [Aktuelle Prüfnachweise](docs/TOOM-ABNAHME.md). Gesamtfortschritt: 99 %; die genannten externen Einrichtungsschritte und Abnahmen bleiben offen.
