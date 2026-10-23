import type { Metadata, Viewport } from "next";
import { googleSiteVerification } from "../lib/analytics";

export const SITE_URL = "https://baumarktfinder-app.de/";
export const SITE_NAME = "Baumarktfinder";
export const SITE_TITLE = "Baumarktfinder – Baumarktpreise vergleichen & Baumärkte in der Nähe";
export const SITE_DESCRIPTION = "Vergleiche Baumarktpreise bei OBI, BAUHAUS, HORNBACH, toom, hagebau, HELLWEG und Globus Baumarkt. Material suchen, Preise vergleichen und den nächsten Baumarkt finden.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  verification: { google: googleSiteVerification() },
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    locale: "de_DE",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/Material.hero.png", alt: "Baumaterialien für den Preisvergleich mit Baumarktfinder" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/Material.hero.png"],
  },
};

export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Describe the actual web service without inventing a legal company or retailer offers.
export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "de-DE",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}#webapplication`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      applicationCategory: "ShoppingApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript",
      inLanguage: "de-DE",
      image: `${SITE_URL}icon.svg`,
      isPartOf: { "@id": `${SITE_URL}#website` },
    },
  ],
};

export function serializeStructuredData(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
