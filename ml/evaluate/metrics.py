"""Evaluation metrics module for demand forecasting.

Computes MAE, RMSE, and MAPE metrics per segment and aggregated comparisons.
"""

from typing import Dict, List, Union
import numpy as np
import pandas as pd


def compute_metrics(
    actual: Union[List[float], np.ndarray, pd.Series],
    predicted: Union[List[float], np.ndarray, pd.Series],
    epsilon: float = 1e-4,
) -> Dict[str, float]:
    """Computes MAE, RMSE, and MAPE between actual and predicted vectors."""
    act = np.array(actual, dtype=float)
    pred = np.array(predicted, dtype=float)

    mask = ~np.isnan(act) & ~np.isnan(pred)
    act_clean = act[mask]
    pred_clean = pred[mask]

    if len(act_clean) == 0:
        return {"mae": np.nan, "rmse": np.nan, "mape": np.nan, "count": 0}

    errors = act_clean - pred_clean
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    # Prevent division by zero in MAPE
    denom = np.maximum(np.abs(act_clean), epsilon)
    mape = float(np.mean(np.abs(errors) / denom) * 100.0)

    return {
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "mape": round(mape, 2),
        "count": len(act_clean),
    }


def compare_models(
    actual: Union[List[float], np.ndarray, pd.Series],
    baseline_pred: Union[List[float], np.ndarray, pd.Series],
    candidate_pred: Union[List[float], np.ndarray, pd.Series],
) -> Dict[str, Dict[str, float]]:
    """Compares baseline vs candidate performance on identical test folds."""
    baseline_m = compute_metrics(actual, baseline_pred)
    candidate_m = compute_metrics(actual, candidate_pred)

    mae_diff = candidate_m["mae"] - baseline_m["mae"]
    rmse_diff = candidate_m["rmse"] - baseline_m["rmse"]

    return {
        "baseline": baseline_m,
        "candidate": candidate_m,
        "delta": {
            "mae_reduction": round(-mae_diff, 3),
            "rmse_reduction": round(-rmse_diff, 3),
            "candidate_wins_mae": bool(candidate_m["mae"] < baseline_m["mae"]),
        },
    }
