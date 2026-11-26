import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <a className={styles.brand} href="/">Baumarktfinder</a>
        <p className={styles.slogan}>Spare Zeit. Spare Geld.</p>
        <div className={styles.divider} />
        <nav className={styles.links} aria-label="Rechtliches und Kontakt">
          <a href="/impressum">Impressum</a>
          <span aria-hidden="true">|</span>
          <a href="/datenschutz">Datenschutz</a>
          <span aria-hidden="true">|</span>
          <a href="/kontakt">Kontakt</a>
        </nav>
        <p className={styles.copyright}>© 2026 Baumarktfinder</p>
      </div>
    </footer>
  );
}
