"""Deterministic Evidence Grading module.

Quantifies the statistical evidence behind each time series segment based on
data volume, cross-source signal agreement, and data recency.
Implements the exact formulation and thresholds defined in docs/product_blueprint.md.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from ml.train.candidate_models import is_statistically_sufficient, MIN_HISTORY_THRESHOLD


def compute_evidence_grade(
    series_length: int,
    demand_series: List[float],
    supply_series: List[float],
    latest_date: Optional[datetime] = None,
    max_vintage_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Computes deterministic evidence score (0-100) and assigns Grade A/B/C or Insufficient."""
    # 1. Step 2 Statistical-Sufficiency Gate Floor Check
    sufficient, reason = is_statistically_sufficient(demand_series)
    if not sufficient or series_length < MIN_HISTORY_THRESHOLD:
        return {
            "grade": "Insufficient",
            "score": 0.0,
            "sufficient": False,
            "gate_reason": reason,
            "components": {
                "volume_score": 0.0,
                "agreement_score": 0.0,
                "recency_score": 0.0,
            },
            "description": "insufficient history to forecast",
        }

    # 2. Volume & Continuity Score (Max 40 points)
    if series_length >= 24:
        s_volume = 40.0
    elif series_length >= 18:
        s_volume = 30.0
    elif series_length >= 12:
        s_volume = 20.0
    else:
        s_volume = 0.0

    # 3. Cross-Source Signal Agreement Score (Max 35 points)
    # Compare 6-month growth directions between postings demand and PLFS supply
    s_agreement = 20.0
    if len(demand_series) >= 6 and len(supply_series) >= 6:
        demand_change = demand_series[-1] - demand_series[-6]
        supply_change = supply_series[-1] - supply_series[-6]

        # Normalized percentage changes
        demand_pct = (demand_change / max(abs(demand_series[-6]), 1e-3)) * 100.0
        supply_pct = (supply_change / max(abs(supply_series[-6]), 1e-3)) * 100.0
        drift = abs(demand_pct - supply_pct)

        # Check directional concordance vs contradiction
        is_contradictory = (demand_change > 0.5 and supply_change < -0.5) or (demand_change < -0.5 and supply_change > 0.5)

        if is_contradictory:
            s_agreement = 5.0  # Sharp contradiction
        elif drift <= 10.0:
            s_agreement = 35.0  # Highly concordant
        elif drift <= 20.0:
            s_agreement = 20.0  # Mild divergence
        else:
            s_agreement = 10.0  # Significant divergence

    # 4. Data Recency Score (Max 25 points)
    s_recency = 25.0
    if latest_date is not None and max_vintage_date is not None:
        diff_days = (max_vintage_date - latest_date).days
        if diff_days <= 90:
            s_recency = 25.0
        elif diff_days <= 180:
            s_recency = 15.0
        else:
            s_recency = 5.0

    total_score = s_volume + s_agreement + s_recency

    # 5. Threshold Mapping
    if total_score >= 80.0:
        grade = "A"
        grade_desc = "High Evidence (Statistically robust, lowest backtest error)"
    elif total_score >= 60.0:
        grade = "B"
        grade_desc = "Moderate Evidence (Stable history, moderate convergence)"
    elif total_score >= 40.0:
        grade = "C"
        grade_desc = "Low Evidence (Divergent signals, higher backtest error)"
    else:
        grade = "Insufficient"
        grade_desc = "insufficient history to forecast"

    return {
        "grade": grade,
        "score": round(total_score, 1),
        "sufficient": True,
        "gate_reason": "passed",
        "components": {
            "volume_score": s_volume,
            "agreement_score": s_agreement,
            "recency_score": s_recency,
        },
        "description": grade_desc,
    }


def grade_panel_segments(panel_df: pd.DataFrame) -> pd.DataFrame:
    """Grades all distinct segments across a panel DataFrame."""
    max_vintage = panel_df["date"].max()
    results = []

    grouped = panel_df.groupby(["state_code", "nco_code", "occupation_title", "trade_category"])
    for (s_code, nco, occ_title, category), group in grouped:
        group_sorted = group.sort_values("date")
        n = len(group_sorted)
        demand_vals = group_sorted["demand_count"].tolist()
        supply_vals = group_sorted["plfs_supply_proxy"].tolist()
        latest_d = group_sorted["date"].max()

        grading = compute_evidence_grade(
            series_length=n,
            demand_series=demand_vals,
            supply_series=supply_vals,
            latest_date=latest_d,
            max_vintage_date=max_vintage,
        )

        results.append({
            "state_code": s_code,
            "nco_code": nco,
            "occupation_title": occ_title,
            "trade_category": category,
            "observations": n,
            "evidence_grade": grading["grade"],
            "evidence_score": grading["score"],
            "sufficient": grading["sufficient"],
            "gate_reason": grading["gate_reason"],
            "volume_score": grading["components"]["volume_score"],
            "agreement_score": grading["components"]["agreement_score"],
            "recency_score": grading["components"]["recency_score"],
        })

    return pd.DataFrame(results)
