"""Automated integration tests for FastAPI API endpoints against a separate seeded test database.

Tests all route behaviors, database queries, Pydantic validation (404 for invalid entities,
422 for invalid date ranges), sufficiency gating, and model evaluation metrics.
"""

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

    # Forecast series: 6 horizon steps (2024-01 to 2024-06)
    assert len(data["forecasts"]) == 6
    for fc in data["forecasts"]:
        assert fc["is_sufficient"] is True
        assert fc["predicted_demand"] is not None
        assert fc["predicted_demand"] > 0
        assert fc["lower_bound"] <= fc["predicted_demand"] <= fc["upper_bound"]


def test_get_forecast_insufficient_segment_hard_gated(client):
    # Mason (7112.01) in Delhi (DL) - 4 obs < 12 threshold
    response = client.get("/forecast/7112.01/DL")
    assert response.status_code == 200
    data = response.json()

    assert data["region"]["state_code"] == "DL"
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
    assert data["sufficient_segments"] == 188
    assert data["excluded_segments"] == 4
    assert data["latest_data_vintage"] == "2023-12-31"

    # Evidence grade distribution
    assert data["grade_distribution"]["A"] == 76
    assert data["grade_distribution"]["B"] == 112
    assert data["grade_distribution"]["Insufficient"] == 4

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

    # Assert real metrics from metadata.json
    assert c_metrics["mae"] == 11.767
    assert c_metrics["rmse"] == 14.735
    assert c_metrics["mape"] == 10.7
    assert b_metrics["mae"] == 16.047
    assert b_metrics["rmse"] == 20.233
    assert b_metrics["mape"] == 14.03

    assert data["total_evaluated_segments"] == 188
    assert data["candidate_losses_to_baseline_count"] == 64
    assert data["excluded_segments_count"] == 4

    assert data["grade_distribution"]["A"] == 76
    assert data["grade_distribution"]["B"] == 112
    assert data["grade_distribution"]["Insufficient"] == 4
