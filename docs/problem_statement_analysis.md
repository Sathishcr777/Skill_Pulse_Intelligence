# Problem Statement Analysis — SIH26246

Official title: AI-Enabled Labour Market Intelligence and Skill
Demand-Supply Forecasting Engine (Ministry of Skill Development and
Entrepreneurship).

IMPORTANT: the literal official PS text (portal PDF) has not been
independently confirmed — it sits behind a login. The requirements below
were triangulated from independent public write-ups of teams solving the
same PS. Re-check against the official portal if access becomes available.

## Confirmed-by-triangulation requirements
- Fuse fragmented labour-market signals (PLFS, NCO-coded job postings,
  industry hiring signals, e-Shram) into one system.
- Forecast skill/occupation demand at district x trade granularity.
- Classify demand-supply mismatches (shortage / oversupply) and explain
  WHY (skill mismatch, geography, wage, eligibility, timing, weak evidence).
- Recommend an action and show a counterfactual ("what happens if
  unchanged").
- Backtest / replay forecasts against actual historical outcomes.
- Primary users: MSDE, state skill planners, district officers,
  NCVET / Sector Skill Council analysts, training-capacity planners.

## Explicitly NOT confirmed — treat as our own product decisions
- Individual/citizen-facing skill-gap or career-recommendation features.
- Any specific named dataset or API as mandatory.
- Any real-time/live data requirement.

## Core differentiator (do not dilute this across unrelated features)
Evidence-graded forecasting: forecast only where statistically justified,
explain the evidence behind each prediction, and validate forecast
reliability against real historical outcomes. Proof point: cells graded
"low evidence" must show measurably higher real backtest error than cells
graded "high evidence" — a falsifiable claim, not a marketing label.

## Primary personas, in priority order
1. District/state skill planner — decides where to shift training seats.
2. NCVET/SSC analyst — needs to trust the model before policy use.
3. (Secondary, optional, lower priority) individual trainee/jobseeker.

## Five priority features — build these, not a longer list
1. Evidence-graded demand forecast, with statistical-sufficiency gating.
2. Explainable gap analysis: demand forecast vs a REAL supply proxy —
   never invented capacity data.
3. Emerging skill-combination detection ("Opportunity Radar").
4. Backtest + evidence-grade validator — proves the core differentiator.
5. Planner decision workspace UI tying 1-4 together, with a scenario
   calculator where the PLANNER types in their own capacity number.

## Explicitly excluded from this build
Chatbot/conversational interface, deep-learning forecasting models,
fabricated official capacity/seat data presented as real, full national
district-level coverage, real ASEEM/e-Shram integration, multi-role auth,
mobile app, personalised learning roadmap / career recommendation modules
(valid future work, not this build).
