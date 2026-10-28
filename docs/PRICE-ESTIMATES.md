# Numeric prices and clearly labelled estimates

Verified retailer prices keep priority. `selectChainOffer` still selects only validated offers, including explicitly supported alternative sizes. Its product identity, source URL, actual package quantity, price and original observation date are preserved. A missing verified offer may receive a runtime comparison estimate through `estimateComparisonPrice`; estimates never become verified offers.

## Calculation and provenance

The estimator uses validated observations from the existing catalog snapshot and available application offers across the supported chains. Exact-material observations take priority; otherwise only compatible material observations are considered. It selects at most one suitable observation per chain so several sizes or duplicate observations from one retailer cannot overweight the result.

The deterministic method `median-unit-price-v1` divides each observed package price by its actual quantity using full precision, applies any justified dimensional normalization, and takes the median. For an even number of sources, the median is the mean of the two middle values. It multiplies that value by the requested material's actual package quantity and only then rounds the final package price to cents. The displayed unit price is calculated from that final package price and rounded to cents. It never extrapolates from a retailer's already rounded display unit price.

Each source has a `normalization_factor`. It is normally 1. For compatible rectangular abrasive-paper sheets with different dimensions, the factor is requested sheet area divided by source sheet area. This adjusts a per-sheet price before taking the median; the actual sheet count remains the package quantity. A circular disc is not a substitute for a rectangular sheet. Other material families receive no invented area or quality adjustment.

There is no random adjustment, arbitrary chain multiplier, hidden minimum price, or fallback unrelated to the material. With the same observations and requested material, different chains missing a verified price receive the same comparison value. If no compatible validated basis exists, the estimator returns no estimate and the audit reports a gap.

Each estimate records its requested material ID, target chain, package quantity, base unit, method and exact/comparable basis. Its `sources` retain the actual observed product names, source retailer IDs, package prices, quantities, original URLs and original check times, plus the full-precision unit price derived from that package and its normalization factor. Source observations can be older; their original dates are shown rather than reset to the calculation date.

## What the customer sees

The existing card shows `ca. … €`, the badge **Schätzpreis**, the requested package specification and **Unverbindlicher Vergleichswert · kein Händlerangebot**. Its details disclose the basis, source products, retailer links and dates. Differences in comparable products are explained. No retailer availability, confirmed price or stock is inferred from another retailer's observation.

The action for an estimated card opens the target retailer's official product search. Provenance URLs appear separately in the estimate details. A source product at another retailer is never presented as the target retailer's offer. Verified cards retain their offer links and existing behavior.

## Data boundaries

Estimates are derived at runtime in a separate `EstimatedComparisonPrice` object. They are not written into the verified price database, cached observation JSON, product catalog, importer output or retailer-refresh pipeline. Material IDs, names, specifications and source prices are not changed by the estimator. No additional API, secret or network lookup is required to calculate an estimate.

## Full-catalog verification

Run:

```sh
node --import tsx scripts/audit-numerical-price-coverage.mjs --report docs/evidence/numerical-price-coverage.json
npx tsx --test tests/numerical-price-coverage.test.ts
```

The numerical audit covers every active canonical material and every configured chain. It reports verified, estimated and missing numeric prices separately, with one row per material/chain pair and complete estimate provenance. A 100% numerical coverage figure means every checked pair has a positive finite package price, unit price and package quantity; it does **not** mean every retailer has a verified price. Percentages are truncated, so a partial result cannot round up to 100%.

The regression test renders the real `ProductComparison` and `StoreCard` components for the complete active matrix. It checks visible numeric totals, estimate labels, source links, target-retailer actions, preserved verified offers, and the absence of missing-price placeholders in the current catalog. A separate unsupported-material case checks that the audit reports missing coverage instead of manufacturing a value.

The existing `scripts/audit-price-coverage.mjs --all-materials` remains the separate verified-observation audit. Neither audit proves live retailer availability, database connectivity, stock at physical branches or deployment success; those require their own checks. The new CLI can write JSON reports only beneath `work/` or `docs/evidence/` and never modifies application data.

### Checked catalog on 2026-10-28

The [saved full matrix](evidence/numerical-price-coverage-20261028.json) contains 79 active products × 7 chains = 553 unique pairs: 314 selected verified prices, 239 estimates, and 0 missing numeric prices. That is **100% numeric coverage** and **56.78% verified-price coverage**, calculated separately. All 553 cards were rendered through the actual components; all five numerical-coverage regression tests passed. These are results for the recorded bundled data, not a claim of live retailer or database coverage.
