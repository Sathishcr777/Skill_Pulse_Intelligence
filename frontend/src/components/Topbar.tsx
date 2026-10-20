import React, { useMemo, useState, useRef, useEffect } from "react"
import { Search, ChevronDown, MapPin, Sun, Moon, RefreshCw, Compass, AlertTriangle } from "lucide-react"
import { useTheme } from "@/lib/theme"
import { Region, Occupation } from "@/types/api"

interface Props {
  regions: Region[]
  occupations: Occupation[]
  selectedRegion: string
  onRegionChange: (code: string) => void
  onJumpToOccupation: (ncoCode: number) => void
  onStartDemo: () => void
  onRefresh: () => void
  refreshing: boolean
}

/** Global top bar: region applies across every real-data page (Forecast,
 * Backtest, What-If), the search is a real quick-jump into the full
 * occupation list (same data the Occupation Explorer panel already has -
 * this is a convenience shortcut to it, not a second data source), and the
 * theme control is a real Light/Dark switch, not decoration. */
export const Topbar: React.FC<Props> = ({
  regions,
  occupations,
  selectedRegion,
  onRegionChange,
  onJumpToOccupation,
  onStartDemo,
  onRefresh,
  refreshing,
}) => {
  const { theme, setTheme } = useTheme()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return occupations
      .filter((o) => o.title.toLowerCase().includes(q) || String(o.nco_code).includes(q) || o.trade_category.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, occupations])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const selectedRegionObj = regions.find((r) => r.state_code === selectedRegion)

  return (
    <header className="min-h-16 border-b border-border/80 bg-surface/60 backdrop-blur-sm flex flex-wrap items-center gap-2.5 px-3 sm:px-5 py-2.5 shrink-0">
      <div ref={boxRef} className="relative flex-1 min-w-[140px] max-w-sm order-1">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => query && setOpen(true)}
          placeholder="Search occupation, skill, or NCO code..."
          aria-label="Search occupations"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-sunken/80 border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
        {open && results.length > 0 && (
          <div className="absolute top-full mt-1.5 left-0 right-0 rounded-xl bg-card border border-border shadow-2xl overflow-hidden z-40 max-h-80 overflow-y-auto">
            {results.map((o) => (
              <button
                key={o.nco_code}
                onClick={() => {
                  onJumpToOccupation(o.nco_code)
                  setQuery("")
                  setOpen(false)
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-surface-hover/60 flex items-center justify-between gap-2 text-sm border-b border-border/60 last:border-0"
              >
                <span className="truncate">
                  <span className="font-mono text-[11px] text-muted-foreground mr-2">{o.nco_code.toFixed(2)}</span>
                  <span className="font-medium text-foreground">{o.title}</span>
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{o.trade_category}</span>
              </button>
            ))}
          </div>
        )}
        {open && query && results.length === 0 && (
          <div className="absolute top-full mt-1.5 left-0 right-0 rounded-xl bg-card border border-border shadow-2xl p-3 text-xs text-muted-foreground z-40 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> No occupations match "{query}".
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="relative">
        <select
          value={selectedRegion}
          onChange={(e) => onRegionChange(e.target.value)}
          aria-label="Select state"
          className="appearance-none pl-9 pr-8 py-2 rounded-xl bg-surface-sunken/80 border border-border text-sm font-semibold text-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 cursor-pointer"
        >
          {regions.map((r) => (
            <option key={r.state_code} value={r.state_code}>
              {r.state_name} ({r.state_code})
            </option>
          ))}
        </select>
        <MapPin className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <button
        onClick={onStartDemo}
        className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <Compass className="w-3.5 h-3.5" />
        Guided demo
      </button>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh data"
        aria-label="Refresh data"
        className="p-2 rounded-xl border border-border bg-surface-sunken/60 hover:bg-surface-hover/60 text-foreground-secondary disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
      </button>

      <div className="flex items-center rounded-xl border border-border bg-surface-sunken/80 p-1 gap-0.5">
        <button
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            theme === "light" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sun className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Light</span>
        </button>
        <button
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            theme === "dark" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Moon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dark</span>
        </button>
      </div>

      <span className="sr-only">Current state: {selectedRegionObj?.state_name ?? selectedRegion}</span>
    </header>
  )
}
