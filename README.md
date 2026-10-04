# Baumarktfinder Deutschland

Webapp für die nächsten Baumärkte zu einer deutschen Adresse und die erfassten Materialien ihrer Händler. Material ist optional: ohne Eingabe erscheint der gesamte verfügbare geprüfte Katalog der nahen Händler. Bestehendes Next.js-Projekt, bestehende Bildwelt und rot-weiße Gestaltung wurden weiterverwendet.

**Stand der Abnahme:** Der Code lässt sich bauen und lokal prüfen. Die vorhandene Supabase-Instanz benötigt die mitgelieferte Migration und den Seed. Der vorhandene Google-Schlüssel weist lokale Places-Anfragen wegen der HTTP-Referrer-Beschränkung zurück. Daher ist die App noch nicht als live vollständig abgenommen zu betrachten. Details und Händlergrenzen stehen in [docs/ABNAHME.md](docs/ABNAHME.md).

Der neue Katalogmodus kann bei Google-Ausfall auf eine ausdrücklich ausgelöste OpenStreetMap-Suche zurückgreifen. Für öffentliche Nominatim-Server gelten strenge Anwendungsgrenzen: keine Autovervollständigung, höchstens eine Anfrage pro Sekunde insgesamt und nur ein kleiner einzelner Serverprozess. Vor öffentlichem Betrieb [Konfiguration und offizielle Nutzungsregeln](docs/OSM.md) beachten; der kostenlose Dienst bietet keine Verfügbarkeitsgarantie. Bei fehlender Preisdatenbank werden ausschließlich tatsächlich überprüfte, mit Originaldatum gespeicherte Händlerbeobachtungen angezeigt. Ein vollständiges Filialsortiment oder Lagerbestand ist damit nicht behauptet.

## Funktionsumfang

- **OBI-Fortsetzung vom 04.10.2026:** freie Materialsuche ohne neue kanonische Datensätze, persistenter geprüfter Cache und separater Chromium-Updater als HTTP-Fallback. [Einrichtung](docs/OBI-UPDATER.md) · [Echte Abrufe und verbleibende Grenzen](docs/OBI-ABNAHME.md).

- Deutsche Google-Adressvorschläge und geprüfter deutscher Standort, auch bei Geolocation. Ausländische Filialen werden an Landesgrenzen ausgeschlossen.
- OBI, BAUHAUS, HORNBACH, toom, hagebau, Globus Baumarkt und HELLWEG im Umkreis von 35 km; maximal 15 physische Märkte.
- Serviceabteilungen werden ausgefiltert. Dubletten werden anhand von Kette, Adresse und räumlicher Nähe bereinigt, bevor Routen angefragt werden.
- Google Routes mit Verkehrslage; bei Ausfall bleiben Märkte und Preise sichtbar. Luftlinie wird ausdrücklich als solche bezeichnet.
- 34 konkrete Materialvarianten mit Synonymen, Schreibfehlertoleranz und überprüfbaren Packungs- und Maßangaben. Kompakte Größen wie „5L“ und „30kg“ funktionieren; unbekannte Größen werden nicht geraten.
- Bei Materialsuche erhält jede physische Filiale eine eigene Vergleichskarte. Je Kette zuerst die Wunschgröße, sonst die nächste geprüfte kompatible Variante unter ihrer eigenen Material-ID. Tatsächliche Größe und großer, zentrierter Packungspreis bleiben unverändert; der Grundpreis steht kleiner darunter. Fehlende Angebote bleiben sichtbar als „Preis nicht verfügbar“.
- Suche nur mit Adresse bleibt möglich: Materialkatalog mit Freitext-/Händlerfilter und nächster Filiale pro Angebot. Preisreihenfolge im Katalog ist nur innerhalb derselben Material-ID verfügbar.
- Separater Preis-Worker: Produkt finden, Merkmale prüfen, echten Packungspreis lesen und atomar speichern. Die Kundensuche verwendet geprüfte Datenbank-/Cachewerte. Die freie OBI-Suche kann serverseitig begrenzt strukturierte Daten nachladen; Chromium läuft ausschließlich im separaten OBI-Updater.
- Preisquelle, Prüfzeit, Grundpreis und Kettenpreis-Hinweis; keine erfundenen Preise oder Bestände. Produktlink und angezeigter Preis gehören zum selben geprüften Produkt.
- Kompakte horizontale Kartenreihe auf Desktop und Mobilgeräten. Neue Suche zeigt sofort fünf Ladeplatzhalter; verspätete Antworten ersetzen keine neueren Ergebnisse.
- Offizielle Händlersuche bei fehlender Produktzuordnung. Route führt zur ausgewählten Filiale; OpenStreetMap-Koordinaten werden nicht als Google Place ID behandelt.

## Lokal starten

**Später nur Google ergänzen:** [Kurzanleitung für den einen Maps-Schlüssel](docs/GOOGLE-EINRICHTEN.md). Der lokale Material- und Preiskatalog benötigt keine eigene Datenbankkonfiguration.

Node.js 24 LTS und npm verwenden. Die Mindestversion ist 22.12. Das Verzeichnis mit dieser README und `package.json` ist die Projektwurzel.

```sh
npm install
```

`.env.example` nach `.env.local` kopieren und Werte lokal eintragen. Keine Schlüssel in Git, Tickets oder Chatnachrichten kopieren.

```sh
npm run check:config
npm run dev
```

Standardadresse: `http://localhost:3000`. Adresse eingeben, Material bei Bedarf leer lassen und „Märkte finden“ wählen. Für die vollständige Datenbankfunktion Migration und Seed einspielen. Bei Ausfall stehen begrenzte echte gespeicherte Preisbeobachtungen und offizielle Händlerlinks zur Verfügung. Es gibt keinen Demo- oder Fakepreis-Modus.

## Umgebungsvariablen

| Variable | Einsatz |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-Projekt-URL; Browser und Preis-Worker |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Öffentlicher Supabase-Schlüssel; ausschließlich RLS-geschützte Leseabfragen |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Öffentlicher Browser-Schlüssel für Google Maps, auf Domains und APIs begrenzen |
| `SUPABASE_SERVICE_ROLE_KEY` | Nur Preis-Worker bzw. manueller Import, niemals Browser oder `NEXT_PUBLIC_*` |

Der bestehende alternative Name `NEXT_PUBLIC_SUPABASE_ANON_KEY` wird ebenfalls unterstützt. Für neue Konfigurationen den Publishable-Key-Namen verwenden. Die drei `NEXT_PUBLIC_*`-Werte müssen bereits **beim Build** gesetzt sein; nach Änderungen neu bauen bzw. deployen. Für die Webapp auf Vercel ist der Service-Role-Schlüssel nicht erforderlich.

## Supabase einrichten

Die Migration ist für die geprüfte Bestandsstruktur mit UUID-Material-IDs vorbereitet und lässt sich auch auf einer frischen Supabase-Datenbank ausführen. Vor Anwendung auf einer anderen Bestandsdatenbank deren Struktur prüfen. Eine übliche Datenbanksicherung anlegen.

Im Supabase SQL Editor mit dem Datenbank-Owner nacheinander ausführen:

1. `supabase/migrations/202609220001_canonical_prices.sql`
2. `supabase/seed.sql`

Alternativ dieselben Dateien mit `psql -v ON_ERROR_STOP=1` auf einer **lokal konfigurierten Owner-Verbindung** ausführen. Die vorhandenen REST-/Service-Role-Schlüssel ersetzen keine SQL-Verbindung und erlauben keine Schema-Migration.

Anschließend:

```sh
npm run check:config
npm run prices:dry-run -- --stores hornbach --limit 3
npm run prices:update -- --stores hornbach
```

Die Migration erhält bestehende Material-IDs, `material_aliases`, alte `store_prices` und gegebenenfalls `analytics_events`. Ungeprüfte alte Materialdefinitionen bleiben Version 0. Ihre alten Preise werden **nicht** ungeprüft als vergleichbare Preise übernommen. Sie bleiben zur kontrollierten Nachprüfung erhalten.

Neue bzw. erweiterte Tabellen:

| Tabelle | Zweck |
| --- | --- |
| `materials` | Kanonische Definition, JSON-Spezifikation, Einheit, Packungsmenge und Version |
| `canonical_material_aliases` | Synonyme; ein Suchwort darf mehrere konkrete Varianten liefern |
| `stores` | Händlerketten, keine doppelten Preise pro Filiale |
| `store_products` | Geprüfte Zuordnung von kanonischem Material und Händlerprodukt |
| `verified_store_prices` | Letzter gültiger Preis je Material und Kette |
| `price_history` | Historie erfolgreicher Prüfungen |

Die RPC `save_verified_price` aktualisiert Zuordnung, Preis und Historie in einer Transaktion. Veraltete Beobachtungen überschreiben neuere nicht. Geänderte Materialmerkmale machen eine erneute Produktprüfung nötig. Anonyme Nutzer können freigegebene Materialien und geprüfte Preise lesen, aber weder schreiben noch die Preis-RPC aufrufen. Alte Preise und die administrative Historie sind nicht öffentlich lesbar.

Die aktuelle Migration zusätzlich auf bereits eingerichteten Instanzen erneut ausführen: Sie prüft jetzt die tatsächlich vom Worker validierten Spezifikationen und die kanonische Version gegen den gesperrten Materialdatensatz. Zwischenzeitlich geänderte Definitionen werden vor jeder Preisänderung abgewiesen.

Der kanonische Katalog liegt in `supabase/canonical-materials.json`. Nach einer bewussten Katalogänderung erzeugt `npm run materials:seed` die SQL-Datei neu. Maße und Packungsgrößen dürfen nicht still umgedeutet werden; für eine neue Ausführung eine eigene Definition anlegen. Der Seed enthält keine Händlerpreise.

## Google Maps einrichten

Im Google-Cloud-Projekt Billing und folgende APIs aktivieren:

1. Maps JavaScript API
2. Places API (New)
3. Geocoding API
4. Routes API

Verwendet werden die JavaScript-Bibliotheken `places`, `geocoding` und `routes` mit dem offiziellen `PlaceAutocompleteElement`, `Place.searchByText` und `RouteMatrix`. Google stellt die Vorschlagsoberfläche bereit; `gmp-select` übernimmt die ausgewählte deutsche Adresse. Die alten Places-/Distance-Matrix-Dienste sind nicht Voraussetzung.

Den Browser-Schlüssel auf **Websites / HTTP-Referrer** und die tatsächlich benötigten APIs beschränken. Die exakten genutzten Origins freigeben, etwa `http://localhost:3000/*` und `https://deine-domain.de/*`; temporäre Test- und Vercel-Preview-Domains nur gezielt. `localhost` und `127.0.0.1` sind verschiedene Hosts. Referrer-Einschränkungen nicht zur Fehlerbehebung entfernen. Kontingente und Budgetbenachrichtigungen passend zur Nutzung festlegen.

Google-Schlüssel sind clientseitig sichtbar. Die Anwendung blendet Google- und ggf. Drittanbieterattribution ein. Es wird keine dauerhafte lokale Kopie von Google-Standortdaten angelegt. Google wird für Adressvorschläge nach Eingabe einer Adresse geladen. Geolocation fragt die Browserfreigabe ab; Ablehnung und Zeitüberschreitung sperren das Formular nicht dauerhaft.

Offizielle Referenzen: [Google-Schlüsselschutz](https://developers.google.com/maps/api-security-best-practices), [Places](https://developers.google.com/maps/documentation/javascript/reference/place), [RouteMatrix](https://developers.google.com/maps/documentation/javascript/reference/route-matrix).

## Preise sammeln und pflegen

Die vollständige Beschreibung einschließlich Importformat steht in [docs/PREISDATEN.md](docs/PREISDATEN.md).

```sh
npm run prices:dry-run -- Rotband
npm run prices:update -- --stores hornbach Rotband
npm run prices:import -- pfad/zu/geprueften-preisen.json
npm run prices:import -- pfad/zu/geprueften-preisen.json --write
npm run prices:import -- pfad/zu/geprueften-preisen.json --local --write
npm run prices:snapshot -- --stores=hornbach --all-materials
```

Importe sind standardmäßig schreibfreie Prüfungen. Ein Worker-Ausfall löscht keinen Preis. Ein älterer Preis bleibt mit seinem ursprünglichen Prüfzeitpunkt sichtbar. Automatische Erreichbarkeit hängt vom Händler ab; CAPTCHA, Sperren und robots-Vorgaben werden nicht umgangen. Die manuellen Zuordnungen und Preise werden mit derselben kanonischen Prüfung und eigener Quellenkennzeichnung gespeichert.

`prices:snapshot` aktualisiert den öffentlichen Ersatzkatalog in `src/data/verified-catalog-snapshot.json` ohne Datenbankzugang. Nur tatsächlich abgerufene, unter ihrer eigenen kanonischen Variante geprüfte Angebote gelangen hinein; erfolglose Abrufe erhalten alte Werte und Zeitstempel. Stand 03.10.2026: zusammen mit den manuellen Daten 59 unterschiedliche Angebote aus sechs Ketten, 34 Materialvarianten. [Genaue Abdeckung und Lücken](docs/PREISABDECKUNG.md). Die Kundensuche kombiniert Datenbank und gespeicherte Beobachtungen je Material/Kette; der neueste gültige Prüfzeitpunkt gewinnt. Der Snapshot wird mit der App ausgeliefert und benötigt nach Änderungen einen neuen Produktionsbuild. Im laufenden Regelbetrieb übernimmt der separate Datenbank-Worker die Preise; der gebündelte Katalog aktualisiert sich nicht selbst.

`.github/workflows/price-update.yml` führt die Aktualisierung täglich um **03:23 UTC** aus und erlaubt einen manuellen Start, standardmäßig als Dry Run. In GitHub Actions die Secrets `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzen. Der Worker läuft außerhalb der Vercel-Webanfragen; lange Abrufe blockieren keine Kundensuche. Der Bericht wird als Workflow-Artefakt gespeichert. Null geprüfte Angebote oder Speicherfehler markieren den Lauf als fehlgeschlagen; Teilprobleme je Händler stehen im Bericht.

## Tests und Produktion

```sh
npm run lint
npm run test
npm run build
npm run start
npm audit --omit=dev
```

`npm run verify` fasst Lint, Tests und Produktionsbuild zusammen. `npm run typecheck` steht ergänzend zur Verfügung. Die GitHub-CI führt dieselben Prüfungen ohne produktive Schlüssel aus. Tests enthalten ausdrücklich gekennzeichnete synthetische Fälle, die niemals als Kundendaten ausgeliefert werden.

Zusätzlich lässt sich die Migration gegen isoliertes PostgreSQL/PGlite prüfen:

```sh
node supabase/verify-schema.mjs file:///absoluter/pfad/zu/pglite/dist/index.js
```

Das optionale Testwerkzeug `@electric-sql/pglite` separat installieren; es ist keine Produktionsabhängigkeit. Der Test prüft zweimaliges Einspielen, Bestandsdatenerhalt, RLS, atomare Preisupdates, Zeitstempel, Grundpreis, Historie und Rücknahme fehlgeschlagener Transaktionen. Die konkrete Abnahme und ihre Grenzen stehen in `docs/ABNAHME.md`.

## GitHub und Vercel

Diese Projektwurzel in ein GitHub-Repository übernehmen. `.env.local`, `.git`, `.next`, `node_modules` und `work` gehören nicht in eine Quellcode-ZIP. Vorhandene persönliche Änderungen wurden nicht zurückgesetzt.

In Vercel dieses Repository als Next.js-Projekt importieren. Falls das Repository den übergeordneten Ordner enthält, `frontend` als Root Directory setzen; bei der mitgelieferten ZIP ist der entpackte Projektordner selbst die Wurzel. Node.js 24, Install `npm ci`, Build `npm run build`; das Next.js-Frameworkpreset verwenden. Die drei öffentlichen Umgebungsvariablen vor dem Build setzen, Supabase-Migration/Seed anwenden und den Google-Schlüssel für die tatsächliche Domain freigeben. Keine kundenseitigen Schreibrechte vergeben.

GitHub-Push und Vercel-Deployment sind ausdrücklich nicht beauftragt und wurden nicht ausgeführt. Betreiberangaben, Impressum und Datenschutzerklärung wurden nicht erfunden; sie müssen vor einer späteren öffentlichen Inbetriebnahme mit den tatsächlichen Betreiberinformationen ergänzt werden.

## Aufbau

```text
src/components/          Suchformular, Vorschläge, Ergebniskarten
src/services/maps.ts     Deutsche Adressen, Marktsuche und Routen
src/lib/stores.ts        Händlerregeln, Entfernung und Dubletten
src/services/materialSuggestions.ts  Kanonischer Katalog und Synonyme
src/services/prices.ts   Nur geprüfte Material-/Kettenpreise lesen
src/services/catalog.ts  Händlerkatalog mit begrenzter Pagination und Ersatzdaten
src/lib/osm-server.ts     Offene Standortsuche, Cache und Abrufbegrenzung
src/app/api/nearby/       Standort-Endpunkt ohne Browser-API-Schlüssel
src/lib/resolver.ts      Offizielle Händlersuchlinks
scripts/shop-reader/    Quellen, Abrufgrenzen und Produktprüfung
scripts/update-store-prices.mjs      Automatische Pipeline
scripts/import-store-prices.mjs      Kontrollierter manueller Import
scripts/refresh-catalog-snapshot.mjs Geprüfter Ersatzkatalog ohne DB-Zugriff
supabase/               Migration und kanonischer Seed
tests/                  Regressionstests
```
