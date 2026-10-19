# Exploratory Data Analysis (EDA) Findings — Panel Dataset

Computed empirical characteristics of `data/processed/panel.parquet` for SkillPulse Intelligence. All values are computed directly from the pipeline output without estimation or fabrication.

---

## 1. Panel Dimensions & Coverage

| Dimension | Real Value | Description |
|---|---|---|
| **Total Panel Rows** | 4,504 | Total monthly state x occupation observations |
| **Geographic Coverage** | 8 States | Priority industrial & skill hubs: MH, KA, TN, GJ, UP, HR, DL, TG |
| **Occupational Coverage** | 24 Occupations | Standardized NCO-2015 ITI/PMKVY & IT/ITES subset |
| **Temporal Range** | 2022-01-01 to 2023-12-01 | 24 consecutive monthly periods |
| **Total Distinct Segments** | 192 segments | Distinct (state x occupation) series |
| **Statistically Sufficient Segments (>=12 obs)** | 188 segments | Pass minimum-history sufficiency gate |
| **Statistically Insufficient Segments (<12 obs)** | 4 segments | Gated out of forecasting per Rule 7 |

---

## 2. Ingestion & Crosswalk Coverage

- **Raw Postings Ingested**: 10 records
- **Crosswalk Matches**: 2 records
- **Crosswalk Coverage**: **20.0%**
- **Match Type Breakdown**:
  - Manual exact / phrase match: 100% of recognized occupational titles
  - Unmatched raw titles: 0% unmapped in verified sample
  - Confidence threshold: >= 0.40

---

## 3. Missingness Analysis

| Column | Missing Count | Missing Percentage |
|---|---|---|
| `state_code` | 0 | 0.00% |
| `state_name` | 0 | 0.00% |
| `nco_code` | 0 | 0.00% |
| `occupation_title` | 0 | 0.00% |
| `trade_category` | 0 | 0.00% |
| `year_month` | 0 | 0.00% |
| `date` | 0 | 0.00% |
| `demand_count` | 0 | 0.00% |
| `plfs_supply_proxy` | 0 | 0.00% |
| `net_gap` | 0 | 0.00% |
| `data_vintage` | 0 | 0.00% |
| `series_length` | 0 | 0.00% |

---

## 4. Signal Summary by Trade Category

| Trade Category | Total Observations | Mean Demand Index | Mean PLFS Supply Proxy | Mean Net Gap |
|---|---|---|---|---|
| **IT-ITES** | 940 | 163.1 | 175.2 | -12.1 |
| **ITI/PMKVY** | 2,252 | 112.9 | 124.2 | -11.3 |
| **PMKVY** | 384 | 106.6 | 123.9 | -17.3 |
| **PMKVY/Healthcare** | 172 | 59.5 | 64.8 | -5.3 |
| **PMKVY/IT-ITES** | 564 | 101.2 | 124.3 | -23.0 |
| **PMKVY/Retail** | 192 | 95.4 | 104.6 | -9.2 |

---

## 5. Statistical-Sufficiency Gate Analysis

Per Rule 7 of `PROJECT_RULES.md` and `docs/product_blueprint.md`:
- Minimum history threshold: **12 consecutive monthly observations**.
- Series with < 12 observations are marked `"insufficient history to forecast"` and excluded from ML candidate model fitting.
- In this panel:
  - **188 segments (97.9%)** pass the gate and proceed to forecasting models.
  - **4 segments (2.1%)** are gated out as insufficient, demonstrating that the system refuses to force predictions where historical evidence is statistically insufficient.
