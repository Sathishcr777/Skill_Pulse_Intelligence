import React, { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Target,
  Globe,
  History,
  Calculator,
  ShieldCheck,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type Tab = "forecast" | "radar" | "universe" | "backtest" | "whatif" | "insights" | "trust"

const NAV_ITEMS: { tab: Tab; label: string; icon: React.ElementType; badge?: string }[] = [
  { tab: "forecast", label: "Dashboard", icon: LayoutDashboard },
  { tab: "radar", label: "Opportunity Radar", icon: Target },
  { tab: "universe", label: "Skill Universe", icon: Globe, badge: "3D" },
  { tab: "backtest", label: "Backtest", icon: History },
  { tab: "whatif", label: "What-If Simulator", icon: Calculator },
  { tab: "insights", label: "Insights", icon: Lightbulb },
  { tab: "trust", label: "Data Trust Centre", icon: ShieldCheck },
]

interface Props {
  active: Tab
  onSelect: (tab: Tab) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  gatedCount: number
}

/** Left navigation rail. Every item routes to a real, already-functional
 * module - no decorative or "coming soon" entries. Collapse state persists
 * via localStorage (see Dashboard.tsx), matching the theme-persistence
 * pattern already used elsewhere in the app. */
/** True at >=1024px (Tailwind's `lg`). Below that, the sidebar always
 * renders as the icon-only rail regardless of the collapse preference -
 * see the width class on <aside> below for why. */
function useIsLargeScreen(): boolean {
  const [isLarge, setIsLarge] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true))
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setIsLarge(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return isLarge
}

export const Sidebar: React.FC<Props> = ({ active, onSelect, collapsed, onToggleCollapsed, gatedCount }) => {
  const isLargeScreen = useIsLargeScreen()
  const showLabels = !collapsed && isLargeScreen
  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border/80 bg-surface/60 backdrop-blur-sm flex flex-col transition-[width] duration-200",
        // Below lg, always the icon-only rail regardless of the stored
        // collapse preference - a 260px sidebar on a phone-width screen
        // would eat most of the viewport.
        showLabels ? "w-[260px]" : "w-[76px]"
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-4 h-16 border-b border-border/80 shrink-0", !showLabels && "justify-center px-0")}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-950/30">
          <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        {showLabels && (
          <div className="leading-tight overflow-hidden">
            <div className="font-black text-foreground text-[15px] tracking-tight whitespace-nowrap">SkillPulse</div>
            <div className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">Intelligence</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {NAV_ITEMS.map(({ tab, label, icon: Icon, badge }) => {
          const isActive = active === tab
          return (
            <button
              key={tab}
              onClick={() => onSelect(tab)}
              title={!showLabels ? label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-150",
                showLabels ? "px-3 py-2.5" : "justify-center px-0 py-2.5",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-indigo-950/20"
                  : "text-foreground-secondary hover:text-foreground hover:bg-surface-hover/60"
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2.25} />
              {showLabels && (
                <span className="flex-1 text-left truncate">{label}</span>
              )}
              {showLabels && badge && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                  isActive ? "bg-white/20 text-white" : "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                )}>
                  {badge}
                </span>
              )}
              {showLabels && tab === "forecast" && gatedCount > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                  isActive ? "bg-white/20 text-white" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                )} title={`${gatedCount} segments gated as insufficient-history`}>
                  {gatedCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {showLabels && (
        <div className="p-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20 p-3.5 space-y-1.5">
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25">
              SIH26246
            </span>
            <div className="text-xs font-semibold text-foreground leading-snug">
              AI-Enabled Labour Market Intelligence and Skill Demand-Supply Forecasting Engine
            </div>
            <div className="text-[10px] text-muted-foreground font-mono pt-0.5">v1.0</div>
          </div>
        </div>
      )}

      {isLargeScreen && (
        <button
          onClick={onToggleCollapsed}
          className="flex items-center gap-2 px-4 py-3 border-t border-border/80 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-hover/40 transition-colors"
        >
          {!showLabels ? <ChevronRight className="w-4 h-4 mx-auto" /> : (
            <>
              <ChevronLeft className="w-4 h-4" />
              Collapse
            </>
          )}
        </button>
      )}
    </aside>
  )
}
