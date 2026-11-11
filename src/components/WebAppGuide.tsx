import Image from "next/image";

export default function WebAppGuide() {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <div className="webAppGuideContent">
      <div className="webAppGuideText">
        <h2 id="webapp-guide-title">Wie Baumarktfinder funktioniert</h2>
        <ol className="guideSteps">
          <li><span className="guideStepNumber" aria-hidden="true">1</span><div><h3>Deinen Standort wählen</h3><p>Gib deine Adresse ein oder verwende deinen aktuellen Standort.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H120 L200 44 H242" /><circle cx="242" cy="44" r="2" /></svg></li>
          <li><span className="guideStepNumber" aria-hidden="true">2</span><div><h3>Material und Preise vergleichen</h3><p>Suche dein Material und vergleiche die Angebote verschiedener Baumärkte.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H90 L180 -6 H242" /><circle cx="242" cy="-6" r="2" /></svg></li>
          <li><span className="guideStepNumber" aria-hidden="true">3</span><div><h3>Angebot öffnen oder Route starten</h3><p>Mit „Zum Angebot“ gelangst du direkt zum Händler. Über „Route“ öffnest du die Wegbeschreibung zum ausgewählten Markt.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H100 L200 197 H242" /><circle cx="242" cy="197" r="2" /></svg></li>
        </ol>
      </div>
      <figure className="webAppGuidePreview">
        <div className="phoneFrame">
          <div className="phoneSpeaker" aria-hidden="true" />
          <Image src="/baumarktfinder-mobile-results-hd.png" alt="Beispielsuche in Frankfurt: Adresse und Acryl weiß 310 ml ausgewählt, darunter Baumarktangebote von HORNBACH für 4,89 € und BAUHAUS für 3,95 € mit Routenbuttons" width={1125} height={2070} unoptimized />
          <div className="phoneHomeIndicator" aria-hidden="true" />
        </div>
      </figure>
    </div>
        <div className="webAppInstall" id="webapp-help">
          <details>
            <summary>Baumarktfinder zum Startbildschirm hinzufügen</summary>
            <p><strong>iPhone:</strong> Öffne Baumarktfinder in Safari. Wähle unter „Teilen“ die Option „Zu Home-Bildschirm hinzufügen“ und bestätige mit „Hinzufügen“.</p>
            <p><strong>Android:</strong> Öffne Baumarktfinder in Chrome. Wähle im Menü „Installieren und Verknüpfung erstellen“, dann „Verknüpfung erstellen“. Je nach Version heißt die Option „Zum Startbildschirm hinzufügen“. Bestätige mit „Hinzufügen“.</p>
            <p>Es ist keine App aus dem App Store oder Google Play erforderlich.</p>
          </details>
        </div>
  </section>;
}
