# Product Blueprint — SkillPulse Intelligence

## Verified data sources (re-verify actual access/schema in a later task
before relying on any of these — this list is from secondary research,
not yet independently confirmed by this codebase)
| Dataset | URL | License/access | Role |
|---|---|---|---|
| PLFS unit-level microdata | https://microdata.gov.in/NADA/index.php/catalog/213 | Govt open data, free registration | Real employment/labour-force base rates by state x occupation x time — REAL SUPPLY PROXY, not invented capacity numbers |
| NCS vacancy data | https://www.data.gov.in/catalog/national-career-service-ncs | NDSAP/OGD India open license | Corroborating real demand signal |
| O*NET database | https://www.onetcenter.org/database.html | CC license | Skill taxonomy + importance weights; needs crosswalk to NCO-2015 |
| ESCO | https://esco.ec.europa.eu | CC-BY | Secondary skill taxonomy cross-check |
| NCO-2015 codebook | DGE/Labour Bureau (public document) | Public, PDF — manually digitize a subset | Canonical occupation taxonomy |
| Naukri postings (Dec 2023) | https://www.kaggle.com/datasets/promptcloud/naukri-jobs-data-dec-2023 | Kaggle, scraped — supplementary/research use only | Skill-demand text signal, India-specific |
| LinkedIn Job Postings 2023-24 | https://www.kaggle.com/datasets/arshkon/linkedin-job-postings | Kaggle, scraped — supplementary | Skill-demand text signal (globally/US-skewed) |

No public dataset provides district x trade training-capacity/seat-allocation
numbers. Do not fabricate one. Use PLFS employment as the real supply proxy
for the core product; let the planner type in their own capacity number for
the what-if scenario tool.

## Stack
Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts,
plus custom visualization components for the Opportunity Radar and
evidence-grade visuals (not default shadcn/Recharts theming).
Backend: FastAPI + Pydantic + SQLAlchemy + Alembic.
ML: pandas, NumPy, scikit-learn, statsmodels (Holt-Winters/SARIMA),
LightGBM. No deep learning — available time series are too short/sparse
to justify it.
Database: PostgreSQL.
Deployment: docker-compose, local-first, offline-capable.

## Scope decisions (binding unless explicitly changed later)
- Demo covers ~15-30 occupations (ITI/PMKVY trades + a couple of IT/ITES
  roles) across 5-8 states — not full national coverage.
- Every forecast is gated by a statistical-sufficiency check; failing
  series show "insufficient history," never a fabricated number.
- Evidence grade (A/B/C) is a deterministic function of data recency,
  data volume, and cross-source agreement — computed from pipeline
  metadata, not a separate ML model.
- No chatbot. Explanations are template-generated from structured driver
  data (deterministic, reproducible). A live-LLM "regenerate explanation"
  button may be added later as strictly non-critical-path.
