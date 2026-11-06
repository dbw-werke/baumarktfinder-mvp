import Image from "next/image";

type SmartphoneImage = { src: string; width: number; height: number };

// Supply the user's smartphone image here once provided; never render a substitute.
export default function WebAppGuide({ smartphoneImage }: { smartphoneImage?: SmartphoneImage }) {
  return <section className="webAppGuide" id="about" aria-labelledby="webapp-guide-title">
    <h2 id="webapp-guide-title">So funktioniert Baumarktfinder</h2>
    <p className="webAppGuideIntro">Adresse eingeben, Material suchen und Baumarktpreise in deiner Nähe vergleichen – inklusive Entfernung, Fahrzeit und Route.</p>
    <div className={`webAppGuideContent${smartphoneImage ? " hasPreview" : ""}`}>
      {smartphoneImage && <div className="webAppGuideImage"><Image {...smartphoneImage} alt="Baumarktfinder-Webapp auf einem Smartphone" sizes="(max-width: 650px) 200px, 240px" /></div>}
      <div className="webAppGuideText">
        <h3>Baumarktfinder als Webapp nutzen</h3>
        <p>Nutze Baumarktfinder direkt auf deinem Smartphone. Vergleiche Baumarktpreise, entdecke Filialen in deiner Nähe und öffne die passende Route – ganz einfach über deinen Browser.</p>
        <h4>So funktioniert die Installation:</h4>
        <ol>
          <li>Baumarktfinder auf dem Smartphone im Browser öffnen.</li>
          <li>Über das Browsermenü „Zum Home-Bildschirm hinzufügen“ bzw. die entsprechende Installationsoption auswählen.</li>
          <li>Baumarktfinder anschließend direkt über das Symbol auf dem Startbildschirm öffnen.</li>
        </ol>
        <p className="webAppPlatformNote">iPhone: In Safari über „Teilen“ die Option „Zu Home-Bildschirm hinzufügen“ wählen. Android: Im Chrome-Menü „Installieren und Verknüpfung erstellen“ und dann „Verknüpfung erstellen“ wählen; je nach Version heißt die Option „Zum Startbildschirm hinzufügen“. Mit „Hinzufügen“ bestätigen. Es ist keine App aus dem App Store oder Google Play erforderlich.</p>
      </div>
    </div>
  </section>;
}
