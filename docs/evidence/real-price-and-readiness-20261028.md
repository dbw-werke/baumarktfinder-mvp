# Verified price review and deployment checks

The retailer retrieval below completed on **27 October 2026 at 20:33:53 UTC**. It was reviewed and integrated on 28 October. Existing observation dates were preserved; this is not a claim that all catalog prices were re-fetched on 28 October.

## Verified coverage

The application selector was audited for all **79 active products × 7 retailers = 553 combinations** before the new observation. It found 313 combinations with a verified offer (162 exact, 151 valid alternatives), 240 without one, and 165 validated observations. 66 products have an exact verified offer of their own; all 79 have an exact or comparable verified offer somewhere.

One new observation was strictly validated and added to `src/data/verified-catalog-snapshot.json`:

- toom: Bosch Trockenbauschraube Feingewinde PH2 Ø 3.5 × 35 mm, 1000 pieces, **€34.99**.
- Existing material: `tn-3-5-35-1000-v1`; no material, alias, ID, specification, or product name was created or changed.
- Product: <https://toom.de/p/trockenbauschraube-feingewinde-ph2-3535-mm-1000-stueck/10454831>.
- Actual observation: **2026-10-27T20:33:00.620Z**. No existing or screenshot-pinned observation was overwritten; branch availability remains unknown.

After this addition: **166 observations; 314 verified combinations (163 exact, 151 alternatives); 239 still without a verified retailer offer**. Estimated prices, implemented separately, are not included in these verified counts. Baseline and after reports are `work/coverage-before-20261027.json` and `work/coverage-real-after-20261028.json`.

## Bounded retrieval

All 240 previously missing pairs were mapped to their existing short search terms. Shared queries were reused. The exact mapping and retrieval results are in `real-price-review-20261027.json` alongside this file. This does not mean every missing product URL was individually fetched.

| Retailer | Missing pairs before | Current queries | Candidate products | Result |
| --- | ---: | ---: | ---: | --- |
| OBI | 18 | 22 | 0 | Queries completed; no machine-verified match |
| BAUHAUS | 12 | 0 | 0 | Previous `robots-unavailable` restriction respected; not retried |
| HORNBACH | 12 | 19 | 35 | Queries completed; no new strict match |
| toom | 16 | 16 | 28 | 120-second budget; one new strict match |
| hagebau | 74 | 19 | 2 | 120-second budget; no new strict match |
| Globus | 29 | 0 | 0 | Previous `blocked` restriction respected; not retried |
| HELLWEG | 79 | 0 | 0 | Previous `robots-unavailable` restriction respected; not retried |

Additional primary-source checks identified OBI Soudal B2 Genius Gun 750 ml, SKU 9089269, listed at €14.29 in the search index. The retailer's linked technical sheet specifies **champagner**, not beige. The direct reader returned `not-found`, so this was **not imported as a newly verified live price**. HORNBACH ACP Trennwandband 30 × 3 mm / 30 m, SKU 12523887, had matching specifications but no verifiable price; it was not imported. No protection or access restrictions were bypassed.

## External services and CI, checked 28 October

- Production `https://baumarktfinder-app.de/` returned **HTTP 200**, served by Vercel. This is an availability check, not verification of the current uncommitted changes.
- Latest production deployment `7378279095` succeeded at **2026-10-28T05:53:45Z**, commit `35b6da16e046fad25062d572e76e34840a1213cc`.
- Latest hourly toom run [40640382560](https://github.com/dbw-werke/baumarktfinder-mvp/actions/runs/40640382560) succeeded. Durable cache restoration, preservation after partial failures, and publishing to the website are configured. Database storage is optional for this job.
- Latest application CI [40122228204](https://github.com/dbw-werke/baumarktfinder-mvp/actions/runs/40122228204) succeeded for commit `9f02aed2227fac8e72b044f503abd1e4f9ec4cdc`. The workflow runs lint, tests, production build, and the production-dependency audit. New changes still require a fresh run.
- Daily multi-retailer run [40667743093](https://github.com/dbw-werke/baumarktfinder-mvp/actions/runs/40667743093) failed at **Check configured credentials**, after dependency installation and price tests passed; actual refresh was skipped. The authenticated repository secret inventory returned **0 secrets**. The configured workflow requires **NEXT_PUBLIC_SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY**.
- Local `npm run check:config -- --database` exited **1** on 27 October: materials, canonical aliases and verified-price queries failed. Configuration variables are present locally, but DNS lookup of the configured Supabase host returned **ENOTFOUND**. A valid, reachable Supabase project URL and matching service-role key must be supplied before restoring the daily database updater. Existing local fallback data remains available. No credential values were printed or committed.

This review did not edit workflows, hosting settings, DNS, database contents, or unrelated application functionality.
