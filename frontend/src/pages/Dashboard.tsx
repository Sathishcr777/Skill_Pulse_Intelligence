import React, { useEffect, useState, useCallback, useMemo } from "react"
import {
  TrendingUp,
  Target,
  History,
  ShieldCheck,
  RefreshCw,
  Search,
  MapPin,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Database,
  Calculator,
  HelpCircle,
  Lightbulb,
  Globe,
  Box,
  List,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { TimeSeriesChart } from "@/components/TimeSeriesChart"
import { BacktestChart } from "@/components/BacktestChart"
import { WhatIfSimulator } from "@/components/WhatIfSimulator"
import { SkillUniverse3D } from "@/components/SkillUniverse3D"
import { SkillUniverse2D, isWebGLAvailable } from "@/components/SkillUniverse2D"
import { api, ApiError } from "@/lib/api"
import {
  Region,
  Occupation,
  ForecastDetailResponse,
  MarketOverviewResponse,
  ModelStatusResponse,
  BacktestDetailResponse,
  DataTrustManifestResponse,
  SkillGraphResponse,
} from "@/types/api"

type Tab = "forecast" | "radar" | "universe" | "backtest" | "whatif" | "trust"
const HORIZON_OPTIONS = [3, 6, 9, 12] as const

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("forecast")
  const [selectedRegion, setSelectedRegion] = useState<string>("MH")
  const [selectedOccupationCode, setSelectedOccupationCode] = useState<number>(7411.01)
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [horizonMonths, setHorizonMonths] = useState<number>(6)

  const [regions, setRegions] = useState<Region[]>([])
  const [occupations, setOccupations] = useState<Occupation[]>([])
  const [forecastDetail, setForecastDetail] = useState<ForecastDetailResponse | null>(null)
  const [backtestDetail, setBacktestDetail] = useState<BacktestDetailResponse | null>(null)
  const [marketOverview, setMarketOverview] = useState<MarketOverviewResponse | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null)

  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [loadingBacktest, setLoadingBacktest] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInitialData = useCallback(async () => {
    setLoadingInitial(true)
    setError(null)
    try {
      const [regData, occData, overviewData, modelData] = await Promise.all([
        api.regions(),
        api.occupations(),
        api.marketOverview(),
        api.modelStatus(),
      ])
      setRegions(regData)
      setOccupations(occData)
      setMarketOverview(overviewData)
      setModelStatus(modelData)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `API error (${err.status}): ${err.message}`
          : "Failed to connect to SkillPulse API backend. Ensure FastAPI is running on port 8000."
      )
    } finally {
      setLoadingInitial(false)
    }
  }, [])

  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  const fetchSegmentDetail = useCallback(async (code: number, region: string) => {
    setLoadingForecast(true)
    setLoadingBacktest(true)
    try {
      const data = await api.forecast(code, region)
      setForecastDetail(data)
    } catch {
      setForecastDetail(null)
    } finally {
      setLoadingForecast(false)
    }
    try {
      const bt = await api.backtest(code, region)
      setBacktestDetail(bt)
    } catch {
      setBacktestDetail(null)
    } finally {
      setLoadingBacktest(false)
    }
  }, [])

  useEffect(() => {
    if (selectedOccupationCode && selectedRegion) {
      fetchSegmentDetail(selectedOccupationCode, selectedRegion)
    }
  }, [selectedOccupationCode, selectedRegion, fetchSegmentDetail])

  const filteredOccupations = useMemo(() => {
    return occupations.filter((occ) => {
      const matchesCategory = selectedCategory === "ALL" || occ.trade_category === selectedCategory
      const matchesSearch =
        occ.title.toLowerCase().includes(searchQuery.toLowerCase()) || occ.nco_code.toString().includes(searchQuery)
      return matchesCategory && matchesSearch
    })
  }, [occupations, selectedCategory, searchQuery])

  const tradeCategories = useMemo(
    () => ["ALL", ...Array.from(new Set(occupations.map((o) => o.trade_category)))],
    [occupations]
  )

  // GET /forecast/{occ}/{region} intentionally omits skills to keep the
  // payload light; look the real, already-fetched skill list up from the
  // /occupations response instead of re-requesting it.
  const selectedOccupationSkills = useMemo(
    () => occupations.find((o) => Math.abs(o.nco_code - selectedOccupationCode) < 0.001)?.skills ?? [],
    [occupations, selectedOccupationCode]
  )

  const handleSelectSegment = (ncoCode: number, stateCode: string) => {
    setSelectedOccupationCode(ncoCode)
    setSelectedRegion(stateCode)
    setActiveTab("forecast")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">SIH26246</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Evidence-Graded Labour Market Intelligence
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SkillPulse Intelligence</h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-3xl">
              Supply proxy: verified PLFS Annual Report 2023-24 (Table 27) state-level industry shares — periodically
              refreshed, never real-time. Demand signal is a synthetic demonstration series; see the Data Trust Centre
              tab for the full, honest breakdown.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInitialData} disabled={loadingInitial} className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 self-start lg:self-auto">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loadingInitial ? "animate-spin text-indigo-400" : ""}`} />
            Refresh
          </Button>
        </header>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={fetchInitialData} className="border-rose-500/40 text-rose-200">Retry</Button>
          </div>
        )}

        {marketOverview && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="bg-slate-900/60 border-slate-800/80">
              <CardContent className="p-4">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Segments Forecastable</div>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {marketOverview.sufficient_segments}
                  <span className="text-xs text-rose-400 font-normal ml-1.5">({marketOverview.excluded_segments} gated)</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-800/80">
              <CardContent className="p-4">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Evidence Grade Split</div>
                <div className="text-lg font-black text-cyan-400 font-mono mt-1">
                  {marketOverview.grade_distribution.A ?? 0} A / {marketOverview.grade_distribution.B ?? 0} B / {marketOverview.grade_distribution.C ?? 0} C
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-800/80">
              <CardContent className="p-4">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Candidate vs Baseline (MAE)</div>
                <div className="text-lg font-black text-slate-100 font-mono mt-1">
                  {modelStatus ? `${modelStatus.overall_candidate_metrics.mae.toFixed(2)} vs ${modelStatus.overall_baseline_metrics.mae.toFixed(2)}` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-800/80">
              <CardContent className="p-4">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Data Vintage</div>
                <div className="text-lg font-black text-slate-100 font-mono mt-1">{marketOverview.latest_data_vintage}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-slate-800/80 overflow-x-auto pb-1">
          {([
            ["forecast", "Forecast", TrendingUp],
            ["radar", "Opportunity Radar", Target],
            ["universe", "Skill Universe", Globe],
            ["backtest", "Backtest", History],
            ["whatif", "What-If Simulator", Calculator],
            ["trust", "Data Trust Centre", ShieldCheck],
          ] as [Tab, string, any][]).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-150 ${
                activeTab === tab ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40" : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {(activeTab === "forecast" || activeTab === "backtest" || activeTab === "whatif") && (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" /> State:
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {regions.map((r) => (
                  <button
                    key={r.state_code}
                    onClick={() => setSelectedRegion(r.state_code)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                      selectedRegion === r.state_code ? "bg-indigo-500 text-white" : "bg-slate-800/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {r.state_code}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {tradeCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                      selectedCategory === cat ? "bg-slate-700 text-white" : "bg-slate-950/40 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search trades..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto pr-1">
              {filteredOccupations.map((occ) => (
                <button
                  key={occ.id}
                  onClick={() => setSelectedOccupationCode(occ.nco_code)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                    Math.abs(selectedOccupationCode - occ.nco_code) < 0.001
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                      : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800/80"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-70">{occ.nco_code.toFixed(2)}</span>
                  <span>{occ.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "forecast" &&
          (loadingForecast && !forecastDetail ? (
            <div className="h-72 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading forecast...
            </div>
          ) : forecastDetail ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                    Forecast horizon
                    <HelpTip text="How many months ahead to show. The model always produces the full 12-month forecast — this only changes how much of it is displayed." />
                  </span>
                  <div className="flex items-center gap-1">
                    {HORIZON_OPTIONS.map((h) => (
                      <button
                        key={h}
                        onClick={() => setHorizonMonths(h)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          horizonMonths === h ? "bg-cyan-600 text-white" : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {h}mo
                      </button>
                    ))}
                  </div>
                </div>
                <TimeSeriesChart
                  historicalData={forecastDetail.historical_series}
                  forecastData={forecastDetail.forecasts.slice(0, horizonMonths)}
                  isSufficient={forecastDetail.is_sufficient}
                  gatingReason={forecastDetail.gating_reason}
                  stateCode={forecastDetail.region.state_code}
                  occupationTitle={forecastDetail.occupation.title}
                />
                <InsightExplanationPanel forecastDetail={forecastDetail} backtestDetail={backtestDetail} />
                <WorkforceGapPanel forecastDetail={forecastDetail} />
              </div>
              <div className="space-y-4">
                <Card className="bg-slate-900/60 border-slate-800/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Evidence Grade</CardTitle>
                    <CardDescription className="text-[11px]">Deterministic score, 0-100</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-black text-indigo-400">{forecastDetail.evidence_grade.grade}</span>
                      <span className="font-mono text-slate-300">{forecastDetail.evidence_grade.score}/100</span>
                    </div>
                    <div className="space-y-1 pt-2 border-t border-slate-800/60">
                      <div className="flex justify-between"><span className="text-slate-400">Volume</span><span>{forecastDetail.evidence_grade.volume_score}/40</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Agreement</span><span>{forecastDetail.evidence_grade.agreement_score}/35</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Recency</span><span>{forecastDetail.evidence_grade.recency_score}/25</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Observations</span><span>{forecastDetail.evidence_grade.observations_count}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-slate-900/60 border-slate-800/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">O*NET Mapped Skills</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {selectedOccupationSkills.length > 0 ? (
                      selectedOccupationSkills.map((sk) => (
                        <div key={sk.skill_id} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                          <span className="text-slate-200">{sk.skill_name}</span>
                          <span className="font-mono text-indigo-400">{(sk.importance_score * 100).toFixed(0)}%</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">No curated skill mapping for this trade yet.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="h-40 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
              No forecast data for this selection.
            </div>
          ))}

        {activeTab === "radar" && marketOverview && (
          <OpportunityRadarPanel overview={marketOverview} onSelect={handleSelectSegment} />
        )}

        {activeTab === "universe" && <SkillUniversePanel />}

        {activeTab === "whatif" &&
          (forecastDetail && forecastDetail.historical_series.length > 0 ? (
            <WhatIfSimulator
              baselineDemand={forecastDetail.historical_series[forecastDetail.historical_series.length - 1].demand_index}
              baselineSupply={forecastDetail.historical_series[forecastDetail.historical_series.length - 1].supply_index}
              occupationTitle={forecastDetail.occupation.title}
              stateCode={forecastDetail.region.state_code}
              dataVintage={forecastDetail.data_vintage}
            />
          ) : (
            <div className="h-40 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
              Select a state and occupation on the Forecast tab first to run a scenario.
            </div>
          ))}

        {activeTab === "backtest" &&
          (loadingBacktest ? (
            <div className="h-72 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading backtest replay...
            </div>
          ) : backtestDetail ? (
            <div className="space-y-5">
              <BacktestChart
                points={backtestDetail.points}
                evidenceGrade={backtestDetail.evidence_grade}
                candidateMeanAbsError={backtestDetail.candidate_mean_abs_error}
                baselineMeanAbsError={backtestDetail.baseline_mean_abs_error}
                occupationTitle={backtestDetail.occupation.title}
                stateCode={backtestDetail.region.state_code}
              />
              <EvidenceValidationPanel validation={modelStatus?.evidence_grade_validation ?? null} />
              <CategoryPerformancePanel categoryMetrics={modelStatus?.category_metrics ?? null} />
            </div>
          ) : (
            <div className="h-40 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
              No backtest data for this selection.
            </div>
          ))}

        {activeTab === "trust" && <DataTrustCentre modelStatus={modelStatus} marketOverview={marketOverview} />}
      </div>
    </div>
  )
}

const OpportunityRadarPanel: React.FC<{
  overview: MarketOverviewResponse
  onSelect: (nco: number, state: string) => void
}> = ({ overview, onSelect }) => (
  <div className="space-y-5">
    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <span>
        This view ranks segments by real computed net gap (demand minus the verified PLFS supply proxy) from the
        current panel. It is not yet a skill-combination co-occurrence detector — that is a separate, not-yet-built
        feature. Nothing here is a forecast; it reflects the latest available period only.
      </span>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <RadarTable title="Highest unmet demand (deficit)" items={overview.top_deficit_trades} tone="rose" onSelect={onSelect} />
      <RadarTable title="Largest oversupply (surplus)" items={overview.top_surplus_trades} tone="emerald" onSelect={onSelect} />
    </div>
  </div>
)

const RadarTable: React.FC<{ title: string; items: MarketOverviewResponse["top_deficit_trades"]; tone: "rose" | "emerald"; onSelect: (nco: number, state: string) => void }> = ({
  title,
  items,
  tone,
  onSelect,
}) => (
  <Card className="bg-slate-900/60 border-slate-800/80">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-1.5">
      {items.length === 0 && <div className="text-xs text-slate-500">No segments to show.</div>}
      {items.map((item, i) => (
        <button
          key={`${item.state_code}-${item.nco_code}-${i}`}
          onClick={() => onSelect(item.nco_code, item.state_code)}
          className="w-full text-left p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/50 flex items-center justify-between text-xs"
        >
          <div>
            <div className="text-slate-200 font-medium">{item.title}</div>
            <div className="text-slate-500">{item.state_name} &middot; {item.trade_category} &middot; Grade {item.evidence_grade}</div>
          </div>
          <span className={`font-mono font-bold ${tone === "rose" ? "text-rose-400" : "text-emerald-400"}`}>
            {item.net_gap > 0 ? "+" : ""}{item.net_gap.toFixed(1)}
          </span>
        </button>
      ))}
    </CardContent>
  </Card>
)

const EvidenceValidationPanel: React.FC<{ validation: ModelStatusResponse["evidence_grade_validation"] }> = ({ validation }) => {
  if (!validation || validation.status !== "computed") {
    return (
      <Card className="bg-slate-900/60 border-slate-800/80">
        <CardContent className="p-4 text-xs text-slate-500">
          Evidence-grade validation has not been computed yet. Run <code className="text-slate-300">python -m ml.evaluate.backtest</code>.
        </CardContent>
      </Card>
    )
  }
  const supported = validation.hypothesis_low_evidence_means_higher_error_supported
  return (
    <Card className="bg-slate-900/60 border-slate-800/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Does the evidence grade actually predict error?</CardTitle>
        <CardDescription className="text-[11px]">
          The core differentiator's proof point, computed from real backtest results — reported honestly either way.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className={`flex items-center gap-2 p-2.5 rounded-lg ${supported ? "bg-emerald-950/30 text-emerald-300" : "bg-rose-950/30 text-rose-300"}`}>
          {supported ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span className="font-semibold">
            Hypothesis ("lower evidence grade correlates with higher real error") {supported ? "supported" : "not supported"} by this run.
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left py-1">Grade</th>
              <th className="text-right py-1">Mean Abs Error</th>
              <th className="text-right py-1">N segments</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(validation.mean_abs_error_by_grade ?? {}).map(([grade, stats]) => (
              <tr key={grade} className="border-b border-slate-800/50">
                <td className="py-1 text-slate-200 font-semibold">{grade}</td>
                <td className="py-1 text-right font-mono">{stats.mean_abs_error}</td>
                <td className="py-1 text-right text-slate-400">{stats.n_segments}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-slate-500">
          Rank correlation (score vs. error): <span className="font-mono text-slate-300">{validation.spearman_like_rank_correlation_score_vs_error}</span>{" "}
          over {validation.n_sufficient_graded_segments} segments. Small-sample, single-run result — see Data Trust Centre for the full disclosure.
        </div>
      </CardContent>
    </Card>
  )
}

/** Feature C: "performance across supported occupations or segments" -
 * this real data (per-category walk-forward metrics) was already computed
 * and returned by the API but never rendered anywhere until now. */
const CategoryPerformancePanel: React.FC<{ categoryMetrics: Record<string, any> | null }> = ({ categoryMetrics }) => {
  if (!categoryMetrics || Object.keys(categoryMetrics).length === 0) return null
  const rows = Object.entries(categoryMetrics).sort((a, b) => b[1].evaluated_segments - a[1].evaluated_segments)

  return (
    <Card className="bg-slate-900/60 border-slate-800/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Model performance by trade category</CardTitle>
        <CardDescription className="text-[11px]">Real walk-forward backtest results, broken down by segment group — not just the single selected segment above</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800 text-left">
              <th className="py-1 pr-2">Category</th>
              <th className="py-1 pr-2 text-right">Segments</th>
              <th className="py-1 pr-2 text-right">Baseline MAE</th>
              <th className="py-1 pr-2 text-right">Candidate MAE</th>
              <th className="py-1 text-right">Candidate win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([category, m]) => (
              <tr key={category} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                <td className="py-1.5 pr-2 text-slate-200">{category}</td>
                <td className="py-1.5 pr-2 text-right text-slate-400">{m.evaluated_segments}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-amber-400">{m.baseline_mean_mae}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-cyan-400">{m.candidate_mean_mae}</td>
                <td className={`py-1.5 text-right font-mono font-semibold ${m.candidate_win_rate_pct >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                  {m.candidate_win_rate_pct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

const CLASSIFICATION_META: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  observed: { label: "Observed (real)", variant: "success" },
  estimated: { label: "Estimated", variant: "secondary" },
  predicted: { label: "Predicted", variant: "secondary" },
  synthetic_demo: { label: "Synthetic demo", variant: "warning" },
}

const DataTrustCentre: React.FC<{ modelStatus: ModelStatusResponse | null; marketOverview: MarketOverviewResponse | null }> = ({
  modelStatus,
  marketOverview,
}) => {
  const [manifest, setManifest] = useState<DataTrustManifestResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api
      .dataTrust()
      .then(setManifest)
      .catch(() => setManifest(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <Card className="bg-slate-900/60 border-slate-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4 text-indigo-400" /> Data sources &amp; classification</CardTitle>
          <CardDescription className="text-[11px]">
            Live from <code>GET /data-trust</code> — click a source for its full citation and limitations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {loading && <div className="text-slate-500">Loading manifest...</div>}
          {!loading && !manifest && <div className="text-rose-400">Could not load the data trust manifest from the API.</div>}
          {manifest?.sources.map((src) => {
            const meta = CLASSIFICATION_META[src.classification] ?? CLASSIFICATION_META.estimated
            const isOpen = expanded === src.name
            return (
              <div key={src.name} className="rounded-lg bg-slate-950/60 border border-slate-800/80 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : src.name)}
                  className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <div>
                    <span className="text-slate-200 font-medium">{src.name}</span>
                    <span className="text-slate-500 ml-2 text-[10px]">{src.source_type}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-slate-500 text-[10px]">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="p-3 pt-0 space-y-1.5 text-[11px] text-slate-400 border-t border-slate-800/60">
                    <DetailRow label="Observation period" value={src.observation_period ?? "—"} />
                    <DetailRow label="Publication date" value={src.publication_date ?? "—"} />
                    <DetailRow label="Geographic coverage" value={src.geographic_coverage} />
                    <DetailRow label="Record count" value={src.record_count?.toLocaleString() ?? "—"} />
                    <DetailRow label="Ingested" value={src.ingestion_timestamp ? new Date(src.ingestion_timestamp).toLocaleString() : "—"} />
                    {src.citation_url && (
                      <DetailRow
                        label="Source"
                        value={
                          <a href={src.citation_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline break-all">
                            {src.citation_url}
                          </a>
                        }
                      />
                    )}
                    <div className="pt-1.5 border-t border-slate-800/60 text-amber-200/80">
                      <strong className="text-amber-300">Limitations:</strong> {src.limitations}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Live panel quality</CardTitle>
          <CardDescription className="text-[11px]">Computed from the current panel file at request time, not cached</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {manifest?.panel_quality && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ResultStat label="Total rows" value={manifest.panel_quality.total_rows.toLocaleString()} />
              <ResultStat label="Segments" value={manifest.panel_quality.total_segments.toString()} />
              <ResultStat label="Forecastable" value={manifest.panel_quality.sufficient_segments.toString()} tone="emerald" />
              <ResultStat label="Gated (insufficient)" value={manifest.panel_quality.excluded_segments.toString()} tone="amber" />
            </div>
          )}
          {manifest?.panel_quality && (
            <div>
              <div className="text-slate-400 mb-1.5">Missingness by column (0% expected — rows with gaps are excluded, not filled)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {Object.entries(manifest.panel_quality.missingness_pct).map(([col, pct]) => (
                  <div key={col} className={`px-2 py-1 rounded-md text-[10px] font-mono flex justify-between ${pct > 0 ? "bg-rose-950/40 text-rose-300" : "bg-slate-950/60 text-slate-500"}`}>
                    <span>{col}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data freshness &amp; model provenance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400">Data vintage</div>
            <div className="font-mono text-slate-200 text-sm">{marketOverview?.latest_data_vintage ?? "—"}</div>
            <div className="text-amber-400 text-[10px] mt-1">Periodically refreshed — never real-time</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400">Training window</div>
            <div className="font-mono text-slate-200 text-sm">
              {modelStatus ? `${modelStatus.training_window.start_date} → ${modelStatus.training_window.end_date}` : "—"}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400">Candidate model</div>
            <div className="text-slate-200">{modelStatus?.candidate_model ?? "—"}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400">Baseline model</div>
            <div className="text-slate-200">{modelStatus?.baseline_model ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-slate-500 shrink-0">{label}</span>
    <span className="text-slate-300 text-right">{value}</span>
  </div>
)

/** Phase 4: Skill Relationship Universe. Fetches the real occupation<->skill
 * graph once and renders it as either an interactive 3D scene or an
 * accessible 2D table, auto-falling back to 2D when WebGL isn't available
 * rather than showing a broken canvas. */
const SkillUniversePanel: React.FC = () => {
  const [graph, setGraph] = useState<SkillGraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<"3d" | "2d">(isWebGLAvailable() ? "3d" : "2d")

  useEffect(() => {
    api
      .skillGraph()
      .then(setGraph)
      .catch(() => setError("Could not load the skill graph from the API."))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    if (!graph) return []
    return Array.from(new Set(graph.nodes.filter((n) => n.type === "occupation").map((n) => n.category)))
  }, [graph])

  if (loading) {
    return (
      <div className="h-72 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-slate-400 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading skill graph...
      </div>
    )
  }
  if (error || !graph) {
    return (
      <div className="h-40 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center justify-center text-rose-400 text-xs">
        {error ?? "No graph data available."}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800/80">
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>
              <strong className="text-slate-200">{graph.occupation_count}</strong> occupations &middot;{" "}
              <strong className="text-slate-200">{graph.skill_count}</strong> real O*NET-derived skills &middot;{" "}
              <strong className="text-slate-200">{graph.edge_count}</strong> real required-skill relationships
            </span>
            <HelpTip text={graph.data_note} />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView("3d")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${view === "3d" ? "bg-indigo-600 text-white" : "bg-slate-800/60 text-slate-400"}`}
            >
              <Box className="w-3 h-3" /> 3D
            </button>
            <button
              onClick={() => setView("2d")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${view === "2d" ? "bg-indigo-600 text-white" : "bg-slate-800/60 text-slate-400"}`}
            >
              <List className="w-3 h-3" /> 2D table
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-200/80 text-[11px] flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
        {graph.data_note}
      </div>

      {view === "3d" ? (
        isWebGLAvailable() ? (
          <SkillUniverse3D nodes={graph.nodes} edges={graph.edges} categories={categories} />
        ) : (
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-amber-300 text-xs">
            WebGL isn't available in this browser/device — showing the 2D table instead.
            <SkillUniverse2D nodes={graph.nodes} edges={graph.edges} categories={categories} />
          </div>
        )
      ) : (
        <SkillUniverse2D nodes={graph.nodes} edges={graph.edges} categories={categories} />
      )}
    </div>
  )
}

const ResultStat: React.FC<{ label: string; value: string; tone?: "emerald" | "amber" }> = ({ label, value, tone }) => (
  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className={`font-mono font-bold ${tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-slate-200"}`}>{value}</div>
  </div>
)

/** Phase 7 contextual help: a small inline "?" that reveals a definition on
 * hover/focus, so technical terms (MAE, evidence grade, supply proxy...)
 * don't need a permanent block of prose cluttering the main view. */
const HelpTip: React.FC<{ text: string }> = ({ text }) => (
  <span className="group relative inline-flex">
    <HelpCircle className="w-3 h-3 text-slate-500 hover:text-slate-300 cursor-help" />
    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 p-2 rounded-lg bg-slate-900 border border-slate-700 text-[10px] text-slate-300 font-normal opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-xl">
      {text}
    </span>
  </span>
)

/** Feature G: Insight Explanation Panel. Everything here is read directly
 * off forecastDetail/backtestDetail - no invented causal narrative. */
const InsightExplanationPanel: React.FC<{
  forecastDetail: ForecastDetailResponse
  backtestDetail: BacktestDetailResponse | null
}> = ({ forecastDetail, backtestDetail }) => {
  const latest = forecastDetail.historical_series[forecastDetail.historical_series.length - 1]
  const earliest = forecastDetail.historical_series[0]
  const gapDirection = latest && latest.net_gap > 0 ? "a shortage (demand above supply)" : "a surplus (supply above demand)"
  const trendDirection =
    latest && earliest ? (latest.demand_index > earliest.demand_index ? "risen" : latest.demand_index < earliest.demand_index ? "fallen" : "stayed flat")
      : "unknown"

  return (
    <Card className="bg-slate-900/60 border-slate-800/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          What this means
        </CardTitle>
        <CardDescription className="text-[11px]">Generated from the actual values on screen — not an invented explanation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-slate-300">
        <p>
          <strong className="text-slate-100">What the data indicates:</strong> over the {forecastDetail.historical_series.length}-month
          observed window ({earliest?.year_month} &ndash; {latest?.year_month}), demand for{" "}
          <strong>{forecastDetail.occupation.title}</strong> in {forecastDetail.region.state_name} has {trendDirection}, and the
          latest observation shows {gapDirection} of {latest ? Math.abs(latest.net_gap).toFixed(1) : "—"} index points.
        </p>
        <p>
          <strong className="text-slate-100">What the model indicates:</strong>{" "}
          {forecastDetail.is_sufficient
            ? `a ${forecastDetail.evidence_grade.score >= 80 ? "high" : "moderate"}-confidence forecast is available (Grade ${forecastDetail.evidence_grade.grade}), based on ${forecastDetail.evidence_grade.observations_count} real observations.`
            : `no forecast was produced — ${forecastDetail.gating_reason ?? "insufficient history"}. The system does not fabricate a number here.`}
        </p>
        {backtestDetail && backtestDetail.backtest_steps > 0 && (
          <p>
            <strong className="text-slate-100">How the model performed historically:</strong> across {backtestDetail.backtest_steps} real
            backtest steps, the candidate model's mean absolute error was {backtestDetail.candidate_mean_abs_error?.toFixed(2)}, versus{" "}
            {backtestDetail.baseline_mean_abs_error?.toFixed(2)} for the naive baseline (
            {backtestDetail.candidate_mean_abs_error! < backtestDetail.baseline_mean_abs_error! ? "candidate wins" : "baseline wins"} on this segment).
          </p>
        )}
        <p>
          <strong className="text-slate-100">What remains uncertain:</strong> the demand series here is a synthetic demonstration
          signal (see Data Trust Centre), so this specific trend should be read as illustrative of the pipeline's behaviour, not as a
          validated real-world trend. The supply figure is a real, verified PLFS state-level employment share, not a monthly or
          district-level observation.
        </p>
        <p className="text-slate-500">
          <strong className="text-slate-400">Investigate next:</strong> compare this segment's evidence grade against its real
          backtest error on the Backtest tab, or check the Opportunity Radar to see how this segment ranks against others.
        </p>
      </CardContent>
    </Card>
  )
}

/** Feature E: Workforce Gap Analysis, as its own panel with explicit units,
 * definitions, and limitations rather than a bare number. */
const WorkforceGapPanel: React.FC<{ forecastDetail: ForecastDetailResponse }> = ({ forecastDetail }) => {
  const latest = forecastDetail.historical_series[forecastDetail.historical_series.length - 1]
  if (!latest) return null
  return (
    <Card className="bg-slate-900/60 border-slate-800/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Workforce Gap Analysis</CardTitle>
        <CardDescription className="text-[11px]">Demand vs. a defensible supply proxy — not an exact worker count</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 flex items-center gap-1">
              Demand measure <HelpTip text="A demonstration index derived from the verified supply baseline plus a documented synthetic trend/seasonality generator. Not a real job-postings count." />
            </div>
            <div className="font-mono text-lg font-bold text-emerald-400 mt-1">{latest.demand_index.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Unit: demonstration index &middot; {latest.year_month}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 flex items-center gap-1">
              Supply measure <HelpTip text="Real PLFS Annual Report 2023-24, Table 27 state-level industry employment share. An annual labour-force statistic, not a monthly figure and not a count of qualified/trained workers." />
            </div>
            <div className="font-mono text-lg font-bold text-indigo-400 mt-1">{latest.supply_index.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500 mt-1">Unit: % industry employment share &middot; annual</div>
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400">Coverage</div>
          <div className="text-slate-200 mt-0.5">
            {forecastDetail.region.state_name}, {forecastDetail.occupation.trade_category} &middot; {forecastDetail.historical_series.length} monthly observations
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-200/90">
          <strong>Limitation:</strong> these two measures are not on a directly comparable real-world unit (a demonstration index vs. a
          real percentage share) — the net gap shown is a relative indicator for this demo, not a literal worker-count shortfall. Do not
          treat the supply figure as an exact count of qualified workers available for this occupation.
        </div>
      </CardContent>
    </Card>
  )
}
