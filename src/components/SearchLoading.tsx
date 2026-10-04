import StoreRow from "./StoreRow";

export default function SearchLoading() {
  return <section className="resultsSection loadingResults" id="results" aria-label="Suchergebnisse werden geladen" aria-busy="true">
    <h2>Baumärkte und Preise werden geladen …</h2>
    <StoreRow label="Angebote werden geladen">{Array.from({ length: 5 }, (_, index) =>
      <div className="offerCard skeletonCard" key={index} aria-hidden="true">
        <span className="skeletonBlock skeletonLogo" /><span className="skeletonBlock" /><span className="skeletonBlock skeletonShort" />
        <span className="skeletonBlock skeletonProduct" /><span className="skeletonBlock skeletonPrice" />
        <div className="cardActions"><span className="skeletonBlock skeletonButton" /><span className="skeletonBlock skeletonButton" /></div>
      </div>)}
    </StoreRow>
  </section>;
}
