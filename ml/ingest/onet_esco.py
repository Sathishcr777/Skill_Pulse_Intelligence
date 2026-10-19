"""O*NET and ESCO skill taxonomy ingestion module.

Fetches/reads raw O*NET database tables and checks ESCO taxonomy packages
into data/raw/onet_esco/ untransformed.
"""

import csv
import io
import json
import logging
import os
import urllib.request
import zipfile
from typing import Any, Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/raw/onet_esco"))
ONET_DIR = os.path.join(RAW_DIR, "onet")
ESCO_DIR = os.path.join(RAW_DIR, "esco")
ZIP_FILE = os.path.join(RAW_DIR, "db_31_0_text.zip")
ONET_URL = "https://www.onetcenter.org/dl_files/database/db_31_0_text.zip"


def ingest_onet_esco() -> Dict[str, Any]:
    os.makedirs(ONET_DIR, exist_ok=True)
    os.makedirs(ESCO_DIR, exist_ok=True)

    results: Dict[str, Any] = {
        "onet": {},
        "esco": {},
    }

    # 1. Ingest O*NET
    if not os.path.exists(ZIP_FILE) or os.path.getsize(ZIP_FILE) < 10000000:
        logger.info(f"Downloading O*NET database 31.0 from {ONET_URL}...")
        try:
            req = urllib.request.Request(
                ONET_URL,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp, open(ZIP_FILE, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    f.write(chunk)
            logger.info(f"Downloaded O*NET database zip: {os.path.getsize(ZIP_FILE)} bytes")
        except Exception as e:
            logger.error(f"Error downloading O*NET database: {e}")
            results["onet"] = {
                "dataset": "O*NET 31.0 Database",
                "status": "BLOCKED",
                "reason": str(e),
                "manual_steps": "Download db_31_0_text.zip from https://www.onetcenter.org/database.html and place in data/raw/onet_esco/",
            }

    if os.path.exists(ZIP_FILE) and os.path.getsize(ZIP_FILE) >= 10000000:
        logger.info("Extracting raw O*NET files from zip...")
        extracted_files = {}
        with zipfile.ZipFile(ZIP_FILE, "r") as z:
            # Extract key taxonomy files
            target_names = [
                "Occupation Data.txt",
                "Software Skills.txt",
                "Essential Skills.txt",
                "Knowledge.txt",
                "Content Model Reference.txt",
            ]
            for member in z.namelist():
                filename = os.path.basename(member)
                if filename in target_names:
                    target_path = os.path.join(ONET_DIR, filename)
                    with z.open(member) as source, open(target_path, "wb") as target:
                        target.write(source.read())

                    # Inspect rows and fields
                    with open(target_path, "r", encoding="utf-8", errors="ignore") as f:
                        reader = csv.reader(f, delimiter="\t")
                        header = next(reader, [])
                        row_count = sum(1 for _ in reader)

                    extracted_files[filename] = {
                        "path": target_path,
                        "file_size_bytes": os.path.getsize(target_path),
                        "row_count": row_count,
                        "fields": header,
                    }

        results["onet"] = {
            "dataset": "O*NET 31.0 Database (National Center for O*NET Development)",
            "status": "SUCCEEDED",
            "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
            "zip_path": ZIP_FILE,
            "zip_size_bytes": os.path.getsize(ZIP_FILE),
            "files": extracted_files,
        }

    # 2. Ingest ESCO
    # Check if local ESCO raw CSV package exists
    esco_files = [f for f in os.listdir(ESCO_DIR) if f.endswith(".csv")]
    if esco_files:
        inspected_esco = {}
        for ef in esco_files:
            ef_path = os.path.join(ESCO_DIR, ef)
            with open(ef_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                header = next(reader, [])
                row_count = sum(1 for _ in reader)
            inspected_esco[ef] = {
                "file_size_bytes": os.path.getsize(ef_path),
                "row_count": row_count,
                "fields": header,
            }
        results["esco"] = {
            "dataset": "European Skills, Competences, Qualifications and Occupations (ESCO v1.2.1)",
            "status": "SUCCEEDED (Local package)",
            "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
            "files": inspected_esco,
        }
    else:
        results["esco"] = {
            "dataset": "European Skills, Competences, Qualifications and Occupations (ESCO v1.2.1)",
            "status": "BLOCKED (Requires portal registration / email confirmation)",
            "reason": (
                "European Commission ESCO portal (https://ec.europa.eu/esco/portal/download) does not host "
                "static open file URLs. Downloads require dynamically selecting language package (English), "
                "accepting data privacy policy, and providing an email address to receive a secure tokenized download link."
            ),
            "manual_steps": (
                "1. Go to https://ec.europa.eu/esco/portal/download\n"
                "2. Choose ESCO dataset (v1.2.1), select format 'CSV' and language 'English (en)'.\n"
                "3. Submit email address and download the zip package.\n"
                f"4. Extract skills.csv / occupations.csv into {ESCO_DIR}/"
            ),
        }

    return results


if __name__ == "__main__":
    result = ingest_onet_esco()
    print(json.dumps(result, indent=2))
