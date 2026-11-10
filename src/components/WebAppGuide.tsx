import Image from "next/image";

export default function WebAppGuide() {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <div className="webAppGuideContent">
      <div className="webAppGuideText">
        <h2 id="webapp-guide-title">Wie Baumarktfinder funktioniert</h2>
        <p>Mit der Baumarktfinder App gibst du einfach deine Adresse und das gewünschte Material ein, vergleichst die Preise von Baumärkten in deiner Nähe und siehst sofort den nächstgelegenen passenden Markt – inklusive Preis, Entfernung und Route. Die Route basiert auf dem tatsächlichen Standort des Marktes und hilft dir, schnell die nächstgelegene und sinnvollste Option zu finden.</p>
        <ul className="guideBenefits" aria-label="Deine Vorteile">
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><strong>Spare Zeit</strong></li>
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 6c-1.3-1.3-2.7-2-5-2-4 0-7 3.6-7 8s3 8 7 8c2.3 0 3.7-.7 5-2M4 10h12M4 14h10" /></svg></span><strong>Spare Geld</strong></li>
          <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg></span><strong>Material übersichtlich vergleichen</strong></li>
        </ul>
        <a className="guideLearnMore" href="#webapp-help">Mehr erfahren <span aria-hidden="true">→</span></a>
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
