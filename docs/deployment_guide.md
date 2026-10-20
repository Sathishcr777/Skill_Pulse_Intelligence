# SkillPulse Intelligence — Deployment Guide

This document covers the full audit → architecture → code-prep → testing → live-deployment
flow for putting SkillPulse Intelligence on the public internet. It reflects what was
actually inspected and actually run in this session — not assumptions.

---

## Step 1 — Audit findings

- **Frontend:** Vite + React 19 + TypeScript. Build: `tsc && vite build` (already verified
  working — see Step 5). Talks to the backend only through `frontend/src/lib/api.ts`,
  which already reads its base URL from `import.meta.env.VITE_API_URL`, falling back to
  `http://localhost:8000` only for local dev. No other hardcoded backend URL exists
  anywhere in `frontend/src`.
- **Backend:** FastAPI + SQLAlchemy 2.0 + Alembic, served by `uvicorn`. 9 read-only `GET`
  endpoints (`/regions`, `/occupations`, `/occupations/availability`,
  `/forecast/{occ}/{region}`, `/market/overview`, `/models/status`,
  `/backtest/{occ}/{region}`, `/data-trust`, `/skill-graph`), plus `/health` and `/`.
  Stateless — no sessions, no file uploads, no server-side writes triggered by user
  requests.
- **Database:** `backend/app/core/database.py` already auto-selects SQLite vs. PostgreSQL
  based on the `DATABASE_URL` scheme, and `psycopg[binary]` is already in
  `backend/requirements.txt`. `alembic/env.py` reads `settings.DATABASE_URL` at migration
  time (not a hardcoded value), so pointing `DATABASE_URL` at a Postgres instance and
  running `alembic upgrade head` creates the real schema there. No SQLite-specific column
  types were found in `backend/app/models/entities.py`.
- **ML "model serving" — the most important finding of this audit:** there is none, and
  none is needed. The FastAPI app never imports `joblib`, `scikit-learn`, `pandas`, or any
  ML library — confirmed by searching `backend/app/` directly. Every forecast, evidence
  grade, and backtest point is **precomputed offline** by the `ml/` pipeline and written
  into Postgres/SQLite once, by `backend/scripts/load_processed_data.py` (its own
  docstring confirms it's idempotent — safe to re-run). The live API only ever reads
  already-computed rows from the database. This means production needs **no GPU, no
  model-serving endpoint, and no heavy ML dependencies in the running web service** — only
  `backend/requirements.txt` (FastAPI/SQLAlchemy/Alembic/psycopg), which is a fast, light
  install.
- **A real blocker found in this audit:** `backend/scripts/load_processed_data.py` loads
  `ml/artifacts/best_forecaster.joblib` to get the actual fitted per-segment models
  (`fitted_models.get(model_key)`); if that file is absent, every segment falls back to
  "insufficient" and the app would show 0 forecastable segments. That file, along with
  `data/processed/panel.parquet`, `data/processed/backtest_points.parquet`, and
  `data/processed/backtest_segment_summary.parquet`, were **gitignored** — meaning a fresh
  clone of this repo (exactly what a deploy platform pulls) had no seed data at all. This
  is fixed in this round (see Step 3).
- **MQTT / background workers / scheduled jobs:** none exist anywhere in the repository
  (`grep`-searched for mqtt/celery/worker/scheduler/cron — no matches). Nothing to deploy
  beyond the two stateless services above.
- **Secrets:** only `DATABASE_URL` and `BACKEND_CORS_ORIGINS` are environment-driven
  config; no API keys are used by the running backend. `.env` is gitignored; only
  `.env.example` (placeholder values) is tracked.
- **Tests:** `backend/tests` + `ml/tests` = 43 tests; `frontend` has 2 tests
  (`App.test.tsx`). Both re-run in this session after the deployment-prep changes below —
  see Step 5.

---

## Step 2 — Architecture decision (and why)

| Component | Choice | Why |
|---|---|---|
| Frontend | **Vercel** (Hobby/free) | Vite auto-detected, generous free tier (~100GB transfer, 1M invocations/month), Hobby plan's non-commercial restriction is fine for a student hackathon project. |
| Backend | **Render** (Free web service) | Simple Python web-service hosting, free tier gives 750 instance-hours/month. **Caveat, disclosed honestly:** a free service spins down after 15 minutes of no traffic and takes ~30–50s to cold-start on the next request — worth knowing before a live judged demo. |
| Database | **Neon** (Free serverless Postgres), not Render's free Postgres | Render's own free Postgres **expires and is deleted 30 days after creation** (confirmed from Render's current docs/changelog) — unacceptable for a project that needs to stay reachable through a judging period. Neon's free tier doesn't expire; its compute just suspends when idle and resumes in a few seconds on the next query. Free storage (0.5GB) is far more than this project needs (the entire processed dataset is under 1MB; raw sources ~31MB are not needed in production at all). |
| ML model serving | **None required** | See Step 1 — forecasts are precomputed and stored in Postgres; the backend only ever reads them. |
| MQTT / workers | **None required** | Confirmed absent from the codebase. |

---

## Step 3 — Code changes made in this repository (and why)

1. **`.gitignore`** — added explicit exceptions (`!data/processed/panel.parquet`,
   `!data/processed/backtest_points.parquet`,
   `!data/processed/backtest_segment_summary.parquet`,
   `!ml/artifacts/best_forecaster.joblib`) so these four files — and only these four,
   nothing else under `data/raw/` or `data/processed/` — are tracked. This is the fix for
   the real blocker found in Step 1. Verified locally: the joblib file loads and contains
   187 fitted models, matching the app's own "187 forecastable segments" stat exactly.
2. **`render.yaml`** (new) — Infrastructure-as-code definition for the backend: build
   command (`pip install -r backend/requirements.txt`), start command (`uvicorn
   backend.app.main:app --host 0.0.0.0 --port $PORT`), a pre-deploy command
   (`alembic upgrade head`, so schema migrations apply automatically on every future
   deploy), the `/health` health-check path, and a pinned Python version (3.12.7,
   matching the existing `backend/Dockerfile`). `DATABASE_URL` and
   `BACKEND_CORS_ORIGINS` are declared but left for you to fill in via Render's
   dashboard (`sync: false`) — never committed.
3. **`.env.example`** — added a clearly-labeled "production values" section documenting
   the exact format each platform expects (e.g., `BACKEND_CORS_ORIGINS` must be a JSON
   array literal, not a bare comma-separated string — this is how `pydantic-settings`
   parses `List[str]` fields from environment variables). No real secrets added.
4. **This file.**

No other backend or frontend source code changes were required. `DATABASE_URL`,
`BACKEND_CORS_ORIGINS`, and `VITE_API_URL` were already environment-variable-driven, the
database layer already dialect-switches automatically, and the frontend already had no
hardcoded production-breaking URLs.

---

## Step 5 — Tests actually run before deployment, and their real results

- `python -m pytest backend/tests ml/tests -q` → **43 passed**, 0 failed (re-run after the
  `.gitignore`/`render.yaml`/`.env.example` changes above, to confirm nothing broke).
- `npm run build` (in `frontend/`) → succeeds; `tsc` type-checks cleanly, Vite produces a
  working `dist/` bundle. One pre-existing, non-blocking warning: the main JS chunk is
  ~1.3MB (366KB gzipped) — a code-splitting opportunity, not a deployment blocker.
- `joblib.load("ml/artifacts/best_forecaster.joblib")` → loads successfully, **187**
  fitted models, keys like `DL_2511.01` — confirmed to exactly match the app's live
  "Segments Forecastable: 187" stat.
- **What was NOT tested live, and why — stated plainly rather than assumed:** this
  sandboxed environment has no running Docker daemon (`docker compose build` fails to
  reach the Docker API) and no local PostgreSQL server, so `alembic upgrade head` and
  `backend/scripts/load_processed_data.py` could **not** be run live against a real
  Postgres instance in this session. The reasons to expect it will work are concrete —
  `alembic/env.py` already reads `DATABASE_URL` dynamically rather than a hardcoded
  value, `psycopg[binary]` is already a backend dependency, no SQLite-specific column
  types exist in the models, and this exact `DATABASE_URL` pattern is what
  `docker-compose.yml`'s Postgres service was already designed around — but this is
  reasoned confidence, not a verified test result. **Part E below is written so that the
  very first time this runs against real Postgres is a step you can watch and verify
  yourself**, with its own checklist.

---

## Step 6 — Live deployment (do this yourself; I cannot access these accounts)

### Part A — Database (Neon), ~3 minutes
1. Go to **neon.tech** and sign in (GitHub sign-in is fastest).
2. Click **New Project**. Name it `skillpulse`, pick a nearby region, keep the default
   Postgres version. Click **Create**.
3. On the project dashboard, find the **Connection string** panel and copy the string
   starting with `postgresql://...` (the default pooled-connection string is fine).
   Keep this tab open — you'll need it in Part B and Part E. Do not paste it anywhere
   public (not in chat, not in a commit).

### Part B — Backend (Render), ~5 minutes
4. Go to **render.com** and sign in with GitHub, authorizing access to your
   `Skill_Pulse_Intelligence` repository.
5. Click **New +** → **Web Service**, and select that repository.
6. Render should detect `render.yaml` at the repo root and offer to use it as a
   Blueprint — choose **Apply**. (If it doesn't offer that, configure manually: Root
   Directory blank/repo root, Runtime Python 3, Build Command
   `pip install -r backend/requirements.txt`, Start Command
   `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`, plan Free.)
7. Under **Environment**, add:
   - `DATABASE_URL` = your Neon string from step 3, with `postgresql://` changed to
     `postgresql+psycopg://` (SQLAlchemy needs the `+psycopg` driver name), keeping any
     `?sslmode=require` suffix Neon included.
   - `BACKEND_CORS_ORIGINS` = `["https://placeholder.vercel.app"]` for now — you'll
     correct this in Part D once you know your real Vercel URL.
8. Confirm the **Pre-Deploy Command** is `alembic upgrade head` (should be set by the
   blueprint already).
9. Click **Create Web Service** and watch the **Logs** tab until the deploy finishes
   (usually 2–4 minutes on a fresh build).
10. Copy the public URL Render gives you (`https://skillpulse-backend-XXXX.onrender.com`).
    Open `<that URL>/health` in your browser. You should see
    `{"status":"healthy", ..., "database":"connected"}`. If `database` shows anything
    else, re-check `DATABASE_URL` and save again (this triggers a redeploy).

### Part C — Frontend (Vercel), ~3 minutes
11. Go to **vercel.com** and sign in with GitHub, authorizing the repository.
12. Click **Add New…** → **Project**, select `Skill_Pulse_Intelligence`.
13. In **Configure Project**, click **Edit** next to Root Directory and set it to
    `frontend`. The Framework Preset should auto-detect as **Vite**.
14. Under **Environment Variables**, add `VITE_API_URL` = your Render URL from step 10
    (no trailing slash).
15. Click **Deploy** and wait (~1–2 minutes).
16. Copy the public URL Vercel gives you.

### Part D — Connect the two
17. Back in Render → your backend service → **Environment**, edit
    `BACKEND_CORS_ORIGINS` to the real Vercel URL from step 16, exactly, as a JSON
    array: `["https://your-real-url.vercel.app"]`. Save — this redeploys the backend.
18. Wait for that redeploy to finish in the Logs tab.

### Part E — Seed the production database, one-time, from your own machine
This runs from your laptop (which already has the full local Python environment this
project has used all session) rather than from Render, so the backend's own deploy stays
small and fast and never needs pandas/scikit-learn just to serve already-computed rows.

19. Open a terminal in the project root, in your existing local Python environment.
20. Point this **one terminal session only** at the Neon database (do not edit your
    actual local `.env` — you want your everyday local dev to keep using SQLite):
    - PowerShell: `$env:DATABASE_URL = "postgresql+psycopg://...your Neon string..."`
21. Run the migration against the real production database:
    `alembic upgrade head`
    Watch for errors. This is the first real test of the Postgres path noted as
    unverified in Step 5 — read the output carefully.
22. Run the idempotent seed script: `python backend/scripts/load_processed_data.py`
    It should log real row counts for regions, occupations, forecasts, and backtest
    points, with no tracebacks.
23. Close that terminal (so `$env:DATABASE_URL` no longer applies to your shell) — your
    local dev setup goes back to SQLite automatically next time you open a new terminal.

---

## Step 7 — Verify the live project

Open your Vercel URL and check each of these, exactly as the project requires — with
browser DevTools (Console + Network tabs) open the whole time:

- [ ] Homepage loads, header and stat cards render with real numbers (187 forecastable,
      5 gated, etc. — should match what you saw locally).
- [ ] Navigation between all 6 tabs works.
- [ ] Select Electrician General / Maharashtra on the Forecast tab — chart and Evidence
      Grade card load.
- [ ] Occupation Explorer search/filter/sufficiency icons work.
- [ ] Select Systems Analyst / Gujarat — confirm it **still** honestly refuses to
      forecast ("Insufficient history...") against the live production database, not
      just locally.
- [ ] What-If Simulator produces a result when you adjust a slider.
- [ ] "ML inference" in this architecture means: forecast/evidence-grade values for a
      sufficient segment load correctly — confirm this, since there is no live model
      call to separately test.
- [ ] Data Trust Centre loads its live manifest and matches the real/synthetic labels
      you saw locally.
- [ ] No red errors in the Console tab; no failed (red) requests in the Network tab.
- [ ] Refresh the page (hard refresh) — everything above still works, nothing depended
      on in-memory state from the first load.

---

## Remaining manual actions

- All of Part A–E in Step 6 require your own Neon/Render/Vercel accounts — I have no
  access to create or configure them. Nothing has been deployed by me; only the
  repository has been prepared.
- The Postgres migration + seed path is reasoned-correct but not live-tested (Step 5) —
  Part E's step 21–22 is genuinely the first real test of it. Watch that output.
- Consider, after judging, either pausing/deleting the free services or upgrading, since
  free Render services cold-start and free Neon compute suspends when idle.
