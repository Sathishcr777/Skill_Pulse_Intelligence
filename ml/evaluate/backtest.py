"""Genuine chronological backtest: persists the per-step, per-segment
walk-forward predictions already computed by WalkForwardValidator (which
were previously only aggregated into metadata.json and discarded), and
validates whether evidence grades actually correlate with realized error.

This is the proof mechanism for SkillPulse Intelligence's core
differentiator (evidence-graded forecasting). The validation result is
reported honestly here regardless of which way it comes out - see
docs/evidence_grade_validation_result.md after running this module.
"""

import json
import logging
import os
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from ml.evaluate.evidence_grade import grade_panel_segments
from ml.evaluate.walk_forward import WalkForwardValidator

logger = logging.getLogger(__name__)

PROCESSED_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../data/processed"))
ARTIFACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../artifacts"))
BACKTEST_POINTS_PATH = os.path.join(PROCESSED_DIR, "backtest_points.parquet")
BACKTEST_SUMMARY_PATH = os.path.join(PROCESSED_DIR, "backtest_segment_summary.parquet")
VALIDATION_JSON_PATH = os.path.join(ARTIFACTS_DIR, "evidence_validation.json")
VALIDATION_DOC_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../docs/evidence_grade_validation_result.md")
)


def run_backtest(panel_df: pd.DataFrame) -> Dict[str, Any]:
    """Runs the walk-forward validator, persists every real per-step
    prediction (not just the aggregate), and joins the resulting per-segment
    realized error against each segment's evidence grade to test whether
    the grade actually predicts error."""
    validator = WalkForwardValidator(initial_train_size=12)

    point_rows: List[Dict[str, Any]] = []
    segment_rows: List[Dict[str, Any]] = []

    grouped = panel_df.groupby(["state_code", "nco_code", "occupation_title", "trade_category"])
    for (s_code, nco, occ_title, category), group in grouped:
        result = validator.evaluate_segment(group)

        if not result["sufficient"]:
            segment_rows.append({
                "state_code": s_code,
                "nco_code": nco,
                "occupation_title": occ_title,
                "trade_category": category,
                "sufficient": False,
                "observations": result["observations"],
                "backtest_steps": 0,
                "candidate_mean_abs_error": np.nan,
                "baseline_mean_abs_error": np.nan,
            })
            continue

        for date, ym_actual, base_pred, cand_pred in zip(
            result["dates"], result["actuals"], result["baseline_preds"], result["candidate_preds"]
        ):
            point_rows.append({
                "state_code": s_code,
                "nco_code": nco,
                "occupation_title": occ_title,
                "trade_category": category,
                "year_month": date,
                "actual": ym_actual,
                "baseline_prediction": base_pred,
                "candidate_prediction": cand_pred,
                "baseline_abs_error": abs(ym_actual - base_pred),
                "candidate_abs_error": abs(ym_actual - cand_pred),
            })

        cand_errors = [abs(a - p) for a, p in zip(result["actuals"], result["candidate_preds"])]
        base_errors = [abs(a - p) for a, p in zip(result["actuals"], result["baseline_preds"])]
        segment_rows.append({
            "state_code": s_code,
            "nco_code": nco,
            "occupation_title": occ_title,
            "trade_category": category,
            "sufficient": True,
            "observations": result["observations"],
            "backtest_steps": len(cand_errors),
            "candidate_mean_abs_error": float(np.mean(cand_errors)),
            "baseline_mean_abs_error": float(np.mean(base_errors)),
        })

    points_df = pd.DataFrame(point_rows)
    segments_df = pd.DataFrame(segment_rows)

    # Join against evidence grades computed on the SAME panel (the full,
    # non-held-out panel - this is intentional: the evidence grade is a
    # property of how much/how-recent/how-concordant the AVAILABLE data is,
    # computed the same way the live API would compute it for a planner
    # today; the backtest error is a property of out-of-sample walk-forward
    # prediction accuracy. We are testing whether one predicts the other.
    evidence_df = grade_panel_segments(panel_df)
    merged = segments_df.merge(
        evidence_df[["state_code", "nco_code", "occupation_title", "trade_category", "evidence_grade", "evidence_score"]],
        on=["state_code", "nco_code", "occupation_title", "trade_category"],
        how="left",
    )

    os.makedirs(PROCESSED_DIR, exist_ok=True)
    points_df.to_parquet(BACKTEST_POINTS_PATH, index=False)
    merged.to_parquet(BACKTEST_SUMMARY_PATH, index=False)
    logger.info(f"Saved {len(points_df)} backtest points and {len(merged)} segment summaries.")

    validation_result = _validate_evidence_grade_correlation(merged)
    _write_validation_doc(validation_result)

    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    with open(VALIDATION_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(validation_result, f, indent=2)
    logger.info(f"Saved evidence validation result to {VALIDATION_JSON_PATH}")

    return {
        "points_df": points_df,
        "segment_summary_df": merged,
        "validation_result": validation_result,
    }


def _validate_evidence_grade_correlation(merged: pd.DataFrame) -> Dict[str, Any]:
    """Computes the real relationship between evidence grade and realized
    backtest error. Reports it honestly whatever it shows - this function
    must never be tuned to produce a favorable-looking result."""
    sufficient = merged[merged["sufficient"] == True].dropna(subset=["candidate_mean_abs_error", "evidence_grade"])  # noqa: E712

    if sufficient.empty:
        return {"status": "no_data", "detail": "No sufficient, graded segments available to validate."}

    by_grade = sufficient.groupby("evidence_grade")["candidate_mean_abs_error"].agg(["mean", "std", "count"]).reset_index()
    by_grade_dict = {
        row["evidence_grade"]: {
            "mean_abs_error": round(float(row["mean"]), 3),
            "std_abs_error": round(float(row["std"]), 3) if pd.notnull(row["std"]) else None,
            "n_segments": int(row["count"]),
        }
        for _, row in by_grade.iterrows()
    }

    # Spearman rank correlation between evidence_score (continuous, higher =
    # more evidence) and candidate_mean_abs_error (lower = better). A
    # genuinely useful evidence grade should show a NEGATIVE correlation
    # (higher score -> lower error). Computed with scipy-free rank method to
    # avoid adding a new dependency for one statistic.
    scored = sufficient.dropna(subset=["evidence_score"])
    correlation = None
    if len(scored) >= 3:
        rank_score = scored["evidence_score"].rank()
        rank_error = scored["candidate_mean_abs_error"].rank()
        correlation = float(rank_score.corr(rank_error, method="pearson"))

    grade_order = ["A", "B", "C", "Insufficient"]
    present_grades = [g for g in grade_order if g in by_grade_dict]
    monotonic_decreasing = all(
        by_grade_dict[present_grades[i]]["mean_abs_error"] <= by_grade_dict[present_grades[i + 1]]["mean_abs_error"]
        for i in range(len(present_grades) - 1)
        if present_grades[i] != "Insufficient" and present_grades[i + 1] != "Insufficient"
    ) if len(present_grades) > 1 else None

    # Hypothesis: "low evidence -> higher error" == "high evidence score ->
    # low error" == a NEGATIVE correlation between score and error.
    hypothesis_supported = (
        correlation is not None and correlation < 0.0
    ) if correlation is not None else None

    return {
        "status": "computed",
        "mean_abs_error_by_grade": by_grade_dict,
        "spearman_like_rank_correlation_score_vs_error": round(correlation, 3) if correlation is not None else None,
        "grade_order_is_monotonic_increasing_error": monotonic_decreasing,
        "hypothesis_low_evidence_means_higher_error_supported": hypothesis_supported,
        "n_sufficient_graded_segments": int(len(sufficient)),
    }


def _write_validation_doc(result: Dict[str, Any]) -> None:
    lines = [
        "# Evidence Grade Validation Result\n",
        "Computed by `ml/evaluate/backtest.py`. This is the real, as-run result -",
        "not edited or tuned to look favorable. It answers: does a higher evidence",
        "grade (A > B > C) actually correspond to lower realized walk-forward",
        "backtest error, or is the grade just a label with no predictive value?\n",
        "## Mean candidate absolute error by evidence grade\n",
    ]
    if result["status"] != "computed":
        lines.append(f"**{result['status']}**: {result.get('detail', '')}\n")
    else:
        lines.append("| Grade | Mean Abs Error | Std Dev | N segments |")
        lines.append("|---|---|---|---|")
        for grade, stats in result["mean_abs_error_by_grade"].items():
            lines.append(
                f"| {grade} | {stats['mean_abs_error']} | {stats['std_abs_error']} | {stats['n_segments']} |"
            )
        lines.append("")
        lines.append(
            f"Rank correlation (evidence score vs. mean abs error): "
            f"**{result['spearman_like_rank_correlation_score_vs_error']}** "
            f"(computed over {result['n_sufficient_graded_segments']} sufficient, graded segments)."
        )
        lines.append(
            "\nA positive correlation here means higher evidence score correlates with "
            "*higher* error (bad - the grade would be backwards or meaningless). A "
            "negative correlation means higher evidence score correlates with *lower* "
            "error (good - the grade is doing its job)."
        )
        lines.append(
            f"\n**Hypothesis ('low evidence -> higher error') supported by this run: "
            f"{result['hypothesis_low_evidence_means_higher_error_supported']}**"
        )
        lines.append(
            "\nThis is a small-sample, single-run result on demonstration-scale data "
            "(see docs/data_integrity_audit.md for what is real vs. synthetic in the "
            "underlying panel). It should be treated as a directional finding to "
            "report honestly, not as a statistically definitive proof, and re-checked "
            "whenever the underlying data changes."
        )
        present = set(result["mean_abs_error_by_grade"].keys())
        missing = {"A", "B", "C"} - present
        if missing:
            lines.append(
                f"\nNote: grade(s) {sorted(missing)} have zero sufficient segments in this "
                "run and are absent from the table above (not zero error - no data). This "
                "panel's current evidence-score formula is not currently producing any "
                "'C' grade (Low Evidence) segments, which limits how much this validation "
                "can say about the weak end of the grading scale."
            )

    os.makedirs(os.path.dirname(VALIDATION_DOC_PATH), exist_ok=True)
    with open(VALIDATION_DOC_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    logger.info(f"Wrote evidence grade validation result to {VALIDATION_DOC_PATH}")


if __name__ == "__main__":
    import sys

    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    panel_path = os.path.join(PROCESSED_DIR, "panel.parquet")
    df = pd.read_parquet(panel_path)
    out = run_backtest(df)
    print("\n=== BACKTEST SUMMARY ===")
    print(f"Backtest points: {len(out['points_df'])}")
    print(f"Segments summarized: {len(out['segment_summary_df'])}")
    print("\nValidation result:")
    for k, v in out["validation_result"].items():
        print(f"  {k}: {v}")
