import "./globals.css";

export const metadata = {
  title: "Baumarkt Finder",
  description: "Baumärkte und Materialien in deiner Nähe finden",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}