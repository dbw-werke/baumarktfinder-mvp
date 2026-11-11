export default function BenefitsSection() {
  return <section className="benefitsSection" aria-label="Deine Vorteile mit Baumarktfinder">
    <ul className="guideBenefits">
      <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><strong>Spare Zeit</strong></li>
      <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 6c-1.3-1.3-2.7-2-5-2-4 0-7 3.6-7 8s3 8 7 8c2.3 0 3.7-.7 5-2M4 10h12M4 14h10" /></svg></span><strong>Spare Geld</strong></li>
      <li><span className="benefitIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg></span><strong>Material übersichtlich vergleichen</strong></li>
    </ul>
  </section>;
}
