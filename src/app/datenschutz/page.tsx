import type { Metadata } from "next";
import LegalPage, { ContactDetails, OperatorAddress } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Datenschutz – Entwurf | Baumarktfinder",
  description: "Datenschutzentwurf zu Hosting, Suchanfragen, Standortdiensten, Analytics und deinen Rechten bei Baumarktfinder.",
  alternates: { canonical: "/datenschutz" },
};

export default function DatenschutzPage() {
  return <LegalPage title="Datenschutzerklärung">
    <aside aria-label="Entwurfsstatus">
      <p><strong>Entwurf zur rechtlichen Prüfung · Stand: 26. November 2026</strong></p>
      <p>Diese Fassung beschreibt die im Quellcode vorgesehene Datenverarbeitung. Die tatsächlich gewählten Anbieterregionen, Vertragsgrundlagen, Speicherfristen sowie die Einwilligungsanforderungen für Umami und Google müssen vor einer endgültigen Veröffentlichung geklärt werden. Diese Fassung ist noch keine abschließend rechtlich geprüfte Datenschutzerklärung.</p>
    </aside>

    <h2>1. Verantwortlicher</h2>
    <OperatorAddress />
    <ContactDetails />

    <h2>2. Allgemeines zur Datenverarbeitung</h2>
    <p>Baumarktfinder hilft dir, Baustoffe und Baumärkte nach Produkt, Preis, Entfernung und Fahrzeit zu vergleichen. Dafür werden technische Verbindungsdaten sowie die von dir eingegebenen Such- und Standortangaben verarbeitet. Die Nutzung erfordert kein Kundenkonto. Baumarktfinder betreibt keinen eigenen Warenkorb oder Checkout.</p>
    <p>Eine Adresse oder ein freigegebener Standort wird für die standortbezogene Suche benötigt. Du kannst eine Adresse manuell eingeben, ohne die Standortfreigabe deines Geräts zu verwenden. Bitte gib in die Materialsuche keine Namen, Kontaktdaten oder sonstigen persönlichen Informationen ein.</p>

    <h2>3. Hosting und Serverprotokolle</h2>
    <p>Die Website wird über Vercel bereitgestellt. Bei Seiten- und API-Aufrufen werden technisch notwendige Informationen wie IP-Adresse, Zeitpunkt, angeforderte Ressource und Browserinformationen an die Hosting-Infrastruktur übermittelt. Zugriffs-, Sicherheits- und Fehlerprotokolle können der Auslieferung, Absicherung und Fehlerbehebung dienen.</p>
    <p>Bei der internen OBI-Produktsuche protokolliert die Anwendung außerdem den Materialsuchbegriff und Informationen zur Produktzuordnung auf dem Server. Eine Aussage, dass Suchbegriffe grundsätzlich nicht protokolliert werden, wäre deshalb unzutreffend. Die Aufbewahrung dieser Protokolle hängt von der Vercel-Konfiguration ab und ist noch zu bestätigen.</p>
    <p>Informationen des Anbieters: <a href="https://vercel.com/legal/privacy-notice" rel="noreferrer">Vercel Privacy Notice</a>. Der für das konkrete Konto geltende Auftragsverarbeitungsvertrag und die eingesetzten Regionen sind vor Freigabe dieser Erklärung zu dokumentieren.</p>

    <h2>4. Adresssuche, Standort und Google-Dienste</h2>
    <p>Die Adressvervollständigung und die Ermittlung von Baumärkten, Entfernungen und Fahrzeiten verwenden Google Maps Platform, insbesondere Places-, Geocoding- und Routendienste. Die Verbindung zu Google kann bereits bei Aktivierung des Adressfelds beginnen. Dabei können eingegebene Adressteile, ausgewählte Adressen, Ortskennungen, Ausgangs- und Zielkoordinaten sowie IP-Adresse und technische Browserdaten an Google gelangen.</p>
    <p>Wenn du „Meinen aktuellen Standort verwenden“ auswählst, fragt dein Browser nach einer Standortberechtigung. Nach Freigabe werden Standortkoordinaten für die Suche verwendet. Eine fortlaufende Standortüberwachung ist im Anwendungscode nicht vorgesehen. Du kannst die Berechtigung über die Einstellungen deines Browsers oder Betriebssystems zurücknehmen; die manuelle Adresseingabe bleibt möglich.</p>
    <p>Die Browserberechtigung für den Standort ersetzt nicht automatisch eine gegebenenfalls erforderliche datenschutzrechtliche Einwilligung für sämtliche Google-Verarbeitungen. Die konkrete Rechtsgrundlage und ein möglicherweise erforderlicher vorgeschalteter Einwilligungsmechanismus sind noch rechtlich zu prüfen.</p>
    <p>Über „Route“ wird Google Maps geöffnet. Der Link enthält die für die Route notwendigen Ausgangs- und Zielangaben. Auf der Zielseite gelten die <a href="https://policies.google.com/privacy?hl=de" rel="noreferrer">Datenschutzhinweise von Google</a>.</p>

    <h2>5. Alternative Standortdienste auf OpenStreetMap-Basis</h2>
    <p>Der Code enthält einen alternativen Suchweg über Nominatim und Overpass. Wenn dieser konfiguriert und verwendet wird, erhält zunächst die eigene Server-API deine Adresse oder Koordinaten. Der Server übermittelt die für die Geocodierung bzw. Umkreissuche erforderlichen Angaben an den jeweiligen Dienst.</p>
    <p>Der öffentliche Nominatim-Standardendpunkt ist für den Vercel-Betrieb im Code gesperrt. Ob ein eigener oder vertraglich bereitgestellter Ersatzdienst aktiv ist, ist nicht bestätigt. Deshalb wird hier keine aktive Nutzung eines bestimmten Nominatim- oder Overpass-Betreibers behauptet. Bei Aktivierung sind dessen Identität, Datenschutzbedingungen und Speicherfristen in dieser Erklärung zu ergänzen.</p>

    <h2>6. Material- und Preisdaten, Supabase und externe APIs</h2>
    <p>Bei konfigurierter Datenbank lädt der Browser Materialkataloge, Suchbezeichnungen und verifizierte Preisbeobachtungen von Supabase. Supabase erhält dabei technische Verbindungsdaten und die angeforderten Katalog- bzw. Händlerfilter. Eine Übertragung deiner eingegebenen Adresse oder Standortkoordinaten an Supabase ist in diesem Datenweg nicht vorgesehen. Materialvorschläge werden aus dem geladenen Katalog lokal ermittelt.</p>
    <p>Für die OBI-Zuordnung wird der ausgewählte Materialname oder Materialsuchtext an die eigene Server-API übermittelt. Diese nutzt gespeicherte Produktdaten; im Kundenpfad wird dafür kein Händlerbrowser gestartet. Die dabei entstehenden Diagnoseprotokolle sind unter Abschnitt 3 beschrieben.</p>
    <p>Aktualisierte toom-Preise werden über die eigene API geladen. Der Server kann dafür einen öffentlichen Preisbestand bei GitHub abrufen. Dieser Abruf übermittelt keine Kundenadresse oder Materialsuchanfrage an GitHub. Die separaten Preisaktualisierungen verarbeiten Händler- und Produktdaten im Hintergrund.</p>
    <p>Für Supabase sind die tatsächlich gewählte Projektregion, Protokollfristen und vertraglichen Schutzmaßnahmen noch zu bestätigen. Weitere Anbieterinformationen: <a href="https://supabase.com/privacy" rel="noreferrer">Supabase Privacy Policy</a>.</p>

    <h2>7. Umami Analytics</h2>
    <p>In der Produktionskonfiguration ist Umami Cloud zur statistischen Auswertung der Website eingebunden. Das Analyseskript wird nach der Interaktivität der Seite automatisch geladen; im bestehenden Code gibt es dafür keine vorgeschaltete Einwilligungsabfrage.</p>
    <p>Umami verarbeitet Nutzungsinformationen wie aufgerufene Seiten und technische Geräte- bzw. Browsermerkmale. Bereits der Abruf des externen Skripts übermittelt Verbindungsdaten an den Anbieter. Nach Anbieterangaben kann die IP-Adresse zur Standortableitung verarbeitet werden; daraus folgt keine Zusicherung, dass in Betriebs- oder Sicherheitsprotokollen keine IP-Adressen vorkommen.</p>
    <p>Die Einbindung ist auf die Baumarktfinder-Domain beschränkt und weist Umami an, URL-Suchparameter und Fragmente auszuschließen sowie Do-Not-Track zu berücksichtigen. Eigene Tracking-Ereignisse für eingegebene Adressen oder Materialbegriffe sind nicht eingerichtet. Diese Einstellungen sind keine umfassende Garantie für Anonymität oder Einwilligungsfreiheit.</p>
    <p>Umami-Kontoregion, Vertragspartner, tatsächlicher Datenumfang und Speicherfrist müssen noch bestätigt werden. Hinweise: <a href="https://umami.is/privacy" rel="noreferrer">Umami Privacy Policy</a> und <a href="https://docs.umami.is/docs/cloud/faq" rel="noreferrer">Umami Cloud: Regionen und Aufbewahrung</a>.</p>

    <h2>8. Cookies, Browser-Speicher und Einwilligung</h2>
    <p>Im eigenen Anwendungscode sind keine Zugriffe auf Cookies, Local Storage oder Session Storage zur Speicherung einer Suchhistorie eingerichtet. Der Supabase-Client speichert keine dauerhafte Anmeldesitzung. Eingaben und Suchergebnisse werden während der Nutzung im Arbeitsspeicher gehalten. Browser-Caches und das Verhalten externer Skripte sind davon zu unterscheiden.</p>
    <p>Nach <a href="https://www.gesetze-im-internet.de/ttdsg/__25.html" rel="noreferrer">§ 25 TDDDG</a> erfordern Speicherungen oder Zugriffe auf Informationen im Endgerät grundsätzlich eine Einwilligung, sofern keine gesetzliche Ausnahme greift. Das betrifft auch andere Techniken als Cookies. Für personenbezogene Daten ist zusätzlich eine Rechtsgrundlage nach der DSGVO erforderlich.</p>
    <p><strong>Offener Prüfpunkt:</strong> Ob Umami und die konkrete Google-Einbindung ohne Einwilligung zulässig sind, ist nicht abschließend geklärt. Falls eine Einwilligung erforderlich ist, müssen die betroffenen Dienste bis zur Zustimmung zurückgehalten und eine Widerrufsmöglichkeit eingerichtet werden. Ein bloßer Hinweisbanner oder diese Erklärung reicht dafür nicht. Ein solcher Mechanismus ist derzeit nicht Bestandteil der Anwendung.</p>

    <h2>9. Externe Händlerlinks</h2>
    <p>Angebots- und Sortimentslinks führen zu OBI, BAUHAUS, HORNBACH, toom, hagebau, Globus Baumarkt oder HELLWEG. Erst beim Öffnen des Links wird eine Verbindung zur jeweiligen Händlerseite hergestellt. Bei einem Suchlink wird auch der im Link enthaltene Materialbegriff übermittelt. Die Händler- und Routenlinks der Anwendung verwenden einen Referrer-Schutz.</p>
    <p>Für die Verarbeitung auf den Zielseiten ist der jeweilige Anbieter verantwortlich. Bitte beachte dessen Datenschutzhinweise. Eine Awin-Einbindung ist im Anwendungscode nicht eingerichtet.</p>

    <h2>10. Kontaktaufnahme</h2>
    <p>Wenn du uns per E-Mail oder Telefon kontaktierst, verarbeiten wir die von dir mitgeteilten Kontaktdaten und Inhalte zur Bearbeitung deiner Anfrage. Die Kontaktseite enthält E-Mail- und Telefonlinks, kein Kontaktformular. Mit einem Klick wird das entsprechende Programm auf deinem Gerät geöffnet.</p>
    <p>Der tatsächlich eingesetzte E-Mail-Anbieter und die Aufbewahrungsregeln des Postfachs sind vor Veröffentlichung noch zu ergänzen. Für die endgültige Löschregelung sind der Abschluss der Anfrage, gegebenenfalls weitere Zusammenarbeit und einschlägige gesetzliche Aufbewahrungspflichten zu berücksichtigen.</p>

    <h2>11. Rechtsgrundlagen</h2>
    <p>Für die notwendige Bereitstellung, Absicherung und Fehlerbehebung der Website kommt Art. 6 Abs. 1 Buchst. f DSGVO in Betracht. Die damit verfolgten Interessen sind ein sicherer, funktionsfähiger Such- und Vergleichsdienst und die Bearbeitung allgemeiner Anfragen. Die konkrete Interessenabwägung, insbesondere für Suchprotokolle, muss dokumentiert werden.</p>
    <p>Soweit eine Anfrage auf einen Vertrag oder vorvertragliche Maßnahmen gerichtet ist, kann Art. 6 Abs. 1 Buchst. b DSGVO einschlägig sein. Gesetzliche Pflichten können eine Verarbeitung nach Art. 6 Abs. 1 Buchst. c DSGVO erfordern. Einwilligungsbedürftige Verarbeitungen benötigen eine wirksame Einwilligung nach Art. 6 Abs. 1 Buchst. a DSGVO und gegebenenfalls § 25 TDDDG. Für Umami und die Google-Dienste ist die abschließende Zuordnung vor Freigabe noch offen.</p>

    <h2>12. Speicherdauer</h2>
    <p>Der eigene Seitenzustand enthält Eingaben und Ergebnisse während der Nutzung. Ein Neuladen setzt diesen Zustand zurück; daraus folgt keine Löschung bei bereits kontaktierten Anbietern oder aus Serverprotokollen.</p>
    <p>Der optionale OpenStreetMap-Suchweg verwendet serverseitige Arbeitsspeicher-Caches. Ihre Gültigkeitszeiten für erneute Antworten sind keine garantierten Löschfristen: Einträge können bis zur Verdrängung, Überschreibung oder zum Prozessende im Speicher verbleiben.</p>
    <p>Die konkreten Aufbewahrungs- und Löschfristen für Vercel-Protokolle, Umami-Statistiken, Supabase-Protokolle und Kontaktanfragen sind aus dem Quellcode nicht feststellbar. Diese Angaben müssen anhand der tatsächlich eingesetzten Konten und eines Löschkonzepts ergänzt werden. Pauschale Tages- oder Jahresfristen werden in diesem Entwurf nicht behauptet.</p>

    <h2>13. Empfänger und Übermittlungen in Drittländer</h2>
    <p>Empfänger ergeben sich aus den beschriebenen Datenwegen: Hosting- und Datenbankanbieter, Umami, Google, gegebenenfalls konfigurierte Standortdienste sowie bei Kontaktaufnahme Kommunikationsanbieter und beim Linkaufruf die jeweiligen Zielanbieter. GitHub erhält im beschriebenen Preisabruf nur eine Serveranfrage.</p>
    <p>Bei internationalen Cloud-Anbietern können Verarbeitung oder Supportzugriffe außerhalb der EU bzw. des EWR stattfinden. Eine ausschließlich europäische Verarbeitung ist nicht bestätigt. Vertragsparteien, Unterauftragnehmer, Regionen und die für einzelne Übermittlungen geltenden Garantien sind noch zu dokumentieren. Ein anwendbarer Angemessenheitsbeschluss oder geeignete Garantien nach Art. 46 DSGVO dürfen nicht ohne Prüfung des konkreten Anbieters und Vertrags vorausgesetzt werden. Informationen und gegebenenfalls Kopien maßgeblicher Garantien können beim Verantwortlichen angefragt werden.</p>

    <h2>14. Deine Rechte</h2>
    <p>Unter den jeweiligen gesetzlichen Voraussetzungen hast du folgende Rechte:</p>
    <ul>
      <li>Auskunft über deine personenbezogenen Daten und deren Verarbeitung (Art. 15 DSGVO).</li>
      <li>Berichtigung unrichtiger und Vervollständigung unvollständiger Daten (Art. 16 DSGVO).</li>
      <li>Löschung und Einschränkung der Verarbeitung (Art. 17 und 18 DSGVO).</li>
      <li>Datenübertragbarkeit bei den dafür vorgesehenen Verarbeitungen (Art. 20 DSGVO).</li>
      <li>Widerspruch aus Gründen deiner besonderen Situation gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 Buchst. e oder f DSGVO (Art. 21 DSGVO).</li>
      <li>Widerruf einer erteilten Einwilligung für die Zukunft; die Rechtmäßigkeit der vorherigen Verarbeitung bleibt unberührt (Art. 7 Abs. 3 DSGVO).</li>
    </ul>
    <p>Zur Ausübung deiner Rechte erreichst du uns unter <a href="mailto:kontakt@baumarktfinder-app.de">kontakt@baumarktfinder-app.de</a>. Automatisierte Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22 DSGVO sind im beschriebenen Vergleichsdienst nicht vorgesehen.</p>

    <h2>15. Beschwerderecht</h2>
    <p>Du kannst dich nach Art. 77 DSGVO bei einer Datenschutzaufsichtsbehörde beschweren, insbesondere an deinem gewöhnlichen Aufenthaltsort, Arbeitsplatz oder am Ort des vermuteten Verstoßes. Für den Betreiber in Hessen ist der Hessische Beauftragte für Datenschutz und Informationsfreiheit ein Ansprechpartner.</p>
    <p><a href="https://datenschutz.hessen.de/service/beschwerde-uebermitteln" rel="noreferrer">Beschwerde beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit</a></p>
  </LegalPage>;
}
