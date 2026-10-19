export interface Region {
  id: number
  state_code: string
  state_name: string
  zone: string
}

export interface SkillSummary {
  skill_id: string
  skill_name: string
  category: string
  importance_score: number
}

export interface Occupation {
  id: number
  nco_code: number
  nco_code_str: string
  title: string
  trade_category: string
  division?: number
  sub_division?: number
  group_code?: number
  family?: number
  description?: string
  skills: SkillSummary[]
}

export interface HistoricalDataPoint {
  year_month: string
  date: string
  demand_index: number
  supply_index: number
  net_gap: number
  data_vintage: string
  supply_data_source: string
  supply_source_citation: string | null
  demand_data_source: string
}

export interface ForecastDataPoint {
  forecast_year_month: string
  forecast_date: string
  predicted_demand: number | null
  lower_bound: number | null
  upper_bound: number | null
  is_sufficient: boolean
  gating_reason: string | null
  model_name: string
  data_vintage: string
}

export interface EvidenceGradeSummary {
  grade: string
  score: number
  volume_score: number
  agreement_score: number
  recency_score: number
  observations_count: number
  is_sufficient: boolean
  gating_reason: string | null
  data_vintage: string
}

export interface ForecastDetailResponse {
  region: Region
  occupation: Occupation
  evidence_grade: EvidenceGradeSummary
  is_sufficient: boolean
  gating_reason: string | null
  historical_series: HistoricalDataPoint[]
  forecasts: ForecastDataPoint[]
  data_vintage: string
}

export interface TradeDeficitItem {
  nco_code: number
  title: string
  trade_category: string
  state_code: string
  state_name: string
  latest_demand: number
  latest_supply: number
  net_gap: number
  evidence_grade: string
}

export interface MarketOverviewResponse {
  total_regions: number
  total_occupations: number
  total_segments: number
  sufficient_segments: number
  excluded_segments: number
  latest_data_vintage: string
  grade_distribution: Record<string, number>
  top_deficit_trades: TradeDeficitItem[]
  top_surplus_trades: TradeDeficitItem[]
  regions_covered: string[]
  trade_categories: string[]
}

export interface GradeValidationStats {
  mean_abs_error: number
  std_abs_error: number | null
  n_segments: number
}

export interface EvidenceGradeValidation {
  status: string
  detail?: string
  mean_abs_error_by_grade?: Record<string, GradeValidationStats>
  spearman_like_rank_correlation_score_vs_error?: number | null
  grade_order_is_monotonic_increasing_error?: boolean | null
  hypothesis_low_evidence_means_higher_error_supported?: boolean | null
  n_sufficient_graded_segments?: number
}

export interface ModelStatusResponse {
  pipeline_version: string
  data_version: string
  training_window: {
    start_date: string
    end_date: string
  }
  candidate_model: string
  baseline_model: string
  overall_candidate_metrics: {
    mae: number
    rmse: number
    mape: number
  }
  overall_baseline_metrics: {
    mae: number
    rmse: number
    mape: number
  }
  total_evaluated_segments: number
  candidate_losses_to_baseline_count: number
  excluded_segments_count: number
  grade_distribution: Record<string, number>
  category_metrics: Record<string, any>
  artifact_path?: string
  evidence_grade_validation: EvidenceGradeValidation | null
}

export interface BacktestPointResponse {
  year_month: string
  actual: number
  baseline_prediction: number
  candidate_prediction: number
  baseline_abs_error: number
  candidate_abs_error: number
}

export interface BacktestDetailResponse {
  region: Region
  occupation: Occupation
  evidence_grade: string
  evidence_score: number
  backtest_steps: number
  candidate_mean_abs_error: number | null
  baseline_mean_abs_error: number | null
  points: BacktestPointResponse[]
  data_vintage: string
}

export interface DataSourceManifestItem {
  name: string
  source_type: string
  classification: "observed" | "estimated" | "predicted" | "synthetic_demo"
  publication_date: string | null
  observation_period: string | null
  geographic_coverage: string
  ingestion_timestamp: string | null
  citation_url: string | null
  record_count: number | null
  limitations: string
}

export interface PanelQualitySummary {
  available: boolean
  total_rows: number
  total_segments: number
  sufficient_segments: number
  excluded_segments: number
  missingness_pct: Record<string, number>
}

export interface DataTrustManifestResponse {
  generated_at: string
  sources: DataSourceManifestItem[]
  panel_quality: PanelQualitySummary
}
