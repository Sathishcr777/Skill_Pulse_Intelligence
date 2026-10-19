import csv
import json
import os
import pytest
from ml.ingest.ncs import ingest_ncs
from ml.ingest.onet_esco import ingest_onet_esco
from ml.ingest.plfs import ingest_plfs
from ml.ingest.postings_naukri import ingest_naukri

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))


def test_nco_subset_reference():
    """Verify hand-digitized NCO-2015 reference file."""
    ref_path = os.path.join(PROJECT_ROOT, "data/reference/nco_subset.csv")
    assert os.path.exists(ref_path), "data/reference/nco_subset.csv must exist"
    assert os.path.getsize(ref_path) > 0, "nco_subset.csv must not be empty"

    with open(ref_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required_cols = {
            "nco_2015_code",
            "division",
            "sub_division",
            "group",
            "family",
            "occupation_title",
            "trade_category",
            "source_document",
            "description",
        }
        assert required_cols.issubset(set(reader.fieldnames or [])), (
            f"Columns must include {required_cols}, found {reader.fieldnames}"
        )
        rows = list(reader)

    assert len(rows) >= 15, f"Must have at least 15 digitized occupations, found {len(rows)}"

    # Confirm key trades are present
    titles = [r["occupation_title"] for r in rows]
    assert any("Electrician" in t for t in titles), "Missing Electrician trade"
    assert any("Fitter" in t for t in titles), "Missing Fitter trade"
    assert any("Welder" in t for t in titles), "Missing Welder trade"
    assert any("Software Developer" in t for t in titles), "Missing Software Developer role"


def test_naukri_ingest_raw_file():
    """Verify ingested raw Naukri job postings."""
    naukri_res = ingest_naukri()
    assert naukri_res["status"] == "SUCCEEDED (Sample archive)"
    raw_path = naukri_res["file_path"]

    assert os.path.exists(raw_path), f"Raw file {raw_path} must exist"
    assert os.path.getsize(raw_path) > 0, f"Raw file {raw_path} must have >0 bytes"
    assert naukri_res["row_count"] > 0, "Naukri sample must have >0 rows"

    # Verify line-delimited JSON schema
    with open(raw_path, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            if not line.strip():
                continue
            record = json.loads(line)
            assert "uniq_id" in record, f"Missing uniq_id in record {idx}"
            assert "job_title" in record, f"Missing job_title in record {idx}"
            assert "job_description" in record, f"Missing job_description in record {idx}"


def test_onet_ingest_raw_files():
    """Verify ingested raw O*NET taxonomy tables."""
    onet_res = ingest_onet_esco()
    assert onet_res["onet"]["status"] == "SUCCEEDED"
    files = onet_res["onet"]["files"]

    assert "Occupation Data.txt" in files
    occ_info = files["Occupation Data.txt"]
    assert os.path.exists(occ_info["path"])
    assert occ_info["row_count"] > 0
    assert "O*NET-SOC Code" in occ_info["fields"]
    assert "Title" in occ_info["fields"]

    assert "Essential Skills.txt" in files
    skill_info = files["Essential Skills.txt"]
    assert os.path.exists(skill_info["path"])
    assert skill_info["row_count"] > 0
    assert "O*NET-SOC Code" in skill_info["fields"]
    assert "Element Name" in skill_info["fields"]


def test_blocked_datasets_reported_honestly():
    """Verify blocked datasets report real blockers and manual steps without faking."""
    plfs_res = ingest_plfs()
    assert plfs_res["status"].startswith("BLOCKED") or "SUCCEEDED" in plfs_res["status"]
    if plfs_res["status"].startswith("BLOCKED"):
        assert "manual_steps" in plfs_res
        assert "microdata.gov.in" in plfs_res["manual_steps"]

    ncs_res = ingest_ncs()
    assert ncs_res["status"].startswith("BLOCKED") or "SUCCEEDED" in ncs_res["status"]
    if ncs_res["status"].startswith("BLOCKED"):
        assert "manual_steps" in ncs_res
        assert "data.gov.in" in ncs_res["manual_steps"]
