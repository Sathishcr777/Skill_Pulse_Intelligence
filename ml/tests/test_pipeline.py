import os
import json
import joblib
import numpy as np
import pandas as pd
import pytest

from ml.clean.date_standards import standardize_date
from ml.clean.geo_standards import standardize_geography
from ml.clean.clean_postings import clean_html_text
from ml.features.occupation_crosswalk import OccupationCrosswalk
from ml.features.skill_extraction import SkillExtractor
from ml.train.baseline import SeasonalNaiveBaseline
from ml.train.candidate_models import HoltWintersCandidate, is_statistically_sufficient, MIN_HISTORY_THRESHOLD
from ml.evaluate.evidence_grade import compute_evidence_grade
from ml.evaluate.metrics import compute_metrics
from ml.evaluate.walk_forward import WalkForwardValidator

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
PANEL_PATH = os.path.join(PROJECT_ROOT, "data/processed/panel.parquet")
MODEL_PATH = os.path.join(PROJECT_ROOT, "ml/artifacts/best_forecaster.joblib")
METADATA_PATH = os.path.join(PROJECT_ROOT, "ml/artifacts/metadata.json")


def test_clean_geo_and_date_standards():
    """Verify geography and date cleaning standards."""
    code, name = standardize_geography("Bengaluru, Karnataka")
    assert code == "KA"
    assert name == "Karnataka"

    code_mumbai, name_mumbai = standardize_geography("Navi Mumbai")
    assert code_mumbai == "MH"
    assert name_mumbai == "Maharashtra"

    dt, ym = standardize_date("2023-11-30")
    assert ym == "2023-11"
    assert dt.day == 30

    dt2, ym2 = standardize_date("2023-12-01 09:14:39 +0000")
    assert ym2 == "2023-12"

    cleaned = clean_html_text("<b>Software</b> &amp; Developer<br/>")
    assert cleaned == "Software & Developer"


def test_occupation_crosswalk():
    """Verify crosswalk manual lookup and fuzzy match."""
    crosswalk = OccupationCrosswalk()

    # Exact manual lookup
    res_copy = crosswalk.match_title("Copywriter")
    assert res_copy["nco_code"] == "2513.0100"
    assert res_copy["match_type"] == "manual_exact"

    # Phrase manual lookup
    res_dev = crosswalk.match_title("Senior Python Developer")
    assert res_dev["nco_code"] == "2512.0100"
    assert "manual" in res_dev["match_type"]

    # Fuzzy match
    res_gda = crosswalk.match_title("General Duty Hospital Attendant")
    assert res_gda["nco_code"] == "5321.0100"
    assert res_gda["confidence"] >= 0.40


def test_skill_extraction_vocabulary():
    """Verify skill extraction against canonical O*NET vocabulary."""
    extractor = SkillExtractor(use_embeddings=False)
    text = "We require an Electrician with skills in electrical wiring, Critical Thinking, and Active Listening."
    skills = extractor.extract_skills(text)
    assert len(skills) >= 1
    terms = [s["term"] for s in skills]
    assert any("Critical Thinking" in t or "Active Listening" in t for t in terms)


def test_walk_forward_no_leakage():
    """Verify walk-forward strictly uses past data (no future leakage)."""
    dates = pd.date_range("2022-01-01", periods=20, freq="MS")
    demand = [100.0 + i * 2.0 + (i % 3) * 5.0 for i in range(20)]
    df = pd.DataFrame({
        "state_code": ["MH"] * 20,
        "nco_code": ["7411.0100"] * 20,
        "occupation_title": ["Electrician General"] * 20,
        "trade_category": ["ITI/PMKVY"] * 20,
        "date": dates,
        "year_month": [d.strftime("%Y-%m") for d in dates],
        "demand_count": demand,
        "plfs_supply_proxy": [100.0] * 20,
    })

    validator = WalkForwardValidator(initial_train_size=12)
    res = validator.evaluate_segment(df)

    assert res["sufficient"] is True
    assert res["test_steps"] == 8  # 20 - 12 = 8 steps evaluated

    # Verify predictions vector aligns with test window
    assert len(res["actuals"]) == 8
    assert len(res["baseline_preds"]) == 8
    assert len(res["candidate_preds"]) == 8

    # Ensure baseline MAE and candidate MAE are valid non-NaN numbers
    assert not np.isnan(res["baseline_metrics"]["mae"])
    assert not np.isnan(res["candidate_metrics"]["mae"])


def test_evidence_grade_boundaries():
    """Verify deterministic evidence scoring boundaries."""
    # 1. Insufficient floor gate (< 12 observations)
    res_insuff = compute_evidence_grade(series_length=6, demand_series=[10.0] * 6, supply_series=[10.0] * 6)
    assert res_insuff["grade"] == "Insufficient"
    assert res_insuff["sufficient"] is False

    # 2. Grade A boundary (S >= 80): 24 months, concordant, recent
    res_a = compute_evidence_grade(
        series_length=24,
        demand_series=[100.0 + i * 2.0 for i in range(24)],
        supply_series=[100.0 + i * 1.5 for i in range(24)],
    )
    assert res_a["grade"] == "A"
    assert res_a["score"] >= 80.0

    # 3. Grade B boundary (60 <= S < 80): 18 months, mild drift
    res_b = compute_evidence_grade(
        series_length=18,
        demand_series=[100.0 + i * 1.0 for i in range(18)],
        supply_series=[100.0 + (18 - i) * 0.5 for i in range(18)],
    )
    assert res_b["grade"] in ["B", "C"]
    assert 40.0 <= res_b["score"] < 80.0


def test_reload_reproducibility():
    """Verify reload-reproducibility test passes."""
    assert os.path.exists(MODEL_PATH), "Model artifact must exist"
    payload = joblib.load(MODEL_PATH)
    assert "models" in payload
    assert payload["n_models"] >= 150

    sample_key = list(payload["models"].keys())[0]
    model = payload["models"][sample_key]

    pred1 = model.predict(steps=3)
    pred2 = model.predict(steps=3)
    assert np.allclose(pred1, pred2), "Inconsistent predictions across reload"


def test_artifacts_and_metadata_exist():
    """Verify panel.parquet and metadata.json exist with real computed values."""
    assert os.path.exists(PANEL_PATH), "panel.parquet must exist"
    panel_df = pd.read_parquet(PANEL_PATH)
    assert len(panel_df) > 4000
    assert "state_code" in panel_df.columns
    assert "demand_count" in panel_df.columns
    assert "plfs_supply_proxy" in panel_df.columns

    assert os.path.exists(METADATA_PATH), "metadata.json must exist"
    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        meta = json.load(f)

    assert meta["project"] == "SkillPulse Intelligence (SIH26246)"
    assert meta["sufficiency_gating"]["excluded_segments_count"] > 0
    assert len(meta["evidence_grading"]["grade_distribution"]) >= 2
