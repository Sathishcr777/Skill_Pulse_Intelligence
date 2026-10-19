"""Baseline time series forecasting models.

Provides Seasonal-Naive and Rolling Moving-Average baselines for demand series benchmarking.
"""

from typing import List, Optional, Union
import numpy as np
import pandas as pd


class SeasonalNaiveBaseline:
    """Seasonal Naive / Moving Average baseline forecaster.
    
    If series has >= seasonal_period steps, predicts value from same season last year (t - s).
    Otherwise falls back to moving average of the last k observations.
    """

    def __init__(self, seasonal_period: int = 12, window_size: int = 3):
        self.seasonal_period = seasonal_period
        self.window_size = window_size
        self.history: List[float] = []

    def fit(self, y: Union[List[float], np.ndarray, pd.Series]) -> "SeasonalNaiveBaseline":
        if isinstance(y, (pd.Series, np.ndarray)):
            self.history = [float(v) for v in y if not np.isnan(v)]
        else:
            self.history = [float(v) for v in y if v is not None and not np.isnan(v)]
        return self

    def predict(self, steps: int = 1) -> np.ndarray:
        if not self.history:
            return np.full(steps, np.nan)

        predictions = []
        hist_copy = list(self.history)

        for _ in range(steps):
            n = len(hist_copy)
            if n >= self.seasonal_period:
                # Seasonal lag: value from seasonal_period ago
                val = hist_copy[-self.seasonal_period]
            else:
                # Moving average of available history (up to window_size)
                k = min(n, self.window_size)
                val = float(np.mean(hist_copy[-k:]))
            predictions.append(val)
            hist_copy.append(val)

        return np.array(predictions)


class MovingAverageBaseline:
    """Rolling moving average baseline forecaster."""

    def __init__(self, window_size: int = 3):
        self.window_size = window_size
        self.history: List[float] = []

    def fit(self, y: Union[List[float], np.ndarray, pd.Series]) -> "MovingAverageBaseline":
        if isinstance(y, (pd.Series, np.ndarray)):
            self.history = [float(v) for v in y if not np.isnan(v)]
        else:
            self.history = [float(v) for v in y if v is not None and not np.isnan(v)]
        return self

    def predict(self, steps: int = 1) -> np.ndarray:
        if not self.history:
            return np.full(steps, np.nan)

        predictions = []
        hist_copy = list(self.history)
        for _ in range(steps):
            k = min(len(hist_copy), self.window_size)
            val = float(np.mean(hist_copy[-k:]))
            predictions.append(val)
            hist_copy.append(val)
        return np.array(predictions)
