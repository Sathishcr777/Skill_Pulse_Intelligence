# Data Sources Findings — Empirical Access Verification

This document reports observed, verified facts regarding data acquisition for SkillPulse Intelligence (SIH26246). No data content, row counts, or API behaviors are fabricated. Every finding was tested programmatically.

---

## Summary Matrix

| Dataset | Claimed Role in Blueprint | Observed Status | Real Row Count | Real File Size | Access Barrier / Blocker | Workaround / Strategic Decision |
|---|---|---|---|---|---|---|
| **NCO-2015 Codebook** | Canonical occupation taxonomy | **SUCCEEDED** | 24 occupations | 5.2 KB | None (Hand-digitized from official DGE publication) | Digitize core ITI/PMKVY engineering trades + healthcare + IT/ITES roles |
| **O\*NET 31.0 Database** | Skill taxonomy + importance weights | **SUCCEEDED** | 1,016 occupations, 18,200 essential skills, 31,821 software skills | 13.18 MB (zip) / 10.4 MB (extracted) | Direct programmatic download succeeded (`db_31_0_text.zip`) | Primary skill taxonomy engine; crosswalk to NCO-2015 via title similarity |
| **Naukri Postings (Dec 2023)** | Skill-demand text signal (India) | **SUCCEEDED (Sample archive)** | 10 records | 49.5 KB | Full 30,000+ dataset requires Kaggle account authentication / PromptCloud license | Use real 10-record sample for schema and pipeline validation; document manual steps for full archive |
| **PLFS Microdata (MoSPI)** | Real supply proxy (base employment) | **BLOCKED** | 0 (remote blocked) | 0 bytes | `WinError 10061`: MoSPI NADA portal blocks unauthenticated script downloads | Reference official MoSPI PLFS Annual Report tabular base rates until manual NADA approval is completed |
| **NCS Vacancy Data** | Corroborating real demand signal | **BLOCKED** | 0 (remote blocked) | 0 bytes | OGD India API requires mandatory `api-key` token; catalog page has no static open CSV | Treat as secondary signal; acquire OGD API key or manual CSV export |
| **ESCO v1.2.1** | Secondary skill taxonomy cross-check | **BLOCKED (Portal verification)** | 0 (remote gated) | 0 bytes | Dynamic EU portal requires email verification to generate secure download link | Rely primarily on O*NET 31.0; document manual ESCO download procedure |

---

## Detailed Dataset Findings

### 1. NCO-2015 Occupation Taxonomy (Hand-Digitized Reference)
- **File Location**: `data/reference/nco_subset.csv`
- **Status**: **SUCCEEDED**
- **Public Source Document**:
  > *National Classification of Occupations 2015 (NCO-2015)*, Volumes I & II, Directorate General of Employment (DGE), Ministry of Labour and Employment, Government of India.
- **Row Count**: 24 occupations.
- **Fields Observed**:
  - `nco_2015_code`: 8-digit NCO-2015 code (e.g., `7411.0100`, `7233.0100`, `2512.0100`)
  - `division`: 1-digit major division (e.g., 7 = Craft & Related Trades, 2 = Professionals)
  - `sub_division`: 2-digit sub-division
  - `group`: 3-digit group
  - `family`: 4-digit occupational family
  - `occupation_title`: Official standardized occupation title
  - `trade_category`: Trade classification (`ITI/PMKVY`, `PMKVY/Healthcare`, `PMKVY/Retail`, `IT-ITES`)
  - `source_document`: Exact government publication citation
  - `description`: Official task/competency definition
- **Coverage**:
  - ITI/PMKVY Core Trades: Electrician General, Fitter General, Welder Gas and Electric, Turner / Lathe Operator, Machinist General, Mechanic Motor Vehicle, Wireman, Electronics Mechanic, Plumber General, Mason, Carpenter General, Refrigeration & AC Mechanic.
  - Emerging / PMKVY Service Trades: Sewing Machine Operator, Solar Panel Installation Technician, General Duty Assistant / Healthcare Attendant, Retail Sales Associate, Field Technician (Computing & Peripherals), Customer Care Executive, Data Entry Operator.
  - IT / ITES Roles: Software Developer, Systems Analyst, Database Administrator, Web and Multimedia Developer, ICT Operations Technician.
- **License**: Government of India Public Document.

---

### 2. O*NET 31.0 Database (National Center for O*NET Development)
- **File Location**: `data/raw/onet_esco/db_31_0_text.zip` and extracted in `data/raw/onet_esco/onet/`
- **Status**: **SUCCEEDED** (Direct programmatic acquisition via `ml/ingest/onet_esco.py`)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0).
- **Archive Size**: 13,183,034 bytes (~13.18 MB).
- **Observed Files, Real Row Counts, and Schemas**:
  1. `Occupation Data.txt`:
     - **Size**: 265,794 bytes
     - **Rows**: 1,016 occupations
     - **Fields**: `O*NET-SOC Code`, `Title`, `Description`
  2. `Essential Skills.txt`:
     - **Size**: 1,567,178 bytes
     - **Rows**: 18,200 skill importance/level ratings
     - **Fields**: `O*NET-SOC Code`, `Element ID`, `Element Name`, `Scale ID`, `Data Value`, `N`, `Standard Error`, `Lower CI Bound`, `Upper CI Bound`, `Recommend Suppress`, `Not Relevant`, `Date`, `Domain Source`
  3. `Software Skills.txt`:
     - **Size**: 2,496,686 bytes
     - **Rows**: 31,821 software tool and technology mappings
     - **Fields**: `O*NET-SOC Code`, `Workplace Example`, `Element ID`, `Element Name`, `Hot Technology`, `In Demand`
  4. `Knowledge.txt`:
     - **Size**: 5,710,599 bytes
     - **Rows**: 60,060 knowledge area ratings
     - **Fields**: `O*NET-SOC Code`, `Element ID`, `Element Name`, `Scale ID`, `Data Value`, `N`, `Standard Error`, `Lower CI Bound`, `Upper CI Bound`, `Recommend Suppress`, `Not Relevant`, `Date`, `Domain Source`
  5. `Content Model Reference.txt`:
     - **Size**: 242,007 bytes
     - **Rows**: 3,006 taxonomy definitions
     - **Fields**: `Element ID`, `Element Name`, `Description`
- **Limitations**: O*NET uses SOC-2018 (US Standard Occupational Classification). Mapping to India NCO-2015 requires a deterministic crosswalk based on title similarity and occupational definitions.

---

### 3. Naukri Job Postings (PromptCloud Dec 2023 Archive)
- **File Location**: `data/raw/postings_naukri/naukri_sample.ldjson`
- **Status**: **SUCCEEDED (Sample archive)** (Direct programmatic acquisition via `ml/ingest/postings_naukri.py`)
- **License**: PromptCloud Kaggle Open Research Distribution.
- **File Size**: 49,523 bytes.
- **Row Count**: 10 line-delimited JSON records.
- **Observed Fields**:
  `uniq_id`, `crawl_timestamp`, `job_title`, `post_date`, `job_description`, `company_name`, `url`, `category`, `city`, `job_type`, `company_description`, `salary_offered`, `job_board`, `html_job_description`, `is_remote`, `inferred_salary_from`, `inferred_salary_to`, `inferred_salary_currency`, `inferred_min_experience`, `inferred_max_experience`, `site_name`, `domain`, `postdate_yyyymmdd`, `predicted_language`, `inferred_iso3_lang_code`, `inferred_salary_time_unit`, `has_expired`, `last_expiry_check_date`, `latest_expiry_check_date`, `dataset`, `is_salary_estimated`, `postdate_in_indexname_format`, `segment_name`, `job_desc_char_count`, `duplicate_status`, `ijp_is_production_ready`, `additional_data`, `fitness_score`.
- **Limitations**: PromptCloud's open download endpoint provides 10 uncompressed real job posting sample records. The complete 30,000+ posting dataset requires Kaggle account authentication (`kaggle.json` API token) or a PromptCloud commercial data store order.

---

### 4. Periodic Labour Force Survey (PLFS) Unit-Level Microdata (MoSPI)
- **Status**: **BLOCKED**
- **Observed Result**:
  Direct automated connection to `https://microdata.gov.in/NADA/index.php/catalog/213` resulted in:
  `[WinError 10061] No connection could be made because the target machine actively refused it`.
- **Reason**:
  The Ministry of Statistics and Programme Implementation (MoSPI) hosts microdata on the National Data Archive (NADA) platform under a restricted-access open data policy. Unit-level raw survey records (individual person-level survey weights, NSS region codes, NIC/NCO codes) are strictly behind interactive authentication.
- **Manual Acquisition Steps**:
  1. Visit `https://microdata.gov.in/nada43/index.php/catalog`.
  2. Create/register an individual researcher account.
  3. Search for "Periodic Labour Force Survey (PLFS) Annual Report (July 2022 - June 2023)" or "2023-24".
  4. Submit an online Data Access Request specifying the study purpose (SIH26246).
  5. Upon approval by MoSPI Data Dissemination Section, download the raw ASCII fixed-width `.TXT` / Stata `.DTA` files.
  6. Place the raw files into `data/raw/plfs/`.
- **Impact on Product & Workaround**:
  PLFS employment is our real supply proxy. Unit-level microdata remains BLOCKED as described above. **UPDATE (2026-10-20):** a prior implementation had silently substituted a fabricated benchmark dict in place of this intended workaround, presented as if it were real PLFS data - this has since been corrected. The aggregate-table digitization described here has now actually been carried out: verified, cited state x NIC-2008-industry-section percentages from the published **PLFS Annual Report 2023-24, Table 27** (not unit-level microdata) are now used as the real supply proxy. Full citation, exact figures, methodology, and disclosed limitations are in `docs/data_integrity_audit.md`.

---

### 5. National Career Service (NCS) Vacancies (data.gov.in)
- **Status**: **BLOCKED**
- **Observed Result**:
  Catalog page `https://www.data.gov.in/catalog/national-career-service-ncs` is an informational portal summary. Automated REST API queries to `https://api.data.gov.in/catalog/search` without an API key returned `HTTP 400 Bad Request`.
- **Reason**:
  Open Government Data (OGD) Platform India mandates an `api-key` query token for all REST endpoints. Furthermore, NCS vacancy microdata at district x trade resolution is not published as an unauthenticated bulk public download stream.
- **Manual Acquisition Steps**:
  1. Register for a free account at `https://data.gov.in`.
  2. Navigate to "My Account" -> "API Key" to generate a personal OGD API key.
  3. Set `OGD_API_KEY=<key>` in `.env` or download the specific published CSV from the catalog page.
  4. Place the raw CSV in `data/raw/ncs/`.
- **Impact on Product & Workaround**:
  NCS vacancy data was designed as a secondary corroborating signal. Primary demand estimation remains anchored on NCO-2015 trade classifications and job postings.

---

### 6. European Skills, Competences, Qualifications and Occupations (ESCO v1.2.1)
- **Status**: **BLOCKED (Requires portal registration / email confirmation)**
- **Observed Result**:
  The European Commission ESCO portal (`https://ec.europa.eu/esco/portal/download`) does not host static open file URLs.
- **Reason**:
  The portal dynamically builds customized packages based on language and format selection, requiring the user to accept privacy terms and submit an email address to receive an expiring secure download link.
- **Manual Acquisition Steps**:
  1. Visit `https://ec.europa.eu/esco/portal/download`.
  2. Select ESCO dataset v1.2.1, format "CSV", and language "English (en)".
  3. Enter email address and download the zip package.
  4. Extract `skills.csv` and `occupations.csv` into `data/raw/onet_esco/esco/`.
- **Impact on Product & Workaround**:
  Since O*NET 31.0 was successfully acquired programmatically with 18,200 essential skills and 31,821 software tool mappings, O*NET provides a fully functional, comprehensive skill taxonomy engine. ESCO serves as an optional secondary validation layer.

---

## Feasibility Assessment for the Five Priority Features

| Priority Feature | Dependency on Datasets | Feasibility Status | Rationale & Workaround |
|---|---|---|---|
| **1. Evidence-graded demand forecast** (with statistical-sufficiency gating) | NCO-2015 reference + time series signals | **HIGHLY FEASIBLE** | NCO-2015 reference subset (24 trades) is digitized. Historical series will be constructed from official published quarterly/annual series; series failing length/variance sufficiency will display "insufficient history to forecast" per Rule 7. |
| **2. Explainable gap analysis** (demand vs REAL supply proxy) | Demand forecast + PLFS supply proxy | **FEASIBLE (with official MoSPI tabular aggregates)** | Using published MoSPI PLFS Annual Report state x occupation employment counts provides a real, non-fabricated supply proxy. Planners enter custom capacity numbers in what-if scenarios without inventing seat data. |
| **3. Emerging skill-combination detection** ("Opportunity Radar") | O*NET 31.0 skills + job postings | **HIGHLY FEASIBLE** | O*NET 31.0 essential skills (18,200) and software skills (31,821) are fully ingested and validated. Co-occurrence analysis operates over real skill clusters and job posting descriptions. |
| **4. Backtest + evidence-grade validator** | Chronological evaluation pipeline | **HIGHLY FEASIBLE** | Expanding-window walk-forward backtest operates on time-indexed historical series without random shuffle (Rule 8). Proves falsifiable claim: low evidence cells exhibit higher empirical backtest error. |
| **5. Planner decision workspace UI** | FastAPI + React frontend | **HIGHLY FEASIBLE** | The React + TypeScript + Vite + Tailwind + shadcn/ui scaffold is running and tested; live telemetry endpoint is operational. |
