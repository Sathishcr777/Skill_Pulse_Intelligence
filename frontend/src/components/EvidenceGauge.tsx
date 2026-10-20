import React from "react"

interface Props {
  grade: string
  score: number
  size?: number
}

const GRADE_COLOR: Record<string, string> = {
  A: "#10b981",
  B: "#6366f1",
  C: "#f59e0b",
  Insufficient: "#64748b",
}

/** Real, data-driven radial gauge for the deterministic 0-100 evidence
 * score - no canned animation library, just an SVG arc sized by the actual
 * score so the visual proportion is never misleading. */
export const EvidenceGauge: React.FC<Props> = ({ grade, score, size = 128 }) => {
  const stroke = 11
  const r = (size - stroke) / 2
  const c = r * 2 * Math.PI
  const pct = Math.max(0, Math.min(100, score))
  const offset = c - (pct / 100) * c
  const color = GRADE_COLOR[grade] ?? GRADE_COLOR.Insufficient

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black leading-none" style={{ color }}>
          {grade === "Insufficient" ? "–" : grade}
        </span>
        <span className="text-[11px] font-mono font-semibold text-muted-foreground mt-1">{score}/100</span>
      </div>
    </div>
  )
}
