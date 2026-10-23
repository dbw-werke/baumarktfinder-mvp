import "./globals.css";
import Script from "next/script";
import { umamiAnalyticsConfig } from "../lib/analytics";
import { serializeStructuredData, siteMetadata, siteStructuredData, siteViewport } from "./seo";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const analytics = umamiAnalyticsConfig();
  return (
    <html lang="de">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(siteStructuredData) }} />
        {children}
        {analytics && <Script {...analytics} />}
      </body>
    </html>
  );
}
