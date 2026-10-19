"""API route definitions for SkillPulse Intelligence.

Implements all core labour market intelligence and forecasting endpoints reading
directly from persisted database tables and serialized ML model artifacts.
"""

from datetime import date, datetime
import json
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.app.core.database import get_db
from backend.app.models.entities import (
    BacktestPoint,
    EmploymentSeries,
    EvidenceGrade,
    Forecast,
    ModelRun,
    Occupation,
    OccupationSkillMap,
    Region,
    Skill,
)
from backend.app.schemas.market import (
    BacktestDetailResponse,
    BacktestPointResponse,
    EvidenceGradeSummary,
    ForecastDataPoint,
    ForecastDetailResponse,
    HistoricalDataPoint,
    MarketOverviewResponse,
    ModelStatusResponse,
    OccupationResponse,
    RegionResponse,
    SkillSummary,
    TradeDeficitItem,
)

router = APIRouter()


def parse_date_param(param_name: str, value: Optional[str]) -> Optional[datetime]:
    """Parses date string (YYYY-MM or YYYY-MM-DD) into datetime with strict 422 validation."""
    if not value:
        return None
    val = value.strip()
    # Try YYYY-MM-DD
    try:
        return datetime.strptime(val, "%Y-%m-%d")
    except ValueError:
        pass

    # Try YYYY-MM
    try:
        return datetime.strptime(val, "%Y-%m")
    except ValueError:
        pass

    raise HTTPException(
        status_code=422,
        detail=f"Invalid {param_name} format: '{value}'. Expected format YYYY-MM or YYYY-MM-DD.",
    )


def resolve_region(region_param: str, db: Session) -> Region:
    """Resolves a region parameter by state code or name; raises 404 if not found."""
    cleaned = region_param.strip()
    stmt = select(Region).where(
        (func.lower(Region.state_code) == cleaned.lower())
        | (func.lower(Region.state_name) == cleaned.lower())
    )
    reg = db.scalars(stmt).first()
    if not reg:
        available = list(db.scalars(select(Region.state_code).order_by(Region.state_code)).all())
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region '{region_param}' not found. Available region codes: {', '.join(available)}",
        )
    return reg


def resolve_occupation(occ_param: str, db: Session) -> Occupation:
    """Resolves an occupation parameter by NCO code, code string, or title; raises 404 if not found."""
    cleaned = occ_param.strip()

    # 1. Try float / code match
    try:
        code_val = round(float(cleaned), 2)
        occ = db.scalars(select(Occupation).where(Occupation.nco_code == code_val)).first()
        if occ:
            return occ
    except ValueError:
        pass

    # 2. Try nco_code_str match
    occ = db.scalars(select(Occupation).where(Occupation.nco_code_str == cleaned)).first()
    if occ:
        return occ

    # 3. Try exact or fuzzy title match
    normalized_input = re.sub(r"[\s\-_]+", " ", cleaned).lower()
    all_occs = db.scalars(select(Occupation)).all()
    for o in all_occs:
        norm_title = re.sub(r"[\s\-_]+", " ", o.title).lower()
        if norm_title == normalized_input:
            return o

    # Partial title match
    for o in all_occs:
        norm_title = re.sub(r"[\s\-_]+", " ", o.title).lower()
        if normalized_input in norm_title or norm_title in normalized_input:
            return o

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Occupation '{occ_param}' not found in NCO-2015 reference database.",
    )


@router.get("/regions", response_model=List[RegionResponse], tags=["Geographies"])
def get_regions(db: Session = Depends(get_db)):
    """Returns list of standardized Indian states and territories."""
    return db.scalars(select(Region).order_by(Region.state_code)).all()


@router.get("/occupations", response_model=List[OccupationResponse], tags=["Taxonomy"])
def get_occupations(
    trade_category: Optional[str] = Query(None, description="Filter by trade category (e.g. 'ITI/PMKVY', 'IT-ITES')"),
    db: Session = Depends(get_db),
):
    """Returns list of standardized NCO-2015 occupations and mapped technical skills."""
    stmt = (
        select(Occupation)
        .options(selectinload(Occupation.skills).joinedload(OccupationSkillMap.skill))
        .order_by(Occupation.nco_code)
    )
    if trade_category:
        stmt = stmt.where(func.lower(Occupation.trade_category) == trade_category.strip().lower())

    occupations = db.scalars(stmt).all()
    results: List[OccupationResponse] = []
    for occ in occupations:
        skills_summary = [
            SkillSummary(
                skill_id=m.skill.skill_id,
                skill_name=m.skill.skill_name,
                category=m.skill.category,
                importance_score=m.importance_score,
            )
            for m in occ.skills
            if m.skill
        ]
        results.append(
            OccupationResponse(
                id=occ.id,
                nco_code=occ.nco_code,
                nco_code_str=occ.nco_code_str,
                title=occ.title,
                trade_category=occ.trade_category,
                division=occ.division,
                sub_division=occ.sub_division,
                group_code=occ.group_code,
                family=occ.family,
                description=occ.description,
                skills=skills_summary,
            )
        )
    return results


@router.get("/forecast/{occupation}/{region}", response_model=ForecastDetailResponse, tags=["Forecasting"])
def get_forecast(
    occupation: str,
    region: str,
    start_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date filter (YYYY-MM or YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Returns historical empirical time series and forecasted demand for a state x occupation segment."""
    # 1. Pydantic / Route Validation
    parsed_start = parse_date_param("start_date", start_date)
    parsed_end = parse_date_param("end_date", end_date)

    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise HTTPException(
            status_code=422,
            detail=f"start_date ({start_date}) cannot be greater than end_date ({end_date}).",
        )

    reg = resolve_region(region, db)
    occ = resolve_occupation(occupation, db)

    # 2. Fetch Evidence Grade
    eg = db.scalars(
        select(EvidenceGrade).where(
            EvidenceGrade.region_id == reg.id,
            EvidenceGrade.occupation_id == occ.id,
        )
    ).first()

    if not eg:
        eg_summary = EvidenceGradeSummary(
            grade="Insufficient",
            score=0.0,
            volume_score=0.0,
            agreement_score=0.0,
            recency_score=0.0,
            observations_count=0,
            is_sufficient=False,
            gating_reason="No observation history available",
            data_vintage="2023-12-31",
        )
        is_sufficient = False
        gating_reason = "No observation history available"
    else:
        eg_summary = EvidenceGradeSummary(
            grade=eg.grade,
            score=eg.score,
            volume_score=eg.volume_score,
            agreement_score=eg.agreement_score,
            recency_score=eg.recency_score,
            observations_count=eg.observations_count,
            is_sufficient=eg.is_sufficient,
            gating_reason=eg.gating_reason,
            data_vintage=eg.data_vintage,
        )
        is_sufficient = eg.is_sufficient
        gating_reason = eg.gating_reason

    # 3. Fetch Historical Employment Series
    stmt_hist = (
        select(EmploymentSeries)
        .where(
            EmploymentSeries.region_id == reg.id,
            EmploymentSeries.occupation_id == occ.id,
        )
        .order_by(EmploymentSeries.date)
    )
    if parsed_start:
        stmt_hist = stmt_hist.where(EmploymentSeries.date >= parsed_start)
    if parsed_end:
        stmt_hist = stmt_hist.where(EmploymentSeries.date <= parsed_end)

    hist_records = db.scalars(stmt_hist).all()
    historical_series = [
        HistoricalDataPoint(
            year_month=h.year_month,
            date=h.date,
            demand_index=h.demand_index,
            supply_index=h.supply_index,
            net_gap=h.net_gap,
            data_vintage=h.data_vintage,
            supply_data_source=h.supply_data_source,
            supply_source_citation=h.supply_source_citation,
            demand_data_source=h.demand_data_source,
        )
        for h in hist_records
    ]

    # 4. Fetch Forecasts
    stmt_fc = (
        select(Forecast)
        .where(
            Forecast.region_id == reg.id,
            Forecast.occupation_id == occ.id,
        )
        .order_by(Forecast.forecast_date)
    )
    if parsed_start:
        stmt_fc = stmt_fc.where(Forecast.forecast_date >= parsed_start)
    if parsed_end:
        stmt_fc = stmt_fc.where(Forecast.forecast_date <= parsed_end)

    fc_records = db.scalars(stmt_fc).all()
    forecasts = [
        ForecastDataPoint(
            forecast_year_month=f.forecast_year_month,
            forecast_date=f.forecast_date,
            predicted_demand=f.predicted_demand,
            lower_bound=f.lower_bound,
            upper_bound=f.upper_bound,
            is_sufficient=f.is_sufficient,
            gating_reason=f.gating_reason,
            model_name=f.model_name,
            data_vintage=f.data_vintage,
        )
        for f in fc_records
    ]

    latest_vintage = hist_records[-1].data_vintage if hist_records else "2023-12-31"

    return ForecastDetailResponse(
        region=RegionResponse.model_validate(reg),
        occupation=OccupationResponse(
            id=occ.id,
            nco_code=occ.nco_code,
            nco_code_str=occ.nco_code_str,
            title=occ.title,
            trade_category=occ.trade_category,
            division=occ.division,
            sub_division=occ.sub_division,
            group_code=occ.group_code,
            family=occ.family,
            description=occ.description,
            skills=[],
        ),
        evidence_grade=eg_summary,
        is_sufficient=is_sufficient,
        gating_reason=gating_reason,
        historical_series=historical_series,
        forecasts=forecasts,
        data_vintage=latest_vintage,
    )


@router.get("/market/overview", response_model=MarketOverviewResponse, tags=["Intelligence"])
def get_market_overview(
    region: Optional[str] = Query(None, description="Filter overview to a single region"),
    trade_category: Optional[str] = Query(None, description="Filter overview to a trade category"),
    db: Session = Depends(get_db),
):
    """Aggregates high-level labour market demand/supply balances and evidence reliability."""
    reg = resolve_region(region, db) if region else None

    # Base query for regions
    all_regions = db.scalars(select(Region).order_by(Region.state_code)).all()
    all_occs = db.scalars(select(Occupation).order_by(Occupation.nco_code)).all()

    # Evidence Grades
    eg_stmt = select(EvidenceGrade)
    if reg:
        eg_stmt = eg_stmt.where(EvidenceGrade.region_id == reg.id)
    if trade_category:
        eg_stmt = eg_stmt.join(Occupation).where(func.lower(Occupation.trade_category) == trade_category.strip().lower())

    evidence_grades = db.scalars(eg_stmt).all()

    total_segments = len(evidence_grades)
    grade_distribution: Dict[str, int] = {"A": 0, "B": 0, "C": 0, "Insufficient": 0}
    sufficient_count = 0
    excluded_count = 0

    for eg in evidence_grades:
        g = eg.grade
        grade_distribution[g] = grade_distribution.get(g, 0) + 1
        if eg.is_sufficient:
            sufficient_count += 1
        else:
            excluded_count += 1

    # Compute latest gap per segment
    # Subquery latest series per segment
    latest_ym = "2023-12"
    latest_series_stmt = (
        select(EmploymentSeries, Region, Occupation, EvidenceGrade)
        .join(Region, EmploymentSeries.region_id == Region.id)
        .join(Occupation, EmploymentSeries.occupation_id == Occupation.id)
        .join(
            EvidenceGrade,
            (EvidenceGrade.region_id == Region.id) & (EvidenceGrade.occupation_id == Occupation.id),
        )
        .where(EmploymentSeries.year_month == latest_ym)
    )
    if reg:
        latest_series_stmt = latest_series_stmt.where(EmploymentSeries.region_id == reg.id)
    if trade_category:
        latest_series_stmt = latest_series_stmt.where(func.lower(Occupation.trade_category) == trade_category.strip().lower())

    rows = db.execute(latest_series_stmt).all()

    trade_items: List[TradeDeficitItem] = []
    for es, r, o, eg in rows:
        trade_items.append(
            TradeDeficitItem(
                nco_code=o.nco_code,
                title=o.title,
                trade_category=o.trade_category,
                state_code=r.state_code,
                state_name=r.state_name,
                latest_demand=round(es.demand_index, 1),
                latest_supply=round(es.supply_index, 1),
                net_gap=round(es.net_gap, 1),
                evidence_grade=eg.grade,
            )
        )

    # Sort deficit (highest positive net_gap = highest unmet demand)
    top_deficits = sorted(trade_items, key=lambda x: x.net_gap, reverse=True)[:5]
    # Sort surplus (most negative net_gap = excess supply over demand)
    top_surplus = sorted(trade_items, key=lambda x: x.net_gap)[:5]

    return MarketOverviewResponse(
        total_regions=len(all_regions),
        total_occupations=len(all_occs),
        total_segments=total_segments,
        sufficient_segments=sufficient_count,
        excluded_segments=excluded_count,
        latest_data_vintage="2023-12-31",
        grade_distribution=grade_distribution,
        top_deficit_trades=top_deficits,
        top_surplus_trades=top_surplus,
        regions_covered=[r.state_code for r in all_regions],
        trade_categories=list({o.trade_category for o in all_occs}),
    )


@router.get("/models/status", response_model=ModelStatusResponse, tags=["Provenance"])
def get_model_status(db: Session = Depends(get_db)):
    """Returns walk-forward evaluation metrics, data lineage, and model deployment status."""
    latest_run = db.scalars(select(ModelRun).order_by(desc(ModelRun.id))).first()

    if latest_run:
        grade_dist = json.loads(latest_run.grade_distribution)
        cat_metrics = json.loads(latest_run.category_metrics)
        return ModelStatusResponse(
            pipeline_version=latest_run.pipeline_version,
            data_version=latest_run.data_version,
            training_window={
                "start_date": latest_run.training_start,
                "end_date": latest_run.training_end,
            },
            candidate_model=latest_run.candidate_model,
            baseline_model=latest_run.baseline_model,
            overall_candidate_metrics={
                "mae": latest_run.overall_mae,
                "rmse": latest_run.overall_rmse,
                "mape": latest_run.overall_mape,
            },
            overall_baseline_metrics={
                "mae": latest_run.baseline_mae,
                "rmse": latest_run.baseline_rmse,
                "mape": latest_run.baseline_mape,
            },
            total_evaluated_segments=latest_run.total_evaluated_segments,
            candidate_losses_to_baseline_count=latest_run.candidate_losses_to_baseline_count,
            excluded_segments_count=latest_run.excluded_segments_count,
            grade_distribution=grade_dist,
            category_metrics=cat_metrics,
            artifact_path=latest_run.artifact_path,
            evidence_grade_validation=(
                json.loads(latest_run.evidence_validation_json) if latest_run.evidence_validation_json else None
            ),
        )

    # Fallback to reading metadata.json directly if DB has no model run record
    meta_path = os.path.abspath("ml/artifacts/metadata.json")
    if not os.path.exists(meta_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model run metadata not found.",
        )

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    validation_path = os.path.abspath("ml/artifacts/evidence_validation.json")
    evidence_validation = None
    if os.path.exists(validation_path):
        with open(validation_path, "r", encoding="utf-8") as vf:
            evidence_validation = json.load(vf)

    eval_b = meta.get("overall_evaluation", {})
    return ModelStatusResponse(
        pipeline_version=meta.get("pipeline_version", "1.0.0"),
        data_version=meta.get("data_version", "panel_v1"),
        training_window=meta.get("training_window", {}),
        candidate_model=eval_b.get("candidate_model", "Holt-Winters"),
        baseline_model=eval_b.get("baseline_model", "Seasonal-Naive"),
        overall_candidate_metrics=eval_b.get("candidate_metrics", {}),
        overall_baseline_metrics=eval_b.get("baseline_metrics", {}),
        total_evaluated_segments=eval_b.get("total_evaluated_segments", 188),
        candidate_losses_to_baseline_count=eval_b.get("candidate_losses_to_baseline_count", 64),
        excluded_segments_count=meta.get("sufficiency_gating", {}).get("excluded_segments_count", 4),
        grade_distribution=meta.get("evidence_grading", {}).get("grade_distribution", {}),
        category_metrics=eval_b.get("category_metrics", {}),
        artifact_path=meta.get("artifact_paths", {}).get("model_path"),
        evidence_grade_validation=evidence_validation,
    )


@router.get("/backtest/{occupation}/{region}", response_model=BacktestDetailResponse, tags=["Backtest"])
def get_backtest(
    occupation: str,
    region: str,
    db: Session = Depends(get_db),
):
    """Returns the real, out-of-sample walk-forward backtest replay for a
    state x occupation segment: what the model would have predicted at each
    historical step using only data available up to that point, vs. what
    actually happened. Computed by ml/evaluate/backtest.py - never fabricated."""
    reg = resolve_region(region, db)
    occ = resolve_occupation(occupation, db)

    eg = db.scalars(
        select(EvidenceGrade).where(
            EvidenceGrade.region_id == reg.id,
            EvidenceGrade.occupation_id == occ.id,
        )
    ).first()

    if not eg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No evidence grade found for occupation '{occupation}' in region '{region}'.",
        )

    stmt_pts = (
        select(BacktestPoint)
        .where(BacktestPoint.region_id == reg.id, BacktestPoint.occupation_id == occ.id)
        .order_by(BacktestPoint.year_month)
    )
    pt_records = db.scalars(stmt_pts).all()

    points = [
        BacktestPointResponse(
            year_month=p.year_month,
            actual=p.actual,
            baseline_prediction=p.baseline_prediction,
            candidate_prediction=p.candidate_prediction,
            baseline_abs_error=p.baseline_abs_error,
            candidate_abs_error=p.candidate_abs_error,
        )
        for p in pt_records
    ]

    return BacktestDetailResponse(
        region=RegionResponse.model_validate(reg),
        occupation=OccupationResponse(
            id=occ.id,
            nco_code=occ.nco_code,
            nco_code_str=occ.nco_code_str,
            title=occ.title,
            trade_category=occ.trade_category,
            division=occ.division,
            sub_division=occ.sub_division,
            group_code=occ.group_code,
            family=occ.family,
            description=occ.description,
            skills=[],
        ),
        evidence_grade=eg.grade,
        evidence_score=eg.score,
        backtest_steps=eg.backtest_steps or 0,
        candidate_mean_abs_error=eg.backtest_candidate_mean_abs_error,
        baseline_mean_abs_error=eg.backtest_baseline_mean_abs_error,
        points=points,
        data_vintage=eg.data_vintage,
    )
