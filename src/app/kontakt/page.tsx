import type { Metadata } from "next";
import LegalPage, { ContactDetails } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Kontakt | Baumarktfinder",
  description: "Kontaktiere Baumarktfinder für Fragen, Verbesserungsvorschläge, Kooperationen und Partnerschaften.",
  alternates: { canonical: "/kontakt" },
};

export default function KontaktPage() {
  return <LegalPage title="Kontakt">
    <p>Du hast Fragen, Anregungen oder Verbesserungsvorschläge? Wir freuen uns über deine Nachricht.</p>
    <h2>Allgemeine Anfragen</h2>
    <ContactDetails />
    <h2>Kooperationen und Partnerschaften</h2>
    <p>Du bist Baumarkthändler, Baustoffhersteller, potenzieller Geschäftspartner oder Investor?</p>
    <p>Wir sind offen für innovative Kooperationen und strategische Partnerschaften, um gemeinsam die Zukunft der digitalen Baustoffbeschaffung zu gestalten.</p>
    <p>Kontaktiere uns gerne unter <a href="mailto:kontakt@baumarktfinder-app.de">kontakt@baumarktfinder-app.de</a>.</p>
  </LegalPage>;
}
