# SkillPulse Intelligence (SIH26246)

AI-Enabled Labour Market Intelligence and Skill Demand-Supply Forecasting Engine (Ministry of Skill Development and Entrepreneurship).

## Core Differentiator

Evidence-graded forecasting: SkillPulse forecasts skill and occupation demand only where statistically justified, transparently explains the evidence driving each prediction, and validates forecast reliability against actual historical outcomes. Cells graded "low evidence" demonstrably exhibit higher real backtest errors than cells graded "high evidence" — offering state and district skill planners falsifiable, grounded intelligence rather than unverified extrapolations or fabricated capacity metrics.

## Setup & Execution Guide

### 1. Prerequisites
- Python 3.11+ (or 3.14)
- Node.js 20+ (npm 10+)
- PostgreSQL 15+ (or Docker Engine / Docker Compose)

### 2. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

### 3. Running via Docker Compose
To boot all three services (PostgreSQL, FastAPI Backend, and Nginx/React Frontend) in a single command:
```bash
docker compose up --build
```
- Frontend UI: `http://localhost:3000`
- Backend API Docs: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`

### 4. Running Locally (Offline / Developer Mode)

#### A. Backend (FastAPI)
Install dependencies and launch the API server:
```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### B. Database Migrations (Alembic)
Apply the initial PostgreSQL database migration:
```bash
alembic upgrade head
```
*(To inspect SQL without an active Postgres instance, run `alembic upgrade head --sql`)*

#### C. Frontend (Vite + React + Tailwind + shadcn/ui)
Install npm packages and run the development server:
```bash
cd frontend
npm install
npm run dev
```
Access the application at `http://localhost:5173`.

### 5. Running Ingestion Pipelines
To execute the raw data ingestion scripts:
```bash
# Ingest O*NET 31.0 database & inspect ESCO status
python -m ml.ingest.onet_esco

# Ingest real Naukri job postings sample
python -m ml.ingest.postings_naukri

# Check PLFS microdata status & manual acquisition steps
python -m ml.ingest.plfs

# Check NCS vacancies status & OGD API key requirements
python -m ml.ingest.ncs
```

### 6. Running Tests & Verification
```bash
# Run backend telemetry & health tests
pytest backend/tests/

# Run ML dataset ingestion & schema validation tests
pytest ml/tests/

# Run all Python test suites together
pytest backend/tests/ ml/tests/

# Run frontend test suite (Vitest + React Testing Library)
cd frontend && npm run test

# Validate frontend production compilation
cd frontend && npm run build
```
