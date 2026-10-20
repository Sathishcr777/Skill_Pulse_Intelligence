# SkillPulse Intelligence — Final Report (11-Phase Enhancement Round)

**Date:** 2026-10-20
**Scope:** The 11-phase enhancement pass requested on top of the already-working product (PLFS data integrity fixes, genuine backtesting, honest evidence grading). This report covers only this round of work.

---

## 1. Improvements implemented, by phase

| Phase | Status | Summary |
|---|---|---|
| 1. Audit | Done | Inspected the existing project before changing anything; found the UI was functionally complete but visually generic, with no theme system, no occupation-discovery aid, and an underused 3D view. |
| 2. Dark/light theme | Done | Full CSS-custom-property token system (`index.css`, `tailwind.config.js`), `ThemeProvider`/`useTheme()`, anti-FOUC inline script, localStorage persistence with OS-preference fallback, accessible `ThemeToggle` switch. Verified on Forecast, 3D Universe, Backtest, Data Trust, and at mobile width. |
| 3. Occupation selection | Done | New `OccupationExplorer` component: search, trade-category filter, localStorage-backed "recently selected," and a real per-occupation sufficiency indicator (✓/⚠) driven by the new `GET /occupations/availability` endpoint — not a cosmetic badge, it reads the actual `EvidenceGrade` gating state. |
| 4. 3D visualization made useful | Done | `SkillUniverse3D`/`SkillUniverse2D` now take `focusOccupationCode` and auto-select/auto-filter to whatever occupation is selected elsewhere in the app, so the 3D view is a connected tool, not an isolated showpiece. Fixed a real React-Three-Fiber raycasting gotcha (`visible={false}` meshes are skipped by R3F's pointer events; switched to `opacity={0}` transparent material) that was silently breaking node clicks. |
| 5. Signature feature | Carried over | The evidence-graded forecasting pipeline (deterministic 0–100 grade, statistical-sufficiency hard-gating, real backtest-vs-grade correlation) was already the core differentiator from the prior round; this round connected it more visibly into the UI (Evidence Grade card, Insight Explanation panel, Backtest tab) rather than rebuilding it. |
| 6. What-If improvements | Carried over, verified | The What-If Simulator's honest unit handling and "hypothetical, not a validated prediction" labeling were already in place; re-verified working in both themes this round. A dedicated two-scenario comparison view was **not** built this round — see §6. |
| 7. Evidence/trust | Done | Data Trust Centre rewritten to fetch a live `GET /data-trust` manifest (not static prose) — every data source is tagged `verified_real` / `synthetic_demo` / `observed` with a citation, and panel-quality stats (row counts, missingness, gating counts) are computed from the current parquet file at request time, not cached or hand-written. |
| 8. Demo-friendly mode | Done | `GuidedDemo` component: a 7-step scripted walkthrough that drives the app's real state (real occupation, real region, real tabs) rather than a separate staged demo — verified step navigation, back/next, and exit. |
| 9. Polish all interactions | Partial | Covered incidentally by the feature work (hover/disabled states on buttons, loading states on async panels), but no dedicated systematic pass (keyboard-nav audit, focus-ring audit, empty/error-state audit) was done as its own task. |
| 10. Test | Done this session | See §4 for what was actually run and the real results. |
| 11. Final report | This document | |

---

## 2. Files changed (this round, by area)

**Theming:** `frontend/src/styles/index.css`, `frontend/tailwind.config.js`, `frontend/index.html`, `frontend/src/lib/theme.tsx` (new), `frontend/src/components/ThemeToggle.tsx` (new), `frontend/src/main.tsx`, `frontend/src/App.test.tsx`

**Occupation Explorer:** `frontend/src/components/OccupationExplorer.tsx` (new), `backend/app/api/routes.py` (`/occupations/availability`), `backend/app/schemas/market.py` (`OccupationAvailability`), `frontend/src/types/api.ts`, `frontend/src/lib/api.ts`

**3D/2D Skill Universe linkage:** `frontend/src/components/SkillUniverse3D.tsx`, `frontend/src/components/SkillUniverse2D.tsx`

**Guided demo:** `frontend/src/components/GuidedDemo.tsx` (new)

**Dashboard integration:** `frontend/src/pages/Dashboard.tsx` (tab structure, state wiring, demo-mode driver, theme-aware color-token migration across the file)

**Backend support already landed in the prior round and reused here, not re-done:** `ml/evaluate/backtest.py`, `backend/app/services/data_trust.py`, `backend/app/services/skill_graph.py`, related Alembic migrations.

---

## 3. New functionality (user-facing)

- Full dark/light mode, toggle persists across sessions, respects OS preference on first load.
- Occupation Explorer: search, category filter, recents, and a real sufficiency indicator per occupation (so a user never has to click into a segment to discover it's gated).
- 3D Skill Universe and its 2D table fallback now follow whatever occupation is globally selected, instead of being a disconnected tab.
- Guided demo mode: one click walks a judge through occupation → forecast → 3D skills → backtest → what-if → data trust, using the app's live data at every step.

---

## 4. What was actually tested, and the real results

**Backend + ML test suite** (`pytest backend/tests ml/tests`, run from the project root): **43 passed**, 0 failed, 2 unrelated deprecation warnings (`httpx`/`asyncio` library warnings, not app bugs). Run live in this session, not assumed.

**Frontend test suite** (`npm test -- --run`): **2 passed** (`App.test.tsx`). This is thin — there is no component-level test coverage for `OccupationExplorer`, `GuidedDemo`, `SkillUniverse3D/2D`, or the theme system. Those were verified manually through the browser (below), not through automated tests.

**Frontend production build** (`npm run build`): succeeds — TypeScript type-checks cleanly and Vite produces a working bundle. One pre-existing warning: the main JS chunk is ~1.3MB (365KB gzipped), above Vite's 500KB chunk-size suggestion; not code-split. Not a functional bug, worth noting as technical debt.

**Manual browser verification performed live in this session** (Claude's built-in browser pane, both themes, desktop and 375×812 mobile viewport):
- Dashboard renders correctly in light and dark mode at desktop width.
- Mobile (375px) layout checked on Forecast, 3D Skill Universe, Backtest, and Data Trust Centre tabs, in both themes: header, stat cards, filters, charts, and tables all reflow without horizontal overflow or illegible contrast. One minor gap found: the tab bar overflows horizontally on narrow screens with no visible scroll affordance (the tabs are still reachable, just not discoverable without already knowing to scroll) — not fixed this round, flagged below.
- 3D Skill Universe: clicking a node opens its real info panel; the earlier React-Three-Fiber hitbox bug (invisible meshes being skipped by the raycaster) was confirmed fixed — node clicks register reliably at both viewport sizes.
- **Insufficient-data gating, re-verified end-to-end against live data:** queried `GET /occupations/availability` for all 8 regions and found 5 real gated segments (e.g. Systems Analyst / Gujarat, 4 observations). Selected that exact segment in the running UI:
  - Forecast tab shows "Insufficient history — no forecast produced... Per project rule, the system never fabricates a prediction here," Evidence Grade card shows `Insufficient 0/100`, and the chart renders only the 4 real observed points with no dashed forecast line or confidence band.
  - Backtest tab shows "No backtest replay available — this segment was gated as insufficient-history. Per project rule, the system does not force a backtest where it would not force a forecast."
  - This confirms the no-fabrication guarantee holds in the actual running application, not just in backend code.

**Docker-compose cold start — NOT verified, and a real gap was found.** Docker Desktop was not running in this environment and could not be started from the automated shell, so `docker compose up` could not be executed live this session. Static review of `docker-compose.yml` and `backend/Dockerfile` found a genuine configuration gap: the backend container's `CMD` starts `uvicorn` directly with no entrypoint step that runs `alembic upgrade head` or loads data — so even a successful `docker compose up` would start a Postgres database with no schema and no data, and the API would error on first query. **This is a real, unfixed gap, not a style nitpick** — a judge trying `docker compose up` as described would hit a broken stack. The locally-supported path (`uvicorn` + `npm run dev` against SQLite, as run throughout this session) is confirmed working; the Docker path is not.

---

## 5. Features still incomplete or not done this round

- **Docker-compose path is broken as configured** (§4) — no migration/seed step wired into the backend container startup.
- **Phase 9 polish** was not done as a dedicated pass — no systematic keyboard-navigation, focus-ring, or empty/error-state audit.
- **Phase 6's "compare two planning scenarios" feature** (side-by-side What-If comparison) was not built — the simulator still handles one scenario at a time.
- **Phase 5's "Opportunity Explorer as a connected 8-step workflow" framing** was not implemented as a distinct guided workflow beyond what the Guided Demo already covers.
- **Frontend automated test coverage is thin** — only 2 tests exist; the newer components (Occupation Explorer, Guided Demo, 3D/2D linkage, theme system) were verified manually in-browser this session but have no regression tests guarding them.
- Mobile tab-bar has no visible "more tabs" affordance (functionally reachable via scroll, not discoverable).
- The main JS bundle is unsplit (~1.3MB) — not a bug, but worth code-splitting before a production deployment.

---

## 6. Synthetic / demonstration data still in the app (and where it's disclosed)

Unchanged from the prior data-integrity work, and still accurately disclosed in-app via the Data Trust Centre:
- **Demand index (`demand_count`)** — explicitly labeled `Synthetic demo` everywhere it appears (Data Trust Centre, forecast chart, Insight Explanation panel).
- **Supply proxy** — real, cited PLFS Annual Report 2023-24 Table 27 state-level industry shares, labeled `Observed (real)`, but explicitly disclosed as state-level and periodically refreshed, not real-time or district-level.
- Nothing new was fabricated this round. The occupation-availability gating, 3D graph edges, and Data Trust manifest are all computed live from real underlying tables, not hand-written.

---

## 7. Strongest selling point for SIH judges

**The no-fabrication guarantee is enforced end-to-end and is independently verifiable live, not just claimed.** Most "AI forecasting" demos either always show a confident-looking chart or hide their uncertainty in fine print. This app's hard gate (≥12 real observations required) actually blocks the forecast and backtest UI when data is insufficient, says so in plain language in the product itself, and that behavior was just re-confirmed against a live, real gated segment in this session — not assumed from reading the code. Paired with the Data Trust Centre's live-computed, source-cited data manifest and the genuine walk-forward backtest (candidate MAE 5.62 vs. baseline MAE 6.39, with the evidence-grade-vs-error correlation reported honestly either way), this is a forecasting tool that is explicit about the difference between what it knows and what it's demonstrating.

---

## 8. Recommended five-minute SIH demonstration workflow

1. **Open the app, click "Guided demo."** This narrates the whole flow below using real data and real API responses — use it as the spine of the live demo, pausing to elaborate.
2. **Occupation Explorer (≈30s):** Point out the ✓/⚠ sufficiency indicators — explain these come from a live endpoint reading real evidence-grade gating, not a static badge.
3. **Forecast tab (≈1 min):** Show Electrician General / MH — real 24-month history, real forecast, Evidence Grade card breaking down Volume/Agreement/Recency.
4. **Switch to the gated example live (≈1 min) — this is the strongest moment:** Select Gujarat, search "Systems Analyst," and show the forecast tab refuse to produce a number ("insufficient history... the system never fabricates a prediction here") and the backtest tab refuse too. This is the single best way to prove the no-fabrication claim isn't just marketing copy.
5. **3D Skill Universe (≈1 min):** Switch back to Electrician General, open the Skill Universe tab, click a couple of skill nodes, mention the O*NET sourcing, and toggle to the 2D table to show the accessible fallback.
6. **Backtest tab (≈45s):** Show the real walk-forward replay chart and state the honest correlation result — the hypothesis is reported truthfully either way, which is itself a credibility point.
7. **Data Trust Centre (≈45s):** Expand one `Observed (real)` source and the one `Synthetic demo` source side by side — this is where to pre-empt "is this data real?" questions directly.
8. **Toggle dark/light mode once, mention mobile support, and stop.** Don't demo Docker — it's not currently working end-to-end (see §4); stick to the locally-running app.

---

## Honesty note

This project is **not** fully complete. The Docker path is broken, Phase 9 polish was not systematically done, the two-scenario What-If comparison from Phase 6 was not built, and frontend test coverage is thin. The claims above that are marked "verified" or "confirmed" were checked live in this session (test suite runs, a production build, and interactive browser testing across both themes, mobile width, and a real gated-data segment) — not assumed from reading source code.
