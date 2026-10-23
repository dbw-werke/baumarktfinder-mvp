# SEO und Besucherstatistik

Stand: 23.10.2026. Hosting bleibt bei Vercel, DNS bei IONOS. Es wurden weder Nameserver noch DNS-Einträge geändert.

## Vorhanden und geprüft

- Ein kanonischer Ursprung `https://baumarktfinder-app.de/`, deutscher Titel/Beschreibung, Sprache, Open-Graph-/Twitter-Angaben und mobiles Viewport ohne Zoomsperre.
- Öffentlich erreichbare `robots.txt` und `sitemap.xml`. Nur bestehende indexierbare Seiten werden aufgeführt; API-Routen werden nicht als Suchergebnisse beworben.
- WebSite-/WebApplication-Strukturdaten ohne erfundene Bewertungen, Firmenangaben, Produktangebote oder Such-URLs.
- Optionaler Search-Console-Meta-Tag über `GOOGLE_SITE_VERIFICATION`. Ohne gültigen Wert wird kein Verifikationstoken ausgegeben.

Eine Google-Indexierung oder Rankingposition wurde nicht bestätigt. Dafür die URL-Präfix-Property in Search Console mit dem eigenen HTML-Tag bestätigen, die vorhandene Sitemap einreichen und den Indexierungsbericht prüfen. Die [offizielle HTML-Tag-Verifikation](https://support.google.com/webmasters/answer/9008080?hl=de) funktioniert für URL-Präfix-Properties ohne DNS-Änderung. Ein Meta-Tag allein meldet keine erfolgreiche Verifikation oder Indexierung zurück.

## Umami Analytics

Der Betreiber hat Umami beauftragt und diesen öffentlichen Tracking-Code bereitgestellt: `https://cloud.umami.is/script.js`, Website-ID `e8e49b5e-7925-4039-97d5-37e646e0c181`. Die bisherige Cloudflare-Vorbereitung ist abgewählt; sie wird nicht parallel verwendet. Es sind keine Umami-Zugangsdaten oder API-Schlüssel im Repository erforderlich.

Das gemeinsame Root-Layout bindet den Tracker einmal mit `next/script` und `afterInteractive` ein. Entwicklungsbetrieb und Vercel-Previews sind ausgeschlossen; die Erfassung ist auf `baumarktfinder-app.de` begrenzt. Umami übernimmt die Seitenaufrufe einschließlich clientseitiger Navigation. Zusätzliche `umami.track()`-Aufrufe bei Routenwechseln würden Aufrufe doppelt zählen und werden nicht eingebaut. Siehe [Next.js-Einbindung](https://docs.umami.is/docs/collect-data) und [automatische SPA-Erfassung](https://docs.umami.is/docs/guides/track-single-page-apps).

Die Attribute `data-exclude-search="true"` und `data-exclude-hash="true"` schließen Suchparameter und Fragmente der erfassten Seiten-URL aus. `data-do-not-track="true"` berücksichtigt die entsprechende Browserpräferenz, soweit vorhanden. Es gibt keine eigenen Events, Besucher-IDs, Formularwerte, Adressen oder Standortkoordinaten; Replay und Heatmaps werden nicht aktiviert. Diese Optionen sind in der [Tracker-Konfiguration](https://docs.umami.is/docs/tracker-configuration) beschrieben.

### Statistiken ansehen und prüfen

1. Bei [Umami Cloud](https://cloud.umami.is) mit dem eigenen Konto anmelden und die Website mit der genannten ID öffnen.
2. Dort Besucher, Seitenaufrufe, zeitlichen Verlauf, Länder, Quellen, Seiten und Gerätetypen auswerten. Länder sind ungefähre Standortangaben und Besucherzahlen sind keine garantiert eindeutige Personenzählung. Google/Social/Direct beruhen auf verfügbaren Referrer-Informationen; ohne URL-Parameter entfallen UTM-/Klick-ID-Auswertungen. Siehe [Metrikdefinitionen](https://docs.umami.is/docs/metric-definitions).
3. Auf der Produktionsdomain einen normalen Seitenaufruf und eine clientseitige Navigation prüfen: genau ein geladenes Script, erfolgreiche Erfassungsanfragen und die entsprechenden Ereignisse im eigenen Dashboard. Ein HTTP-Erfolg für das Script allein bestätigt noch keine gespeicherten Messwerte. Browserblocker oder DNT können die Erfassung verhindern.

Der tatsächliche Stand von Build, Deployment, Browser-Erfassungsanfragen und Dashboard-Kontrolle wird im Abschlussbericht getrennt angegeben. Aus dem bereitgestellten öffentlichen Tracking-Code ergibt sich kein Lesezugriff auf das private Dashboard.

Lokale Prüfung am 23.10.2026: Lint, TypeScript, Produktions-Build und alle 344 Tests bestanden. Der echte `next/script`-Lader wurde auf einmaliges Laden bei erneutem Rendern und Mounten geprüft. Ein separater Lauf des aktuellen offiziellen Umami-Scripts mit abgefangenen Netzwerkaufrufen bestätigte initialen Seitenaufruf, `pushState`/`replaceState`, Ausschluss von Query/Hash auch beim Referrer sowie Domain- und DNT-Filter. Diese simulierten Aufrufe wurden nicht an das echte Konto gesendet. Das Script hört selbst nicht auf `popstate`; der installierte Next-App-Router aktualisiert nach Zurück/Vorwärts die URL über `replaceState`. Eine echte Mehrseiten-Browserprüfung wird damit nicht behauptet; Baumarktfinder hat derzeit nur eine öffentliche Inhaltsroute.

### Datenschutzerklärung ergänzen

Umamis Standardtracker verwendet nach [Anbieter-FAQ](https://docs.umami.is/docs/faq) keine Cookies. Cookie-frei bedeutet nicht automatisch, dass alle rechtlichen Anforderungen erfüllt sind. Umami verarbeitet IP-Adressen vorübergehend für Anfragen, Besucherzuordnung und ungefähre Standorte; Betriebs-/Sicherheitslogs können IP-Adressen enthalten. Siehe [Anbieter-Datenschutzinformation](https://umami.is/privacy).

Die noch fehlende öffentliche Datenschutzerklärung muss Umami Software, Inc. als Analytics-Anbieter, Zweck, tatsächliche Datenkategorien, gewählte Rechtsgrundlage, Speicherfristen des gebuchten Tarifs, Betroffenenrechte und etwaige Drittlandübermittlungen beschreiben. Der Betreiber muss die geltende [Auftragsverarbeitungsvereinbarung](https://umami.is/dpa), [Unterauftragsverarbeiter](https://umami.is/subprocessors) und konkrete Kontokonfiguration prüfen. Es wird weder EU-only-Speicherung noch eine bestätigte Vertrags-/Rechtsprüfung behauptet. Maßgeblich sind insbesondere [DSGVO Art. 6, 13, 28 und 44 ff.](https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=celex%3A32016R0679) sowie für Endgerätezugriffe [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html). Eine erforderliche Einwilligung ist anhand der tatsächlichen Verarbeitung zu bewerten. Betreiberangaben und Rechtsgrundlagen werden nicht erfunden.
