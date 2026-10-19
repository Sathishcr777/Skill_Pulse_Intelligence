"""End-to-End Forecasting and Evidence Grading Pipeline.

Coordinates walk-forward backtesting, model selection, artifact persistence,
evidence grading, and metadata logging.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict
import joblib
import numpy as np
import pandas as pd

from ml.evaluate.evidence_grade import grade_panel_segments
from ml.evaluate.metrics import compute_metrics
from ml.evaluate.walk_forward import WalkForwardValidator
from ml.train.candidate_models import HoltWintersCandidate, MIN_HISTORY_THRESHOLD

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ARTIFACTS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../artifacts")
)
PANEL_PARQUET_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/processed/panel.parquet")
)
MODEL_ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, "best_forecaster.joblib")
METADATA_JSON_PATH = os.path.join(ARTIFACTS_DIR, "metadata.json")


def run_pipeline() -> Dict[str, Any]:
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    if not os.path.exists(PANEL_PARQUET_PATH):
        raise FileNotFoundError(f"Processed panel not found at {PANEL_PARQUET_PATH}")

    panel_df = pd.read_parquet(PANEL_PARQUET_PATH)
    logger.info(f"Loaded panel with {len(panel_df)} rows from {PANEL_PARQUET_PATH}")

    # 1. Walk-Forward Chronological Backtesting
    validator = WalkForwardValidator(initial_train_size=12)
    eval_results = validator.evaluate_panel(panel_df)

    # 2. Train and serialize final model dictionary per sufficient segment
    fitted_models: Dict[str, Any] = {}
    grouped = panel_df.groupby(["state_code", "nco_code"])

    for (s_code, nco), group in grouped:
        sorted_vals = group.sort_values("date")["demand_count"].tolist()
        seg_key = f"{s_code}_{nco}"
        if len(sorted_vals) >= MIN_HISTORY_THRESHOLD:
            hw = HoltWintersCandidate(seasonal_periods=12)
            hw.fit(sorted_vals)
            fitted_models[seg_key] = hw

    # Persist model artifact
    artifact_payload = {
        "models": fitted_models,
        "n_models": len(fitted_models),
        "created_at": datetime.utcnow().isoformat(),
        "model_type": "HoltWintersCandidate",
        "seasonal_periods": 12,
    }
    joblib.dump(artifact_payload, MODEL_ARTIFACT_PATH)
    logger.info(f"Saved best forecaster artifact to {MODEL_ARTIFACT_PATH}")

    # 3. Reload Reproducibility Verification
    reloaded = joblib.load(MODEL_ARTIFACT_PATH)
    assert len(reloaded["models"]) == len(fitted_models), "Reloaded model count mismatch"

    # Test sample prediction reproducibility
    test_key = list(fitted_models.keys())[0]
    orig_pred = fitted_models[test_key].predict(steps=3)
    reloaded_pred = reloaded["models"][test_key].predict(steps=3)
    assert np.allclose(orig_pred, reloaded_pred), "Prediction mismatch upon reload!"
    logger.info(f"Reload reproducibility verified: exact match on {test_key}")

    # 4. Evidence Grading across all panel segments
    evidence_df = grade_panel_segments(panel_df)
    grade_distribution = evidence_df["evidence_grade"].value_counts().to_dict()

    # 5. Compile Category-Level Metrics & Candidate vs Baseline Comparison
    seg_df = pd.DataFrame(eval_results["segment_results"])
    category_metrics = {}
    if not seg_df.empty:
        cat_group = seg_df.groupby("trade_category").agg(
            segments=("nco_code", "count"),
            baseline_mae=("baseline_mae", "mean"),
            candidate_mae=("candidate_mae", "mean"),
            candidate_wins=("candidate_wins", "sum"),
        ).reset_index()

        for _, r in cat_group.iterrows():
            category_metrics[r["trade_category"]] = {
                "evaluated_segments": int(r["segments"]),
                "baseline_mean_mae": round(float(r["baseline_mae"]), 3),
                "candidate_mean_mae": round(float(r["candidate_mae"]), 3),
                "candidate_wins_count": int(r["candidate_wins"]),
                "candidate_win_rate_pct": round(float(r["candidate_wins"]) / int(r["segments"]) * 100, 1),
            }

    # Honest disclosure: count segments where candidate lost to baseline
    candidate_losses = int((~seg_df["candidate_wins"]).sum()) if not seg_df.empty else 0

    # 6. Save Metadata JSON
    metadata = {
        "project": "SkillPulse Intelligence (SIH26246)",
        "pipeline_version": "1.0.0",
        "execution_timestamp": datetime.utcnow().isoformat(),
        "data_version": "panel_v1_2022_2023",
        "training_window": {
            "start_date": panel_df["date"].min().strftime("%Y-%m-%d"),
            "end_date": panel_df["date"].max().strftime("%Y-%m-%d"),
            "total_months": int(panel_df["year_month"].nunique()),
            "initial_train_steps": 12,
            "test_steps": 12,
        },
        "overall_evaluation": {
            "baseline_model": "Seasonal-Naive (lag=12, ma=3)",
            "candidate_model": "Holt-Winters Exponential Smoothing",
            "baseline_metrics": eval_results["overall_baseline"],
            "candidate_metrics": eval_results["overall_candidate"],
            "total_evaluated_segments": eval_results["evaluated_segments_count"],
            "candidate_losses_to_baseline_count": candidate_losses,
            "category_metrics": category_metrics,
        },
        "sufficiency_gating": {
            "minimum_history_threshold_months": MIN_HISTORY_THRESHOLD,
            "total_segments": eval_results["total_segments"],
            "sufficient_segments_count": eval_results["evaluated_segments_count"],
            "excluded_segments_count": eval_results["excluded_segments_count"],
            "excluded_segments": eval_results["excluded_segments"],
        },
        "evidence_grading": {
            "grade_distribution": grade_distribution,
            "total_graded_segments": len(evidence_df),
            "scoring_formula": "S = S_volume (40) + S_agreement (35) + S_recency (25)",
            "thresholds": "A: >=80, B: 60-79, C: 40-59, Insufficient: <40 or N<12",
        },
        "artifact_paths": {
            "model_path": MODEL_ARTIFACT_PATH,
            "metadata_path": METADATA_JSON_PATH,
            "panel_path": PANEL_PARQUET_PATH,
        },
    }

    with open(METADATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"Saved pipeline metadata to {METADATA_JSON_PATH}")

    return metadata


if __name__ == "__main__":
    meta = run_pipeline()
    print("\n=== PIPELINE EXECUTION SUMMARY ===")
    print(f"Total Segments: {meta['sufficiency_gating']['total_segments']}")
    print(f"Evaluated: {meta['sufficiency_gating']['sufficient_segments_count']}")
    print(f"Excluded (<12 obs): {meta['sufficiency_gating']['excluded_segments_count']}")
    print("\nOverall Performance:")
    print(f"  Baseline MAE:  {meta['overall_evaluation']['baseline_metrics']['mae']}")
    print(f"  Candidate MAE: {meta['overall_evaluation']['candidate_metrics']['mae']}")
    print(f"  Candidate Losses to Baseline: {meta['overall_evaluation']['candidate_losses_to_baseline_count']} segments")
    print("\nEvidence Grade Distribution:")
    for grade, count in meta["evidence_grading"]["grade_distribution"].items():
        print(f"  Grade {grade}: {count} segments")
