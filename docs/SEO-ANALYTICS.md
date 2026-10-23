# SEO und Besucherstatistik

Stand: 23.10.2026. Hosting bleibt bei Vercel, DNS bei IONOS. Es wurden weder Nameserver noch DNS-Einträge geändert.

## Vorhanden und geprüft

- Ein kanonischer Ursprung `https://baumarktfinder-app.de/`, deutscher Titel/Beschreibung, Sprache, Open-Graph-/Twitter-Angaben und mobiles Viewport ohne Zoomsperre.
- Öffentlich erreichbare `robots.txt` und `sitemap.xml`. Nur bestehende indexierbare Seiten werden aufgeführt; API-Routen werden nicht als Suchergebnisse beworben.
- WebSite-/WebApplication-Strukturdaten ohne erfundene Bewertungen, Firmenangaben, Produktangebote oder Such-URLs.
- Optionaler Search-Console-Meta-Tag über `GOOGLE_SITE_VERIFICATION`. Ohne gültigen Wert wird kein Verifikationstoken ausgegeben.

Eine Google-Indexierung oder Rankingposition wurde nicht bestätigt. Dafür die URL-Präfix-Property in Search Console mit dem eigenen HTML-Tag bestätigen, die vorhandene Sitemap einreichen und den Indexierungsbericht prüfen. Die [offizielle HTML-Tag-Verifikation](https://support.google.com/webmasters/answer/9008080?hl=de) funktioniert für URL-Präfix-Properties ohne DNS-Änderung. Ein Meta-Tag allein meldet keine erfolgreiche Verifikation oder Indexierung zurück.

## Cloudflare Web Analytics

Die Integration ist implementiert und getestet, bleibt aber ohne echten öffentlichen Site-Token ausgeschaltet. In der verfügbaren lokalen/Prozess-Konfiguration war kein Token vorhanden. Es wurden keine Besucherzahlen oder erfolgreichen Beacon-Eingänge behauptet.

1. In Cloudflare **Web Analytics → Add a site** den Host `baumarktfinder-app.de` auswählen.
2. Aus **Manage site** den öffentlichen `token`-Wert des Snippets übernehmen, keinen Cloudflare-API-Schlüssel.
3. Diesen Wert als `CLOUDFLARE_WEB_ANALYTICS_TOKEN` in der Vercel-Produktionsumgebung setzen und neu deployen. Der Token ist für die öffentliche Webseite bestimmt; keine Kontozugangsdaten eintragen.
4. Im echten Browser einmaliges Laden von `static.cloudflareinsights.com/beacon.min.js`, einen erfolgreichen Beacon und anschließend Messwerte im eigenen Cloudflare-Dashboard prüfen. Blockierte Browser dürfen die Produktsuche nicht beeinträchtigen.

Der Code lädt das Script nach der Hydrierung nur im Produktionsbetrieb, nicht in Vercel-Previews. Fehlende oder ungültige Token führen zu keinem Script. Es werden keine eigenen Events mit Adresse, Standort, Formularinhalt oder Materialsuche ergänzt. Die standardmäßigen Datenflüsse des Anbieters sind in der tatsächlichen Datenschutzerklärung zu berücksichtigen; die Integration behauptet keine rechtliche Freigabe.

Cloudflare dokumentiert die [manuelle Einrichtung für nicht über Cloudflare geleitete Websites](https://developers.cloudflare.com/web-analytics/get-started/) sowie den [Beacon-Endpunkt](https://developers.cloudflare.com/web-analytics/faq/). Ein Umzug von IONOS oder Vercel ist dafür nicht erforderlich.
