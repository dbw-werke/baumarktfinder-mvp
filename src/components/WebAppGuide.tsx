import Image from "next/image";

export default function WebAppGuide() {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <div className="webAppGuideHeading">
      <h2 id="webapp-guide-title">So funktioniert Baumarktfinder</h2>
    </div>
    <div className="webAppGuideContent">
      <figure className="webAppGuidePreview">
        <div className="phoneFrame">
          <div className="phoneSpeaker" aria-hidden="true" />
          <Image src="/baumarktfinder-mobile-results.png" alt="Beispielsuche in Frankfurt: Adresse und Acryl weiß 310 ml ausgewählt, darunter Baumarktangebote mit Preisen und Routenbuttons" width={375} height={672} sizes="(max-width: 650px) 190px, 230px" />
          <div className="phoneHomeIndicator" aria-hidden="true" />
        </div>
        <figcaption>Beispielansicht · Frankfurt am Main</figcaption>
      </figure>
      <div className="webAppGuideText">
        <ol className="guideSteps" role="list">
          <li><svg className="guideConnector" viewBox="0 0 128 1" aria-hidden="true"><path d="M3 0 H128" /><circle cx="3" cy="0" r="2" /></svg><span className="guideStepNumber" aria-hidden="true">1</span><div><h3>Adresse eingeben</h3><p>Gib deine Adresse ein oder verwende deinen aktuellen Standort.</p></div></li>
          <li><svg className="guideConnector" viewBox="0 0 128 1" aria-hidden="true"><path d="M3 -57 H40 L96 0 H128" /><circle cx="3" cy="-57" r="2" /></svg><span className="guideStepNumber" aria-hidden="true">2</span><div><h3>Material suchen</h3><p>Suche dein Material und vergleiche die Angebote verschiedener Baumärkte.</p></div></li>
          <li><svg className="guideConnector" viewBox="0 0 128 1" aria-hidden="true"><path d="M3 76 H40 L96 0 H128" /><circle cx="3" cy="76" r="2" /></svg><span className="guideStepNumber" aria-hidden="true">3</span><div><h3>Nächsten Baumarkt finden</h3><p>Finde den nächstgelegenen Baumarkt, vergleiche Preise und starte direkt die Route. Die Fahrzeit berücksichtigt die tatsächliche Straßenroute. Wenn verfügbar, fließen auch aktuelle Verkehrsdaten und Staus ein.</p></div></li>
        </ol>
        <div className="webAppInstall">
          <details>
            <summary>Baumarktfinder zum Startbildschirm hinzufügen</summary>
            <p><strong>iPhone:</strong> Öffne Baumarktfinder in Safari. Wähle unter „Teilen“ die Option „Zu Home-Bildschirm hinzufügen“ und bestätige mit „Hinzufügen“.</p>
            <p><strong>Android:</strong> Öffne Baumarktfinder in Chrome. Wähle im Menü „Installieren und Verknüpfung erstellen“, dann „Verknüpfung erstellen“. Je nach Version heißt die Option „Zum Startbildschirm hinzufügen“. Bestätige mit „Hinzufügen“.</p>
            <p>Es ist keine App aus dem App Store oder Google Play erforderlich.</p>
          </details>
        </div>
      </div>
    </div>
  </section>;
}
