# OBI: Suche, Browser-Updater und Speicherung

Stand: 04.10.2026. Nur OBI wurde in dieser Fortsetzung erweitert. [Ergebnisse pro Suchbegriff und Nachweise](OBI-ABNAHME.md).

## Ablauf

1. Bereits verifizierte Produkte aus Datei/Supabase und den belegten Ersatzdaten prüfen. Kürzlich bestätigte passende Angebote werden wiederverwendet. Eine bloße Größenalternative verhindert nicht die Suche nach einer ausdrücklich gewünschten exakten Größe.
2. Der separate Updater versucht den bestehenden strukturierten HTTP-Reader auf offiziellen OBI-Seiten. Bereits bekannte Produkt-URLs werden berücksichtigt.
3. Bei 404, fehlenden Produkten/Preisen oder ungültigen Treffern verwendet **nur dieser Updater** lokales Playwright/Chromium. Eine normale Sitzung wird innerhalb des Laufs wiederverwendet; JavaScript, Weiterleitungen und notwendige Cookies funktionieren. Optionale Cookie-Zustimmungen werden über die normale Oberfläche abgelehnt. Suchergebnisse und bis zu sechs Produktseiten werden sequenziell mit mindestens 2,5 Sekunden Abstand geprüft.
4. Falls kein neuer gültiger Treffer entsteht, bleiben frühere verifizierte automatische/manuelle Belege mit dem ursprünglichen Prüfdatum erhalten. Ohne Beleg bleibt der Preis leer.

Die Kundensuche nutzt `POST /api/obi/search` mit `{"query":"Acryl 310 ml"}`. Sie liest den Cache und kann bei fehlendem/veraltetem Treffer einen begrenzten strukturierten HTTP-Abruf ausführen. Sie importiert und startet **kein Playwright**. Der Browser des Kunden kontaktiert OBI nicht zum Scrapen. Das bestehende Frontend zeigt das Ergebnis auf den nahen OBI-Filialkarten; alle anderen Händlerpfade bleiben bestehen. Ein Onlinepreis der Kette bestätigt keinen Filialpreis oder Lagerbestand.

CAPTCHA, 401/403/429 oder erkennbare Bot-Challenges stoppen die Abrufsitzung (`FETCH_BLOCKED`, Ursache `captcha`/`hard_bot_block`). Auch robots.txt wird beachtet. Kein Stealth, keine Challenge-Lösung, kein Proxywechsel und keine aggressiven Wiederholungen.

## Lokal ausführen

Im Ordner mit `package.json`:

```sh
npm install
npx playwright install chromium
npm run obi:search -- "Acryl 310 ml"
npm run obi:search -- "Direktabhänger" --refresh
npm run obi:search -- --fallback-regression --refresh
npm run obi:search -- --regression
```

Chromium ist auf diesem Rechner bereits vorhanden und wurde erfolgreich verwendet. `--refresh` fordert eine Aktualisierung trotz frischem Cache an, hebt aber keine Block-/Robots-Sperre auf. Ohne `--refresh` werden aktuelle Treffer wiederverwendet. Berichte stehen standardmäßig in `work/obi-search-last.json`. Mit `--report=docs/evidence/mein-bericht.json` lässt sich der Bericht dauerhaft ablegen.

Der Befehl wird bewusst separat gestartet. Für regelmäßige Aktualisierungen diesen CLI-Befehl als einzelnen Worker ausführen; nicht in Seitenaufrufe oder in React-Effekte einbauen. Der ältere `prices:update`-Befehl bleibt der kanonische Mehrhändler-Worker; für die neue freie OBI-Suche den hier beschriebenen `obi:search`-Worker verwenden. Es wurde keine neue Automation, kein Push und kein Deployment gestartet.

## Cache und Supabase

Standard: `work/obi-query-cache.json`, alternativ `OBI_CACHE_PATH` in `.env.local`. Server und Worker müssen denselben absoluten Pfad bzw. dasselbe persistente Volume verwenden. Die Datei wird atomar ersetzt; höchstens 500 Produkte und maximal 8 MB werden eingelesen. Ein laufender Server liest Änderungen spätestens bei einer Suche nach drei Sekunden erneut. Frischegrenze: 24 Stunden. Fehlgeschlagene Abrufe haben eine 15-minütige Wiederholungspause. Ein einzelner Worker pro Datei vermeidet konkurrierende Dateischreiber.

Für mehrere Server oder flüchtige Dateisysteme die vorbereitete Supabase-Schicht aktivieren:

1. `supabase/migrations/202610040001_obi_verified_products.sql` im Supabase SQL Editor mit Owner-Rechten ausführen. Die Migration erzeugt eine eigene SKU-/URL-basierte Tabelle; freie OBI-Produkte benötigen keine erfundenen kanonischen Material-IDs.
2. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` und `OBI_USE_SUPABASE=true` setzen. Der Server liest verifizierte Daten zentral und behält Datei-/Originalbelege als Ersatz.
3. `SUPABASE_SERVICE_ROLE_KEY` nur im Server-/Worker-Umfeld setzen, niemals als `NEXT_PUBLIC_*`. Nur die Service-Rolle darf über `record_verified_obi_product` schreiben. Ältere Beobachtungen überschreiben neuere nicht.
4. Worker ausführen; neue validierte Kandidaten werden zusätzlich zentral gespeichert. Datenbankfehler löschen den lokalen gültigen Preis nicht und erscheinen im Diagnosebericht.

Die zusätzliche Migration/RPC/RLS wurde isoliert in PostgreSQL getestet. Die externe Supabase-Instanz wurde nicht migriert; diese zentrale Speicherung ist ohne Migration und aktivierte Konfiguration noch nicht live abgenommen. Lokale Speicherung und Kundensuche funktionieren bereits ohne diese Freischaltung.

## Optionaler Testmarkt

Für normale Markt-Auswahl im Updater kann `OBI_TEST_MARKET_URL` auf eine tatsächlich existierende offizielle URL unter `https://www.obi.de/markt/...` gesetzt werden. Der Reader besucht sie und verwendet den sichtbaren Button zur Marktauswahl; fehlt er, meldet er `test-market-selection-unconfirmed`. Optional kann `OBI_BROWSER_STORAGE_STATE` auf eine lokal gespeicherte normale Playwright-Sitzung zeigen, z. B. unter `work/`. Sitzungsdateien nicht veröffentlichen. `OBI_BROWSER_HEADLESS=false` ist nur eine optionale lokale Diagnoseeinstellung.

Die erfolgreichen Onlineabrufe benötigten keinen ausgewählten Markt. Die Markt-Auswahl wurde daher nicht als erfolgreich getestet behauptet. Ein solcher Testmarkt wird niemals als Kundenfiliale ausgegeben. Angebote ohne eindeutig belegten OBI-Online-Verkäufer werden für die Kettenkarten nicht übernommen; tatsächliche Einzelmarktpreise benötigen eine gesonderte Filialzuordnung.

## Preisbeleg und manuelle Pflege

`src/data/obi-verified-products.json` enthält ergänzende manuell gelesene Originalbelege ohne Material-ID. Bestehende Belege aus `manual-prices.json` werden ebenfalls verwendet. Neue manuelle Zeilen nur nach Prüfung der echten offiziellen Produktseite ergänzen: `name`, vollständige eigene `url`, **Gesamtpreis** in `price`, `currency: "EUR"`, `priceBasis: "package"`, `priceSource: "manual-admin-verification"`, tatsächlicher Beobachtungszeitpunkt in `retrievedAt`, belegte `observedSpecs` und eine Prüfanmerkung. Niemals Grundpreise hochrechnen, Zeitstempel beim bloßen Kopieren erneuern oder fremde Verkäufer als OBI ausgeben.

Die 14 ergänzten manuellen Belege wurden über gerenderte offizielle OBI-Seiten gelesen; der Web-Renderer kann zwischengespeicherte Seiten liefern. Sie sind deshalb als manuell und mit ihrem Beobachtungsdatum gekennzeichnet. Neue bestätigte Browser-Abrufe derselben URL haben Vorrang.

Der Matcher prüft Familie/Identität und Ausschlüsse vor technischen Anforderungen, tatsächlicher Packung und Bewertung. Acryl/Silikon, CD/CW/UW, Standard-/Feuchtraumplatte, Zement/Putz/Mörtel und wesentliche Materialarten bleiben getrennt. Mehrfachpackungen brauchen eindeutige Mengen. Titel und eigene technische Attribute dürfen sich nicht widersprechen. Versandgewicht, Kartonmaße und Preise empfohlener anderer Produkte sind keine Produkteigenschaften. Paketflächen werden nur aus ausdrücklich angegebenen Maßen/Inhalten gewonnen, nie aus Preisdivision.

## Diagnose

Jeder Bericht enthält Anfrage, normalisierte Anfrage, direkte/browserbasierte Abrufstufe, Anzahl extrahierter Produkte, Kandidaten mit Familien/Spezifikationen/Score/Ablehnungsgrund, ausgewähltes Produkt, tatsächliche Packung, Gesamt-/Grundpreis, URL, Quelle, Prüfdatum, Verifikationsstatus und Cache-Ergebnis. `not_run` bzw. `retrieval: null` bedeutet Wiederverwendung/Sperrpause, keinen erfolgreichen Netzabruf.

Typische Ursachen: `direct_fetch_404`, `direct_empty_products`, `playwright_no_products`, `playwright_price_missing`, `playwright_seller_unverified`, `playwright_online_offer_unverified`, `playwright_conditional_price`, `no_valid_product_match`, `FETCH_BLOCKED`, `database-read-failed`, `database-write-failed`. Ein gültiger Browser-Fallback darf trotz eines vorherigen HTTP-404 erfolgreich sein.
