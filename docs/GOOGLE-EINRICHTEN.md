# Google Maps einrichten

Adressvorschläge, Filialsuche und Routen sind im Code angeschlossen. Die reale Anfrage vom 28. September 2026 mit der lokalen Website `http://127.0.0.1:3000` wurde von Google mit HTTP 403 und `API_KEY_HTTP_REFERRER_BLOCKED` abgewiesen. Diese Website ist für den vorhandenen Schlüssel nicht freigegeben; die Codekorrekturen können diese Cloud-Beschränkung nicht aufheben. Der [bereinigte Diagnosebericht](evidence/google-autocomplete-diagnostic-20260928.json) enthält keine Schlüsselwerte.

In der Projektdatei `.env.local` diesen Wert ersetzen beziehungsweise ergänzen:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=DEIN_GOOGLE_SCHLUESSEL
```

Danach den Entwicklungsserver neu starten (`npm run dev`). Bei einem Produktionsbuild oder Vercel denselben Wert als Umgebungsvariable setzen und neu bauen/deployen. Den Schlüssel nicht in Chat oder Git einfügen.

Der Schlüssel muss zu einem Google-Cloud-Projekt mit aktiviertem Billing und diesen APIs gehören:

- [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/get-api-key) für das Browser-Script
- [Places API (New)](https://developers.google.com/maps/documentation/javascript/place-get-started) für Adressvorschläge, ausgewählte Adressen und Filialsuche
- [Geocoding API](https://developers.google.com/maps/documentation/javascript/geocoding) für eingegebene Adressen und Standortauflösung
- [Routes API](https://developers.google.com/maps/documentation/javascript/routes/start) für die Fahrzeitberechnung

In Google Cloud unter **APIs & Dienste → Anmeldedaten → verwendeter API-Schlüssel**:

1. Die Anwendungseinschränkung **Websites / HTTP-Verweis-URLs** beibehalten.
2. Für die tatsächlich benutzte lokale Adresse `http://127.0.0.1:3000/*` hinzufügen. Wird auch `localhost` verwendet, zusätzlich `http://localhost:3000/*` hinzufügen. Hostname und Port müssen zur geöffneten App passen.
3. Unter API-Einschränkungen die vier oben genannten APIs zulassen; sie müssen im selben Cloud-Projekt aktiviert sein. Billing muss aktiv sein.
4. Änderungen speichern und danach die lokale App im Browser neu laden. Nach Änderung des Schlüssels in `.env.local` zuerst den Entwicklungsserver neu starten.

Für späteren öffentlichen Betrieb nur die tatsächlich verwendete HTTPS-Domain ergänzen. Keine unbeschränkte Freigabe und kein Entfernen der Schlüsselbeschränkungen nötig. Die [offizielle Schlüsselschutz-Anleitung](https://developers.google.com/maps/api-security-best-practices) beschreibt Website- und API-Einschränkungen.

Die App verwendet das offizielle [Place Autocomplete Widget](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new), `PlaceAutocompleteElement` mit `includedRegionCodes: ["de"]`. Google stellt Eingabe und Vorschläge bereit; `gmp-select` übernimmt die ausgewählte Adresse über `placePrediction.toPlace()` und `fetchFields()`. Bei Autorisierungsfehlern bleibt eine normale Adresseingabe mit verständlichem Hinweis. Die Schaltfläche **Route** verwendet unabhängig von der Fahrzeitberechnung eine [Google-Maps-URL](https://developers.google.com/maps/documentation/urls/get-started) mit den Koordinaten der konkreten Filiale und zusätzlich ihrer Google-Place-ID, sofern vorhanden. Dafür ist kein API-Schlüssel nötig; aus einem Routes-API-Ausfall folgt daher kein defekter Route-Link. Die erfolgreiche Live-Autovervollständigung ist wegen der vorhandenen Freigabe-/Browserbeschränkungen noch nicht abgenommen.

Für den lokalen Material- und Preiskatalog brauchst du keine Supabase-Zugangsdaten: kanonische Definitionen, automatisch geprüfte Beobachtungen und die lokale manuelle Preisdatenbank sind enthalten. Supabase bleibt die optionale zentrale Datenbank für den täglichen Worker. Einrichtung und Import: [PREISDATEN.md](PREISDATEN.md).

Ohne nutzbaren Google-Schlüssel versucht die lokale App die offene Standortsuche. Deren öffentliche Dienste sind nicht garantiert verfügbar; ihre [Betriebsgrenzen](OSM.md) gelten weiterhin.
