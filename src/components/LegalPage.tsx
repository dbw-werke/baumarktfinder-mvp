import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./LegalPage.module.css";

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/" prefetch={false}>← Zurück zu Baumarktfinder</Link>
      <article className={styles.content}>
        <h1>{title}</h1>
        {children}
      </article>
    </main>
  );
}

export function ContactDetails() {
  return <p>E-Mail: <a href="mailto:kontakt@baumarktfinder-app.de">kontakt@baumarktfinder-app.de</a><br />
    Telefon: <a href="tel:+4915756996469">+49 157 56996469</a></p>;
}

export function OperatorAddress() {
  return <address>Gabriel Tunjic<br />Franz-Werfel-Straße 12<br />60431 Frankfurt am Main<br />Deutschland</address>;
}
