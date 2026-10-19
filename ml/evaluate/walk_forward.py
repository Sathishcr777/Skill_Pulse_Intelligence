"""Chronological expanding-window walk-forward validation module.

Strict time-aware backtesting with zero future leakage. Gated by statistical sufficiency.
"""

import logging
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd

from ml.evaluate.metrics import compute_metrics
from ml.train.baseline import SeasonalNaiveBaseline
from ml.train.candidate_models import HoltWintersCandidate, is_statistically_sufficient, MIN_HISTORY_THRESHOLD

logger = logging.getLogger(__name__)


class WalkForwardValidator:
    """Performs chronological walk-forward validation across all state x occupation series."""

    def __init__(self, initial_train_size: int = 12):
        self.initial_train_size = initial_train_size

    def evaluate_segment(self, segment_df: pd.DataFrame) -> Dict[str, Any]:
        """Evaluates baseline vs candidate on an individual segment series."""
        sorted_df = segment_df.sort_values("date").reset_index(drop=True)
        vals = sorted_df["demand_count"].tolist()
        n = len(vals)

        sufficient, reason = is_statistically_sufficient(vals)
        if not sufficient or n <= self.initial_train_size:
            return {
                "sufficient": False,
                "reason": reason,
                "observations": n,
                "baseline_metrics": {"mae": np.nan, "rmse": np.nan, "mape": np.nan},
                "candidate_metrics": {"mae": np.nan, "rmse": np.nan, "mape": np.nan},
                "predictions": [],
            }

        baseline_preds = []
        candidate_preds = []
        actuals = []
        dates = []

        # Expanding window loop
        for t in range(self.initial_train_size, n):
            train_y = vals[:t]
            test_val = vals[t]
            test_date = sorted_df.loc[t, "year_month"]

            # 1. Baseline prediction (Seasonal Naive)
            base_model = SeasonalNaiveBaseline(seasonal_period=12, window_size=3)
            base_model.fit(train_y)
            pred_base = float(base_model.predict(steps=1)[0])

            # 2. Candidate prediction (Holt-Winters)
            cand_model = HoltWintersCandidate(seasonal_periods=12)
            try:
                cand_model.fit(train_y)
                pred_cand = float(cand_model.predict(steps=1)[0])
            except Exception as e:
                # If candidate fails to converge on this step, fallback to naive
                logger.debug(f"Candidate step failure at step {t}: {e}")
                pred_cand = pred_base

            baseline_preds.append(pred_base)
            candidate_preds.append(pred_cand)
            actuals.append(test_val)
            dates.append(test_date)

        base_metrics = compute_metrics(actuals, baseline_preds)
        cand_metrics = compute_metrics(actuals, candidate_preds)

        return {
            "sufficient": True,
            "reason": "passed",
            "observations": n,
            "test_steps": len(actuals),
            "baseline_metrics": base_metrics,
            "candidate_metrics": cand_metrics,
            "actuals": actuals,
            "baseline_preds": baseline_preds,
            "candidate_preds": candidate_preds,
            "dates": dates,
        }

    def evaluate_panel(self, panel_df: pd.DataFrame) -> Dict[str, Any]:
        """Runs walk-forward backtesting across all segments in the panel."""
        segment_results = []
        excluded_segments = []

        all_actuals = []
        all_baseline_preds = []
        all_candidate_preds = []

        grouped = panel_df.groupby(["state_code", "nco_code", "occupation_title", "trade_category"])

        for (s_code, nco, occ_title, category), group in grouped:
            res = self.evaluate_segment(group)
            seg_info = {
                "state_code": s_code,
                "nco_code": nco,
                "occupation_title": occ_title,
                "trade_category": category,
                "observations": res["observations"],
                "sufficient": res["sufficient"],
            }

            if not res["sufficient"]:
                seg_info["exclusion_reason"] = res["reason"]
                excluded_segments.append(seg_info)
            else:
                seg_info["baseline_mae"] = res["baseline_metrics"]["mae"]
                seg_info["baseline_rmse"] = res["baseline_metrics"]["rmse"]
                seg_info["baseline_mape"] = res["baseline_metrics"]["mape"]
                seg_info["candidate_mae"] = res["candidate_metrics"]["mae"]
                seg_info["candidate_rmse"] = res["candidate_metrics"]["rmse"]
                seg_info["candidate_mape"] = res["candidate_metrics"]["mape"]
                seg_info["candidate_wins"] = bool(res["candidate_metrics"]["mae"] < res["baseline_metrics"]["mae"])
                segment_results.append(seg_info)

                all_actuals.extend(res["actuals"])
                all_baseline_preds.extend(res["baseline_preds"])
                all_candidate_preds.extend(res["candidate_preds"])

        overall_baseline = compute_metrics(all_actuals, all_baseline_preds)
        overall_candidate = compute_metrics(all_actuals, all_candidate_preds)

        return {
            "total_segments": len(grouped),
            "evaluated_segments_count": len(segment_results),
            "excluded_segments_count": len(excluded_segments),
            "overall_baseline": overall_baseline,
            "overall_candidate": overall_candidate,
            "segment_results": segment_results,
            "excluded_segments": excluded_segments,
        }
