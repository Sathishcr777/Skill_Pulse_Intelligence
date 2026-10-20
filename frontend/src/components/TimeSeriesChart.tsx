import React, { useState } from "react"
import { HistoricalDataPoint, ForecastDataPoint } from "@/types/api"
import { Eye, EyeOff, Calendar, AlertTriangle } from "lucide-react"

interface ChartPoint {
  label: string
  demand: number | null
  supply: number | null
  forecast: number | null
  lowerBound: number | null
  upperBound: number | null
  isForecast: boolean
  supplySource: string | null
  demandSource: string
}

interface Props {
  historicalData: HistoricalDataPoint[]
  forecastData: ForecastDataPoint[]
  isSufficient: boolean
  gatingReason?: string | null
  stateCode: string
  occupationTitle: string
}

export const TimeSeriesChart: React.FC<Props> = ({
  historicalData,
  forecastData,
  isSufficient,
  gatingReason,
  stateCode,
  occupationTitle,
}) => {
  const [showSupply, setShowSupply] = useState(true)
  const [showBounds, setShowBounds] = useState(true)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  if (!historicalData || historicalData.length === 0) {
    return (
      <div className="h-72 rounded-xl bg-surface/60 border border-border flex items-center justify-center text-muted-foreground text-sm">
        No time series observations loaded for this selection.
      </div>
    )
  }

  const points: ChartPoint[] = historicalData.map((d) => ({
    label: d.year_month,
    demand: d.demand_index,
    supply: d.supply_index,
    forecast: null,
    lowerBound: null,
    upperBound: null,
    isForecast: false,
    supplySource: d.supply_data_source,
    demandSource: d.demand_data_source,
  }))

  const lastHist = historicalData[historicalData.length - 1]
  if (isSufficient && forecastData && forecastData.length > 0) {
    forecastData.forEach((f) => {
      points.push({
        label: f.forecast_year_month,
        demand: null,
        supply: lastHist.supply_index,
        forecast: f.predicted_demand,
        lowerBound: f.lower_bound,
        upperBound: f.upper_bound,
        isForecast: true,
        supplySource: lastHist.supply_data_source,
        demandSource: "model_generated",
      })
    })
  }

  const allValues: number[] = []
  points.forEach((p) => {
    if (p.demand !== null) allValues.push(p.demand)
    if (p.supply !== null) allValues.push(p.supply)
    if (p.forecast !== null) allValues.push(p.forecast)
    if (p.lowerBound !== null) allValues.push(p.lowerBound)
    if (p.upperBound !== null) allValues.push(p.upperBound)
  })
  const minVal = Math.max(0, Math.floor(Math.min(...allValues) * 0.85))
  const maxVal = Math.ceil(Math.max(...allValues) * 1.15)
  const valRange = maxVal - minVal || 1

  const svgWidth = 860
  const svgHeight = 300
  const padLeft = 50
  const padRight = 20
  const padTop = 24
  const padBottom = 36
  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  const getX = (i: number) => padLeft + (i / (points.length - 1 || 1)) * chartWidth
  const getY = (v: number) => padTop + chartHeight - ((v - minVal) / valRange) * chartHeight

  const histPoints = points.filter((p) => !p.isForecast)
  const fcPoints = points.filter((p) => p.isForecast)

  const demandPath = histPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.demand!)}`).join(" ")
  const supplyPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.supply!)}`).join(" ")

  let forecastPath = ""
  let boundsAreaPath = ""
  if (fcPoints.length > 0) {
    const startIndex = histPoints.length - 1
    const startX = getX(startIndex)
    const startY = getY(histPoints[startIndex].demand!)
    forecastPath =
      `M ${startX} ${startY} ` +
      fcPoints.map((p, idx) => `L ${getX(startIndex + 1 + idx)} ${getY(p.forecast!)}`).join(" ")

    if (showBounds) {
      const topPath = fcPoints.map((p, idx) => `L ${getX(startIndex + 1 + idx)} ${getY(p.upperBound!)}`).join(" ")
      const bottomRev = [...fcPoints]
        .reverse()
        .map((p, idx) => `L ${getX(points.length - 1 - idx)} ${getY(p.lowerBound!)}`)
        .join(" ")
      boundsAreaPath = `M ${startX} ${startY} ${topPath} ${bottomRev} Z`
    }
  }

  const hoverItem = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="rounded-2xl bg-surface/60 border border-border/80 p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {occupationTitle} &middot; {stateCode}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Historical series + {forecastData.length}-month forecast with confidence band. Solid = actual, dashed = forecast.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSupply(!showSupply)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 ${
              showSupply ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" : "bg-surface-hover/40 text-muted-foreground"
            }`}
          >
            {showSupply ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Supply (PLFS proxy)
          </button>
          {isSufficient && (
            <button
              onClick={() => setShowBounds(!showBounds)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 ${
                showBounds ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" : "bg-surface-hover/40 text-muted-foreground"
              }`}
            >
              {showBounds ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              Confidence band
            </button>
          )}
        </div>
      </div>

      {!isSufficient && (
        <div className="mb-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-300">Insufficient history — no forecast produced</div>
            <div className="text-amber-200/80 mt-0.5">
              {gatingReason || "Below the statistical-sufficiency threshold."} Per project rule, the system never
              fabricates a prediction here.
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full overflow-hidden select-none">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto max-h-[340px]" onMouseLeave={() => setHoverIndex(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padTop + chartHeight * ratio
            const val = Math.round(maxVal - ratio * valRange)
            return (
              <g key={i}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} stroke="#334155" strokeOpacity="0.35" strokeDasharray="4 4" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                  {val}
                </text>
              </g>
            )
          })}

          {isSufficient && fcPoints.length > 0 && (
            <g>
              <line
                x1={getX(histPoints.length - 1)}
                y1={padTop}
                x2={getX(histPoints.length - 1)}
                y2={padTop + chartHeight}
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text x={getX(histPoints.length - 1) + 6} y={padTop + 12} fontSize="10" fill="#38bdf8" fontWeight="600">
                FORECAST &rarr;
              </text>
            </g>
          )}

          {boundsAreaPath && <path d={boundsAreaPath} fill="#06b6d4" fillOpacity="0.12" />}
          {showSupply && <path d={supplyPath} fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="5 3" />}
          <path d={demandPath} fill="none" stroke="#10b981" strokeWidth="2.5" />
          {isSufficient && forecastPath && <path d={forecastPath} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeDasharray="2 2" />}

          {points.map((p, idx) => {
            const x = getX(idx)
            const y = p.isForecast ? getY(p.forecast!) : getY(p.demand!)
            const isHovered = hoverIndex === idx
            return (
              <g key={idx} onMouseEnter={() => setHoverIndex(idx)} className="cursor-pointer">
                <rect x={x - 12} y={padTop} width="24" height={chartHeight} fill="transparent" />
                <circle cx={x} cy={y} r={isHovered ? 6 : p.isForecast ? 4 : 3} fill={p.isForecast ? "#06b6d4" : "#10b981"} stroke="#0f172a" strokeWidth="2" />
                {(idx % 3 === 0 || idx === points.length - 1) && (
                  <text x={x} y={padTop + chartHeight + 18} textAnchor="middle" fontSize="9.5" fill={p.isForecast ? "#38bdf8" : "#94a3b8"} fontFamily="monospace">
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}

          {hoverIndex !== null && (
            <line x1={getX(hoverIndex)} y1={padTop} x2={getX(hoverIndex)} y2={padTop + chartHeight} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
          )}
        </svg>

        {hoverItem && (
          <div
            className="absolute top-2 pointer-events-none rounded-xl bg-surface/95 border border-border p-3 shadow-2xl text-xs space-y-1 z-20"
            style={{ left: `${Math.min(Math.max(10, (hoverIndex! / points.length) * 100 - 15), 65)}%` }}
          >
            <div className="flex items-center justify-between gap-4 border-b border-border pb-1 font-mono font-semibold text-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                {hoverItem.label}
              </span>
              <span className={hoverItem.isForecast ? "text-cyan-600 dark:text-cyan-400" : "text-emerald-600 dark:text-emerald-400"}>
                {hoverItem.isForecast ? "Forecast" : "Historical"}
              </span>
            </div>
            {hoverItem.demand !== null && (
              <div className="flex items-center justify-between gap-4 text-emerald-600 dark:text-emerald-400">
                <span>Demand:</span>
                <span className="font-bold">{hoverItem.demand.toFixed(1)}</span>
              </div>
            )}
            {hoverItem.forecast !== null && (
              <div className="flex items-center justify-between gap-4 text-cyan-600 dark:text-cyan-400">
                <span>Forecast:</span>
                <span className="font-bold">{hoverItem.forecast.toFixed(1)}</span>
              </div>
            )}
            {hoverItem.lowerBound !== null && hoverItem.upperBound !== null && (
              <div className="flex items-center justify-between gap-4 text-cyan-200/70 text-[11px]">
                <span>95% bounds:</span>
                <span>[{hoverItem.lowerBound.toFixed(1)} - {hoverItem.upperBound.toFixed(1)}]</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 text-indigo-600 dark:text-indigo-400">
              <span>Supply proxy:</span>
              <span className="font-bold">{hoverItem.supply?.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[10px] pt-1 border-t border-border/80">
              <span className="text-muted-foreground">Supply source:</span>
              <span className={hoverItem.supplySource === "verified_real" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
                {hoverItem.supplySource === "verified_real" ? "Verified (PLFS Table 27)" : "Unavailable"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[10px]">
              <span className="text-muted-foreground">Demand source:</span>
              <span className={hoverItem.demandSource === "verified_real" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
                {hoverItem.demandSource === "model_generated" ? "Model-generated forecast" : "Synthetic demo (not verified)"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
