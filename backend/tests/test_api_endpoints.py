"""Automated integration tests for FastAPI API endpoints against a separate seeded test database.

Tests all route behaviors, database queries, Pydantic validation (404 for invalid entities,
422 for invalid date ranges), sufficiency gating, and model evaluation metrics.
"""

import json
import os
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.database import Base, get_db
from backend.app.main import app
from backend.scripts.load_processed_data import load_data

TEST_DB_PATH = os.path.abspath("data/test_api_skillpulse.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"

# Test engine and session
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Seeds a separate test SQLite database before running the suite."""
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass

    # Load data into separate test database
    load_data(TEST_DB_URL)

    yield

    # Clean up test database
    test_engine.dispose()
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass


@pytest.fixture
def client():
    """Provides a TestClient with overridden get_db dependency pointing to test database."""
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# =========================================================================
# 1. Regions Endpoint Tests
# =========================================================================
def test_get_regions_returns_all_eight_states(client):
    response = client.get("/regions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 8

    state_codes = {r["state_code"] for r in data}
    expected_states = {"DL", "GJ", "HR", "KA", "MH", "TG", "TN", "UP"}
    assert state_codes == expected_states

    for r in data:
        assert "id" in r
        assert "state_code" in r
        assert "state_name" in r
        assert "zone" in r
        assert r["zone"] in ["West", "South", "North", "Other"]


# =========================================================================
# 2. Occupations Endpoint Tests
# =========================================================================
def test_get_occupations_returns_twenty_four_trades(client):
    response = client.get("/occupations")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 24

    for occ in data:
        assert "id" in occ
        assert "nco_code" in occ
        assert "title" in occ
        assert "trade_category" in occ
        assert isinstance(occ["skills"], list)
        assert len(occ["skills"]) > 0


def test_get_occupations_filter_by_trade_category(client):
    response = client.get("/occupations?trade_category=IT-ITES")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
    for occ in data:
        assert occ["trade_category"] == "IT-ITES"


# =========================================================================
# 3. Forecast Endpoint & Gating Tests
# =========================================================================
def test_get_forecast_sufficient_segment(client):
    # Electrician General (7411.01) in Maharashtra (MH)
    response = client.get("/forecast/7411.01/MH")
    assert response.status_code == 200
    data = response.json()

    assert data["region"]["state_code"] == "MH"
    assert data["occupation"]["nco_code"] == 7411.01
    assert data["is_sufficient"] is True
    assert data["gating_reason"] is None

    # Evidence grade
    assert data["evidence_grade"]["grade"] in ["A", "B"]
    assert data["evidence_grade"]["score"] >= 60.0

    # Historical series: 24 observations (2022-01 to 2023-12)
    assert len(data["historical_series"]) == 24
    assert data["historical_series"][0]["year_month"] == "2022-01"
    assert data["historical_series"][-1]["year_month"] == "2023-12"

    # Data provenance must be explicit per point: supply is verified real
    # PLFS Table 27 data, demand remains a disclosed synthetic demo signal.
    for point in data["historical_series"]:
        assert point["supply_data_source"] == "verified_real"
        assert point["supply_source_citation"] is not None
        assert "Table 27" in point["supply_source_citation"]
        assert point["demand_data_source"] == "synthetic_demo"

    # Forecast series: full 12-month horizon (2024-01 to 2024-12). The UI's
    # horizon selector slices this real precomputed array client-side; the
    # API itself always returns the full real model output.
    assert len(data["forecasts"]) == 12
    for fc in data["forecasts"]:
        assert fc["is_sufficient"] is True
        assert fc["predicted_demand"] is not None
        assert fc["predicted_demand"] > 0
        assert fc["lower_bound"] <= fc["predicted_demand"] <= fc["upper_bound"]


def _find_insufficient_segment():
    """Discovers a real insufficient-history segment from the panel rather
    than hardcoding one. Segment length assignment is now a neutral random
    draw (see docs/data_integrity_audit.md section on de-biasing demand
    classification), not tied to a specific occupation/state by name, so
    which segment is insufficient can change between panel rebuilds."""
    import pandas as pd

    panel_path = os.path.abspath("data/processed/panel.parquet")
    df = pd.read_parquet(panel_path)
    counts = df.groupby(["state_code", "nco_code"])["year_month"].count()
    short = counts[counts < 12]
    assert len(short) > 0, "Expected at least one insufficient-history segment in the panel"
    state_code, nco_code = short.index[0]
    return state_code, nco_code


def test_get_forecast_insufficient_segment_hard_gated(client):
    state_code, nco_code = _find_insufficient_segment()
    response = client.get(f"/forecast/{nco_code}/{state_code}")
    assert response.status_code == 200
    data = response.json()

    assert data["region"]["state_code"] == state_code
    assert data["is_sufficient"] is False
    assert "insufficient history to forecast" in data["gating_reason"]
    assert data["evidence_grade"]["grade"] == "Insufficient"
    assert data["evidence_grade"]["is_sufficient"] is False

    # Check forecasts are NOT fabricated
    for fc in data["forecasts"]:
        assert fc["is_sufficient"] is False
        assert fc["predicted_demand"] is None
        assert fc["lower_bound"] is None
        assert fc["upper_bound"] is None
        assert "insufficient history to forecast" in fc["gating_reason"]


def test_get_forecast_by_occupation_title(client):
    # Access via occupation title string
    response = client.get("/forecast/Software Developer/KA")
    assert response.status_code == 200
    data = response.json()
    assert data["region"]["state_code"] == "KA"
    assert data["occupation"]["nco_code"] == 2512.01


def test_get_forecast_date_range_filtering(client):
    response = client.get("/forecast/7411.01/MH?start_date=2023-01&end_date=2023-06")
    assert response.status_code == 200
    data = response.json()
    # 6 historical months
    assert len(data["historical_series"]) == 6
    assert data["historical_series"][0]["year_month"] == "2023-01"
    assert data["historical_series"][-1]["year_month"] == "2023-06"


# =========================================================================
# 4. Pydantic & Route Validation (404 and 422) Tests
# =========================================================================
def test_invalid_region_returns_404(client):
    response = client.get("/forecast/7411.01/NONEXISTENT_STATE")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Region 'NONEXISTENT_STATE' not found" in detail


def test_invalid_occupation_returns_404(client):
    response = client.get("/forecast/999999/MH")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Occupation '999999' not found" in detail


def test_invalid_date_range_inverted_returns_422(client):
    # start_date > end_date must fail with 422
    response = client.get("/forecast/7411.01/MH?start_date=2023-12&end_date=2022-01")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "start_date" in detail
    assert "cannot be greater than end_date" in detail


def test_malformed_date_format_returns_422(client):
    response = client.get("/forecast/7411.01/MH?start_date=invalid-date")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "Invalid start_date format" in detail


# =========================================================================
# 5. Market Overview Tests
# =========================================================================
def test_get_market_overview(client):
    response = client.get("/market/overview")
    assert response.status_code == 200
    data = response.json()

    assert data["total_regions"] == 8
    assert data["total_occupations"] == 24
    assert data["total_segments"] == 192
    assert data["sufficient_segments"] == 187
    assert data["excluded_segments"] == 5
    assert data["latest_data_vintage"] == "2023-12-31"

    # Evidence grade distribution (recomputed after (1) replacing the
    # fabricated PLFS benchmark dict with verified real PLFS Table 27
    # figures, and (2) de-biasing the demand-signal classification away from
    # occupation-name-keyed rules to a neutral random draw - see
    # docs/data_integrity_audit.md). Exact counts are not asserted beyond
    # internal consistency since the neutral draw is expected to vary
    # slightly between panel rebuilds.
    assert sum(data["grade_distribution"].values()) == 192
    assert data["grade_distribution"]["Insufficient"] == 5

    # Top deficit and surplus
    assert len(data["top_deficit_trades"]) > 0
    assert len(data["top_surplus_trades"]) > 0


def test_get_market_overview_with_region_filter(client):
    response = client.get("/market/overview?region=MH")
    assert response.status_code == 200
    data = response.json()
    assert data["total_segments"] == 24


# =========================================================================
# 6. Models Status & Provenance Tests
# =========================================================================
def test_get_model_status(client):
    response = client.get("/models/status")
    assert response.status_code == 200
    data = response.json()

    assert data["candidate_model"] == "Holt-Winters Exponential Smoothing"
    assert data["baseline_model"] == "Seasonal-Naive (lag=12, ma=3)"

    c_metrics = data["overall_candidate_metrics"]
    b_metrics = data["overall_baseline_metrics"]

    # Metrics now come from a panel whose demand-signal segment
    # classification is a neutral random draw (see
    # docs/data_integrity_audit.md), so exact MAE/RMSE/MAPE will shift
    # slightly between rebuilds. Assert the API reports EXACTLY what the
    # training pipeline actually produced (metadata.json), rather than a
    # hardcoded magic number - this is a provenance-consistency check, not
    # a fixed-value regression check. MAPE is expected to be large (>100%)
    # because real PLFS-anchored demand values are small in scale, making
    # percentage error an unstable metric here - MAE/RMSE are the more
    # honest metrics to read for this dataset.
    with open("ml/artifacts/metadata.json", "r", encoding="utf-8") as f:
        meta = json.load(f)
    eval_block = meta["overall_evaluation"]

    assert c_metrics["mae"] == eval_block["candidate_metrics"]["mae"]
    assert c_metrics["rmse"] == eval_block["candidate_metrics"]["rmse"]
    assert c_metrics["mape"] == eval_block["candidate_metrics"]["mape"]
    assert b_metrics["mae"] == eval_block["baseline_metrics"]["mae"]
    assert b_metrics["rmse"] == eval_block["baseline_metrics"]["rmse"]
    assert b_metrics["mape"] == eval_block["baseline_metrics"]["mape"]
    assert c_metrics["mae"] < b_metrics["mae"], "Candidate should beat naive baseline on MAE"

    assert data["total_evaluated_segments"] == eval_block["total_evaluated_segments"]
    assert data["candidate_losses_to_baseline_count"] == eval_block["candidate_losses_to_baseline_count"]
    assert data["excluded_segments_count"] == meta["sufficiency_gating"]["excluded_segments_count"]

    assert sum(data["grade_distribution"].values()) == 192
    assert data["grade_distribution"]["Insufficient"] == meta["sufficiency_gating"]["excluded_segments_count"]

    # Real evidence-grade-vs-backtest-error validation result must be present
    # and must not have been fabricated or omitted (ml/evaluate/backtest.py).
    validation = data["evidence_grade_validation"]
    assert validation is not None
    assert validation["status"] == "computed"
    assert validation["n_sufficient_graded_segments"] > 0
    assert "mean_abs_error_by_grade" in validation
    assert "hypothesis_low_evidence_means_higher_error_supported" in validation


# =========================================================================
# 7. Backtest Tests - real walk-forward replay, not fabricated
# =========================================================================
def test_get_backtest_sufficient_segment(client):
    response = client.get("/backtest/7411.01/MH")
    assert response.status_code == 200
    data = response.json()

    assert data["region"]["state_code"] == "MH"
    assert data["occupation"]["nco_code"] == 7411.01
    assert data["evidence_grade"] in ["A", "B", "C"]
    assert data["backtest_steps"] > 0
    assert len(data["points"]) == data["backtest_steps"]
    assert data["candidate_mean_abs_error"] is not None
    assert data["baseline_mean_abs_error"] is not None

    # Every point is a real walk-forward prediction: actual + both model
    # predictions + their real computed errors, in chronological order.
    prev_ym = None
    for pt in data["points"]:
        assert pt["baseline_abs_error"] == pytest.approx(abs(pt["actual"] - pt["baseline_prediction"]), abs=0.01)
        assert pt["candidate_abs_error"] == pytest.approx(abs(pt["actual"] - pt["candidate_prediction"]), abs=0.01)
        if prev_ym is not None:
            assert pt["year_month"] > prev_ym, "Backtest points must be in chronological order"
        prev_ym = pt["year_month"]


def test_get_backtest_insufficient_segment_has_no_points(client):
    state_code, nco_code = _find_insufficient_segment()
    response = client.get(f"/backtest/{nco_code}/{state_code}")
    assert response.status_code == 200
    data = response.json()

    assert data["evidence_grade"] == "Insufficient"
    assert data["backtest_steps"] == 0
    assert data["points"] == []
    assert data["candidate_mean_abs_error"] is None
    assert data["baseline_mean_abs_error"] is None


def test_get_backtest_unknown_segment_returns_404(client):
    response = client.get("/backtest/7411.01/NONEXISTENT_STATE")
    assert response.status_code == 404


# =========================================================================
# 8. Data Trust Centre - real, live-computed provenance, not hardcoded
# =========================================================================
def test_get_data_trust_manifest(client):
    response = client.get("/data-trust")
    assert response.status_code == 200
    data = response.json()

    assert len(data["sources"]) >= 5
    classifications = {s["classification"] for s in data["sources"]}
    assert "observed" in classifications
    assert "synthetic_demo" in classifications

    # Every source must be traceable: real ones carry a name real enough to
    # grep for in docs/data_integrity_audit.md; the synthetic one must be
    # explicitly labeled, never disguised as observed.
    plfs_source = next(s for s in data["sources"] if "PLFS" in s["name"])
    assert plfs_source["classification"] == "observed"
    assert "mospi.gov.in" in plfs_source["citation_url"]

    demand_source = next(s for s in data["sources"] if "Demand index" in s["name"])
    assert demand_source["classification"] == "synthetic_demo"

    # Panel quality must be computed live from the real panel file, not a
    # stale cached number - cross-check against the same live parquet read
    # used by every other endpoint's loader.
    quality = data["panel_quality"]
    assert quality["available"] is True
    assert quality["total_segments"] == 192
    assert quality["sufficient_segments"] + quality["excluded_segments"] == 192
    assert all(pct == 0.0 for pct in quality["missingness_pct"].values()), (
        "Panel columns should have zero missingness given rows are excluded "
        "rather than filled with nulls - a nonzero value here would be worth investigating."
    )


# =========================================================================
# 9. Skill Relationship Graph - real occupation<->skill edges only
# =========================================================================
def test_get_skill_graph(client):
    response = client.get("/skill-graph")
    assert response.status_code == 200
    data = response.json()

    assert data["occupation_count"] == 24
    assert data["skill_count"] > 0
    assert data["edge_count"] > 0
    assert len(data["nodes"]) == data["occupation_count"] + data["skill_count"]

    node_ids = {n["id"] for n in data["nodes"]}
    occupation_node_ids = {n["id"] for n in data["nodes"] if n["type"] == "occupation"}
    skill_node_ids = {n["id"] for n in data["nodes"] if n["type"] == "skill"}
    assert len(occupation_node_ids) == 24

    # Every edge must reference real nodes that exist in the node list, and
    # must connect an occupation to a skill (not skill-to-skill, which this
    # project does not have real data to support).
    for edge in data["edges"]:
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids
        assert edge["source"] in occupation_node_ids
        assert edge["target"] in skill_node_ids
        assert 0.0 <= edge["weight"] <= 1.0

    assert "co-occurrence" in data["data_note"] or "sparse" in data["data_note"]


# =========================================================================
# 10. Occupation Availability - powers the occupation explorer's real
#     "N observations" / "insufficient data" indicators per item
# =========================================================================
def test_get_occupations_availability(client):
    response = client.get("/occupations/availability?region=MH")
    assert response.status_code == 200
    data = response.json()

    assert len(data) == 24  # every occupation has a real evidence grade for this region
    sufficient = [o for o in data if o["is_sufficient"]]
    insufficient = [o for o in data if not o["is_sufficient"]]
    assert len(sufficient) + len(insufficient) == 24

    for item in sufficient:
        assert item["observations_count"] >= 12
        assert item["evidence_grade"] in ["A", "B", "C"]
    for item in insufficient:
        assert item["evidence_grade"] == "Insufficient"
        assert item["gating_reason"] is not None


def test_get_occupations_availability_unknown_region_returns_404(client):
    response = client.get("/occupations/availability?region=NONEXISTENT")
    assert response.status_code == 404
