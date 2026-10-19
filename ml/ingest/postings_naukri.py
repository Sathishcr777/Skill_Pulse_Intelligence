"""Naukri Job Postings ingestion module.

Fetches/reads raw job postings data into data/raw/postings_naukri/ untransformed.
Downloads PromptCloud's verified Kaggle sample archive or reads local raw files.
"""

import io
import json
import logging
import os
import urllib.request
import zipfile
from typing import Any, Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/raw/postings_naukri"))
SAMPLE_URL = "https://www.kaggle.com/api/v1/datasets/download/promptcloud/naukri-jobs-data-dec-2023"
LOCAL_RAW_FILE = os.path.join(RAW_DIR, "naukri_sample.ldjson")


def ingest_naukri() -> Dict[str, Any]:
    os.makedirs(RAW_DIR, exist_ok=True)

    if os.path.exists(LOCAL_RAW_FILE) and os.path.getsize(LOCAL_RAW_FILE) > 0:
        logger.info(f"Existing raw file found at: {LOCAL_RAW_FILE}")
    else:
        logger.info(f"Fetching raw sample from Kaggle PromptCloud endpoint: {SAMPLE_URL}")
        try:
            req = urllib.request.Request(
                SAMPLE_URL,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    names = z.namelist()
                    if not names:
                        raise ValueError("Downloaded zip archive is empty")
                    raw_content = z.read(names[0])
                    with open(LOCAL_RAW_FILE, "wb") as f:
                        f.write(raw_content)
                    logger.info(f"Extracted {names[0]} to {LOCAL_RAW_FILE} ({len(raw_content)} bytes)")
        except Exception as e:
            logger.error(f"Failed to fetch Naukri raw data: {e}")
            return {
                "dataset": "Naukri Postings (Dec 2023)",
                "status": "BLOCKED",
                "reason": f"Kaggle download failed or requires authentication: {e}",
                "manual_steps": (
                    "1. Visit https://www.kaggle.com/datasets/promptcloud/naukri-jobs-data-dec-2023\n"
                    "2. Download dataset archive (requires Kaggle account or kaggle.json token)\n"
                    f"3. Place extracted raw .ldjson or .csv in {RAW_DIR}/naukri_sample.ldjson"
                ),
            }

    # Inspect the raw file
    lines = []
    sample_fields = []
    with open(LOCAL_RAW_FILE, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_str = line.strip()
            if line_str:
                lines.append(line_str)
                if not sample_fields:
                    try:
                        record = json.loads(line_str)
                        sample_fields = list(record.keys())
                    except Exception:
                        pass

    file_size = os.path.getsize(LOCAL_RAW_FILE)
    logger.info(f"Successfully ingested Naukri sample: {len(lines)} records, {file_size} bytes")

    return {
        "dataset": "Naukri Postings (Dec 2023)",
        "status": "SUCCEEDED (Sample archive)",
        "file_path": LOCAL_RAW_FILE,
        "row_count": len(lines),
        "file_size_bytes": file_size,
        "sample_fields": sample_fields,
        "limitation": (
            "PromptCloud Kaggle open download provides 10 uncompressed real job posting sample records. "
            "The full 30,000+ record dataset requires Kaggle account authentication or PromptCloud commercial license."
        ),
    }


if __name__ == "__main__":
    result = ingest_naukri()
    print(json.dumps(result, indent=2))
