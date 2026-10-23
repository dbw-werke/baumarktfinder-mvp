import "./globals.css";
import Script from "next/script";
import { cloudflareAnalyticsConfig } from "../lib/analytics";
import { serializeStructuredData, siteMetadata, siteStructuredData, siteViewport } from "./seo";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const analytics = cloudflareAnalyticsConfig();
  return (
    <html lang="de">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(siteStructuredData) }} />
        {children}
        {analytics && <Script id="cloudflare-web-analytics" src={analytics.src} strategy="afterInteractive" defer
          data-cf-beacon={analytics.beacon} />}
      </body>
    </html>
  );
}
