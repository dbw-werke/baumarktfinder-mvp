import Image from "next/image";

export default function WebAppGuide() {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <div className="webAppGuideHeading">
      <span className="eyebrow">IN DREI SCHRITTEN ZUM PASSENDEN BAUMARKT</span>
      <h2 id="webapp-guide-title">So funktioniert Baumarktfinder</h2>
      <p>Material finden. Preise vergleichen. Losfahren.</p>
    </div>
    <div className="webAppGuideContent">
      <figure className="webAppGuidePreview">
        <div className="phoneFrame">
          <div className="phoneSpeaker" aria-hidden="true" />
          <Image src="/baumarktfinder-mobile.png" alt="Die Baumarktfinder-Webapp auf dem Smartphone mit Adresssuche und Materialauswahl" width={375} height={672} sizes="(max-width: 650px) 190px, 230px" />
          <div className="phoneHomeIndicator" aria-hidden="true" />
        </div>
        <figcaption>Dein Baumarktvergleich. Auch unterwegs.</figcaption>
      </figure>
      <div className="webAppGuideText">
        <ol className="guideSteps" role="list">
          <li><span className="guideStepNumber" aria-hidden="true">1</span><div><h3>Deinen Standort wählen</h3><p>Gib deine Adresse ein oder verwende deinen aktuellen Standort. Wir finden die Baumärkte in deiner Nähe.</p></div></li>
          <li><span className="guideStepNumber" aria-hidden="true">2</span><div><h3>Material und Preise vergleichen</h3><p>Suche dein Material und wähle die passende Ausführung. Vergleiche Preise, Packungsgrößen und Entfernung auf einen Blick.</p></div></li>
          <li><span className="guideStepNumber" aria-hidden="true">3</span><div><h3>Angebot öffnen oder Route starten</h3><p>Mit „Zum Angebot“ gelangst du direkt zum Händler. Über „Route“ öffnest du die Wegbeschreibung zum ausgewählten Markt.</p></div></li>
        </ol>
        <div className="webAppInstall">
          <h3>Wie eine App. Direkt im Browser.</h3>
          <p>Lege Baumarktfinder auf deinen Startbildschirm – so ist dein Preisvergleich immer nur einen Fingertipp entfernt.</p>
          <details>
            <summary>So legst du Baumarktfinder auf den Startbildschirm</summary>
            <p><strong>iPhone:</strong> Öffne Baumarktfinder in Safari. Wähle unter „Teilen“ die Option „Zu Home-Bildschirm hinzufügen“ und bestätige mit „Hinzufügen“.</p>
            <p><strong>Android:</strong> Öffne Baumarktfinder in Chrome. Wähle im Menü „Installieren und Verknüpfung erstellen“, dann „Verknüpfung erstellen“. Je nach Version heißt die Option „Zum Startbildschirm hinzufügen“. Bestätige mit „Hinzufügen“.</p>
            <p>Es ist keine App aus dem App Store oder Google Play erforderlich.</p>
          </details>
        </div>
      </div>
    </div>
  </section>;
}
