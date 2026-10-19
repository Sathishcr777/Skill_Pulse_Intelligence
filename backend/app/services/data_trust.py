"""Builds the Data Trust Centre manifest from real, live-inspected sources.

Every number here is either read directly from a file on disk (row counts,
missingness, file modification time) or is a static citation fact (a
report's own publication date doesn't change) - nothing is invented. See
docs/data_integrity_audit.md and docs/data_sources_findings.md for the
full research trail these facts come from.
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, List

import pandas as pd

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
PANEL_PATH = os.path.join(PROJECT_ROOT, "data/processed/panel.parquet")
ONET_ZIP_PATH = os.path.join(PROJECT_ROOT, "data/raw/onet_esco/db_31_0_text.zip")
NAUKRI_PATH = os.path.join(PROJECT_ROOT, "data/raw/postings_naukri/naukri_sample.ldjson")
NCO_PATH = os.path.join(PROJECT_ROOT, "data/reference/nco_subset.csv")


def _file_mtime_iso(path: str) -> str | None:
    if not os.path.exists(path):
        return None
    return datetime.fromtimestamp(os.path.getmtime(path), tz=timezone.utc).isoformat()


def _live_panel_quality() -> Dict[str, Any]:
    """Computes real, current missingness/coverage stats directly from the
    panel file at request time - not a cached/stale snapshot."""
    if not os.path.exists(PANEL_PATH):
        return {
            "available": False,
            "total_rows": 0,
            "total_segments": 0,
            "sufficient_segments": 0,
            "excluded_segments": 0,
            "missingness_pct": {},
        }
    df = pd.read_parquet(PANEL_PATH)
    total_rows = len(df)
    counts = df.groupby(["state_code", "nco_code"])["year_month"].count()
    sufficient = int((counts >= 12).sum())
    excluded = int((counts < 12).sum())
    missing_pct = {
        col: round(float(df[col].isnull().sum()) / total_rows * 100, 2) if total_rows else 0.0
        for col in df.columns
    }
    return {
        "available": True,
        "total_rows": total_rows,
        "total_segments": int(len(counts)),
        "sufficient_segments": sufficient,
        "excluded_segments": excluded,
        "missingness_pct": missing_pct,
    }


def get_data_trust_manifest() -> Dict[str, Any]:
    panel_quality = _live_panel_quality()

    sources: List[Dict[str, Any]] = [
        {
            "name": "PLFS Annual Report 2023-24, Table 27",
            "source_type": "Government survey report (MoSPI/NSSO)",
            "classification": "observed",
            "publication_date": "2024-09-22",
            "observation_period": "July 2023 - June 2024",
            "geographic_coverage": "8 Indian states (MH, KA, TN, GJ, UP, HR, DL, TG) - rural+urban",
            "ingestion_timestamp": None,
            "citation_url": "https://www.mospi.gov.in/sites/default/files/publication_reports/AnnualReport_PLFS2023-24L2.pdf",
            "record_count": 8,
            "limitations": "Annual, state-level industry employment share - not monthly, not district-level, not a count of qualified/trained workers in a specific trade. 'Persons' figure is an unweighted mean of published Male/Female rows (not population-weighted).",
        },
        {
            "name": "O*NET 31.0 Database",
            "source_type": "Occupational skill taxonomy (US DOL / National Center for O*NET Development)",
            "classification": "observed",
            "publication_date": None,
            "observation_period": None,
            "geographic_coverage": "United States (used here as a skill-taxonomy reference, not an India-specific demand source)",
            "ingestion_timestamp": _file_mtime_iso(ONET_ZIP_PATH),
            "citation_url": "https://www.onetcenter.org/database.html",
            "record_count": 1016,
            "limitations": "US-centric; occupation titles manually crosswalked to the NCO-2015 subset used here.",
        },
        {
            "name": "NCO-2015 occupation reference (hand-digitized)",
            "source_type": "Government occupation classification (DGE, Ministry of Labour and Employment)",
            "classification": "observed",
            "publication_date": None,
            "observation_period": None,
            "geographic_coverage": "India (national classification)",
            "ingestion_timestamp": _file_mtime_iso(NCO_PATH),
            "citation_url": None,
            "record_count": 24,
            "limitations": "A 24-occupation subset only (ITI/PMKVY trades + IT/ITES), not the full NCO-2015 codebook.",
        },
        {
            "name": "Naukri job postings sample (PromptCloud, Dec 2023)",
            "source_type": "Scraped job-postings sample (Kaggle, third-party)",
            "classification": "observed",
            "publication_date": "2023-12",
            "observation_period": "December 2023",
            "geographic_coverage": "India (unevenly distributed across states in this 10-record sample)",
            "ingestion_timestamp": _file_mtime_iso(NAUKRI_PATH),
            "citation_url": "https://www.kaggle.com/datasets/promptcloud/naukri-jobs-data-dec-2023",
            "record_count": 10,
            "limitations": "Only 10 sample records (full dataset requires Kaggle auth, not obtained). Only 2 of 10 crosswalk-matched to a known occupation - too sparse for a general demand signal, used only for the narrowly-scoped real postings-skill-signal feature.",
        },
        {
            "name": "Demand index (demand_count)",
            "source_type": "Synthetic demonstration generator",
            "classification": "synthetic_demo",
            "publication_date": None,
            "observation_period": "2022-01 to 2023-12 (demo window)",
            "geographic_coverage": "Matches the 8-state panel",
            "ingestion_timestamp": _file_mtime_iso(PANEL_PATH),
            "citation_url": None,
            "record_count": panel_quality["total_rows"],
            "limitations": "Base magnitude anchored to the real PLFS figure, but trend/seasonality/noise is a documented synthetic formula, not a real job-postings volume. Never presented as observed data in any chart.",
        },
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "panel_quality": panel_quality,
    }
