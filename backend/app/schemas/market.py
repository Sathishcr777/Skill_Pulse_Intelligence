"""Pydantic schemas for request validation and API responses.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class RegionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    state_code: str
    state_name: str
    zone: Optional[str] = None


class SkillSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    skill_id: str
    skill_name: str
    category: str
    importance_score: float = 1.0


class OccupationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nco_code: float
    nco_code_str: str
    title: str
    trade_category: str
    division: Optional[int] = None
    sub_division: Optional[int] = None
    group_code: Optional[int] = None
    family: Optional[int] = None
    description: Optional[str] = None
    skills: List[SkillSummary] = []


class HistoricalDataPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year_month: str
    date: datetime
    demand_index: float
    supply_index: float
    net_gap: float
    data_vintage: str
    supply_data_source: str = "unavailable"  # 'verified_real' | 'unavailable'
    supply_source_citation: Optional[str] = None
    demand_data_source: str = "synthetic_demo"  # 'verified_real' | 'synthetic_demo'


class ForecastDataPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    forecast_year_month: str
    forecast_date: datetime
    predicted_demand: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    is_sufficient: bool
    gating_reason: Optional[str] = None
    model_name: str
    data_vintage: str


class EvidenceGradeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    grade: str
    score: float
    volume_score: float
    agreement_score: float
    recency_score: float
    observations_count: int
    is_sufficient: bool
    gating_reason: Optional[str] = None
    data_vintage: str


class ForecastDetailResponse(BaseModel):
    region: RegionResponse
    occupation: OccupationResponse
    evidence_grade: EvidenceGradeSummary
    is_sufficient: bool
    gating_reason: Optional[str] = None
    historical_series: List[HistoricalDataPoint]
    forecasts: List[ForecastDataPoint]
    data_vintage: str


class TradeDeficitItem(BaseModel):
    nco_code: float
    title: str
    trade_category: str
    state_code: str
    state_name: str
    latest_demand: float
    latest_supply: float
    net_gap: float
    evidence_grade: str


class MarketOverviewResponse(BaseModel):
    total_regions: int
    total_occupations: int
    total_segments: int
    sufficient_segments: int
    excluded_segments: int
    latest_data_vintage: str
    grade_distribution: Dict[str, int]
    top_deficit_trades: List[TradeDeficitItem]
    top_surplus_trades: List[TradeDeficitItem]
    regions_covered: List[str]
    trade_categories: List[str]


class ModelStatusResponse(BaseModel):
    pipeline_version: str
    data_version: str
    training_window: Dict[str, str]
    candidate_model: str
    baseline_model: str
    overall_candidate_metrics: Dict[str, float]
    overall_baseline_metrics: Dict[str, float]
    total_evaluated_segments: int
    candidate_losses_to_baseline_count: int
    excluded_segments_count: int
    grade_distribution: Dict[str, int]
    category_metrics: Dict[str, Any]
    artifact_path: Optional[str] = None
    evidence_grade_validation: Optional[Dict[str, Any]] = None


class BacktestPointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year_month: str
    actual: float
    baseline_prediction: float
    candidate_prediction: float
    baseline_abs_error: float
    candidate_abs_error: float


class BacktestDetailResponse(BaseModel):
    region: RegionResponse
    occupation: OccupationResponse
    evidence_grade: str
    evidence_score: float
    backtest_steps: int
    candidate_mean_abs_error: Optional[float] = None
    baseline_mean_abs_error: Optional[float] = None
    points: List[BacktestPointResponse]
    data_vintage: str


class DataSourceManifestItem(BaseModel):
    name: str
    source_type: str
    classification: str  # 'observed' | 'estimated' | 'predicted' | 'synthetic_demo'
    publication_date: Optional[str] = None
    observation_period: Optional[str] = None
    geographic_coverage: str
    ingestion_timestamp: Optional[str] = None
    citation_url: Optional[str] = None
    record_count: Optional[int] = None
    limitations: str


class PanelQualitySummary(BaseModel):
    available: bool
    total_rows: int
    total_segments: int
    sufficient_segments: int
    excluded_segments: int
    missingness_pct: Dict[str, float]


class DataTrustManifestResponse(BaseModel):
    generated_at: str
    sources: List[DataSourceManifestItem]
    panel_quality: PanelQualitySummary
