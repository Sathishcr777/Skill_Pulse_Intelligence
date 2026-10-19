import React, { useState } from "react"
import { BacktestPointResponse } from "@/types/api"
import { Calendar, Info } from "lucide-react"

interface Props {
  points: BacktestPointResponse[]
  evidenceGrade: string
  candidateMeanAbsError: number | null
  baselineMeanAbsError: number | null
  occupationTitle: string
  stateCode: string
}

export const BacktestChart: React.FC<Props> = ({
  points,
  evidenceGrade,
  candidateMeanAbsError,
  baselineMeanAbsError,
  occupationTitle,
  stateCode,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  if (!points || points.length === 0) {
    return (
      <div className="h-64 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-sm gap-1">
        <Info className="w-5 h-5" />
        <span>No backtest replay available — this segment was gated as insufficient-history.</span>
        <span className="text-[11px] text-slate-600">
          Per project rule, the system does not force a backtest where it would not force a forecast.
        </span>
      </div>
    )
  }

  const allVals = points.flatMap((p) => [p.actual, p.baseline_prediction, p.candidate_prediction])
  const minVal = Math.max(0, Math.floor(Math.min(...allVals) * 0.85))
  const maxVal = Math.ceil(Math.max(...allVals) * 1.15)
  const valRange = maxVal - minVal || 1

  const svgWidth = 860
  const svgHeight = 260
  const padLeft = 50
  const padRight = 20
  const padTop = 20
  const padBottom = 34
  const chartWidth = svgWidth - padLeft - padRight
  const chartHeight = svgHeight - padTop - padBottom

  const getX = (i: number) => padLeft + (i / (points.length - 1 || 1)) * chartWidth
  const getY = (v: number) => padTop + chartHeight - ((v - minVal) / valRange) * chartHeight

  const pathFor = (key: "actual" | "baseline_prediction" | "candidate_prediction") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p[key])}`).join(" ")

  const hoverItem = hoverIndex !== null ? points[hoverIndex] : null
  const candidateWins = candidateMeanAbsError !== null && baselineMeanAbsError !== null && candidateMeanAbsError < baselineMeanAbsError

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-slate-800/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">
            Backtest replay: {occupationTitle} &middot; {stateCode}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            At each step, the model only ever saw data up to that point — a genuine out-of-sample walk-forward
            replay, not a fit-the-whole-series chart.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2 py-1 rounded-md bg-slate-800/60 text-slate-300">Grade {evidenceGrade}</span>
          {candidateMeanAbsError !== null && (
            <span className={`px-2 py-1 rounded-md font-semibold ${candidateWins ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
              Candidate MAE {candidateMeanAbsError.toFixed(2)} {candidateWins ? "< " : "> "}
              Baseline {baselineMeanAbsError?.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden select-none">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto max-h-[300px]" onMouseLeave={() => setHoverIndex(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padTop + chartHeight * ratio
            const val = Math.round(maxVal - ratio * valRange)
            return (
              <g key={i}>
                <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y} stroke="#334155" strokeOpacity="0.35" strokeDasharray="4 4" />
                <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">{val}</text>
              </g>
            )
          })}

          <path d={pathFor("baseline_prediction")} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" />
          <path d={pathFor("candidate_prediction")} fill="none" stroke="#06b6d4" strokeWidth="2" strokeDasharray="2 2" />
          <path d={pathFor("actual")} fill="none" stroke="#10b981" strokeWidth="2.5" />

          {points.map((p, idx) => {
            const x = getX(idx)
            const isHovered = hoverIndex === idx
            return (
              <g key={idx} onMouseEnter={() => setHoverIndex(idx)} className="cursor-pointer">
                <rect x={x - 10} y={padTop} width="20" height={chartHeight} fill="transparent" />
                <circle cx={x} cy={getY(p.actual)} r={isHovered ? 5 : 2.5} fill="#10b981" stroke="#0f172a" strokeWidth="1.5" />
                <circle cx={x} cy={getY(p.candidate_prediction)} r={isHovered ? 5 : 2.5} fill="#06b6d4" stroke="#0f172a" strokeWidth="1.5" />
                {(idx % 2 === 0 || idx === points.length - 1) && (
                  <text x={x} y={padTop + chartHeight + 16} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="monospace">{p.year_month}</text>
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
            className="absolute top-2 pointer-events-none rounded-xl bg-slate-900/95 border border-slate-700 p-3 shadow-2xl text-xs space-y-1 z-20"
            style={{ left: `${Math.min(Math.max(10, (hoverIndex! / points.length) * 100 - 15), 65)}%` }}
          >
            <div className="flex items-center gap-1 border-b border-slate-800 pb-1 font-mono font-semibold text-slate-200">
              <Calendar className="w-3 h-3 text-slate-400" />
              {hoverItem.year_month}
            </div>
            <div className="flex items-center justify-between gap-4 text-emerald-400">
              <span>Actual:</span><span className="font-bold">{hoverItem.actual.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-cyan-400">
              <span>Candidate predicted:</span><span className="font-bold">{hoverItem.candidate_prediction.toFixed(1)} (err {hoverItem.candidate_abs_error.toFixed(1)})</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-amber-400">
              <span>Baseline predicted:</span><span className="font-bold">{hoverItem.baseline_prediction.toFixed(1)} (err {hoverItem.baseline_abs_error.toFixed(1)})</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Actual</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-500 inline-block" /> Candidate (Holt-Winters)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> Baseline (Seasonal-Naive)</span>
      </div>
    </div>
  )
}
