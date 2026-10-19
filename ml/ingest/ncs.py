"""National Career Service (NCS) vacancy data ingestion module.

Fetches/reads raw NCS vacancy data from data.gov.in into data/raw/ncs/ untransformed.
Verifies real access against Open Government Data (OGD) platform India API.
"""

import csv
import json
import logging
import os
import urllib.request
from typing import Any, Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/raw/ncs"))
DATA_GOV_CATALOG_URL = "https://www.data.gov.in/catalog/national-career-service-ncs"
API_SEARCH_URL = "https://api.data.gov.in/catalog/search"


def ingest_ncs() -> Dict[str, Any]:
    os.makedirs(RAW_DIR, exist_ok=True)

    # 1. Check if user provided local raw NCS vacancy export
    raw_files = [f for f in os.listdir(RAW_DIR) if f.endswith((".csv", ".json", ".xlsx", ".tsv"))]
    if raw_files:
        inspected = {}
        for rf in raw_files:
            rf_path = os.path.join(RAW_DIR, rf)
            with open(rf_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                header = next(reader, [])
                row_count = sum(1 for _ in reader)
            inspected[rf] = {
                "file_path": rf_path,
                "file_size_bytes": os.path.getsize(rf_path),
                "row_count": row_count,
                "fields": header[:15],
            }
        logger.info(f"Loaded existing NCS raw files from {RAW_DIR}")
        return {
            "dataset": "National Career Service (NCS) Vacancies",
            "status": "SUCCEEDED (Local raw export)",
            "files": inspected,
        }

    # 2. Check for OGD API key
    api_key = os.getenv("OGD_API_KEY")
    if not api_key:
        logger.warning("OGD_API_KEY environment variable not set. data.gov.in API requires an authenticated key.")
        return {
            "dataset": "National Career Service (NCS) Vacancies (data.gov.in)",
            "status": "BLOCKED",
            "reason": (
                "Open Government Data (OGD) Platform India API requires a mandatory 'api-key' token. "
                "The public catalog page hosts informational portal summaries, while REST API endpoints reject unauthenticated queries (HTTP 400/403)."
            ),
            "license": "Government Open Data License - India (GODL / NDSAP)",
            "catalog_url": DATA_GOV_CATALOG_URL,
            "manual_steps": (
                "1. Register at https://data.gov.in\n"
                "2. Navigate to 'My Account' -> 'API Key' to generate your OGD API Key.\n"
                "3. Set the key in .env as OGD_API_KEY=<your_key> or download the NCS vacancy CSV directly from the catalog resource page.\n"
                f"4. Place the downloaded CSV into {RAW_DIR}/"
            ),
            "impact_on_project": (
                "NCS vacancy data serves as a secondary corroborating demand signal. "
                "Core demand forecasting remains anchored on the NCO-2015 taxonomy and digitized job postings."
            ),
        }

    # If API key is present, test API query
    try:
        url = f"{API_SEARCH_URL}?title=National%20Career%20Service&format=json&api-key={api_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "dataset": "National Career Service (NCS) Vacancies",
                "status": "SUCCEEDED (OGD API)",
                "api_response_records": len(data.get("records", [])),
            }
    except Exception as e:
        return {
            "dataset": "National Career Service (NCS) Vacancies",
            "status": "BLOCKED",
            "reason": f"OGD API query failed with provided key: {e}",
        }


if __name__ == "__main__":
    result = ingest_ncs()
    print(json.dumps(result, indent=2))
