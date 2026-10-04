# Offene Standortsuche mit OpenStreetMap

Die App kann eine ausdrücklich ausgelöste Suche ohne Google-Schlüssel über Nominatim und Overpass ausführen. Der Betreiber entscheidet sich damit bewusst für diese öffentlichen Dienste und ist für die Einhaltung ihrer Nutzungsregeln verantwortlich. Die [offizielle Nominatim-Nutzungsrichtlinie](https://operations.osmfoundation.org/policies/nominatim/) ist maßgeblich.

## Grenzen des öffentlichen Betriebs

- Nominatim darf höchstens eine Anfrage pro Sekunde für die gesamte Anwendung erhalten, zusammen über alle Nutzer und Server. Die App begrenzt Starts in einem Serverprozess auf einen Abstand von mindestens 1,1 Sekunden, begrenzt wartende Anfragen und speichert Ergebnisse zwischen.
- Dieser Modus eignet sich deshalb ausschließlich für einen einzelnen Serverprozess mit geringem Verkehr, beispielsweise den lokalen Betrieb. Der Prozess-Limiter ist kein verteilter Limiter. Mehrere Instanzen, Serverless-Skalierung oder mehrere Node-Worker benötigen einen gemeinsam durchgesetzten Limiter oder einen eigenen beziehungsweise vertraglich gebuchten Geocoding-Dienst.
- Auf erkannten Vercel- oder AWS-Lambda-Deployments verweigert der Endpunkt die Nutzung des öffentlichen Nominatim-Servers bereits vor einer Anfrage. Dort muss `OSM_NOMINATIM_URL` auf einen eigenen oder gebuchten Dienst zeigen. Der Schutz erkennt nicht jede mögliche Hosting-Plattform; für weitere Umgebungen bleibt die Gesamtbegrenzung Betreiberpflicht.
- Es gibt keine Nominatim-Autovervollständigung, keine periodischen Abfragen und keine Hintergrund-Suche. Standortanfragen erfolgen erst nach einer aktiven Such- oder Standortaktion des Nutzers.
- Der Standard-User-Agent lautet `Baumarktfinder/1.0 (local development)`. Für einen öffentlichen Betrieb soll `OSM_USER_AGENT` den tatsächlichen Betreiber und eine gültige Kontaktmöglichkeit benennen.
- Öffentliche Dienste bieten keine Verfügbarkeitsgarantie. Sperren, Kontingente oder Zeitüberschreitungen werden als Fehler angezeigt; es werden keine Filialen oder Fahrzeiten erfunden.
- Overpass kann Anfragen vor der Ausführung in eine Warteschlange stellen. Der Proxy wartet insgesamt höchstens 40 Sekunden auf diesen Dienst; der API-Endpunkt ist auf 60 Sekunden begrenzt. Für dauerhaften kommerziellen Betrieb empfiehlt auch [Overpass einen eigenen Dienst](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

Nominatim erhält die eingegebene Adresse oder die freigegebenen Koordinaten. Overpass erhält den Suchmittelpunkt und den Radius. Der Endpunkt schreibt keine Adressen in Logs. Erfolgreiche Nominatim-Antworten werden bis zu 24 Stunden, Filialergebnisse bis zu 30 Minuten und Fehler 30 Sekunden im begrenzten Arbeitsspeicher gespeichert. Nach Neustarts ist dieser Cache leer. An den Browser ausgelieferte Antworten sind als `private, no-store` markiert. Vertrauliche Informationen gehören nicht in die Suche; siehe auch die [OSMF-Datenschutzrichtlinie](https://osmfoundation.org/wiki/Privacy_Policy).

## Konfiguration

Die Dienste lassen sich ohne Codeänderung durch Umgebungsvariablen wechseln:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `OSM_NOMINATIM_URL` | `https://nominatim.openstreetmap.org/` | Basis-URL einer Nominatim-kompatiblen Suche; `search` oder `reverse` wird angehängt. |
| `OSM_OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Vollständiger Overpass-Endpunkt. |
| `OSM_USER_AGENT` | `Baumarktfinder/1.0 (local development)` | Tatsächliche Anwendungs-/Betreiberkennung. |

HTTPS ist erforderlich; für selbst betriebene lokale Dienste ist HTTP auf localhost erlaubt. Das Umschalten erfolgt über die Serverkonfiguration; je nach Hosting muss der Prozess neu gestartet werden.

## Inhalt und Darstellung

Die Ländereinschränkung verwendet Nominatims `countrycodes=de` und prüft das zurückgelieferte Land. Die Overpass-Abfrage verbindet den 35-km-Umkreis mit der deutschen Verwaltungsgrenze. Nur OBI, BAUHAUS, HORNBACH, toom, hagebau, Globus Baumarkt und HELLWEG werden berücksichtigt. Unterabteilungen und Dubletten werden vor der Begrenzung auf 15 Märkte entfernt. Fehlende Straßenadressen bleiben ausdrücklich als unvollständig gekennzeichnet.

Die Rangfolge beruht auf Luftlinie. Der offene Ersatzdienst berechnet keine Fahrstrecken oder Verkehrszeiten. Der Routenlink übergibt ausschließlich Koordinaten an Google Maps, niemals eine OpenStreetMap-ID als Google Place ID. OpenStreetMap-Kartendaten bestätigen weder ein vollständiges Sortiment noch Bestand oder Preis eines Produkts.

Die Oberfläche muss [© OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright) anzeigen. Für die Daten gilt die Open Database License. Technische Grundlagen: [Nominatim-Suche](https://nominatim.org/release-docs/latest/api/Search/), [Nominatim-Reverse-Geocoding](https://nominatim.org/release-docs/latest/api/Reverse/), [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
