"""Validation tests for the verified real PLFS Table 27 supply-proxy data.

These tests exist specifically to prevent regression back to fabricated
supply-proxy figures. See docs/data_integrity_audit.md for the full source
citation and methodology.
"""

import os
import pandas as pd
import pytest

from ml.features.build_panel import (
    PLFS_TABLE27_RURAL_URBAN_BY_GENDER,
    OCCUPATION_TO_NIC_SECTION,
    get_real_supply_share,
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
PANEL_PATH = os.path.join(PROJECT_ROOT, "data/processed/panel.parquet")
NCO_PATH = os.path.join(PROJECT_ROOT, "data/reference/nco_subset.csv")


def test_all_priority_states_covered():
    """All 8 priority states must have verified Table 27 figures."""
    expected_states = {"MH", "KA", "TN", "GJ", "UP", "HR", "DL", "TG"}
    assert set(PLFS_TABLE27_RURAL_URBAN_BY_GENDER.keys()) == expected_states


def test_all_nco_occupations_have_a_nic_section_mapping():
    """Every occupation in the reference taxonomy must resolve to a real
    NIC-2008 section via our documented crosswalk - no silent gaps."""
    nco_df = pd.read_csv(NCO_PATH)
    for code in nco_df["nco_2015_code"]:
        code_2dec = round(float(code), 2)
        assert code_2dec in OCCUPATION_TO_NIC_SECTION, f"nco_code {code_2dec} missing from OCCUPATION_TO_NIC_SECTION"


def test_known_figure_maharashtra_fitter_general():
    """Spot-check: Maharashtra, Fitter General (nco 7233.01 -> NIC section C).
    Source: PLFS Annual Report 2023-24, Table 27, rural+urban: Male C=10.59,
    Female C=12.66 -> mean = 11.625 (rounds to 11.62 or 11.63)."""
    result = get_real_supply_share("MH", 7233.01)
    assert result["is_verified"] is True
    assert result["source"] == "verified_real"
    assert result["value"] == pytest.approx(11.625, abs=0.01)
    assert "Table 27" in result["citation"]
    assert "mospi.gov.in" in result["citation"]


def test_known_figure_delhi_information_communication():
    """Spot-check: Delhi, Software Developer (nco 2512.01 -> NIC section J).
    Source: Table 27, rural+urban: Male J=3.46, Female J=3.06 -> mean=3.26."""
    result = get_real_supply_share("DL", 2512.01)
    assert result["is_verified"] is True
    assert result["value"] == pytest.approx(3.26, abs=0.01)


def test_unverified_combination_returns_unavailable_not_fabricated():
    """A state/section combination outside our verified dataset must be
    marked unavailable, never silently filled with an invented number."""
    result = get_real_supply_share("XX", 7233.01)
    assert result["is_verified"] is False
    assert result["value"] is None
    assert result["source"] == "unavailable"


def test_panel_supply_values_are_flat_across_months_per_segment():
    """PLFS Table 27 is an annual, not monthly, statistic. The supply proxy
    must therefore be held constant across all months for a given
    state/occupation - no synthetic month-to-month growth may be applied."""
    if not os.path.exists(PANEL_PATH):
        pytest.skip("panel.parquet not built yet")
    df = pd.read_parquet(PANEL_PATH)
    sample = df[(df["state_code"] == "MH") & (df["occupation_title"] == "Fitter General")]
    assert sample["plfs_supply_proxy"].nunique() == 1


def test_panel_provenance_columns_present_and_correct():
    """Every panel row must be tagged with its real provenance so the API
    and UI can distinguish verified data from synthetic demo data."""
    if not os.path.exists(PANEL_PATH):
        pytest.skip("panel.parquet not built yet")
    df = pd.read_parquet(PANEL_PATH)
    assert set(df["supply_data_source"].unique()) == {"verified_real"}
    assert set(df["demand_data_source"].unique()) == {"synthetic_demo"}
    assert df["supply_source_citation"].notna().all()
    assert df["supply_source_citation"].str.contains("Table 27").all()
