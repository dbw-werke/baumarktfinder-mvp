import "./globals.css";
import { serializeStructuredData, siteMetadata, siteStructuredData, siteViewport } from "./seo";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(siteStructuredData) }} />
        {children}
      </body>
    </html>
  );
}
