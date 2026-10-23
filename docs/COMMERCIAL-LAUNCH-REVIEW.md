# Vorbereitung des kommerziellen Starts

Stand: 22.10.2026. Bewertet wurde das vorhandene Repository `dbw-werke/baumarktfinder-mvp` und die öffentliche Website `https://baumarktfinder-app.de`. Dieser Bericht trennt nachprüfbare technische Ergebnisse von noch benötigten Betreiberentscheidungen. Ein erfolgreicher Build oder ein erreichbares Deployment allein bedeutet keine kommerzielle Freigabe.

**Ergebnis: Der kommerzielle Start ist noch nicht vollständig vorbereitet.** Die wichtigsten offenen Voraussetzungen sind die produktive Standortsuche, die nicht erreichbare zentrale Datenbank, fehlende Betreiber-/Datenschutzinformationen und die geklärte kommerzielle Verwendung der Händlerdaten. Es wurden keine Betreiberangaben, Zugangsdaten, Händlerlizenzen oder Produktpreise erfunden.

## Technischer Befund

| Bereich | Nachweis am 22.10.2026 | Folgerung |
| --- | --- | --- |
| Öffentliche Website | `/`, `/robots.txt`, `/sitemap.xml` antworten mit HTTP 200 | Deployment und grundlegende Auslieferung sind erreichbar. |
| toom-Veröffentlichung | `/api/toom/prices` antwortet mit HTTP 200; der getrennte Stundenworkflow veröffentlicht geprüfte Beobachtungen auch ohne Supabase | Nicht mit dem datenbankabhängigen Tagesworkflow verwechseln. Den Lauf nach dem finalen Commit separat kontrollieren. |
| Zentrale Datenbank | `npm run check:config -- --database` endet mit Exit 1; `materials`, `canonical_material_aliases` und `verified_store_prices` sind nicht lesbar. Die vorherige DNS-Prüfung des konfigurierten Hosts ergab `ENOTFOUND`. | URL/Projektstatus korrigieren, gültige Schlüssel konfigurieren, Migrationen und Seed anwenden, RLS und Schreibpfad anschließend erneut prüfen. Ein neuer Schema-Import in eine nicht erreichbare Instanz löst dies nicht. |
| Allgemeiner Tagesworkflow | Bei der Prüfung waren keine GitHub-Actions-Secrets vorhanden; der Workflow benötigt die zwei unten genannten Secrets | Der bestehende Fehler lässt sich ohne gültige Zugangsdaten nicht durch Code oder erfundene Werte beheben. |
| Standortsuche | Der direkte Produktionsaufruf von `/api/nearby` war wegen der Schutzregel für öffentlichen Nominatim-Betrieb auf Vercel nicht verfügbar | Google für die Produktionsdomain real prüfen oder einen eigenen/vertraglich nutzbaren Geocoder konfigurieren. Die Schutzregel bleibt aktiv. |
| Rechtstexte | `/impressum` und `/datenschutz` antworten weiterhin mit HTTP 404 | Tatsächliche Betreiberangaben und Datenschutzkonzept sind erforderlich, bevor vollständige Seiten erstellt und dauerhaft verlinkt werden können. |
| Oberfläche | Bestehende Kartenstruktur und responsive Styles bleiben erhalten; DOM-Tests prüfen Auswahl, Lade-/Fehlerzustände und Preise | DOM-Tests ersetzen keine visuelle Endabnahme auf echten Desktop- und Mobilbrowsern mit funktionierender Standortsuche. |

Die aktuelle Preisabdeckung ist mit `npm run prices:audit` aus dem aktiven Katalog zu ermitteln. Fehlende Händlerpreise werden als fehlend dargestellt. Gespeicherte Beobachtungen behalten ihr tatsächliches Datum; ein gescheiterter Abruf macht einen alten Preis nicht zu einem neu geprüften Preis. Festgelegte Screenshotpreise bleiben als solche nachvollziehbar und müssen bei Änderungen bewusst freigegeben bzw. ersetzt werden.

## Umgesetzte Begrenzung des Google-Aufrufs

`GoogleAddressInput` lädt das Adresswidget erst, wenn der Nutzer das Adressfeld fokussiert. Beim bloßen Seitenaufruf löst diese Komponente keinen Google-Aufruf mehr aus. Der Hinweis am Feld erklärt Anbieter und Übertragung der Eingabe. Eine ausdrücklich gestartete Marktsuche kann unabhängig davon Google verwenden. Der Wechsel vom normalen Eingabefeld zum Widget behält den zuletzt eingegebenen Text und den Fokus; bei Fehlern bleibt das normale Eingabefeld verfügbar.

Der React-/JSDOM-Regressionstest `tests/google-address-input.test.tsx` prüft den ausbleibenden Aufruf beim Mounten, die Aktivierung beim Fokus, Text- und Fokuserhalt, keinen Fokusdiebstahl, den Fehlerfallback ohne Reload-Schleife und das Verwerfen später Ergebnisse nach dem Unmount. Er ist lokal erfolgreich. Dabei werden keine echten Adressen an Google gesendet.

Diese technische Reduzierung ist **keine behauptete Einwilligung** und ersetzt weder eine Datenschutzerklärung noch eine Bewertung der Rechtsgrundlage. Ob ein vorgelagertes Einwilligungsverfahren erforderlich ist, muss anhand der tatsächlichen Google-Konfiguration, Datenflüsse und eingesetzten Endgerätezugriffe entschieden werden. Maßgeblich sind insbesondere [DSGVO Art. 6 und 13](https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=celex%3A32016R0679) und [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/BJNR198210021.html).

## Konkret benötigte Betriebsangaben

- **GitHub Actions:** eine erreichbare `NEXT_PUBLIC_SUPABASE_URL` und ein dazugehöriger `SUPABASE_SERVICE_ROLE_KEY` als Repository-/Environment-Secrets für `price-update.yml`. Der Service-Role-Schlüssel bleibt ausschließlich serverseitig.
- **Vercel:** dieselbe erreichbare öffentliche Supabase-URL mit `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (alternativ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) sowie ein gültiger `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Öffentliche Variablen werden beim Build eingebunden, daher nach Änderungen neu deployen.
- **Supabase:** Projekt wiederherstellen oder eine tatsächlich freigegebene erreichbare Instanz bereitstellen; Migrationen in Dateinamen-Reihenfolge und anschließend `supabase/seed.sql` anwenden. Dann öffentliche RLS-Lesezugriffe und einen echten Worker-Schreiblauf prüfen. Schlüssel niemals in Git oder Berichte übernehmen.
- **Google:** Billing und benötigte APIs prüfen, HTTPS-Referrer der Produktionsdomain freigeben, API-/Domainbeschränkungen beibehalten und reale Adressvorschläge, Marktsuche sowie Routen testen. Ein vorhandener Schlüssel allein bestätigt diese Freigaben nicht.
- **Alternativer Standortdienst:** Für zuverlässigen Vercel-Betrieb ggf. `OSM_NOMINATIM_URL`, `OSM_OVERPASS_URL` und einen `OSM_USER_AGENT` mit echtem Betreiberkontakt konfigurieren. Die [öffentliche Nominatim-Richtlinie](https://operations.osmfoundation.org/policies/nominatim/) begrenzt die gesamte Anwendung auf maximal eine Anfrage pro Sekunde, untersagt Autocomplete und bietet keine kommerzielle Verfügbarkeitszusage. Die vorhandene Serverless-Sperre darf nicht als schnelle Fehlerbehebung entfernt werden.

## Betreiber- und Datennutzung vor dem Start klären

1. **Impressum:** Benötigt werden tatsächlicher Anbietername/Firma, ladungsfähige Anschrift, E-Mail und gegebenenfalls Rechtsform, Vertretung, Register-/Umsatzsteuerangaben. Die einschlägigen Informationspflichten stehen in [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html). Angaben dürfen nicht aus dem Repositorynamen abgeleitet werden.
2. **Datenschutz:** Tatsächliche Verantwortliche, Kontakt, Zwecke/Rechtsgrundlagen, Anbieter/Empfänger, etwaige Drittlandübermittlungen, Speicherfristen und Betroffenenrechte dokumentieren. Dabei mindestens Vercel-Hosting/Logs, Google-Adress-/Standortdaten, den gegebenenfalls verwendeten OSM-Dienst und Supabase berücksichtigen. Auftragsverarbeitung und Anbietervereinbarungen passend zum tatsächlichen Betrieb prüfen. Grundlage der Informationspflicht ist [DSGVO Art. 13](https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=celex%3A32016R0679).
3. **Händlerdaten und Logos:** Pro Händler festhalten, welche vertragliche bzw. sonstige Nutzungsgrundlage die regelmäßige kommerzielle Übernahme von Preisen, Produkttexten, Bildern und Logos erlaubt. Öffentliche Sichtbarkeit und robots-Freigaben ersetzen keine Lizenzprüfung. Regelmäßige Entnahmen können auch bei kleinen Einzelabrufen Datenbankrechte betreffen; siehe [§ 87b UrhG](https://www.gesetze-im-internet.de/urhg/__87b.html). Feed-/Affiliate-Verträge, Umfang, Aktualisierungsregeln und Löschprozesse bleiben offen, soweit keine Vereinbarung vorliegt.
4. **Kartendienstbedingungen:** Öffentlich erreichbare Nutzungsbedingungen und Datenschutzinformationen sowie Attributions-/Speicherregeln prüfen. Google nennt diese Voraussetzungen in den [Places-Richtlinien](https://developers.google.com/maps/documentation/places/web-service/policies); für Kunden mit EWR-Rechnungsadresse sind außerdem die dort verlinkten EWR-Bedingungen relevant. Das Laden erst nach Fokus erfüllt diese übrigen Anforderungen nicht automatisch.
5. **Preisdarstellung:** Tatsächlichen Packungspreis und Menge, soweit erforderlich Grundpreis, Aktualisierungsdatum und Händlerquelle verständlich zeigen. Kettenpreise dürfen keine geprüften Filialbestände suggerieren. Vor einer Monetarisierung die konkrete Vergleichs-/Werbefunktion einschließlich Umsatzsteuer-, Versand- und gegebenenfalls Affiliate-Hinweisen rechtlich bewerten; einschlägig sind unter anderem [PAngV §§ 3–6](https://www.gesetze-im-internet.de/pangv_2022/BJNR492110021.html).

## Abschließende Abnahme nach Bereitstellung

1. `npm run check:config -- --database` erfolgreich ausführen; Schema-/RLS-Tests und einen erfolgreichen echten Preis-Worker-Lauf nachweisen.
2. `npm run verify` und `npm run typecheck` erfolgreich ausführen. Finalen Commit, GitHub-CI und Vercel-Deployment demselben Stand zuordnen.
3. Mit einem realen Desktop- und Mobilbrowser Adresse/Geolocation, Ergebnisse, Quellenlinks, Pakete/Grundpreise und verständliche Fehlerfälle prüfen. Keine Funktionsfreigabe aus HTTP 200 allein ableiten.
4. Vollständige Betreiber-/Datenschutzseiten und gegebenenfalls erforderliche Einwilligung vor Produktivbetrieb veröffentlichen. Händler- und Kartendienstrechte für den vorgesehenen kommerziellen Umfang dokumentieren.

Die rechtlichen Punkte sind ein auf den vorhandenen Code bezogener Prüfbedarf, keine Rechtszertifizierung. Sie sind vom tatsächlichen Betreiber mit seinen Angaben und Verträgen abzuschließen.
