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

## Statistical-Sufficiency Gating Specification (Step 2)
A time-series segment (state x occupation) may only produce a forecast if it passes the following concrete statistical-sufficiency check:
1. **Minimum History**: The segment must contain at least **12 consecutive monthly observations** ($N \ge 12$).
2. **Variance Floor**: The standard deviation of the historical series must be strictly non-zero ($\sigma > 0$).
3. **Gating Outcome**: Any segment failing this threshold is hard-gated out of forecasting models and outputs:
   `"insufficient history to forecast"` — a prediction number is NEVER fabricated.

## Evidence Grade Deterministic Formulation (Step 3)
Evidence grades (A, B, C, or Insufficient) quantify the statistical reliability of each segment using a deterministic pipeline scoring function ($S \in [0, 100]$):

$$S = S_{\text{volume}} + S_{\text{agreement}} + S_{\text{recency}}$$

1. **Data Volume & Continuity ($S_{\text{volume}}$, max 40 points)**:
   - $N \ge 24$ months: **40 pts**
   - $18 \le N < 24$ months: **30 pts**
   - $12 \le N < 18$ months: **20 pts**
   - $N < 12$ months: **0 pts** (Sufficiency failure)

2. **Cross-Source Signal Agreement ($S_{\text{agreement}}$, max 35 points)**:
   - Postings demand trajectory aligns directionally with PLFS supply trend (concordant): **35 pts**
   - Mild divergence (drift $\le 15\%$): **20 pts**
   - Contradictory signals (divergence $> 15\%$): **5 pts**

3. **Data Recency ($S_{\text{recency}}$, max 25 points)**:
   - Latest observation vintage within 3 months: **25 pts**
   - Latest observation vintage within 6 months: **15 pts**
   - Older than 6 months: **5 pts**

### Grade Mapping Thresholds:
- **Grade A (High Evidence)**: $S \ge 80$. Reliable, robust cross-source backing. Demonstrates lowest backtest error.
- **Grade B (Moderate Evidence)**: $60 \le S < 80$. Moderate cross-source convergence.
- **Grade C (Low Evidence)**: $40 \le S < 60$. High variance or weak cross-source alignment; demonstrably higher backtest error.
- **Insufficient**: Gated by Step 2 ($N < 12$); floor grade assigned regardless of recency or agreement.

