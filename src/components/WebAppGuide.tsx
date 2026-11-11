import Image from "next/image";

export default function WebAppGuide() {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <div className="webAppGuideContent">
      <div className="webAppGuideText">
        <h2 id="webapp-guide-title">Wie Baumarktfinder funktioniert</h2>
        <ul className="guideBenefits" aria-label="Deine Vorteile">
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><strong>Spare Zeit</strong></li>
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 6c-1.3-1.3-2.7-2-5-2-4 0-7 3.6-7 8s3 8 7 8c2.3 0 3.7-.7 5-2M4 10h12M4 14h10" /></svg></span><strong>Spare Geld</strong></li>
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg></span><strong>Material übersichtlich vergleichen</strong></li>
        </ul>
        <ol className="guideSteps">
          <li><span className="guideStepNumber" aria-hidden="true">1</span><div><h3>Deinen Standort wählen</h3><p>Gib deine Adresse ein oder verwende deinen aktuellen Standort.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H120 L200 -76 H242" /><circle cx="242" cy="-76" r="2" /></svg></li>
          <li><span className="guideStepNumber" aria-hidden="true">2</span><div><h3>Material und Preise vergleichen</h3><p>Suche dein Material und vergleiche die Angebote verschiedener Baumärkte.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H90 L180 -126 H242" /><circle cx="242" cy="-126" r="2" /></svg></li>
          <li><span className="guideStepNumber" aria-hidden="true">3</span><div><h3>Angebot öffnen oder Route starten</h3><p>Mit „Zum Angebot“ gelangst du direkt zum Händler. Über „Route“ öffnest du die Wegbeschreibung zum ausgewählten Markt.</p></div><svg className="guideConnector" viewBox="0 0 244 1" aria-hidden="true"><path d="M0 0 H100 L200 77 H242" /><circle cx="242" cy="77" r="2" /></svg></li>
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
