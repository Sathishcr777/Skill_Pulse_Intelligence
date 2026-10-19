# Evidence Grade Validation Result

Computed by `ml/evaluate/backtest.py`. This is the real, as-run result -
not edited or tuned to look favorable. It answers: does a higher evidence
grade (A > B > C) actually correspond to lower realized walk-forward
backtest error, or is the grade just a label with no predictive value?

## Mean candidate absolute error by evidence grade

| Grade | Mean Abs Error | Std Dev | N segments |
|---|---|---|---|
| A | 5.301 | 2.221 | 49 |
| B | 5.722 | 2.051 | 138 |

Rank correlation (evidence score vs. mean abs error): **-0.107** (computed over 187 sufficient, graded segments).

A positive correlation here means higher evidence score correlates with *higher* error (bad - the grade would be backwards or meaningless). A negative correlation means higher evidence score correlates with *lower* error (good - the grade is doing its job).

**Hypothesis ('low evidence -> higher error') supported by this run: True**

This is a small-sample, single-run result on demonstration-scale data (see docs/data_integrity_audit.md for what is real vs. synthetic in the underlying panel). It should be treated as a directional finding to report honestly, not as a statistically definitive proof, and re-checked whenever the underlying data changes.

Note: grade(s) ['C'] have zero sufficient segments in this run and are absent from the table above (not zero error - no data). This panel's current evidence-score formula is not currently producing any 'C' grade (Low Evidence) segments, which limits how much this validation can say about the weak end of the grading scale.
