# Data Integrity Audit — SkillPulse Intelligence (SIH26246)

Date: 2026-10-20

## 1. What was found

An audit of the running application (not just its documentation) found that
`ml/features/build_panel.py` generated the entire demand-supply panel
(`data/processed/panel.parquet`, 4,504 rows) using a hardcoded Python dict
(`PLFS_STATE_TRADE_BENCHMARKS`) labelled in a comment as "Published MoSPI
PLFS Annual Report baseline supply rate benchmarks." No citation to an
actual report, table, or page existed anywhere in the codebase, and
`docs/data_sources_findings.md` independently confirms that real PLFS
microdata access was **BLOCKED** (`WinError 10061`, connection refused).
The benchmark numbers were therefore fabricated, not digitized.

This fabricated "supply" figure fed: the ML training panel, the persisted
`EmploymentSeries.supply_index` column in the database, the `/forecast` and
`/market/overview` API responses, and a Dashboard UI card that explicitly
(and falsely) claimed to use "unit-level PLFS microdata."

A second, related issue (not fixed in this pass, see §5) was also found:
`PostingsSkillSignal` rows loaded by `backend/scripts/load_processed_data.py`
use `np.random.randint`/`np.random.uniform` for "mention_count" and
"frequency_pct," also presented without a synthetic-data label.

## 2. Verified real replacement source

| Field | Value |
|---|---|
| Report title | Annual Report, Periodic Labour Force Survey (PLFS) 2023-24 |
| Publisher | Ministry of Statistics and Programme Implementation (MoSPI) / National Sample Survey Office (NSSO), Government of India |
| Reference period | July 2023 - June 2024 |
| Table used | Table 27 - "Percentage distribution of usually working persons (ps+ss) by industry of work (industry sections of NIC-2008) for each State/UT," sub-tables "rural+urban, Male" and "rural+urban, Female" |
| Location in document | Appendix-A, Detailed Tables, pp. A-166 - A-174 |
| Source URL | https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf |
| Document length | 572 pages (confirmed - an earlier download attempt mistakenly retrieved MoSPI's unrelated 116-page general Ministry Annual Report at a similarly-named URL; this was caught before use) |
| Units | Percentage of "usually working persons" (principal + subsidiary status) within each NIC-2008 industry section, per state, combined rural+urban |
| Population definition | All persons aged 15+ classified "employed" under PLFS usual status, July 2023-June 2024 |

### How the table was read

The PDF was downloaded directly (`curl`, HTTP 200, 26,917,638 bytes) and its
text extracted page-by-page with `pypdf` into a local scratch file, then
located by searching for the literal string "Table (27)" and the NIC-2008
section legend. Male and Female state rows were read directly from the
cleanly-extracted "rural+urban, Male" and "rural+urban, Female" sub-tables.
A "rural+urban, Persons" (combined-gender) sub-table does **not** exist in
this appendix - only rural-persons, urban-persons, and rural+urban-male/
rural+urban-female are published - confirmed by exhaustively locating every
`Table (27)` occurrence and every `Andhra Pradesh` row in the extracted text
(8 distinct sub-tables total, no 9th "rural+urban persons" block).

### Exact verified figures used (rural+urban, Male / Female, %)

| State | Section C (Manufacturing) | Section F (Construction) | Section G (Trade) | Section J (Info & Comm) | Section Q (Health) |
|---|---|---|---|---|---|
| MH | 10.59 / 12.66 | 1.33 / 6.98 | 5.59 / 10.07 | 2.62 / 3.27 | 2.56 / 1.83 |
| KA | 13.77 / 10.86 | 2.03 / 9.15 | 4.99 / 9.71 | 4.00 / 4.19 | 2.77 / 1.50 |
| TN | 15.44 / 15.97 | 17.74 / 17.21 | 7.06 / 11.24 | 1.81 / 3.14 | 2.43 / 1.45 |
| GJ | 16.27 / 21.64 | 2.53 / 6.98 | 3.59 / 9.98 | 0.22 / 0.48 | 2.73 / 1.62 |
| UP | 6.87 / 8.45 | 0.54 / 12.38 | 3.89 / 9.98 | 0.13 / 0.45 | 0.67 / 0.68 |
| HR | 14.78 / 18.26 | 2.37 / 10.60 | 6.60 / 12.87 | 2.84 / 2.30 | 3.56 / 2.30 |
| DL | 16.68 / 16.46 | 3.38 / 9.61 | 9.29 / 20.53 | 3.46 / 3.06 | 4.57 / 2.19 |
| TG | 17.83 / 12.83 | 5.23 / 9.35 | 6.68 / 9.81 | 2.26 / 4.16 | 1.87 / 1.48 |

These exact numbers are embedded, with the same citation, in
`ml/features/build_panel.py` (`PLFS_TABLE27_RURAL_URBAN_BY_GENDER`).

## 3. Disclosed methodology and its limitations

1. **Annual, not monthly.** PLFS publishes no monthly or district-level
   industry breakdown. The verified percentage is held **flat** across all
   24 months for a given state/occupation in the panel - the prior code's
   synthetic "+0.8%/quarter" growth applied on top of the (fabricated) base
   figure has been removed entirely, since applying any invented trend to a
   real annual government statistic would itself be a fabrication.
2. **"Persons" is a simple mean, not a population-weighted total.** Table 27
   publishes Male and Female shares separately; it does not publish a
   combined-gender "rural+urban Persons" row. The value used is
   `round((male_pct + female_pct) / 2, 2)` - an explicit, disclosed,
   unweighted approximation of both real published numbers, not an official
   published figure in its own right and not a population-weighted average
   (that would require state-level male/female workforce-count weights not
   collected in this pass).
3. **Labour-force share, not "qualified worker" headcount.** This is an
   employment/labour-force statistic. It is never used to claim knowledge of
   how many *trained or certified* workers exist in a trade - that data does
   not exist publicly (see `docs/data_sources_findings.md`, PLFS microdata
   status: BLOCKED).
4. **The occupation -> NIC-2008 section mapping is our own judgment call**,
   documented in `OCCUPATION_TO_NIC_SECTION` in `ml/features/build_panel.py`
   (e.g. Mason -> Construction, Fitter -> Manufacturing, Customer Care
   Executive/BPO -> Information & Communication as a simplification - BPO
   "call centre activities" are technically NIC Section N, not J; this
   simplification is intentional and disclosed, not hidden). No official
   NCO-2015-to-NIC-2008 crosswalk at this granularity was found to exist
   publicly.
5. **Coverage is exhaustive for the current occupation/state set.** Every
   one of the 24 occupations in `data/reference/nco_subset.csv` and all 8
   priority states resolve to a verified Table 27 figure - confirmed by
   `ml/tests/test_real_plfs_data.py::test_all_nco_occupations_have_a_nic_section_mapping`
   and by the panel rebuild producing the same 4,504 rows (zero segments
   dropped for lack of a verified figure).

## 4. What changed in the codebase

- `ml/features/build_panel.py`: replaced `PLFS_STATE_TRADE_BENCHMARKS`
  (fabricated) with `PLFS_TABLE27_RURAL_URBAN_BY_GENDER` (verified, cited)
  plus `OCCUPATION_TO_NIC_SECTION` (documented crosswalk) and
  `get_real_supply_share()`. Removed the synthetic monthly growth applied to
  the supply figure. Any state/occupation without a verified figure is now
  **excluded from the panel** rather than filled with an invented number
  (none were excluded with the current 8-state/24-occupation scope).
- `backend/app/models/entities.py`: added `supply_data_source`,
  `supply_source_citation`, `demand_data_source` to `EmploymentSeries`
  (Alembic migration `6bc2f24f0b19`).
- `backend/app/schemas/market.py`, `backend/app/api/routes.py`: surface the
  three new provenance fields on every historical data point returned by
  `GET /forecast/{occupation}/{region}`.
- `backend/scripts/load_processed_data.py`: persists the new provenance
  columns from the panel.
- `frontend/src/types/api.ts`, `frontend/src/components/TimeSeriesChart.tsx`:
  added the provenance fields to the TypeScript contract and to the chart's
  hover tooltip, which now explicitly labels each point's supply source as
  "Verified (PLFS Table 27)" and demand source as "Synthetic demo (not
  verified)."
- `frontend/src/pages/Dashboard.tsx`: removed the false "unit-level PLFS
  microdata" claim (both the original card and a duplicate in the page
  header added later); also fixed a stale hardcoded "-26.7% vs Seasonal
  Baseline" / "11.8 MAE" fallback to compute from live API data instead.
- `ml/tests/test_real_plfs_data.py` (new): verifies state coverage, full
  occupation-to-NIC-section mapping, two independently-checked known
  figures (Maharashtra/Fitter General, Delhi/Software Developer), that an
  unverified combination returns `unavailable` rather than a fabricated
  value, that supply values are flat across months per segment, and that
  every panel row carries correct provenance tags.
- `backend/tests/test_api_endpoints.py`: added provenance assertions to
  `test_get_forecast_sufficient_segment`; updated two assertions
  (`test_get_market_overview`, `test_get_model_status`) that had hardcoded
  the *old, fabricated* evidence-grade distribution and MAE/RMSE/MAPE
  numbers, to the newly-recomputed real values (see §6).

## 5a. Follow-up fix: demand-signal de-biasing (same session, after §4)

The circularity flagged below as a known issue was then also fixed in this
session. `ml/features/build_panel.py`'s segment classification
(`is_insufficient` / `is_moderate_history` / `is_contracting` / high-growth)
previously branched on occupation **name substrings** (e.g.
`"Mason" in occ_title`, `"Software" in occ_title`), which pre-determined, by
construction, which real trades would come out graded "strong" vs "weak" -
making any "low evidence correlates with higher backtest error" validation
circular. This has been replaced with a single neutral random draw per
(state, occupation), seeded via a stable hash (`stable_seed()`) so results
are reproducible across runs but uncorrelated with occupation identity.

**A second, independent bug was found and fixed in the same change:** the
original noise generator used Python's built-in `hash()` on an f-string,
which is **randomized per-process** (`PYTHONHASHSEED`) for strings since
Python 3.3 - meaning the "deterministic" panel was silently NOT reproducible
across separate runs of the pipeline, despite looking deterministic within
one process. Replaced with `hashlib.md5`-based `stable_seed()`. Verified: two
independent `python -m ml.features.build_panel` invocations now produce
byte-identical `demand_count` values (checked programmatically, not just
row counts).

Re-ran full pipeline + reload + test suite after this fix: panel unchanged
in row count (4,504), segment-length distribution comparable to before
(5 insufficient / 9 moderate / 178 full-length, vs. 4/N/A/188 previously),
retrained metrics MAE 5.618 (candidate) vs 6.387 (baseline), 34/34 tests
pass. Two test assertions that had hardcoded exact grade-distribution/metric
values were rewritten to check internal consistency against
`ml/artifacts/metadata.json` instead of magic numbers, since the neutral
random draw is expected to shift slightly on each panel rebuild by design -
and one test (`test_get_forecast_insufficient_segment_hard_gated`) was
rewritten to discover a real insufficient segment from the panel dynamically
rather than assuming a specific named trade.

**Still not independently validated:** whether low-evidence-grade segments
actually show higher realized backtest error is a claim that requires the
backtest/replay feature (§5b) to exist and be run - it has not been built or
tested yet. De-biasing the generator removes the mechanism that would make
such a validation automatically circular; it does not by itself prove the
claim true.

## 5b. What was explicitly NOT fixed in this pass (known remaining issues)

- **`PostingsSkillSignal.mention_count` / `.frequency_pct`** (loaded in
  `load_processed_data.py` step 5) are still generated with
  `np.random.randint` / `np.random.uniform` and are not labelled as
  synthetic anywhere in the API or UI.
- **MAPE is now very large (>190%)** for both baseline and candidate models,
  because real PLFS-anchored supply values are much smaller in scale (single
  digits to twenties) than the old fabricated ones (100+), which makes
  percentage error a poor/unstable metric here. MAE/RMSE are the more
  honest metrics to present; this should be called out explicitly in any
  pitch material rather than quoting MAPE alone.

## 6. Verification performed

- `python -m ml.features.build_panel` - panel rebuilt successfully, same
  4,504 rows, zero segments dropped for missing verified data. Re-run twice
  in separate processes and confirmed byte-identical `demand_count` output
  (reproducibility fix, §5a).
- Spot-check: Maharashtra/Fitter General `plfs_supply_proxy` = 11.62 across
  all 24 months (flat, as required) = `round((10.59+12.66)/2, 2)`.
- `python -m ml.train.pipeline` - retrained cleanly on the corrected,
  de-biased panel. Current real metrics (will shift slightly on future
  rebuilds by design - see §5a): baseline MAE 6.387 / candidate
  (Holt-Winters) MAE 5.618; 187 of 192 segments evaluated, 5 excluded as
  insufficient-history; evidence grades A=49 / B=138 / Insufficient=5.
- `python -m backend.scripts.load_processed_data` - reloaded cleanly,
  idempotent.
- `python -m pytest -q` (full backend + ml suite): **34 passed, 0 failed**
  (27 pre-existing + 7 new PLFS-verification tests; 3 pre-existing tests
  updated - 2 to check against live metadata.json instead of hardcoded
  numbers, 1 to dynamically discover an insufficient segment instead of
  assuming a specific named trade - not weakened, made more robust).
- `npx tsc --noEmit` on the frontend: no new type errors introduced by this
  change. Several pre-existing errors remain (unused imports in
  concurrently-developed components, a testing-library import mismatch, and
  a pre-existing `number | null` type issue at `TimeSeriesChart.tsx:61`
  predating this fix) - these are unrelated to the data-integrity change and
  were not introduced by it.

**Do not claim this data pipeline is "complete."** The supply-proxy
fabrication is fixed and verified; the demand-signal classification
circularity is fixed and verified. The `PostingsSkillSignal` fabrication in
§5b remains open. No backtest/replay feature exists yet to actually validate
the "low evidence -> higher error" claim - that is the next task.
