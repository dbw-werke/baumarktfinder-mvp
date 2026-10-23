Die sieben explizit gewählten Produkte aus den Screenshots vom 21.10.2026 sind in `docs/evidence/screenshot-corrections-20261021.json` dokumentiert. Packungspreise werden nicht auf frühere Wunschgrößen umgerechnet.

`src/data/requested-products.json` ordnet diese Produkte den bisherigen Suchauswahlen zu. Nur die exakt belegte manuelle Beobachtung (Artikel, Händler, Menge, Preis und Datum) erhält Vorrang. Automatische Beobachtungen werden weiter gesammelt; für diese ausdrücklich korrigierten Artikel bleiben die Screenshotpreise sichtbar, bis die Zuordnung bewusst aktualisiert oder entfernt wird. Andere Artikel werden weiterhin nach Aktualität ausgewählt. Das ursprüngliche Datum und „Manuell gepflegt“ bleiben in den Preisdetails erhalten.

- HORNBACH: RAUTNER 10501474, 15 Blatt 230 × 280 mm, K60/80/120/180/240, 11,95 €.
- toom: Knauf Perlfix 3053281, 25 kg, 10,49 €; Soudal 2368036, 500 ml, 10,99 €.
- BAUHAUS: Sika 29340206, 300 ml, 10,95 €; Catnic 13907753, 1 × 10 m, 22,95 €. Catnic ist Innenputzgewebe, keine behauptete 160-g-WDVS-Identität.
- HORNBACH: Baumit Zementsockelputz 7196554, 25 kg, 10,35 € ohne Mengenrabatt.
- OBI: Multipor 3554755, 1 × 25 m, 59,75 € je Rolle (2,39 €/m²), für das Multipor-Dämmsystem. Keine unbestätigte Grammatur übernommen.

Der BAUHAUS-Link zur Wolfcraft-Rolle 27790416 ist im öffentlichen Seitenindex vorhanden (93 mm × 5 m, K180, 5,30 €), lieferte beim Benutzer aber eine Fehlerseite. Direkte automatisierte Requests werden von BAUHAUS mit HTTP 403 abgelehnt. Der Kartenbutton öffnet daher die BAUHAUS-Suche nach genau dieser Artikelnummer; Preisbeleg und ursprünglicher Produktlink bleiben gespeichert. Dies ist eine Ausweichnavigation, keine behauptete Reparatur der externen Händlerseite.

Die spätere Vorgabe ergänzt die breite Suche „Bauschaum 1K“: Sie zeigt BAUHAUS Sika 300 ml zu 10,95 € und toom Soudal Genius Gun 750 ml zu 13,99 € aus dem früheren Screenshot (`edge-strip-silicone-foam-20261020.json`). Beide Karten zeigen ihre tatsächliche Menge. Die generische 500-ml-Auswahl verwendet weiterhin das ausdrücklich gewählte Sika-Produkt bei BAUHAUS und Soudal 500 ml bei toom. Bei einer ausdrücklich auf Genius Gun 750 ml eingeschränkten Suche wird Sika 300 ml weiterhin nicht als gleichwertig eingesetzt. Die kurzen Anzeigenamen ändern keine gespeicherten technischen Eigenschaften. Layout und CSS bleiben unverändert.
