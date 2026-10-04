# Geprüfte Preisabdeckung

Stand: 03.10.2026. **59 unterschiedliche geprüfte Angebote aus sechs Ketten**. 34 kanonische Varianten × sieben Ketten ergeben 238 Suchkombinationen: 59 exakt, 24 mit kompatibler tatsächlicher Alternative, 155 ohne Preis. Die 24 Alternativen sind Wiederverwendungen vorhandener Angebote, keine 24 zusätzlich beobachteten Preise. 26 der 34 Varianten haben bei mindestens einer Kette ein exaktes oder vergleichbares Angebot.

Originalbeobachtungen: 2026-09-24T17:23:44.000Z bis 2026-10-02T22:12:02.180Z. Das sind gespeicherte Quellenstände, keine heutige Preis- oder Filialbestandszusage. Die App kennzeichnet ältere Beobachtungen. Kein Preis wurde aus einem Grundpreis hochgerechnet.

| Kette | Exakte Varianten | Passende Alternativen | Ohne Angebot |
| --- | ---: | ---: | ---: |
| OBI | 15 | 4 | 15 |
| BAUHAUS | 12 | 4 | 18 |
| HORNBACH | 14 | 4 | 16 |
| toom | 11 | 6 | 17 |
| hagebau | 2 | 1 | 31 |
| Globus Baumarkt | 5 | 5 | 24 |
| HELLWEG | 0 | 0 | 34 |

## Acryl zuerst geprüft

Anfrage: Acryl-Dichtstoff weiß, 310 ml. Die verwendeten Angebote gehören zur Acrylfamilie und haben einen unabhängig beobachteten Gesamtpreis. 300-ml-Varianten von OBI/Soudal und BAUHAUS/Sika sind zusätzlich unter eigenen IDs gespeichert; ein vorhandenes exaktes 310-ml-Angebot gewinnt. Für 280 ml wurde kein Preis erfunden.

| Kette | Kandidat | Tatsächlicher Packungspreis | Ergebnis / Begründung |
| --- | --- | --- | --- |
| OBI | [CMI Acryl Weiß 310 ml](https://www.obi.de/p/4771325/cmi-acryl-weiss-310-ml) | 2,19 € / 310 ml | manual_verified; Acryl, 310 ml, weiß bestätigt; Score 164 |
| BAUHAUS | [Probau Maleracryl Plus Weiß 310 ml](https://www.bauhaus.info/acryl/probau-maleracryl-plus/p/26149033) | 3,95 € / 310 ml | manual_verified; Acryl, 310 ml, weiß bestätigt; Score 164 |
| HORNBACH | [PRECIT Acryl weiß 310 ml; Acrylat Dichtstoff, Acrylatbasis](https://www.hornbach.de/p/precit-acryl-weiss-310-ml/10313763/) | 4,89 € / 310 ml | automatic; Acryl, 310 ml, weiß bestätigt; Score 174 |
| toom | [toom Maleracryl "express" weiß 310 ml; überstreichbar](https://toom.de/p/maleracryl-express-weiss-310-ml/2350309) | 5,99 € / 310 ml | automatic; Acryl, 310 ml, weiß bestätigt; Score 176 |
| hagebau | Racofix Acryldichtstoff 310 ml weiß/grau | Kein geprüfter Preis | Nicht online kaufbar, OUTLET_PLACEHOLDER; kein normaler Onlinepreis übernommen. |
| Globus Baumarkt | [Acryl weiß 310 ml](https://www.globus-baumarkt.de/p/acryl-weiss-310-ml-0779051109/) | 1,99 € / 310 ml | manual_verified; Acryl, 310 ml, weiß bestätigt; Score 164 |
| HELLWEG | Kein belastbarer Kandidat | Kein geprüfter Preis | Automatische Quelle nicht verfügbar; erprobter Produktlink leitete zur Startseite. Kein historischer Indexpreis übernommen. |

Alle geprüften Acryl-/Silikon-/Hybrid-Kandidaten mit angeforderter/erkannter Familie, Spezifikationen, Score, harten Ausschlüssen und Ablehnungsgrund: [Acryl-Diagnose](evidence/acryl-matcher-20261003.json). Silikon bleibt auch bei passender Farbe und Menge ausgeschlossen. hagebau scheitert hier vor der Preisspeicherung an der Kaufbarkeit, nicht am Wort „Acryl“.

## Noch fehlende Materialabdeckung

Für diese acht Definitionen liegt bei keiner Kette eine belegte vergleichbare Beobachtung vor:

- OSB/3 Verlegeplatte 18 × 1250 × 2500 mm, Nut und Feder — `osb3-18-2500-1250-v1`
- Dichtungsband 50 mm × 3 mm × 30 m, selbstklebend — `dichtungsband-50-3-30000-v1`
- Direktabhänger CD 60/27, 125 mm, 1 Stück — `direktabhaenger-cd60-125-1-v1`
- Noniusabhänger Unterteil CD 60/27, 130 mm, 1 Stück — `nonius-unterteil-cd60-130-1-v1`
- Rigips VARIO Fugenspachtel, 5 kg — `rigips-vario-5kg-v1`
- Haftgrund mit Quarzsand, gebrauchsfertig, 5 l — `haftgrund-quarzsand-5l-v1`
- PE-Baufolie 200 µm, 2 × 50 m, 100 m²/Rolle — `pe-folie-200-2000-50000-v1`
- Randdämmstreifen 8 × 150 mm × 25 m, mit Folienlasche — `randdaemmstreifen-8-150-25000-v1`

Das bedeutet nicht „nicht im Sortiment“. Kandidaten werden bei unklarer Packungspreisbasis, abweichender Spezifikation, fehlendem wesentlichen Merkmal oder gesperrter Quelle nicht übernommen. Alle 238 Kombinationen und konkrete letzte Readergründe stehen im [vollständigen Audit](evidence/final-price-coverage-20261003.json); die zugehörigen Kandidaten im [Reader-/Matcherbericht](evidence/matcher-replay-20261003.json). Dieser Abschluss wertet vorhandene Originalseiten aus und behauptet keinen erneuten Netzabruf jeder Seite.

## Grenzen nach Quelle

- OBI/BAUHAUS: automatische Abrufe nicht zuverlässig; echte manuelle Produktseitenbelege ergänzen den Bestand. Weitere Paare benötigen eigene Beobachtungen oder eine erlaubte Datenquelle.
- HORNBACH/toom: automatische strukturierte Produktdaten funktionieren für die enthaltenen Belege. Marketplace-, Mengenstaffel-, Grundpreis- und falsch zugeordnete Varianten bleiben ausgeschlossen.
- Globus: einige strukturierte Belege verfügbar; andere automatische Abrufe gesperrt. Acryl wurde anhand der offiziellen Kategorie mit genau zugeordnetem Produktlink und eigener Produktseite manuell bestätigt.
- hagebau: zwei Produktvarianten mit übereinstimmendem normalen Onlinepreis bestätigt. Weitere Seiten haben nicht kaufbare Varianten, lokale Platzhalter oder keine belastbare Preisbasis.
- HELLWEG: kein gültiger Preisbeleg; gespeicherte Abrufversuche zeigen fehlende robots-Verfügbarkeit beziehungsweise Weiterleitung auf die Startseite. Keine Suchmaschinen-Schnipselpreise übernommen.

[Preisimport und Workerbetrieb](PREISDATEN.md). Fehlgeschlagene Updates löschen keine gültigen Preise und ändern deren Prüfzeit nicht.
