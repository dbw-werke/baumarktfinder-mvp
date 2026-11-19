# Preiszuverlässigkeit und Betrieb

Stand: 19.11.2026. Keine Neugestaltung, keine neuen Dienste und keine Erweiterung des Produktsortiments. Die bestehenden kanonischen Materialien, Händleradapter und Transaktionen bleiben Grundlage.

## Nachgewiesene Ursachen

- **Hourly verified toom prices**, Lauf `43968078520`: 34/34 Abrufe scheiterten. Die toom-Seite wechselte von Legacy-Produktdaten zu Next.js Flight. Der alte Parser fand dadurch keine Produktidentität. Browserfehler wurden zu einem ungenauen Sammelfehler reduziert. Mangels erfolgreicher Prüfungen verweigerte der Publisher korrekt neue Daten.
- **German retailer price update**, Lauf `43861114176`: Abbruch vor dem Reader wegen fehlender `NEXT_PUBLIC_SUPABASE_URL`. Repository-Secrets und Secrets der Umgebung `Production` waren leer; auch `SUPABASE_SERVICE_ROLE_KEY` fehlt. Die lokal hinterlegte Projektadresse ist per DNS nicht erreichbar (`ENOTFOUND`). Es wurden keine ungültigen lokalen Werte zu GitHub kopiert.
- **Validate application**, Lauf `43822275408`, Commit `6744ce4`: bereits erfolgreich; frühere rote Runs sind kein Beleg für einen aktuellen CI-Fehler.
- Drei ausgewählte toom-Produkte blieben trotz neuerer veröffentlichter Beobachtungen auf den manuellen Screenshot-Preisen/Prüfdaten stehen. Ursache war die absolute Priorität der historischen Beobachtung statt der Produktidentität.
- Der lokale Abschlussbuild mit Next.js 16.4.2 wurde durch den Sicherheitshinweis zu GHSA-mfr8-8qww-v76h / GHSA-vc7v-qv4w-wrv8 angehalten. Next.js und die zugehörige ESLint-Konfiguration wurden auf die korrigierte Patch-Version 16.4.6 aktualisiert; Produktionsbuild und Audit der Produktionsabhängigkeiten sind danach erfolgreich.

## Datenweg und Fehlergrenzen

1. Der toom-Worker prüft gespeicherte exakte URLs. Daten werden ausschließlich geparst, nicht als JavaScript ausgeführt. SKU und kanonische URL müssen zur eigenen Produktseite passen. Der aktuelle Verkaufspreis wird unabhängig über den gebundenen öffentlichen Preisendpunkt bestätigt. Ein Metadatenpreis allein genügt nicht.
2. Der bestehende Matcher prüft Produktfamilie, Material, Maße, Wärmeleitfähigkeit und tatsächliche Packung. Widersprüchliche oder unzureichende Angaben werden abgelehnt und im Bericht dokumentiert.
3. Ein bestätigter Abruf speichert seinen tatsächlichen Zeitstempel. Fehler erhalten den bisherigen Preis, `checked_at` und die Historie. Datenbanktransaktionen müssen eine gültige gespeicherte ID bestätigen; leere Antworten gelten nicht als Erfolg.
4. Der Publisher exportiert nur validierte öffentliche Felder. Er verbindet den aktuellen Cache mit dem bisherigen Snapshot, damit Teilprüfungen oder ältere Artefakte keine neueren Preise verlieren. Ein Datenbankfehler bleibt als Workflow-Fehler sichtbar; unabhängig bestätigte Cache-Preise können trotzdem veröffentlicht werden.
5. Vercel liest den veröffentlichten GitHub-Snapshot über `/api/toom/prices`; erneuter Abruf spätestens nach dem bestehenden Fünf-Minuten-Cache. Der Kundenpfad startet weder Chromium noch einen toom-Abruf. Der automatische Bot-Commit benötigt deshalb keinen zusätzlichen Vercel-Build, um Preise zu aktualisieren.
6. Ausgewählte Produkte behalten ihre exakte Identität/Packung. Neuere bestätigte Beobachtungen dieser Identität gewinnen auch gegen alte manuelle Beobachtungen. Andere Händlerartikel verdrängen die Auswahl nicht.

## Matching und Suche

Die bestehenden `supabase/canonical-materials.json`, Materialalias-Daten und `materialSearch.mjs` bilden Taxonomie und Suchwortschatz; es gibt keinen zweiten Katalog. Präfixsuche, Schreibvarianten und kontrollierte Tippfehlertoleranz dienen der Entdeckung. Die technische Prüfung entscheidet anschließend über Vergleichbarkeit.

- „Dämmung“ findet die vorhandenen Dämmstofffamilien; „Glaswolle“ darf nicht zu einer identischen Steinwolle-Packung werden.
- „Rigips“, „Gipskarton“, „GKB“ und „GK-Platte“ werden erkannt; Feucht-/Brandschutz und Dicke bleiben getrennt.
- CW/UW sowie unterschiedliche Dicken sind technische Grenzen. Rotband 10 kg und 25 kg sind unterschiedliche Packungen; passende andere Packungen werden ausdrücklich als Alternative geführt.
- 0,034/0,035/0,036 W/(m·K) sind unterscheidbar. Abweichende Angaben zwischen Titel und technischen Attributen werden nicht durch eine großzügige Zahlentoleranz verdeckt.
- Händler-SKU und vorhandene GTIN-Belege binden die jeweiligen Adapter. Gleiche Identifikatoren heben technische Widersprüche nicht auf. Ein vollständiges händlerübergreifendes GTIN-Verzeichnis ist mangels freigegebener Produktfeeds nicht vorhanden und wird nicht vorgetäuscht.

## Aktualität, Monitoring und Zugriff

- Bis 24 Stunden: frisch geprüft; bis sieben Tage: gespeicherte Beobachtung; darüber: im bestehenden Statusfeld als **veraltet** gekennzeichnet. Das tatsächliche Prüfdatum bleibt in den Preisdetails.
- Ohne verifizierten Händlerpreis erzeugt der Vergleich keinen numerischen Ersatz aus anderen Händlerpreisen. Die vorhandene Karte meldet „Preis aktuell nicht verfügbar“ und behält Händler-/Routenlinks.
- Ein fehlgeschlagener Händler verhindert nicht die Prüfung anderer Händler. Abruf-/Schreibfehler führen trotzdem zu einem Fehlerstatus; kein `continue-on-error` zur Unterdrückung der Benachrichtigungen.
- Actions archiviert Diagnosen und Cache/Historie auch nach Teilfehlern. Die Job-Zusammenfassung zeigt Prüfungen, bestätigte Datenbankwrites, Fehlerkategorien, fehlende Variablennamen und auffällige Preisänderungen (>2× bzw. <½).
- HTTP 401/403/429, CAPTCHA, robots.txt und Zugriffssperren werden respektiert. Es gibt keine Stealth-Technik, Proxy-Rotation oder Wiederholung zur Umgehung einer Sperre. Vorübergehende Netz-/Serverfehler dürfen nur begrenzt wiederholt werden.
- Geheimnisse gehören ausschließlich in Server-/Actions-Konfiguration. Berichte enthalten keine API-Schlüssel oder vollständigen Backend-Fehlerantworten.

## Noch notwendige Betreiberkonfiguration

Der allgemeine tägliche Datenbankimport kann ohne diese Schritte nicht erfolgreich werden. Sein Fehlerstatus wird bewusst nicht versteckt:

1. Ein erreichbares Supabase-Projekt bereitstellen oder das bisherige wiederherstellen. Die bisherige lokale URL ist nicht per DNS erreichbar.
2. Bestehende kanonische Migration, Seed und toom-Migration gemäß `TOOM-UPDATER.md` auf der echten Instanz prüfen/anwenden. In dieser Reparatur wurde keine echte Datenbank migriert.
3. In GitHub **Settings → Secrets and variables → Actions** `NEXT_PUBLIC_SUPABASE_URL` und den zugehörigen serverseitigen `SUPABASE_SERVICE_ROLE_KEY` setzen. Optional den passenden öffentlichen `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` oder `NEXT_PUBLIC_SUPABASE_ANON_KEY` hinzufügen. Niemals einen Service-Key als `NEXT_PUBLIC_*` veröffentlichen.
4. Vercel muss für Datenbank-Lesezugriffe dieselbe erreichbare URL und den passenden öffentlichen Schlüssel verwenden. Den Service-Key braucht nur der geschützte Worker.
5. Zuerst den täglichen Workflow mit `dry_run: true`, danach mit `false` auslösen und gespeicherte IDs/Prüfdaten sowie die Live-Karten kontrollieren.

Für andere Händler sind keine freigegebenen Awin-/Partnerfeeds oder neuen Zugangsdaten vorhanden. Bestehende gespeicherte Beobachtungen sind kein Nachweis eines heute funktionierenden Imports. Zugriffs- oder Lieferantenfreigaben müssen je Quelle beschafft werden; Sperren werden nicht umgangen.

## Skalierung und Nachprüfung

Der Stundenlauf verarbeitet vorhandene Zuordnungen sequenziell mit mindestens 2,5 Sekunden Händlerabstand; Discovery ist explizit. Damit ist der aktuelle Bestand prüfbar, aber kein Nachweis für stündliche Browserabrufe von Zehntausenden Artikeln erbracht. Für große Kataloge sind erlaubte Änderungsfeeds, deren vereinbarte Intervalle, serverseitige Indizes und inkrementelle Imports nötig. Kosten entstehen vor allem durch Actions-/Browserlaufzeit, Datenbank- und API-Zugriffe sowie Feedverträge; es wurde kein zusätzlicher kostenpflichtiger Dienst eingerichtet.

Prüfung: `npm run verify`, `npm audit --omit=dev`, gezielte echte toom-Prüfung, anschließend GitHub-Workflow und Live-Endpoint vergleichen. Synthetische Regressionstests belegen Schutzregeln, keine Lieferantenverfügbarkeit. Der Abschlussbericht nennt separat die tatsächlichen Live-Ergebnisse und weiterhin blockierte Zugänge.
