import React, { useEffect, useState, useCallback, useMemo } from "react"
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Database,
  HelpCircle,
  Lightbulb,
  Globe,
  Box,
  List,
  Home,
  ChevronRight,
  Info,
  BarChart3,
  CalendarClock,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  Briefcase,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { TimeSeriesChart } from "@/components/TimeSeriesChart"
import { BacktestChart } from "@/components/BacktestChart"
import { WhatIfSimulator } from "@/components/WhatIfSimulator"
import { SkillUniverse3D } from "@/components/SkillUniverse3D"
import { OccupationExplorer } from "@/components/OccupationExplorer"
import { GuidedDemo, DEMO_STEPS } from "@/components/GuidedDemo"
import { SkillUniverse2D, isWebGLAvailable } from "@/components/SkillUniverse2D"
import { Sidebar, Tab } from "@/components/Sidebar"
import { Topbar } from "@/components/Topbar"
import { EvidenceGauge } from "@/components/EvidenceGauge"
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

const HORIZON_OPTIONS = [3, 6, 9, 12] as const
const SIDEBAR_STORAGE_KEY = "skillpulse-sidebar-collapsed"

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("forecast")
  const [selectedRegion, setSelectedRegion] = useState<string>("MH")
  const [selectedOccupationCode, setSelectedOccupationCode] = useState<number>(7411.01)
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [horizonMonths, setHorizonMonths] = useState<number>(6)
  const [demoActive, setDemoActive] = useState(false)
  const [demoStep, setDemoStep] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
    } catch {
      return false
    }
  })
  const [showOccupationDetails, setShowOccupationDetails] = useState(false)

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

  // Guided demo drives the app's REAL state - same setters a user would
  // trigger by clicking - rather than rendering a separate fake UI.
  useEffect(() => {
    if (!demoActive) return
    const step = DEMO_STEPS[demoStep]
    setActiveTab(step.tab)
    if (step.region) setSelectedRegion(step.region)
    if (step.occupationCode) setSelectedOccupationCode(step.occupationCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoActive, demoStep])

  const startDemo = () => {
    setDemoStep(0)
    setDemoActive(true)
  }
  const exitDemo = () => setDemoActive(false)

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

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch {
        // ignore - collapse state still works for this session
      }
      return next
    })
  }

  const selectedOccupation = useMemo(
    () => occupations.find((o) => Math.abs(o.nco_code - selectedOccupationCode) < 0.001),
    [occupations, selectedOccupationCode]
  )

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar
        active={activeTab}
        onSelect={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        gatedCount={marketOverview?.excluded_segments ?? 0}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          regions={regions}
          occupations={occupations}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
          onJumpToOccupation={(code) => {
            setSelectedOccupationCode(code)
            setActiveTab("forecast")
          }}
          onStartDemo={startDemo}
          onRefresh={fetchInitialData}
          refreshing={loadingInitial}
        />

        <div className="px-5 py-2 border-b border-border/60 bg-amber-50/60 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-200/90 flex items-center gap-2 shrink-0">
          <Info className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          Supply proxy: verified PLFS Annual Report 2023-24 (Table 27) state-level industry shares — periodically
          refreshed, never real-time. Demand signal is a synthetic demonstration series — see{" "}
          <button onClick={() => setActiveTab("trust")} className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100">
            Data Trust Centre
          </button>{" "}
          for the full breakdown.
        </div>

        <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-500/30 text-rose-700 dark:text-rose-200 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
              <Button size="sm" variant="outline" onClick={fetchInitialData} className="border-rose-500/40 text-rose-700 dark:text-rose-200">Retry</Button>
            </div>
          )}

          {marketOverview && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                icon={TrendingUp}
                tone="emerald"
                label="Segments Forecastable"
                value={marketOverview.sufficient_segments}
                suffix={<span className="text-xs text-rose-600 dark:text-rose-400 font-semibold ml-1.5">({marketOverview.excluded_segments} gated)</span>}
              />
              <KpiCard
                icon={ShieldCheck}
                tone="cyan"
                label="Evidence Grade Split"
                value={`${marketOverview.grade_distribution.A ?? 0} A / ${marketOverview.grade_distribution.B ?? 0} B / ${marketOverview.grade_distribution.C ?? 0} C`}
                small
              />
              <KpiCard
                icon={BarChart3}
                tone="indigo"
                label="Model vs Baseline (MAE)"
                value={modelStatus ? `${modelStatus.overall_candidate_metrics.mae.toFixed(2)} vs ${modelStatus.overall_baseline_metrics.mae.toFixed(2)}` : "—"}
                small
              />
              <KpiCard
                icon={CalendarClock}
                tone="slate"
                label="Data Vintage"
                value={marketOverview.latest_data_vintage}
                small
              />
            </div>
          )}

          {activeTab === "forecast" && (
            <>
              {forecastDetail && (
                <OccupationHero
                  forecastDetail={forecastDetail}
                  occupation={selectedOccupation}
                  showDetails={showOccupationDetails}
                  onToggleDetails={() => setShowOccupationDetails((s) => !s)}
                />
              )}
              <div className="p-4 rounded-2xl bg-surface/60 border border-border/80 space-y-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {tradeCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                        selectedCategory === cat ? "bg-surface-hover text-white" : "bg-surface-sunken/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <OccupationExplorer
                  occupations={occupations}
                  selectedRegion={selectedRegion}
                  selectedOccupationCode={selectedOccupationCode}
                  selectedCategory={selectedCategory}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  onSelect={setSelectedOccupationCode}
                />
              </div>
            </>
          )}

        {activeTab === "forecast" &&
          (loadingForecast && !forecastDetail ? (
            <div className="h-72 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading forecast...
            </div>
          ) : forecastDetail ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    Forecast horizon
                    <HelpTip text="How many months ahead to show. The model always produces the full 12-month forecast — this only changes how much of it is displayed." />
                  </span>
                  <div className="flex items-center gap-1">
                    {HORIZON_OPTIONS.map((h) => (
                      <button
                        key={h}
                        onClick={() => setHorizonMonths(h)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          horizonMonths === h ? "bg-cyan-600 text-white" : "bg-surface-hover/60 text-muted-foreground hover:text-foreground"
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
                <DemandSupplyMiniCard forecastDetail={forecastDetail} onViewDetails={() => setActiveTab("insights")} />
              </div>
              <div className="space-y-4">
                <Card className="bg-surface/60 border-border/80">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm">Evidence Grade</CardTitle>
                      <CardDescription className="text-[11px]">Deterministic score, 0-100</CardDescription>
                    </div>
                    <HelpTip text="Volume (40pts, more real observations = higher) + Agreement (35pts, demand/supply source consistency) + Recency (25pts, how current the data is). Computed deterministically, not a model guess." />
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    <div className="flex items-center justify-center py-1">
                      <EvidenceGauge grade={forecastDetail.evidence_grade.grade} score={forecastDetail.evidence_grade.score} />
                    </div>
                    {forecastDetail.evidence_grade.is_sufficient ? (
                      <Badge variant="success" className="w-full justify-center py-1">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Statistically sufficient
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="w-full justify-center py-1">
                        <AlertCircle className="w-3 h-3 mr-1" /> Insufficient
                      </Badge>
                    )}
                    <div className="space-y-1.5 pt-2 border-t border-border/60">
                      <EvidenceBar label="Data volume" value={forecastDetail.evidence_grade.volume_score} max={40} />
                      <EvidenceBar label="Source agreement" value={forecastDetail.evidence_grade.agreement_score} max={35} />
                      <EvidenceBar label="Data recency" value={forecastDetail.evidence_grade.recency_score} max={25} />
                      <div className="flex justify-between pt-1"><span className="text-muted-foreground">Observations</span><span className="font-mono font-semibold text-foreground">{forecastDetail.evidence_grade.observations_count}</span></div>
                    </div>
                  </CardContent>
                </Card>
                <KeyInsightsCard forecastDetail={forecastDetail} backtestDetail={backtestDetail} />
                <Card className="bg-surface/60 border-border/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Top Related Skills</CardTitle>
                    <CardDescription className="text-[11px]">Real O*NET-derived importance scores</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    {selectedOccupationSkills.length > 0 ? (
                      selectedOccupationSkills.map((sk) => (
                        <div key={sk.skill_id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-foreground font-medium">{sk.skill_name}</span>
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{(sk.importance_score * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                              style={{ width: `${Math.round(sk.importance_score * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">No curated skill mapping for this trade yet.</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="h-40 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
              No forecast data for this selection.
            </div>
          ))}

        {activeTab === "insights" && (
          forecastDetail ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InsightExplanationPanel forecastDetail={forecastDetail} backtestDetail={backtestDetail} />
              <WorkforceGapPanel forecastDetail={forecastDetail} />
            </div>
          ) : (
            <div className="h-40 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
              Select an occupation on the Dashboard tab first to see its insights.
            </div>
          )
        )}

        {activeTab === "radar" && marketOverview && (
          <OpportunityRadarPanel overview={marketOverview} onSelect={handleSelectSegment} />
        )}

        {activeTab === "universe" && <SkillUniversePanel focusOccupationCode={selectedOccupationCode} />}

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
            <div className="h-40 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
              Select a state and occupation on the Forecast tab first to run a scenario.
            </div>
          ))}

        {activeTab === "backtest" &&
          (loadingBacktest ? (
            <div className="h-72 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
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
            <div className="h-40 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
              No backtest data for this selection.
            </div>
          ))}

        {activeTab === "trust" && <DataTrustCentre modelStatus={modelStatus} marketOverview={marketOverview} />}
        </main>
      </div>

      {demoActive && (
        <GuidedDemo
          stepIndex={demoStep}
          onNext={() => setDemoStep((s) => Math.min(s + 1, DEMO_STEPS.length - 1))}
          onBack={() => setDemoStep((s) => Math.max(s - 1, 0))}
          onExit={exitDemo}
        />
      )}
    </div>
  )
}

const KPI_TONE: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
}

const KpiCard: React.FC<{
  icon: React.ElementType
  tone: "emerald" | "cyan" | "indigo" | "slate"
  label: string
  value: React.ReactNode
  suffix?: React.ReactNode
  small?: boolean
}> = ({ icon: Icon, tone, label, value, suffix, small }) => (
  <Card className="bg-surface/60 border-border/80">
    <CardContent className="p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${KPI_TONE[tone]}`}>
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</div>
        <div className={`${small ? "text-base" : "text-2xl"} font-black text-foreground font-mono mt-0.5 truncate`}>
          {value}
          {suffix}
        </div>
      </div>
    </CardContent>
  </Card>
)

const EvidenceBar: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => (
  <div>
    <div className="flex justify-between mb-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-foreground">{value}/{max}</span>
    </div>
    <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  </div>
)

/** Hero banner for the selected occupation on the Dashboard tab. Every
 * figure shown is read directly from ForecastDetailResponse/Occupation -
 * there is no fabricated "total workforce" headcount, since the project
 * has no real source for that number. "View Occupation Details" expands
 * real fields (description, NCO classification) already in the API
 * response rather than opening a dead link. */
const OccupationHero: React.FC<{
  forecastDetail: ForecastDetailResponse
  occupation: Occupation | undefined
  showDetails: boolean
  onToggleDetails: () => void
}> = ({ forecastDetail, occupation, showDetails, onToggleDetails }) => {
  const { occupation: occ, region, evidence_grade } = forecastDetail
  const latest = forecastDetail.historical_series[forecastDetail.historical_series.length - 1]

  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-cyan-700 dark:from-indigo-950 dark:via-indigo-900 dark:to-cyan-950 border border-indigo-500/20 p-6 text-white shadow-xl">
      <div className="flex items-center gap-1.5 text-[11px] text-indigo-100/80 mb-3">
        <Home className="w-3 h-3" /> Home <ChevronRight className="w-3 h-3" /> Dashboard <ChevronRight className="w-3 h-3" />
        <span className="text-white font-semibold">{occ.title}</span>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-2.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 border border-white/20 font-mono">{occ.nco_code_str || occ.nco_code}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 border border-white/20">{occ.trade_category}</span>
          </div>
          <h2 className="text-[28px] sm:text-[32px] font-black tracking-tight leading-tight">{occ.title}</h2>
          {occ.description && <p className="text-indigo-100/90 text-sm max-w-2xl">{occ.description}</p>}
          <div className="flex items-center gap-4 flex-wrap pt-1 text-xs">
            <HeroStat label="Evidence Grade" value={evidence_grade.grade} />
            <HeroStat label="Observations" value={String(evidence_grade.observations_count)} />
            {latest && <HeroStat label="Supply share (PLFS)" value={`${latest.supply_index.toFixed(1)}%`} />}
            <HeroStat label="Region" value={`${region.state_name}`} />
          </div>
        </div>
        <Button
          onClick={onToggleDetails}
          variant="outline"
          size="sm"
          className="shrink-0 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white"
        >
          {showDetails ? "Hide" : "View"} Occupation Details <ChevronRight className={`w-3.5 h-3.5 ml-1.5 transition-transform ${showDetails ? "rotate-90" : ""}`} />
        </Button>
      </div>
      {showDetails && occupation && (
        <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <HeroDetail label="Division" value={occupation.division} />
          <HeroDetail label="Sub-division" value={occupation.sub_division} />
          <HeroDetail label="Group code" value={occupation.group_code} />
          <HeroDetail label="Family" value={occupation.family} />
        </div>
      )}
    </div>
  )
}

const HeroStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-1.5">
    <Briefcase className="w-3.5 h-3.5 text-indigo-200" />
    <span className="text-indigo-200/80">{label}:</span>
    <span className="font-bold font-mono">{value}</span>
  </div>
)

const HeroDetail: React.FC<{ label: string; value: number | undefined }> = ({ label, value }) => (
  <div className="bg-white/10 rounded-lg p-2.5 border border-white/15">
    <div className="text-indigo-200/80 text-[10px] uppercase tracking-wide">{label}</div>
    <div className="font-mono font-bold">{value ?? "—"}</div>
  </div>
)

const OpportunityRadarPanel: React.FC<{
  overview: MarketOverviewResponse
  onSelect: (nco: number, state: string) => void
}> = ({ overview, onSelect }) => (
  <div className="space-y-5">
    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-50 dark:bg-amber-950/30 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
  <Card className="bg-surface/60 border-border/80">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-1.5">
      {items.length === 0 && <div className="text-xs text-muted-foreground">No segments to show.</div>}
      {items.map((item, i) => (
        <button
          key={`${item.state_code}-${item.nco_code}-${i}`}
          onClick={() => onSelect(item.nco_code, item.state_code)}
          className="w-full text-left p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80 hover:border-indigo-500/50 flex items-center justify-between text-xs"
        >
          <div>
            <div className="text-foreground font-medium">{item.title}</div>
            <div className="text-muted-foreground">{item.state_name} &middot; {item.trade_category} &middot; Grade {item.evidence_grade}</div>
          </div>
          <span className={`font-mono font-bold ${tone === "rose" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
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
      <Card className="bg-surface/60 border-border/80">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Evidence-grade validation has not been computed yet. Run <code className="text-foreground-secondary">python -m ml.evaluate.backtest</code>.
        </CardContent>
      </Card>
    )
  }
  const supported = validation.hypothesis_low_evidence_means_higher_error_supported
  return (
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Does the evidence grade actually predict error?</CardTitle>
        <CardDescription className="text-[11px]">
          The core differentiator's proof point, computed from real backtest results — reported honestly either way.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className={`flex items-center gap-2 p-2.5 rounded-lg ${supported ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300"}`}>
          {supported ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span className="font-semibold">
            Hypothesis ("lower evidence grade correlates with higher real error") {supported ? "supported" : "not supported"} by this run.
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1">Grade</th>
              <th className="text-right py-1">Mean Abs Error</th>
              <th className="text-right py-1">N segments</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(validation.mean_abs_error_by_grade ?? {}).map(([grade, stats]) => (
              <tr key={grade} className="border-b border-border/50">
                <td className="py-1 text-foreground font-semibold">{grade}</td>
                <td className="py-1 text-right font-mono">{stats.mean_abs_error}</td>
                <td className="py-1 text-right text-muted-foreground">{stats.n_segments}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-muted-foreground">
          Rank correlation (score vs. error): <span className="font-mono text-foreground-secondary">{validation.spearman_like_rank_correlation_score_vs_error}</span>{" "}
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
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Model performance by trade category</CardTitle>
        <CardDescription className="text-[11px]">Real walk-forward backtest results, broken down by segment group — not just the single selected segment above</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border text-left">
              <th className="py-1 pr-2">Category</th>
              <th className="py-1 pr-2 text-right">Segments</th>
              <th className="py-1 pr-2 text-right">Baseline MAE</th>
              <th className="py-1 pr-2 text-right">Candidate MAE</th>
              <th className="py-1 text-right">Candidate win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([category, m]) => (
              <tr key={category} className="border-b border-border/50 hover:bg-surface-hover/20">
                <td className="py-1.5 pr-2 text-foreground">{category}</td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">{m.evaluated_segments}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-amber-600 dark:text-amber-400">{m.baseline_mean_mae}</td>
                <td className="py-1.5 pr-2 text-right font-mono text-cyan-600 dark:text-cyan-400">{m.candidate_mean_mae}</td>
                <td className={`py-1.5 text-right font-mono font-semibold ${m.candidate_win_rate_pct >= 50 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
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
      <Card className="bg-surface/60 border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Data sources &amp; classification</CardTitle>
          <CardDescription className="text-[11px]">
            Live from <code>GET /data-trust</code> — click a source for its full citation and limitations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {loading && <div className="text-muted-foreground">Loading manifest...</div>}
          {!loading && !manifest && <div className="text-rose-600 dark:text-rose-400">Could not load the data trust manifest from the API.</div>}
          {manifest?.sources.map((src) => {
            const meta = CLASSIFICATION_META[src.classification] ?? CLASSIFICATION_META.estimated
            const isOpen = expanded === src.name
            return (
              <div key={src.name} className="rounded-lg bg-surface-sunken/60 border border-border/80 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : src.name)}
                  className="w-full p-2.5 flex items-center justify-between text-left hover:bg-surface/40 transition-colors"
                >
                  <div>
                    <span className="text-foreground font-medium">{src.name}</span>
                    <span className="text-muted-foreground ml-2 text-[10px]">{src.source_type}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-muted-foreground text-[10px]">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="p-3 pt-0 space-y-1.5 text-[11px] text-muted-foreground border-t border-border/60">
                    <DetailRow label="Observation period" value={src.observation_period ?? "—"} />
                    <DetailRow label="Publication date" value={src.publication_date ?? "—"} />
                    <DetailRow label="Geographic coverage" value={src.geographic_coverage} />
                    <DetailRow label="Record count" value={src.record_count?.toLocaleString() ?? "—"} />
                    <DetailRow label="Ingested" value={src.ingestion_timestamp ? new Date(src.ingestion_timestamp).toLocaleString() : "—"} />
                    {src.citation_url && (
                      <DetailRow
                        label="Source"
                        value={
                          <a href={src.citation_url} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline break-all">
                            {src.citation_url}
                          </a>
                        }
                      />
                    )}
                    <div className="pt-1.5 border-t border-border/60 text-amber-700 dark:text-amber-200/80">
                      <strong className="text-amber-700 dark:text-amber-300">Limitations:</strong> {src.limitations}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="bg-surface/60 border-border/80">
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
              <div className="text-muted-foreground mb-1.5">Missingness by column (0% expected — rows with gaps are excluded, not filled)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {Object.entries(manifest.panel_quality.missingness_pct).map(([col, pct]) => (
                  <div key={col} className={`px-2 py-1 rounded-md text-[10px] font-mono flex justify-between ${pct > 0 ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" : "bg-surface-sunken/60 text-muted-foreground"}`}>
                    <span>{col}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-surface/60 border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data freshness &amp; model provenance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Data vintage</div>
            <div className="font-mono text-foreground text-sm">{marketOverview?.latest_data_vintage ?? "—"}</div>
            <div className="text-amber-600 dark:text-amber-400 text-[10px] mt-1">Periodically refreshed — never real-time</div>
          </div>
          <div className="p-3 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Training window</div>
            <div className="font-mono text-foreground text-sm">
              {modelStatus ? `${modelStatus.training_window.start_date} → ${modelStatus.training_window.end_date}` : "—"}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Candidate model</div>
            <div className="text-foreground">{modelStatus?.candidate_model ?? "—"}</div>
          </div>
          <div className="p-3 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Baseline model</div>
            <div className="text-foreground">{modelStatus?.baseline_model ?? "—"}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-foreground-secondary text-right">{value}</span>
  </div>
)

/** Phase 4: Skill Relationship Universe. Fetches the real occupation<->skill
 * graph once and renders it as either an interactive 3D scene or an
 * accessible 2D table, auto-falling back to 2D when WebGL isn't available
 * rather than showing a broken canvas. */
const SkillUniversePanel: React.FC<{ focusOccupationCode: number }> = ({ focusOccupationCode }) => {
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
      <div className="h-72 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-muted-foreground text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading skill graph...
      </div>
    )
  }
  if (error || !graph) {
    return (
      <div className="h-40 rounded-2xl bg-surface/40 border border-border flex items-center justify-center text-rose-600 dark:text-rose-400 text-xs">
        {error ?? "No graph data available."}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="bg-surface/60 border-border/80">
        <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>
              <strong className="text-foreground">{graph.occupation_count}</strong> occupations &middot;{" "}
              <strong className="text-foreground">{graph.skill_count}</strong> real O*NET-derived skills &middot;{" "}
              <strong className="text-foreground">{graph.edge_count}</strong> real required-skill relationships
            </span>
            <HelpTip text={graph.data_note} />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView("3d")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${view === "3d" ? "bg-indigo-600 text-white" : "bg-surface-hover/60 text-muted-foreground"}`}
            >
              <Box className="w-3 h-3" /> 3D
            </button>
            <button
              onClick={() => setView("2d")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${view === "2d" ? "bg-indigo-600 text-white" : "bg-surface-hover/60 text-muted-foreground"}`}
            >
              <List className="w-3 h-3" /> 2D table
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-amber-800 dark:text-amber-700 dark:text-amber-200/80 text-[11px] flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        {graph.data_note}
      </div>

      {view === "3d" ? (
        isWebGLAvailable() ? (
          <SkillUniverse3D nodes={graph.nodes} edges={graph.edges} categories={categories} focusOccupationCode={focusOccupationCode} />
        ) : (
          <div className="p-4 rounded-2xl bg-surface/40 border border-border text-amber-700 dark:text-amber-700 dark:text-amber-300 text-xs">
            WebGL isn't available in this browser/device — showing the 2D table instead.
            <SkillUniverse2D nodes={graph.nodes} edges={graph.edges} categories={categories} focusOccupationCode={focusOccupationCode} />
          </div>
        )
      ) : (
        <SkillUniverse2D nodes={graph.nodes} edges={graph.edges} categories={categories} focusOccupationCode={focusOccupationCode} />
      )}
    </div>
  )
}

const ResultStat: React.FC<{ label: string; value: string; tone?: "emerald" | "amber" }> = ({ label, value, tone }) => (
  <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className={`font-mono font-bold ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{value}</div>
  </div>
)

/** Phase 7 contextual help: a small inline "?" that reveals a definition on
 * hover/focus, so technical terms (MAE, evidence grade, supply proxy...)
 * don't need a permanent block of prose cluttering the main view. */
const HelpTip: React.FC<{ text: string }> = ({ text }) => (
  <span className="group relative inline-flex">
    <HelpCircle className="w-3 h-3 text-muted-foreground hover:text-foreground-secondary cursor-help" />
    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 p-2 rounded-lg bg-surface border border-border text-[10px] text-foreground-secondary font-normal opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-xl">
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
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          What this means
        </CardTitle>
        <CardDescription className="text-[11px]">Generated from the actual values on screen — not an invented explanation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-foreground-secondary">
        <p>
          <strong className="text-foreground">What the data indicates:</strong> over the {forecastDetail.historical_series.length}-month
          observed window ({earliest?.year_month} &ndash; {latest?.year_month}), demand for{" "}
          <strong>{forecastDetail.occupation.title}</strong> in {forecastDetail.region.state_name} has {trendDirection}, and the
          latest observation shows {gapDirection} of {latest ? Math.abs(latest.net_gap).toFixed(1) : "—"} index points.
        </p>
        <p>
          <strong className="text-foreground">What the model indicates:</strong>{" "}
          {forecastDetail.is_sufficient
            ? `a ${forecastDetail.evidence_grade.score >= 80 ? "high" : "moderate"}-confidence forecast is available (Grade ${forecastDetail.evidence_grade.grade}), based on ${forecastDetail.evidence_grade.observations_count} real observations.`
            : `no forecast was produced — ${forecastDetail.gating_reason ?? "insufficient history"}. The system does not fabricate a number here.`}
        </p>
        {backtestDetail && backtestDetail.backtest_steps > 0 && (
          <p>
            <strong className="text-foreground">How the model performed historically:</strong> across {backtestDetail.backtest_steps} real
            backtest steps, the candidate model's mean absolute error was {backtestDetail.candidate_mean_abs_error?.toFixed(2)}, versus{" "}
            {backtestDetail.baseline_mean_abs_error?.toFixed(2)} for the naive baseline (
            {backtestDetail.candidate_mean_abs_error! < backtestDetail.baseline_mean_abs_error! ? "candidate wins" : "baseline wins"} on this segment).
          </p>
        )}
        <p>
          <strong className="text-foreground">What remains uncertain:</strong> the demand series here is a synthetic demonstration
          signal (see Data Trust Centre), so this specific trend should be read as illustrative of the pipeline's behaviour, not as a
          validated real-world trend. The supply figure is a real, verified PLFS state-level employment share, not a monthly or
          district-level observation.
        </p>
        <p className="text-muted-foreground">
          <strong className="text-muted-foreground">Investigate next:</strong> compare this segment's evidence grade against its real
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
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Workforce Gap Analysis</CardTitle>
        <CardDescription className="text-[11px]">Demand vs. a defensible supply proxy — not an exact worker count</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground flex items-center gap-1">
              Demand measure <HelpTip text="A demonstration index derived from the verified supply baseline plus a documented synthetic trend/seasonality generator. Not a real job-postings count." />
            </div>
            <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{latest.demand_index.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Unit: demonstration index &middot; {latest.year_month}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground flex items-center gap-1">
              Supply measure <HelpTip text="Real PLFS Annual Report 2023-24, Table 27 state-level industry employment share. An annual labour-force statistic, not a monthly figure and not a count of qualified/trained workers." />
            </div>
            <div className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">{latest.supply_index.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Unit: % industry employment share &middot; annual</div>
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
          <div className="text-muted-foreground">Coverage</div>
          <div className="text-foreground mt-0.5">
            {forecastDetail.region.state_name}, {forecastDetail.occupation.trade_category} &middot; {forecastDetail.historical_series.length} monthly observations
          </div>
        </div>
        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-amber-800 dark:text-amber-700 dark:text-amber-200/90">
          <strong>Limitation:</strong> these two measures are not on a directly comparable real-world unit (a demonstration index vs. a
          real percentage share) — the net gap shown is a relative indicator for this demo, not a literal worker-count shortfall. Do not
          treat the supply figure as an exact count of qualified workers available for this occupation.
        </div>
      </CardContent>
    </Card>
  )
}

/** Three real, computed bullets - not a canned "insights" widget. Each line
 * is derived directly from the same forecastDetail/backtestDetail already
 * on screen (trend = real % change across the observed window, category =
 * the occupation's real trade_category, backtest = the real candidate-vs-
 * baseline result for this segment). */
const KeyInsightsCard: React.FC<{ forecastDetail: ForecastDetailResponse; backtestDetail: BacktestDetailResponse | null }> = ({
  forecastDetail,
  backtestDetail,
}) => {
  const series = forecastDetail.historical_series
  const latest = series[series.length - 1]
  const earliest = series[0]
  const pctChange = earliest && latest && earliest.demand_index !== 0
    ? (((latest.demand_index - earliest.demand_index) / Math.abs(earliest.demand_index)) * 100)
    : null

  const items: { icon: React.ElementType; tone: string; text: React.ReactNode }[] = []
  if (pctChange !== null) {
    items.push({
      icon: TrendingUp,
      tone: pctChange >= 0 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-rose-600 dark:text-rose-400 bg-rose-500/10",
      text: <><strong className="font-mono">{pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%</strong> change in demand index over the {series.length}-month observed window</>,
    })
  }
  items.push({
    icon: Briefcase,
    tone: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
    text: <>Classified under <strong>{forecastDetail.occupation.trade_category}</strong> in {forecastDetail.region.state_name}</>,
  })
  if (backtestDetail && backtestDetail.candidate_mean_abs_error != null && backtestDetail.baseline_mean_abs_error != null) {
    const candidateWins = backtestDetail.candidate_mean_abs_error < backtestDetail.baseline_mean_abs_error
    items.push({
      icon: ShieldCheck,
      tone: candidateWins ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      text: <>Candidate model {candidateWins ? "beats" : "does not beat"} the naive baseline on this segment's real backtest</>,
    })
  }

  return (
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Key Insights</CardTitle>
        <CardDescription className="text-[11px]">Computed from the data on screen, not canned text</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 text-xs">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${it.tone}`}>
              <it.icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-foreground-secondary leading-snug pt-1">{it.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Condensed version of WorkforceGapPanel for the Dashboard tab - the full
 * panel (with the limitation disclosure) lives on the Insights tab so it
 * isn't duplicated across two pages. */
const DemandSupplyMiniCard: React.FC<{ forecastDetail: ForecastDetailResponse; onViewDetails: () => void }> = ({ forecastDetail, onViewDetails }) => {
  const latest = forecastDetail.historical_series[forecastDetail.historical_series.length - 1]
  if (!latest) return null
  const gapIsShortage = latest.net_gap > 0
  return (
    <Card className="bg-surface/60 border-border/80">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">Demand vs Supply Analysis</CardTitle>
          <CardDescription className="text-[11px]">{forecastDetail.region.state_name} &middot; {latest.year_month}</CardDescription>
        </div>
        <button onClick={onViewDetails} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0">
          View in Insights <ChevronRight className="w-3 h-3" />
        </button>
      </CardHeader>
      <CardContent className="space-y-2.5 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Estimated Demand <span className="text-[10px]">(index)</span></div>
            <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{latest.demand_index.toFixed(1)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-sunken/60 border border-border/80">
            <div className="text-muted-foreground">Estimated Supply <span className="text-[10px]">(PLFS %)</span></div>
            <div className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-1">{latest.supply_index.toFixed(1)}</div>
          </div>
        </div>
        <div className={`p-2.5 rounded-lg border flex items-center justify-between ${gapIsShortage ? "bg-amber-50 dark:bg-amber-950/30 border-amber-500/30" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30"}`}>
          <div className="flex items-center gap-2">
            <AlertCircle className={`w-4 h-4 shrink-0 ${gapIsShortage ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} />
            <span className={`font-semibold ${gapIsShortage ? "text-amber-800 dark:text-amber-200" : "text-emerald-800 dark:text-emerald-200"}`}>
              {gapIsShortage ? "Potential Gap" : "Surplus"}
            </span>
          </div>
          <span className={`font-mono font-bold ${gapIsShortage ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>
            {gapIsShortage ? "+" : ""}{latest.net_gap.toFixed(1)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
