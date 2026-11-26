# Footer und rechtliche Unterseiten

Stand: 26.11.2026. Der Nutzer hat die Veröffentlichung von Footer und Unterseiten ausdrücklich freigegeben. Die Datenschutzerklärung bleibt als Entwurf zur rechtlichen Prüfung gekennzeichnet.

## Umfang

- Neuer gemeinsamer Footer im Root-Layout: nahezu schwarz, dezenter Rahmen, Rundungen, blauer Schriftzug, Slogan, Trennlinie, Impressum/Datenschutz/Kontakt und Copyright 2026. Responsive und auf alle öffentlichen Seiten angewendet.
- Der bisherige Footer in `Finder.tsx` wurde ersetzt; sonst keine Änderung an Finder, Suchlogik, Preisen, Datenbank, Produktkarten, Analytics oder globalen Styles.
- Statische Seiten `/impressum`, `/datenschutz`, `/kontakt`; Impressum und Kontakt mit den vorgegebenen Angaben der natürlichen Person Gabriel Tunjic. Keine erfundenen Register- oder Steuerdaten. Anklickbare E-Mail-/Telefonlinks und Rücklink zur Startseite.
- Eigene CSS-Module beschränken neue Styles auf Footer und Unterseiten. Bestehende Systemschrift wird geerbt. Das vorhandene Header-Branding ist rot; ausschließlich der neue Footer-Schriftzug verwendet das ausdrücklich gewünschte Blau (`#60a5fa`).
- Die drei Seiten erhalten die ursprünglich gewünschten individuellen Titel, Beschreibungen und ihre eigene kanonische URL. Keine Änderung an bestehender Sitemap, Homepage-Metadaten, strukturierten Daten oder sonstigen SEO-Einstellungen entsprechend der letzten Eingrenzung.
- Keine lokalen Tests, kein lokaler Produktions-Build und keine Funktions-/Browserprüfung gemäß letzter Anweisung. Es wurden keine neuen Bibliotheken, Consent- oder sonstigen Funktionen ergänzt. Der freigegebene Stand wird auf dem bestehenden Branch veröffentlicht; die vorhandene GitHub-/Vercel-Automatisierung bleibt unverändert.

## Datenschutz: bekannte Implementierung und offene Angaben

Der sichtbare Entwurf benennt die Unsicherheiten; er stellt keine abschließend geprüfte DSGVO-/TDDDG-Konformität dar. Die folgenden Informationen stammen aus gezielter Quellcodesichtung, nicht aus einer erneuten Prüfung des Live-Betriebs oder der Kundenkonten:

| Bereich | Quellcodebefund | Vor Freigabe zu klären |
| --- | --- | --- |
| Vercel | Hosting und eigene API-Routen; `src/lib/obi-server.ts` protokolliert OBI-Materialsuchbegriffe und Matchdiagnostik. | Kontotarif/Vertragspartei, AV-Vertrag, Regionen, Unterauftragnehmer, Protokollfristen und Notwendigkeit dieser Diagnoseinhalte. |
| Umami Cloud | `src/lib/analytics.ts` und Root-Layout laden das Skript automatisch in Produktion, ohne Einwilligungssperre. URL-Parameter/Hash werden ausgeschlossen, DNT ist konfiguriert; keine eigenen Such-Events. | Kontoregion, Vertragspartner, Datenumfang/Sessionbildung, tatsächliche Aufbewahrung, Transfers und Rechtsgrundlage. Keine Behauptung „keine IP-Verarbeitung“. |
| Google | `GoogleAddressInput.tsx` lädt beim Fokus; `src/services/maps.ts` nutzt Places/Geocoding/Routes direkt aus dem Browser. | Zulässigkeit und Erforderlichkeit einzelner Verarbeitungen, Anbieterrollen/Verträge, Transfers und gegebenenfalls Einwilligung vor dem Laden. Die Standortberechtigung allein ist kein Nachweis für alle erforderlichen Einwilligungen. |
| Supabase | `src/lib/supabase.ts`, `materialSuggestions.ts`, `catalog.ts`: Browser liest öffentliche Katalog-/Preisdaten, ohne Kundenadresse; keine persistierte Auth-Sitzung. | Tatsächliche Projektregion, Vertragspartei, AV-Vertrag, Logs, Löschfristen und Transfers. |
| OSM-Alternative | `osm-server.ts`: öffentliche Nominatim-Nutzung auf Vercel gesperrt; eigene Endpunkte optional. Cache-Gültigkeit ist keine garantierte Löschfrist. | Ob ein eigener Nominatim-/Overpass-Dienst aktiv ist; gegebenenfalls dessen Betreiber, Vertrag und Fristen ergänzen. |
| GitHub/Händler | Server liest öffentlichen Preis-Snapshot; Preisworker laufen unabhängig von Besucheranfragen. Händler-/Routenlinks übermitteln beim Klick Ziel-/Suchangaben, mit Referrer-Schutz. | Keine Awin-Einbindung gefunden; deshalb nicht als aktiven Affiliate-Dienst darstellen. |
| Browser-Speicher | Keine eigenen Cookie-, Local-Storage-, Session-Storage- oder IndexedDB-Zugriffe im App-Code gefunden. | Drittanbieter-Skripte sind dadurch nicht geprüft oder automatisch einwilligungsfrei. |
| Kontakt | Nur `mailto:`/`tel:`, kein Formular. | E-Mail-Anbieter, Auftragsverarbeitung, Aufbewahrung und Löschkonzept bestätigen. |

Eine pauschale Aussage „Cookie-Banner nicht erforderlich“ wäre nicht belastbar. § 25 TDDDG erfasst auch andere Speicher-/Zugriffstechniken; die DSGVO ist zusätzlich zu prüfen. Falls eine Einwilligung nötig ist, genügt ein Informationstext nicht: Laden/Verarbeitung müssten bis zur Zustimmung gesperrt und ein Widerruf ermöglicht werden. Eine solche Änderung ist nicht Teil dieses auf Footer und Seiten beschränkten Auftrags. Die offenen Punkte sind vor Veröffentlichung rechtlich und betrieblich zu klären.

## Grundlagen für die rechtliche Prüfung

- [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html)
- [DSGVO, insbesondere Art. 6, 13 und 15–22](https://ao.bundesfinanzministerium.de/ao/2025/Datenschutz-Grundverordnung/inhalt.html)
- [Vercel Datenschutz](https://vercel.com/legal/privacy-notice) und [DPA](https://vercel.com/legal/dpa) – tatsächliche Vertragsgeltung für das Konto bestätigen.
- [Supabase Datenschutz](https://supabase.com/privacy) und [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).
- [Umami Datenschutz](https://umami.is/privacy) und [Cloud-FAQ zu Region/Aufbewahrung](https://docs.umami.is/docs/cloud/faq) – keine pauschale Tariffrist übernommen.
- [Google Datenschutz](https://policies.google.com/privacy?hl=de).
- [Beschwerde beim HBDI](https://datenschutz.hessen.de/service/beschwerde-uebermitteln).
