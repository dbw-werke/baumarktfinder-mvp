# Baumarktfinder – Blueprint für die ersten zahlenden Kunden

Stand: 14.10.2026. Ziel: erste bezahlte Aufträge mit dem vorhandenen Produkt. Alle vorgeschlagenen Preise, Umsätze und Zeitbudgets sind Testannahmen, keine Marktbelege oder Umsatzversprechen.

## 1. Ehrliche Startentscheidung

**Noch keine Freigabe als vollständig fertige, automatisch aktuelle Vergleichs-App für sieben Händler. Für einen klar begrenzten, persönlich betreuten Pilotservice ist die vorhandene Technik nutzbar.**

Die aktuelle Prüfung des tatsächlich verwendeten lokalen Kundenkatalogs ergibt:

| Händler | Preiszuordnungen für die 21 MVP-Materialien |
|---|---:|
| OBI | 21/21 |
| toom | 21/21 |
| BAUHAUS | 21/21 |
| HORNBACH | 20/21 – Schleifpapier fehlt |
| Globus Baumarkt | 21/21 |
| hagebau | 2/21 – Uniflott und Tiefengrund |
| HELLWEG | 0/21 |
| Gesamt | **106/147** |

Das sind vorhandene geprüfte Preisbeobachtungen mit ihren ursprünglichen Prüfzeitpunkten, keine heute erneut bestätigte Preis- oder Lagerbestandsabdeckung. Nachweis: [Katalogaudit](docs/evidence/mvp-readiness-20261014.json).

Weitere konkrete Grenzen:

- Die echte Webapp zeigt aktuell einen Fehler bei den Google-Adressvorschlägen. Der Google-Projektzugang muss geprüft werden; für den Pilotservice lässt sich der Einsatzort persönlich aufnehmen.
- HELLWEG zeigt aktuell Abverkauf und Insolvenz-Informationen. Geprüfte Produktlinks führen zur Startseite; aktuelle Verkaufspreise sind darüber nicht belegbar. Das ist kein Nachweis, dass die Produkte in allen Filialen fehlen. [Offizielle HELLWEG-Seite](https://www.hellweg.de/).
- Eine vollständige Live-Browserabnahme aller 21 Suchen und aller Filialkarten ist nicht bestätigt. Automatisierte Komponententests ersetzen sie nicht.
- Eine produktive Veröffentlichung, laufende stündliche Aktualisierung und funktionierende zentrale Supabase-Speicherung sind nicht durch den aktuellen Lauf bestätigt. Die bisherige Dokumentation nennt offene Zugangsdaten-/Schema-Themen.
- Die App enthält normale Händlerlinks. Ein abgeschlossener Affiliate-Vertrag und funktionierendes Provisionstracking sind nicht nachgewiesen. Klicks allein sind daher keine belegte Einnahmequelle.

Die Prozentdatei wurde auf die messbare Preisabdeckung von rund 72 % bezogen. Sie ist keine Verkaufsfreigabe.

## 2. Schnellster sinnvoller Umsatzweg

**Verkaufe zunächst eine fertig geprüfte Einkaufsliste an kleine Trockenbau- und Ausbauunternehmen. Nutze Baumarktfinder intern als Werkzeug.**

Meine Empfehlung: ein regionaler Pilot mit drei bis fünf zahlenden Betrieben. Zielkunden sind Inhaber kleiner Betriebe, die regelmäßig Material bestellen und die Beschaffung noch selbst erledigen. Beginne in einer Region, deren Händler du zuverlässig prüfen kannst.

Das Angebot:

> „Du schickst mir deine fertige Materialliste. Ich prüfe passende Produkte und echte Packungspreise bei bis zu drei vereinbarten Händlern und liefere dir innerhalb eines Werktags eine übersichtliche Einkaufsliste mit Produktlinks und Prüfzeitpunkt.“

**Testpreis: 99 € netto je Auftrag**, zuzüglich Umsatzsteuer, soweit sie für deinen Betrieb anfällt. Die Rechnungsstellung muss zu deinem tatsächlichen Steuerstatus passen. Begrenze den ersten Auftrag auf zehn unterschiedliche Positionen aus dem unterstützten Sortiment, einen Standort und eine Korrekturrunde.

Vor der Beauftragung bestätigst du, welche Positionen und Händler du abdecken kannst. Du verkaufst Recherche und Vergleich, keine Bauplanung, garantierte Ersparnis oder garantierte Filialverfügbarkeit. Der Kunde gibt erforderliche technische Eigenschaften und zulässige Alternativen vor.

## 3. Was der Kunde tatsächlich erhält

Eine Tabelle oder PDF mit:

| Feld | Inhalt |
|---|---|
| Kundenbedarf | Material, technische Eigenschaften, benötigte Menge |
| Gefundenes Produkt | Echter Händlername und genauer Produktname |
| Verkaufspackung | Tatsächliche Größe, Abmessungen und Inhalt |
| Preis | Geprüfter Gesamtpreis dieser Packung, Prüfdatum und Preisgeltung |
| Benötigte Packungen | Auf volle Verkaufspackungen aufgerundet |
| Materialkosten | Packungsanzahl × echter Packungspreis |
| Zusatzkosten | Versand/Lieferung nur mit belegter Angabe; sonst separat offen |
| Bezug | Exakter Produktlink, passende Filiale soweit bestätigt |
| Einschränkungen | Fehlende Preise, offene Bestände, abweichende Ausführungen |

Die Berechnung der benötigten Packungsanzahl ist erlaubt und nützlich. Dabei bleibt der Einzelpreis immer der echte Packungspreis; eine 300-ml-Kartusche wird niemals als erfundene 310-ml-Packung verkauft.

Für jede bezahlte Lieferung prüfst du die verwendeten Angebote erneut. Eine gespeicherte Beobachtung allein reicht für das Versprechen einer frisch geprüften Einkaufsliste nicht. HELLWEG wird nur aufgenommen, wenn ein aktuelles offizielles Filialangebot oder ein anderer belastbarer offizieller Preis vorliegt.

## 4. Dein Ablauf für die nächsten sieben Tage

| Tag | Konkrete Handlung | Ergebnis |
|---|---|---|
| 1 | Einen Musterauftrag mit höchstens zehn Positionen vollständig prüfen. Aufwand messen. Angebot und Leistungsgrenze schriftlich festlegen. | Ehrlich vorzeigbare Beispiel-Einkaufsliste |
| 2 | Zehn passende Betriebe über vorhandene Kontakte, Empfehlungen oder persönliche Gespräche erreichen. | Drei kurze Bedarfsgespräche als Arbeitsziel |
| 3 | Mit den Interessenten eine echte nächste Bestellung ansehen. Abdeckung prüfen und das 99-€-Angebot konkret machen. | Erster verbindlich beauftragter Pilot als Ziel |
| 4 | Auftrag abarbeiten, Quellen prüfen, Tabelle liefern und vereinbarungsgemäß abrechnen. | Erste bezahlte Leistung |
| 5 | Nachfragen: Wie viel Zeit wurde gespart? Welche Produkte waren unpassend? Wurde bestellt? | Tatsächliches Feedback statt angenommener Ersparnis |
| 6 | Zwei weitere passende Pilotaufträge anbieten. Eine Kundenreferenz nur mit Zustimmung verwenden. | Wiederholbarer Ablauf |
| 7 | Aufwand, Zahlungseingänge und Wiederbestellungen auswerten. Umfang oder Preis anpassen. | Entscheidung über Fortsetzung |

Keine Massen-Kaltmails oder ungefragten WhatsApp-Werbenachrichten einplanen. Elektronische Werbung unterliegt grundsätzlich Einwilligungsregeln; Ausnahmen müssen tatsächlich passen. Nutze warme Empfehlungen, persönliche Kontakte und erwünschte Anfragen. [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html).

## 5. Vorlage für ein erlaubtes Gespräch oder eine angefragte Nachricht

> „Ich teste einen Material-Einkaufsvergleich für kleine Trockenbaubetriebe. Du gibst mir deine nächste Materialliste, ich prüfe bis zu zehn Positionen bei bis zu drei vereinbarten Händlern. Du bekommst echte Packungspreise, Produktlinks und eine nachvollziehbare Gesamtrechnung. Der Pilot kostet 99 € netto. Vorher bestätige ich, welche Positionen ich zuverlässig vergleichen kann. Hast du gerade eine Bestellung, an der wir das ausprobieren können?“

Zeige danach dein konkretes Muster. Frage nach dem bisherigen Bestellablauf und dem tatsächlichen Zeitaufwand. Behaupte keine prozentuale Ersparnis ohne belegbaren Vergleich derselben Mengen und Eigenschaften.

Diese Vorlage wurde nicht versendet. Es wurden keine Kontakte angeschrieben und keine Verträge abgeschlossen.

## 6. Einfache Wirtschaftlichkeit und klare Grenzen

Rechenbeispiele zum Testpreis, jeweils vor Kosten und Steuern:

| Bezahlte Aufträge | Netto-Umsatz |
|---|---:|
| 3 | 297 € |
| 5 | 495 € |
| 10 | 990 € |

Bei zwei Stunden Lieferaufwand entsprechen 99 € einem Umsatz von 49,50 € pro Lieferstunde. Mit einer zusätzlichen Stunde Akquise/Administration sind es nur noch 33 € pro Gesamtstunde – jeweils vor API-, Zahlungs-, Fahrt- und sonstigen Kosten.

Arbeitsregeln:

- Zunächst höchstens zwei Stunden Lieferaufwand pro Auftrag. Wenn das wiederholt nicht reicht: weniger Positionen oder höherer Preis, keine kostenlose Dauerrecherche.
- Für die erste Woche kein Budget für bezahlte Werbung. Erst prüfen, ob überhaupt jemand bezahlt und erneut bestellt.
- Arbeitsziel: Nach zehn qualifizierten Gesprächen mindestens ein bezahlter Pilot. Das ist eine Entscheidungsregel, keine prognostizierte Abschlussquote.
- Wenn nach zehn passenden Gesprächen niemand bezahlt: Einwände auswerten und Angebot ändern, bevor weitere Funktionen gebaut werden.
- Wiederkehrendes Angebot erst bei nachgewiesenem Bedarf testen: beispielsweise 249 € netto monatlich für maximal drei Listen mit je zehn Positionen. Keine unbegrenzte Betreuung versprechen.

## 7. Was vor einem öffentlichen App-Verkauf erledigt sein muss

Für den persönlichen Pilotservice kannst du Recherche, Auftrag und Rechnung manuell abwickeln. Für den Verkauf eines selbstständig nutzbaren App-Abos fehlen noch nachweisbare Freigaben:

1. **Funktionsfreigabe:** Google-Schlüssel für die echte Domain und benötigte APIs korrekt konfigurieren; Standortsuche, Karten, Produktlinks und mobile Nutzung praktisch prüfen. Für Browser-Schlüssel Website- und API-Beschränkungen passend setzen, nicht pauschal entfernen. [Google-Sicherheitshinweise](https://developers.google.com/maps/api-security-best-practices).
2. **Ehrlicher Produktumfang:** Sichtbar nur die tatsächlich abgedeckten Materialien/Händler zusagen. Nicht mit „alle sieben Händler live“ oder „überall auf Lager“ werben. HORNBACH-/hagebau-Lücken und HELLWEG-Verfügbarkeit bleiben offen, solange keine gültigen Belege vorliegen.
3. **Betriebsfreigabe:** Hosting, dauerhafte Preisablage, Aktualisierung, Fehlerprotokolle und Verantwortlichkeit testen. Ein lokaler Build veröffentlicht nichts. Deployment erfolgt erst nach deiner separaten Anweisung.
4. **Geschäftliche Grundlagen:** Betreiberangaben/Impressum und zum tatsächlichen Datenfluss passende Datenschutzinformationen bereitstellen. Geschäfts- und Steuerstatus, Rechnung und Leistungsbedingungen klären. [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html), [DSGVO Art. 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=de).
5. **Preis- und Quellenangaben:** Bei Verbraucherangeboten Gesamtpreise und gegebenenfalls Grundpreise korrekt darstellen; Händler-Onlinepreise, Filialpreise und Verfügbarkeit unterscheiden. Nutzungsrechte/Vertragsbedingungen für Händlerdaten und Bilder vor kommerzieller Veröffentlichung prüfen. [PAngV §§ 3–4](https://www.gesetze-im-internet.de/pangv_2022/BJNR492110021.html).

Das ist keine Aufforderung zu einem weiteren großen Umbau: Für die ersten zahlenden Piloten genügt ein klar abgegrenzter Service mit zuverlässiger manueller Lieferung.

## 8. Affiliate und Wachstum: nach dem ersten Zahlungsnachweis

Affiliate kann später ergänzen. Normale Produktlinks werden erst durch genehmigte Partnerschaften und korrekt eingerichtete Trackinglinks zu einem möglichen Provisionskanal. Awin beschreibt den Zusammenhang zwischen Publisher-ID, Trackinglinks und Provisionen; die konkreten Händlerprogramme und Konditionen musst du einzeln bestätigen. [Awin: Funktionsweise](https://help.awin.com/docs/de/the-basics-awin-and-affiliate-marketing).

Es wird hier keine Teilnahme eines bestimmten Baumarkts, Provisionshöhe oder Annahme deines Projekts zugesagt. Baue deine ersten Einnahmen nicht auf unbestätigte Provisionen.

Nach drei bis fünf bezahlten Piloten:

- Wiederbestellungen und Gesamtaufwand je Kunde messen.
- Nur wiederkehrende Arbeitsschritte automatisieren.
- Mit belegbaren Ergebnissen passende Daten-/Affiliate-Partnerschaften anfragen.
- Öffentlichen App-Tarif erst anbieten, wenn ein Kunde die Suche ohne deine Hilfe erfolgreich durchlaufen kann und Preise zuverlässig gepflegt werden.

**Deine nächste konkrete Handlung:** Einen vollständig geprüften Mustervergleich erstellen und einem passenden Betrieb einen klar begrenzten 99-€-Pilotauftrag anbieten.

## Technischer Prüfstand dieses Dokuments

Katalogaudit, 278 automatisierte Tests, ESLint und der abschließende Produktionsbuild (`npm run build`) sind bestanden. Die TypeScript-Typangaben im bestehenden Frontend-Test wurden korrigiert. Die echte lokale App wurde geöffnet; die Google-Adressvorschläge zeigten einen Freigabefehler. Eine vollständige Live-Browserabnahme aller Suchabläufe wird damit nicht behauptet. Es wurde nichts gepusht oder deployt.
