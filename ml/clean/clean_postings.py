"""Clean and normalize raw job postings data.

Extracts text, strips HTML formatting, and applies geography and date standardization.
"""

import html
import json
import logging
import os
import re
from typing import List, Dict, Any
import pandas as pd

from ml.clean.date_standards import standardize_date
from ml.clean.geo_standards import standardize_geography

logger = logging.getLogger(__name__)

RAW_POSTINGS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/raw/postings_naukri")
)


def clean_html_text(text: str) -> str:
    """Strips HTML tags, decodes entities, and cleans whitespace."""
    if not text or not isinstance(text, str):
        return ""
    # Decode HTML entities
    decoded = html.unescape(text)
    # Remove HTML tags
    stripped = re.sub(r"<[^>]+>", " ", decoded)
    # Remove multiple spaces/newlines
    cleaned = re.sub(r"\s+", " ", stripped).strip()
    return cleaned


def clean_job_postings(input_path: str = None) -> pd.DataFrame:
    """Reads and normalizes raw job postings into a clean DataFrame."""
    if input_path is None:
        input_path = os.path.join(RAW_POSTINGS_DIR, "naukri_sample.ldjson")

    if not os.path.exists(input_path):
        logger.warning(f"Raw postings file not found at {input_path}")
        return pd.DataFrame()

    records: List[Dict[str, Any]] = []

    with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
        for idx, line in enumerate(f):
            line_str = line.strip()
            if not line_str:
                continue
            try:
                raw = json.loads(line_str)
            except Exception:
                continue

            raw_city = raw.get("city") or ""
            state_code, state_name = standardize_geography(raw_city)

            raw_date = raw.get("post_date") or raw.get("crawl_timestamp")
            dt, year_month = standardize_date(raw_date)

            cleaned_title = clean_html_text(raw.get("job_title", ""))
            cleaned_desc = clean_html_text(raw.get("job_description", ""))

            records.append({
                "uniq_id": raw.get("uniq_id", f"post_{idx}"),
                "job_title": cleaned_title,
                "raw_city": raw_city,
                "state_code": state_code,
                "state_name": state_name,
                "post_date": dt,
                "year_month": year_month,
                "category": clean_html_text(raw.get("category", "")),
                "job_description": cleaned_desc,
                "company_name": clean_html_text(raw.get("company_name", "")),
            })

    df = pd.DataFrame(records)
    logger.info(f"Cleaned {len(df)} postings from {input_path}")
    return df


if __name__ == "__main__":
    df = clean_job_postings()
    print("Cleaned Postings Shape:", df.shape)
    if not df.empty:
        print(df[["job_title", "raw_city", "state_code", "year_month"]].head())
