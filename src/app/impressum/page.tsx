import type { Metadata } from "next";
import LegalPage, { ContactDetails, OperatorAddress } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Impressum | Baumarktfinder",
  description: "Angaben zum Betreiber und Kontaktinformationen von Baumarktfinder.",
  alternates: { canonical: "/impressum" },
};

export default function ImpressumPage() {
  return <LegalPage title="Impressum">
    <p>Angaben gemäß § 5 DDG</p>
    <p>Baumarktfinder</p>
    <h2>Betreiber</h2>
    <OperatorAddress />
    <h2>Kontakt</h2>
    <ContactDetails />
    <h2>Hinweise zur Plattform</h2>
    <p>Baumarktfinder ist eine unabhängige Such- und Vergleichsplattform für Baustoffe und Baumärkte. Die Plattform ermöglicht es Nutzern, Produktpreise, Entfernungen und Fahrzeiten verschiedener Händler zu vergleichen.</p>
    <p>Die angezeigten Preise, Produktinformationen und Verfügbarkeiten können sich jederzeit ändern. Maßgeblich sind die aktuellen Angaben des jeweiligen Händlers.</p>
    <p>Baumarktfinder verkauft selbst keine Produkte. Kaufverträge kommen ausschließlich zwischen dem Kunden und dem jeweiligen Händler zustande.</p>
  </LegalPage>;
}
