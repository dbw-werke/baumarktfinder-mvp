# Abnahme Baumarktfinder Deutschland

**Aktuelle OBI-Fortsetzung vom 04.10.2026:** [OBI-Abnahme mit echten Chromium-Abrufen](OBI-ABNAHME.md). Der nachstehende Mehrhändler-Bericht dokumentiert den früheren Stand vom 03.10.2026; aktuelle OBI-Zahlen und zusätzliche Prüfungen stehen im verlinkten Bericht.

Stand: 03.10.2026. Fortsetzung des vorhandenen Projekts ohne Rücksetzen der Vorarbeiten. Kein Push, kein Deployment.

## Änderungen seit dem vorherigen Stand

- Produktfamilie vor Wortgleichheit: Synonyme, eigene Produktattribute, technische Identität, harte Ausschlüsse und Größenbewertung. Keine Umrechnung des Packungspreises. Deutsche zusammengesetzte Ausschlüsse und Stückzahlen abgesichert.
- Separate Preisaktualisierung; Kundensuche kombiniert geprüfte Daten je tatsächlicher Material-ID/Kette. Neuester Prüfzeitpunkt gewinnt, bei Zeitgleichheit die Datenbank.
- 34 kanonische Varianten, 59 unterschiedliche Angebote aus sechs Ketten: 31 automatisch, 28 manuell geprüft in der zusammengeführten Auswahl. Die Quelldateien enthalten 31 automatische und 30 manuelle Zeilen; zwei ältere manuelle Zeilen sind durch automatische Beobachtungen überholt.
- hagebau prüft übereinstimmende SKU, Variante und normalen Onlinepreis; Mitgliedspreise, Platzhalter und nicht kaufbare Angebote werden abgelehnt.
- Kompakte bestehende Karten horizontal, fünf Ladeplatzhalter bei neuer Suche, alte Ergebnisse sofort ausblenden, überholte Antworten verwerfen.

## Abschlussprüfungen

| Prüfung | Ergebnis |
| --- | --- |
| npm run verify | Erfolgreich: ESLint, 163 Tests und Produktionsbuild |
| TypeScript | Im Next.js-Produktionsbuild erfolgreich |
| Händlerbelege | 198 gespeicherte Seiten, 177 extrahierte Kandidaten, 45 gültige Beobachtungen; alle 31 vorherigen automatischen Angebote weiterhin gültig |
| Preisbestand | 59 unterschiedliche validierte Angebote, sechs Ketten |
| SQL / RPC / RLS | Mit aktuellem Seed isoliert in PostgreSQL/PGlite bestanden |
| Frontend-Komponenten | Elf Materialien × acht Filialfixtures = 88 Karten; echte Preise, Größen, Produktlinks und eigene Routen geprüft |
| Suchwechsel | DOM-Integration Acryl → Tiefengrund; überlappende Acryl-/Rotband-Suche, alte Antwort verworfen |
| Google-Code | Offizielles Widget, Deutschland-Beschränkung, ausgewählte Adresse und Fehlerfälle automatisiert geprüft |
| Horizontaler Aufbau | Flex ohne Umbruch, overflow-x:auto, 210/250 px Kartenbreite; aktuelle visuelle Abnahme offen |
| Lokaler Server | HTTP 200 auf http://127.0.0.1:3000/ |
| Live-Supabase | Abschlussprüfung ohne nutzbare Antworten; vorher fehlende Schemaobjekte |
| Live-Google | Letzter konkreter Befund API_KEY_HTTP_REFERRER_BLOCKED; erfolgreiche Autocomplete-Sitzung offen |

Die elf Materialien sind Gipskarton, CD-Profil, Glaswolle 120 mm, Uniflott, Rotband, Tiefengrund, Acryl, Mineralwolle 40 mm, Sanitärsilikon, PU-Schaum und Haftgrund. Haftgrund hat derzeit keinen geprüften Treffer; dessen sichere Leerdarstellung ist geprüft.

SQL-/Kartentests verwenden echte gespeicherte Händlerbeobachtungen mit Originalzeiten und ausdrücklich synthetische Filialfixtures. Sie beweisen keine externe Datenbankmigration, reale Filialverfügbarkeit oder heutigen Händlerpreis. Kein Preis wurde aus einem gerundeten Grundpreis hochgerechnet.

## Nachweise

- [Alle 238 Material-/Kettenkombinationen](evidence/final-price-coverage-20261003.json)
- [Lesbarer Preisbericht mit Lücken](PREISABDECKUNG.md)
- [Matcher und ursprüngliche HTML-Quellen](evidence/matcher-replay-20261003.json)
- [Acryl-Kandidaten aller sieben Ketten](evidence/acryl-matcher-20261003.json)
- [SQL- und Frontend-Datenfluss](evidence/price-comparison-data-proof.json)
- [Acryl-Belege](evidence/manual-acryl-20261003.json)
- [Mineralwolle/Globus-Belege](evidence/manual-additions-20261003.json)
- [Weitere OBI-/BAUHAUS-Belege](evidence/manual-obi-bauhaus-20261001.json)
- [Abschlussstatus](evidence/final-verification-20261003.json)

## Extern offen

Google-Referrer/API-Freigabe, Migration/Seed auf der externen Supabase-Instanz, zusätzliche belastbare Händlerquellen und visuelle Browserabnahme bleiben offen. Die Browser-Sicherheitsrichtlinie blockierte die Steuerung der geöffneten lokalen Seite; dieser Block wurde nicht umgangen. Frühere Google- und Standortdienstfehler sind historische Befunde, keine erfolgreich wiederholten Live-Prüfungen.

Einrichtung: [Erklärung](../Erklärung.md), [Google](GOOGLE-EINRICHTEN.md), [Preise](PREISDATEN.md). Gesamtfortschritt: 98 %.
