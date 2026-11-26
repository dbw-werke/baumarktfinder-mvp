import Link from "next/link";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" prefetch={false}>Baumarktfinder</Link>
        <p className={styles.slogan}>Spare Zeit. Spare Geld.</p>
        <div className={styles.divider} />
        <nav className={styles.links} aria-label="Rechtliches und Kontakt">
          <Link href="/impressum" prefetch={false}>Impressum</Link>
          <span aria-hidden="true">|</span>
          <Link href="/datenschutz" prefetch={false}>Datenschutz</Link>
          <span aria-hidden="true">|</span>
          <Link href="/kontakt" prefetch={false}>Kontakt</Link>
        </nav>
        <p className={styles.copyright}>© 2026 Baumarktfinder</p>
      </div>
    </footer>
  );
}
