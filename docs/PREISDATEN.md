# Verlässliche Produkt- und Preisdaten

Jede tatsächlich angebotene Ausführung besitzt ihre eigene `material_id`. Je Händler wird zuerst die gewünschte ID verwendet, andernfalls die nächste geprüfte kompatible Größenvariante. Diese bleibt unter ihrer tatsächlichen ID und wird auf der Karte ausdrücklich als Alternative mit eigener Größe, eigenem Packungspreis und eigenem Produktlink angezeigt. Fehlende Daten beweisen nicht, dass der Händler die Wunschgröße nicht verkauft.

Händlerpreise werden zusätzlich nach `store_id` gelesen. Für das MVP ist `store_id` die Kette, nicht die Google-Filiale. Mehrere nahe Filialen derselben Kette erhalten jeweils eine eigene Vergleichskarte mit demselben geprüften Onlineangebot und ihrer eigenen Route. Filialpreis und Bestand können abweichen. Eine Verfügbarkeit wird nicht aus einem vorhandenen Preis abgeleitet.

## Automatische Aktualisierung

1. Aktive kanonische Definition mit vollständigen Spezifikationen aus Supabase lesen.
2. Bereits zugeordnetes Händlerprodukt aktualisieren, sonst Kandidaten aus erlaubter Händlersuche/strukturierten Seiten und begrenzter Sitemap-Suche entdecken.
3. Nur eindeutig zugeordnete `Product`-/`Offer`-Daten mit EUR, sicherem Händlerlink und nachvollziehbarer Preisbasis akzeptieren.
4. Produktfamilie und harte Ausschlüsse zuerst prüfen, dann wesentliche technische Merkmale. Eigene Kategorie, Produktattribute und beobachtete Spezifikationen ergänzen den Titel; fremde Empfehlungen und Rohseitentext zählen nicht als Produktbeweis. Paketgröße, Farbe, Markenwortlaut und optionale Eigenschaften beeinflussen die Bewertung. Nicht passende oder nicht belegte wesentliche Merkmale bleiben ausgeschlossen.
5. Packungspreis und Grundpreis unterscheiden. Ein gerundeter Grundpreis allein darf nicht zu einem vermeintlich exakten Packungspreis hochgerechnet werden. Mengenstaffeln, Mitgliedspreise, widersprüchliche Angebote und erkannte reine Filialangebote werden abgelehnt.
6. Mit `save_verified_price` in einer Transaktion Zuordnung, Cache und Historie aktualisieren. Der Browser liest geprüfte Cachewerte; bei fehlender Datenbank können die unten beschriebenen lokalen Preisdateien einspringen.

Fehlt ein exakter Treffer, prüft derselbe Reader deklarierte vergleichbare Varianten nach Größenabstand und Präferenzen. Produktfamilie und funktionale Merkmale bleiben verbindlich, etwa Plattenstärke, Feuchtraumeignung, Profilquerschnitt und Wärmeleitfähigkeit. Die Marke oder ein fehlendes optionales Titelwort allein definieren keine Produktfamilie. Explizit abweichende Farbe, Marke oder Packung dürfen aber nicht unter einer falschen kanonischen ID gespeichert werden: Dazu muss eine passende tatsächliche Variante existieren. Die 300- und 280-ml-Acrylvarianten sind vorbereitet; für 280 ml liegt derzeit kein eigener Preis vor. Eine 3,1-m-Leiste wird nie als 3-m-Leiste gespeichert; aus ihrem Gesamtpreis entsteht kein fiktiver 3-m-Preis.

`evaluateProductMatch()` liefert Familie, harte Ausschlüsse, angeforderte/beobachtete Spezifikationen, Bewertung und Ablehnungsgrund. `findStoreProduct()` protokolliert Kandidaten und wählt exakte Ausführung vor ähnlicher Größe, danach Matchqualität vor Preis. [Acryl-Diagnose für alle sieben Ketten](evidence/acryl-matcher-20261003.json).

Die RPC vergleicht auch die geprüfte Spezifikation und Version mit dem aktuellen Materialdatensatz. Eine Änderung während des Abrufs führt zur Ablehnung, ohne Preis, Zuordnung oder Historie zu verändern.

Der Worker besucht nur freigegebene HTTPS-Händlerhosts. Er begrenzt Antwortgröße, Laufzeit, Umleitungen, Kandidatenseiten und Sitemap-Anfragen. Er beachtet robots.txt, pausiert zwischen Anfragen und stoppt bei Sperren bzw. Ratelimits. Es werden keine Zugangssperren oder CAPTCHAs umgangen.

Fehler ändern weder letzten gültigen Preis noch dessen Zeitstempel. Alte Beobachtungen können keine neueren überschreiben. Nach einer Änderung an kanonischen Spezifikationen wird eine alte Zuordnung nicht still weiterverwendet. Die UI unterscheidet automatische, gespeicherte und manuell gepflegte Preise und kennzeichnet Beobachtungen über sieben Tage.

## Manueller Import

Eine JSON-Datei enthält ein Array geprüfter Produkte. Keine Beispiele mit erfundenen Händlerpreisen sind vorbefüllt. Jedes Objekt benötigt:

| Feld | Inhalt |
| --- | --- |
| `material_slug` oder `material_id` | Existierende kanonische Ausführung aus Supabase |
| `store_id` | `obi`, `bauhaus`, `hornbach`, `toom`, `hagebau`, `globus`, `hellweg` |
| `product_name` | Tatsächlicher vollständiger Produktname |
| `product_url` | Offizielle Seite genau dieses Produkts |
| `price` | Tatsächlicher Packungspreis als Zahl; keine Grundpreisangabe |
| `price_basis` | Pflichtwert `package`: bestätigt den unabhängig abgelesenen Gesamtpreis der tatsächlich angebotenen Packung; alternativ `priceBasis` |
| `currency` | `EUR` |
| `base_unit` | `kg`, `l`, `m`, `m2` oder `piece`, passend zum Material |
| `package_quantity` | Menge dieser Einheit pro gekaufter Packung |
| `checked_at` | Tatsächlicher Prüfzeitpunkt als ISO-Zeitstempel |
| `verification_note` | Nachvollziehbare manuelle Prüfung, mindestens zehn Zeichen |
| `observed_specs` | Optional: auf der Produktseite ausdrücklich nachgewiesene Spezifikationen |
| `availability` | Optional: tatsächlich beobachtete Verfügbarkeit, sonst weglassen |
| `unit_price` | Optional: separat abgelesener Grundpreis als Zahl; muss zum Packungspreis und zur Menge passen. Auch `declared_unit_price` oder `declaredUnitPrice` werden geprüft. |

Neue Importzeilen brauchen ausdrücklich `"price_basis": "package"`. In `verification_note` beschreiben, wo der Gesamtpreis und die tatsächliche Packungsgröße geprüft wurden. Ein Grundpreis mit bekannter Menge genügt nicht; der Import berechnet daraus keinen Packungspreis. Explizite Preisbasen wie `kg`, `l`, `m2` oder widersprüchliche Grundpreise werden abgelehnt, auch wenn zusätzlich ein anderer Feldname einen gültigen Wert enthält.

Bereits gespeicherte geprüfte Beobachtungen bleiben mit ihrem ursprünglichen Prüfdatum erhalten. Für einen erneuten Import älterer Quelldateien muss die Preisbasis nach Prüfung ergänzt werden; ein bloßes Umbenennen eines Grundpreises ist keine Verifizierung.

Beispiel für die **Einheitenrechnung**, kein Händlerangebot: Eine Platte mit 1200 × 600 mm hat 0,72 m², also `base_unit=m2` und `package_quantity=0.72`. Der Grundpreis ergibt sich aus dem beobachteten Plattenpreis geteilt durch 0,72. Ein 30-kg-Sack hat `base_unit=kg`, `package_quantity=30`. Produktmaße werden nicht aus dem Preis geschätzt.

```sh
npm run prices:import -- meine-geprueften-preise.json
npm run prices:import -- meine-geprueften-preise.json --write
```

Die komplette Datei wird zunächst geprüft. Der zweite Befehl speichert jede Zeile mit `source=manual` über dieselbe atomare Preis-RPC. Die Gesamtdatei ist keine gemeinsame Transaktion: Bei einem Datenbankausfall kann ein Teil bereits gespeichert sein. Ein erneuter Import ist möglich; ältere Beobachtungen überschreiben neuere nicht. Der Service-Role-Schlüssel bleibt ausschließlich auf dem ausführenden Rechner bzw. im Worker.

## Lokale manuelle Datenbank ohne Supabase

`src/data/manual-prices.json` ist eine eigenständige lokale Preisdatenbank. Zum Ergänzen zuerst die jeweilige offizielle Produktseite prüfen und eine Importdatei im oben beschriebenen Format anlegen. `material_slug` stammt aus `supabase/canonical-materials.json`. Danach:

```sh
npm run prices:import -- meine-geprueften-preise.json --local
npm run prices:import -- meine-geprueften-preise.json --local --write
```

Der erste Aufruf prüft nur. Der zweite ersetzt die lokale Datei erst, wenn alle Zeilen gültig sind. Bestehende andere Angebote bleiben erhalten; ältere Beobachtungen überschreiben keine neueren. Kein Datenbankzugang oder Dienstschlüssel wird benötigt. Die UI zeigt diese Werte als **Manuell gepflegt**, mit Originalprüfdatum und genauem Produktlink. Nach Änderungen eine bereitgestellte App neu bauen/deployen; der lokale Entwicklungsserver übernimmt sie automatisch.

Die Original-Importdatei mit Prüfnotiz aufbewahren. Neue Belege können `source: "manual_verified"` kennzeichnen; das bestehende Datenbankschema speichert diese validierten Importe weiterhin kompatibel als `source=manual`, die UI zeigt „Manuell gepflegt“. Der Auditbericht nennt diese Herkunft `manual_verified`. Das bedeutet eine echte manuelle Beobachtung, keine Schätzung.

Die öffentliche Preisdatenbank enthält nur Anzeigefelder. Der automatische Katalog bleibt separat in `verified-catalog-snapshot.json`. Die Kundensuche kombiniert Datenbank und lokale Angebote je tatsächlicher Material-ID/Kette; neuester gültiger Prüfzeitpunkt gewinnt, bei Zeitgleichheit Supabase. Zentralen Import ohne `--local` verwenden. Herkunft und Originaldatum bleiben sichtbar.

Alle Materialien ohne Datenbank aktualisieren und anschließend prüfen:

```sh
npm run prices:snapshot -- --all-materials --stores=obi,bauhaus,hornbach,toom,globus,hagebau,hellweg --candidates=docs/evidence/automatic-candidates-20261001.json --report=work/catalog-snapshot-refresh.json
npm run prices:audit -- --all-materials --update-report work/catalog-snapshot-refresh.json --report work/price-coverage.json
```

Der Audit führt keine Abrufe und keine Datenbankänderungen aus. Fehlende neue Belege lassen vorherige gültige Angebote bestehen. Aktueller vollständiger [Preisbericht](PREISABDECKUNG.md).

## Betrieb und Messgrenzen

Händlerseiten sind keine zugesicherte Schnittstelle. Ein funktionierender Adapter garantiert nicht, dass jeder Händler zu jeder Zeit jeden Artikel automatisch bereitstellt. Der mitgelieferte Bericht dokumentiert echte Abrufversuche je Kette. Für dauerhaft gesperrte oder nicht eindeutig strukturierte Angebote sind genehmigte Feeds/API-Zugänge oder geprüfte manuelle Zuordnungen erforderlich.

Preisbelege unter `docs/evidence` sind zeitgebundene Beobachtungen, **keine automatisch installierten Preis-Seeds** und keine Preisgarantie. Produkt-URLs wurden bei den erfolgreichen Abrufen direkt aus der Quelle gewonnen.
