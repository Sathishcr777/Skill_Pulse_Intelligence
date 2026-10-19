import React, { useMemo, useState } from "react"
import { Calculator, TrendingDown, TrendingUp, Info } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

interface Props {
  baselineDemand: number
  baselineSupply: number
  occupationTitle: string
  stateCode: string
  dataVintage: string
}

/**
 * Hypothetical scenario calculator, not a prediction.
 *
 * IMPORTANT UNIT NOTE: the real supply_index here is a PLFS Table 27
 * state-level industry EMPLOYMENT SHARE (a percentage), not a worker
 * headcount or a count of training seats. Converting a user-entered
 * "number of training seats" into a change in that percentage would
 * require data we don't have (total state workforce size) and would be a
 * fabricated unit conversion. So this simulator deliberately works in
 * percentage growth-rate assumptions applied to the real baseline values
 * instead - honest about what it can and can't model.
 */
export const WhatIfSimulator: React.FC<Props> = ({
  baselineDemand,
  baselineSupply,
  occupationTitle,
  stateCode,
  dataVintage,
}) => {
  const [supplyGrowthPct, setSupplyGrowthPct] = useState(10)
  const [demandGrowthPct, setDemandGrowthPct] = useState(5)
  const [horizonMonths, setHorizonMonths] = useState(12)

  const result = useMemo(() => {
    const yearsFraction = horizonMonths / 12
    const simulatedSupply = baselineSupply * (1 + (supplyGrowthPct / 100) * yearsFraction)
    const simulatedDemand = baselineDemand * (1 + (demandGrowthPct / 100) * yearsFraction)
    const baselineGap = baselineDemand - baselineSupply
    const simulatedGap = simulatedDemand - simulatedSupply
    // Percentage change is meaningless (and can blow up to absurd values)
    // when the baseline gap is at or near zero - show "N/A" rather than a
    // misleading huge number in that case.
    const baselineGapNearZero = Math.abs(baselineGap) < 0.5
    const gapChangePct = !baselineGapNearZero ? ((simulatedGap - baselineGap) / Math.abs(baselineGap)) * 100 : null
    return { simulatedSupply, simulatedDemand, baselineGap, simulatedGap, gapChangePct, baselineGapNearZero }
  }, [baselineDemand, baselineSupply, supplyGrowthPct, demandGrowthPct, horizonMonths])

  const gapImproving = result.simulatedGap < result.baselineGap

  return (
    <Card className="bg-slate-900/60 border-slate-800/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-400" />
              What-If Scenario Simulator
            </CardTitle>
            <CardDescription className="text-[11px]">
              {occupationTitle} &middot; {stateCode} &middot; baseline from data vintage {dataVintage}
            </CardDescription>
          </div>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            HYPOTHETICAL — NOT A FORECAST
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-start gap-2 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-indigo-400" />
          <span>
            This models percentage growth-rate assumptions applied to the real baseline demand and supply figures.
            It does not convert a specific number of training seats, since the real PLFS supply figure here is an
            industry employment <em>share</em> (%), not a worker headcount — that conversion would require data we
            don't have.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderInput
            label="Assumed supply growth"
            value={supplyGrowthPct}
            onChange={setSupplyGrowthPct}
            min={-20}
            max={50}
            step={1}
            unit="%/yr"
            accent="indigo"
          />
          <SliderInput
            label="Assumed demand growth"
            value={demandGrowthPct}
            onChange={setDemandGrowthPct}
            min={-20}
            max={50}
            step={1}
            unit="%/yr"
            accent="emerald"
          />
          <SliderInput
            label="Scenario horizon"
            value={horizonMonths}
            onChange={setHorizonMonths}
            min={3}
            max={24}
            step={3}
            unit=" months"
            accent="cyan"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-950/90 border border-indigo-900/30">
          <ResultCell label="Baseline demand" value={baselineDemand.toFixed(1)} />
          <ResultCell label="Baseline supply" value={baselineSupply.toFixed(1)} />
          <ResultCell label="Simulated demand" value={result.simulatedDemand.toFixed(1)} tone="emerald" />
          <ResultCell label="Simulated supply" value={result.simulatedSupply.toFixed(1)} tone="indigo" />
        </div>

        <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400">Net gap: baseline &rarr; simulated</div>
            <div className="font-mono text-base font-bold text-slate-100">
              {result.baselineGap.toFixed(1)} &rarr; {result.simulatedGap.toFixed(1)}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-sm font-bold ${gapImproving ? "text-emerald-400" : "text-rose-400"}`}>
            {gapImproving ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {result.gapChangePct === null ? (
              <span className="text-slate-500 text-xs font-normal">N/A — baseline gap ~0</span>
            ) : (
              <>
                {result.gapChangePct >= 0 ? "+" : ""}
                {result.gapChangePct.toFixed(1)}%
              </>
            )}
          </div>
        </div>

        <div className="text-[10px] text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Assumptions &amp; limitations:</strong> linear growth applied uniformly
          over the horizon; does not account for seasonality, policy lag, or capacity constraints; both growth rates
          are user-chosen hypotheticals, not model predictions. This panel never writes to or affects the real
          forecast, backtest, or evidence-grade calculations elsewhere in the app.
        </div>
      </CardContent>
    </Card>
  )
}

const SliderInput: React.FC<{
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  unit: string
  accent: "indigo" | "emerald" | "cyan"
}> = ({ label, value, onChange, min, max, step, unit, accent }) => {
  const accentClass = { indigo: "accent-indigo-500 text-indigo-400", emerald: "accent-emerald-500 text-emerald-400", cyan: "accent-cyan-500 text-cyan-400" }[accent]
  return (
    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className={`font-mono font-bold ${accentClass.split(" ")[1]}`}>
          {value >= 0 && unit.includes("%") ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-1.5 bg-slate-800 rounded-lg cursor-pointer ${accentClass.split(" ")[0]}`}
      />
      <div className="flex justify-between text-[9px] text-slate-500">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

const ResultCell: React.FC<{ label: string; value: string; tone?: "indigo" | "emerald" }> = ({ label, value, tone }) => (
  <div>
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className={`font-mono font-bold text-sm ${tone === "emerald" ? "text-emerald-400" : tone === "indigo" ? "text-indigo-400" : "text-slate-200"}`}>
      {value}
    </div>
  </div>
)
