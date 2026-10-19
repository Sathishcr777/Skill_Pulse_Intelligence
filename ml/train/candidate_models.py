"""Candidate forecasting models for SkillPulse Intelligence.

Includes Holt-Winters Exponential Smoothing per segment and LightGBM pooled
panel feature regressor, gated by the concrete minimum-history threshold (N >= 12).
"""

import logging
from typing import Any, Dict, List, Optional, Tuple, Union
import lightgbm as lgb
import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

logger = logging.getLogger(__name__)

# Minimum history threshold defined in docs/product_blueprint.md
MIN_HISTORY_THRESHOLD = 12


def is_statistically_sufficient(series: Union[List[float], np.ndarray, pd.Series]) -> Tuple[bool, str]:
    """Applies the statistical-sufficiency gate to a time series."""
    vals = [float(v) for v in series if not np.isnan(v)]
    if len(vals) < MIN_HISTORY_THRESHOLD:
        return False, f"insufficient history to forecast ({len(vals)} obs < {MIN_HISTORY_THRESHOLD} required)"
    if np.std(vals) <= 1e-6:
        return False, "insufficient history to forecast (series variance is zero)"
    return True, "sufficient"


class HoltWintersCandidate:
    """Holt-Winters Exponential Smoothing candidate model for a single segment series."""

    def __init__(self, seasonal_periods: int = 12):
        self.seasonal_periods = seasonal_periods
        self.fitted_model_ = None
        self.history_: List[float] = []

    def fit(self, y: Union[List[float], np.ndarray, pd.Series]) -> "HoltWintersCandidate":
        vals = [float(v) for v in y if not np.isnan(v)]
        sufficient, reason = is_statistically_sufficient(vals)
        if not sufficient:
            raise ValueError(f"Sufficiency Gate Failed: {reason}")

        self.history_ = vals
        n = len(vals)

        try:
            # If at least 2 full cycles (24 periods), use full additive trend + season
            if n >= 2 * self.seasonal_periods:
                hw = ExponentialSmoothing(
                    vals,
                    trend="add",
                    seasonal="add",
                    seasonal_periods=self.seasonal_periods,
                    initialization_method="heuristic",
                )
            else:
                # Additive trend without seasonal full cycle
                hw = ExponentialSmoothing(
                    vals,
                    trend="add",
                    seasonal=None,
                    initialization_method="heuristic",
                )
            self.fitted_model_ = hw.fit()
        except Exception as e:
            # Fallback to simple exponential smoothing
            logger.debug(f"HoltWinters fit fallback: {e}")
            hw = ExponentialSmoothing(vals, initialization_method="heuristic")
            self.fitted_model_ = hw.fit()

        return self

    def predict(self, steps: int = 1) -> np.ndarray:
        if self.fitted_model_ is None:
            raise RuntimeError("Model must be fitted before predict")
        preds = self.fitted_model_.forecast(steps)
        # Ensure non-negative demand predictions
        return np.maximum(0.0, np.array(preds))


class LightGBMPanelForecaster:
    """Pooled LightGBM Panel Regressor across all state x occupation series.
    
    Generates time-lag and rolling window features for tabular regression.
    """

    def __init__(self, n_estimators: int = 100, learning_rate: float = 0.05):
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.model_ = lgb.LGBMRegressor(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=5,
            num_leaves=31,
            random_state=42,
            verbosity=-1,
        )
        self.feature_names_: List[str] = []

    @staticmethod
    def create_features(df: pd.DataFrame) -> pd.DataFrame:
        """Constructs lag and rolling statistics features per segment."""
        data = df.sort_values(["state_code", "nco_code", "date"]).copy()

        # Lag features
        for lag in [1, 2, 3]:
            data[f"demand_lag_{lag}"] = data.groupby(["state_code", "nco_code"])["demand_count"].shift(lag)

        # Rolling statistics
        data["rolling_mean_3"] = (
            data.groupby(["state_code", "nco_code"])["demand_lag_1"]
            .transform(lambda x: x.rolling(3, min_periods=1).mean())
        )
        data["rolling_std_3"] = (
            data.groupby(["state_code", "nco_code"])["demand_lag_1"]
            .transform(lambda x: x.rolling(3, min_periods=1).std().fillna(0.0))
        )

        # Categorical frequency / target proxies
        data["month_num"] = data["date"].dt.month
        data["quarter"] = data["date"].dt.quarter

        return data

    def fit(self, panel_df: pd.DataFrame) -> "LightGBMPanelForecaster":
        feat_df = self.create_features(panel_df)
        clean_df = feat_df.dropna(subset=["demand_lag_1", "demand_count"])

        self.feature_names_ = [
            "demand_lag_1",
            "demand_lag_2",
            "demand_lag_3",
            "rolling_mean_3",
            "rolling_std_3",
            "plfs_supply_proxy",
            "month_num",
            "quarter",
        ]

        # Fill any remaining lag NaNs with mean
        X = clean_df[self.feature_names_].fillna(clean_df["demand_count"].mean())
        y = clean_df["demand_count"]

        self.model_.fit(X, y)
        return self

    def predict_features(self, X: pd.DataFrame) -> np.ndarray:
        clean_X = X[self.feature_names_].copy()
        clean_X = clean_X.fillna(0.0)
        preds = self.model_.predict(clean_X)
        return np.maximum(0.0, preds)
