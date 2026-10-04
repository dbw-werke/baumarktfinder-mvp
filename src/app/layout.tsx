import "./globals.css";

export const metadata = {
  title: "Baumarktfinder – Material und Baumärkte in Deutschland",
  description: "Vergleiche gleiche Baumaterialien, geprüfte Händlerpreise und Fahrzeiten zu Baumärkten in Deutschland.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
