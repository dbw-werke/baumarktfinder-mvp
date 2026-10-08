# Stündliche toom-Preisprüfung

Stand: 06.10.2026. Nur toom wurde erweitert; Karten, Logos, Maps und übrige Händler bleiben erhalten.

## Ablauf

`npm run toom:refresh` lädt alle vorhandenen geprüften toom-Zuordnungen aus den bestehenden Beobachtungen, dem lokalen Cache und optional Supabase. Jede gespeicherte Produkt-URL wird zuerst direkt aufgerufen. Die SAP-Artikelnummer der eigenen Produktseite bindet die aktuelle öffentliche toom-Preisantwort an genau diesen Artikel. Veraltete `meta_price`-/JSON-LD-Werte reichen nicht als aktueller Preisbeleg. Auch der bisherige allgemeine Preis-Worker benutzt für toom diese Bestätigung.

Aktiver Angebotspreis, regulärer Preis, durchgestrichener Preis und Grundpreis bleiben getrennt. Für Platten zählt der unabhängig angegebene Packungsgesamtpreis. Grundpreise werden nie zu erfundenen Gesamtpreisen hochgerechnet. Aktionen in der Zukunft, abgelaufene Aktionen, Mengenrabatte und widersprüchliche Preise werden nicht übernommen. Die Produktfamilie und tatsächliche Packung müssen weiterhin zum gespeicherten Material passen.

Wenn die direkte Preisquelle unbrauchbar ist, öffnet nur der separate Worker eine normale Chromium-Sitzung. Er liest die aktuelle eigene Kaufbox, verarbeitet normale Cookie-Abfragen und verwendet eine Sitzung je Lauf. CAPTCHA, HTTP 401/403/429 und harte Sperren beenden weitere Händlerabrufe. Keine Umgehung, keine Stealth-Technik. Die Seiten werden nacheinander mit mindestens 2,5 Sekunden Abstand besucht.

Bei bestätigter Entfernung/404 wird erneut nach dem Material gesucht. Nur ein technisch gültiger Kandidat ersetzt die URL. Fehler erhalten den letzten gültigen Preis **und dessen bisheriges Prüfdatum**. Erfolgreiche unveränderte Prüfungen aktualisieren `checked_at`; Preis-/Produktänderungen erhalten die vorherigen Beobachtungen in der Historie.

## Lokal ausführen

```powershell
npm install
npx playwright install chromium
npm run toom:refresh
```

Weitere Optionen:

```powershell
# Fehlende kanonische Materialien einmalig entdecken und erfolgreich zuordnen:
npm run toom:refresh -- --discover
# Gezielte Prüfung; regulärer Stundenlauf benötigt keinen Suchfilter:
npm run toom:refresh -- --query "uniflott"
# Begrenzter Lauf und eigener Bericht:
npm run toom:refresh -- --limit 10 --report work/toom-refresh-test.json
```

Der Stundenlauf sucht nicht erneut nach bereits bekannten Artikeln. Neue erfolgreiche Zuordnungen aus `--discover`, dem bestehenden Import oder Supabase werden in den nächsten Lauf aufgenommen. Die Materialdefinitionen liegen weiterhin in `supabase/canonical-materials.json`; der vorhandene Matcher bleibt maßgeblich. `--limit` begrenzt einen manuellen Lauf, ist kein automatischer rotierender Batch-Plan.

Standarddatei: `work/toom-verified-cache.json`. Sie enthält aktuelle geprüfte Preise, Preisänderungshistorie und letzte Fehler. `TOOM_CACHE_PATH` kann einen anderen dauerhaften Pfad festlegen. Server und Worker müssen dieselbe Datei sehen. Atomisches Schreiben und eine `.lock`-Datei verhindern überlappende lokale Läufe. Nach einem harten Prozessabbruch eine verwaiste Lockdatei nur entfernen, nachdem bestätigt wurde, dass kein Updater mehr läuft. Fehler beim Lesen einer vorhandenen Cachedatei werden nicht durch Überschreiben beseitigt.

`GET /api/toom/prices` liest diese Datei bei jeder Anfrage mit `no-store`. Die Kundensuche übernimmt pro Material/Kette die neueste geprüfte Beobachtung aus Laufzeitcache, Supabase und gebündeltem Katalog. Eine Preisänderung erscheint ohne Neubau oder Serverneustart bei der nächsten Suche. Im Kundenpfad werden keine toom-Seiten und kein Chromium aufgerufen.

## Preis- und Marktkontext

`TOOM_TEST_MARKET_ID` ist optional; Standard ist 3248, der bei der Untersuchung von toom ausgewählte Markt Troisdorf. Abgerufen wird der öffentliche `deliver`-Preiskanal, nicht der `reserve`-Abholpreis. Dieser Kontext ist keine Zuordnung zum Kundenmarkt. Lieferbarkeit kann fehlen; sie wird nicht als Filialbestand dargestellt. Preisbeleg und Markt-/Lieferkontext werden gespeichert. Die vorhandene Karteninformation weist weiterhin auf mögliche Filialabweichungen hin.

## Supabase: aktueller realer Stand

Der geprüfte öffentliche Zugang meldete:

- `store_products`, `verified_store_prices`, `price_history`: HTTP 404 / `PGRST205`, im Schema-Cache nicht vorhanden.
- `materials.canonical_version`: HTTP 400 / PostgreSQL `42703`, Spalte fehlt.
- Konfigurierter Service-Role-Schlüssel: HTTP 401, `Invalid API key`.

Es wurde **keine Live-Migration durchgeführt**. Ergebnisse werden derzeit ausschließlich lokal gespeichert. [Live-Befund](evidence/toom-schema-20261005.json).

Mit Owner-Zugang im SQL Editor in dieser Reihenfolge ausführen:

1. `supabase/migrations/202609220001_canonical_prices.sql`
2. `supabase/seed.sql` (Materialdefinitionen, keine erfundenen Preise)
3. `supabase/migrations/202610050001_toom_hourly_prices.sql`

Danach gültige `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (alternativ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) und ausschließlich serverseitig `SUPABASE_SERVICE_ROLE_KEY` konfigurieren; `TOOM_USE_SUPABASE=true` setzen. Die neue Migration erweitert die vorhandenen Tabellen additiv um `old_price` und `fetch_method`. Der Service-RPC `refresh_verified_toom_price` schreibt Zuordnung, aktiven Preis und Historie atomar. Ältere Beobachtungen werden ignoriert; fehlgeschlagene Transaktionen rollen vollständig zurück. Es gibt kein zweites unverbundenes Datenbankmodell.

Lesen oder Schreiben in Supabase darf scheitern, ohne den lokalen gültigen Preis zu löschen. Der Bericht unterscheidet `cache_updated`, `db_updated`, `schema_error` und `db_failure_reason`. Ein isolierter PostgreSQL-Test bestätigt Migration, Wiederholbarkeit, RPC, Historie, Rollback und Zugriffsrechte; er ersetzt die ausstehende Migration der echten Instanz nicht.

## Stundenplan

`.github/workflows/toom-refresh.yml` ist für jede Stunde zur Minute 17 UTC konfiguriert, zusätzlich manuell auslösbar. Er installiert Chromium, lädt den letzten Cache derselben Branch, prüft bekannte URLs und archiviert Cache/Historie sowie Diagnosebericht auch bei einzelnen Abruffehlern. Nach einer fehlgeschlagenen Cache-Wiederherstellung wird kein unvollständiger Ersatz archiviert. GitHub kann geplante Läufe verzögert starten.

Der Workflow ist **lokal vorbereitet, nicht aktiviert**: Es wurde nichts gepusht oder deployt. Nach ausdrücklicher Freigabe muss er auf die Standardbranch gelangen und GitHub Actions aktiviert sein. Für gemeinsame Webapp-Preise sind die oben genannten gültigen Supabase-Secrets nötig. Ein GitHub-Artefakt versorgt nur spätere Workflow-Läufe; es aktualisiert weder die lokale Datei dieses PCs noch eine Vercel-Datei automatisch. Ohne Supabase braucht ein eigener dauerhaft laufender Worker dasselbe beschreibbare Volume wie der Webserver. Hier wurde kein zusätzlicher Windows-/Codex-Stundenjob angelegt.

## Prüfungen

[Ergebnisse pro Material](TOOM-ABNAHME.md). 247 Tests, ESLint, TypeScript und `npm run build` bestanden. Die gebaute Anwendung wird zusätzlich per HTTP und mit den produktiven Kartenkomponenten geprüft. Die Chromium-Abnahme betrifft die echte toom-Produktseite; eine visuelle Neuabnahme der unveränderten gesamten Webapp ist damit nicht behauptet.
