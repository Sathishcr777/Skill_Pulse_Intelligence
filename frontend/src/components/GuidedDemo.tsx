import React from "react"
import { Compass, X, ArrowRight, ArrowLeft } from "lucide-react"

export interface DemoStep {
  title: string
  body: string
  tab: "forecast" | "radar" | "universe" | "backtest" | "whatif" | "trust"
  region?: string
  occupationCode?: number
}

/** Real steps, driving the app's own real state - no separate demo
 * dataset, no fake success messages. Chosen occupations/regions are real
 * segments already verified sufficient/insufficient where that distinction
 * matters for the narrative. */
export const DEMO_STEPS: DemoStep[] = [
  {
    title: "Welcome to SkillPulse Intelligence",
    body: "This is a live walkthrough using the application's real data and real API responses - nothing here is staged. We'll pick an occupation, look at what's actually observed, generate a forecast only where the data supports one, and show you how to check whether to trust it.",
    tab: "forecast",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "1. Select an occupation",
    body: "Electrician General in Maharashtra is selected. The Occupation Explorer's checkmark means this segment has enough real observations (24 months) to be forecastable - an amber warning would mean it doesn't, and no forecast would be shown for it.",
    tab: "forecast",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "2. Inspect historical observations & the forecast",
    body: "The solid line is real observed history; the dashed line is the model's forecast, with a confidence band. The Evidence Grade card on the right shows exactly how that grade was computed - volume, cross-source agreement, and recency, each scored separately.",
    tab: "forecast",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "3. Explore related skills in 3D",
    body: "This occupation is now focused in the Skill Universe - its real O*NET-derived required skills are highlighted, everything else dims. Click any node for its own detail panel, or switch to the 2D table for the same data in an accessible list.",
    tab: "universe",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "4. Check the backtest - does the evidence grade actually mean anything?",
    body: "This is the core differentiator's proof: a genuine out-of-sample walk-forward replay (the model never saw future data when making each point's prediction), plus the real computed relationship between evidence grade and realized error - reported honestly, including when it's weak.",
    tab: "backtest",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "5. Try a what-if scenario",
    body: "Adjust the growth-rate assumptions yourself. Every number here is clearly labeled as a hypothetical built on the real baseline - it never claims to be a validated prediction.",
    tab: "whatif",
    region: "MH",
    occupationCode: 7411.01,
  },
  {
    title: "6. Trace everything back to its source",
    body: "The Data Trust Centre is where every claim on this site is sourced: what's verified real (cited, with a working link), what's a synthetic demonstration signal, and the live-computed data quality behind it. This is deliberate - we'd rather show you the limitations than hide them.",
    tab: "trust",
    region: "MH",
    occupationCode: 7411.01,
  },
]

interface Props {
  stepIndex: number
  onNext: () => void
  onBack: () => void
  onExit: () => void
}

export const GuidedDemo: React.FC<Props> = ({ stepIndex, onNext, onBack, onExit }) => {
  const step = DEMO_STEPS[stepIndex]
  const isLast = stepIndex === DEMO_STEPS.length - 1
  const isFirst = stepIndex === 0

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] sm:w-96 rounded-2xl bg-surface border border-primary/40 shadow-2xl p-4 space-y-3 transition-all duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-primary shrink-0" />
          <span className="text-[11px] font-semibold text-muted-foreground">
            Guided demo &middot; step {stepIndex + 1} of {DEMO_STEPS.length}
          </span>
        </div>
        <button onClick={onExit} aria-label="Exit guided demo" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onExit}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Exit demo
        </button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onBack}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-hover text-foreground-secondary hover:bg-surface-hover/80 flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
          )}
          <button
            onClick={isLast ? onExit : onNext}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
          >
            {isLast ? "Finish" : "Next"} {!isLast && <ArrowRight className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  )
}
