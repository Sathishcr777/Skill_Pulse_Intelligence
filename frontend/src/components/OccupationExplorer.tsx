import React, { useEffect, useMemo, useState } from "react"
import { Search, Clock, CheckCircle2, AlertTriangle } from "lucide-react"
import { Occupation } from "@/types/api"
import { api } from "@/lib/api"

const RECENTS_KEY = "skillpulse-recent-occupations"
const MAX_RECENTS = 5

function readRecents(): number[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function pushRecent(ncoCode: number) {
  try {
    const current = readRecents().filter((c) => c !== ncoCode)
    current.unshift(ncoCode)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(current.slice(0, MAX_RECENTS)))
  } catch {
    // localStorage unavailable - recents just won't persist this session
  }
}

interface Props {
  occupations: Occupation[]
  selectedRegion: string
  selectedOccupationCode: number
  selectedCategory: string
  searchQuery: string
  onSearchChange: (q: string) => void
  onSelect: (ncoCode: number) => void
}

export const OccupationExplorer: React.FC<Props> = ({
  occupations,
  selectedRegion,
  selectedOccupationCode,
  selectedCategory,
  searchQuery,
  onSearchChange,
  onSelect,
}) => {
  const [availability, setAvailability] = useState<Record<string, { is_sufficient: boolean; evidence_grade: string; observations_count: number; gating_reason: string | null }>>({})
  const [recents, setRecents] = useState<number[]>(readRecents)

  useEffect(() => {
    let cancelled = false
    api
      .occupationAvailability(selectedRegion)
      .then((rows) => {
        if (cancelled) return
        const map: typeof availability = {}
        rows.forEach((r) => {
          map[r.nco_code.toFixed(2)] = r
        })
        setAvailability(map)
      })
      .catch(() => {
        if (!cancelled) setAvailability({})
      })
    return () => {
      cancelled = true
    }
  }, [selectedRegion])

  const handleSelect = (ncoCode: number) => {
    pushRecent(ncoCode)
    setRecents(readRecents())
    onSelect(ncoCode)
  }

  const filtered = useMemo(() => {
    return occupations.filter((occ) => {
      const matchesCategory = selectedCategory === "ALL" || occ.trade_category === selectedCategory
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        occ.title.toLowerCase().includes(q) ||
        occ.nco_code.toString().includes(q) ||
        occ.trade_category.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [occupations, selectedCategory, searchQuery])

  const recentOccupations = useMemo(
    () => recents.map((code) => occupations.find((o) => Math.abs(o.nco_code - code) < 0.001)).filter((o): o is Occupation => !!o),
    [recents, occupations]
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search by occupation, NCO code, or trade category..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-sunken border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          aria-label="Search occupations"
        />
      </div>

      {recentOccupations.length > 0 && !searchQuery && (
        <div>
          <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3 h-3" /> Recently selected
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {recentOccupations.map((occ) => (
              <button
                key={occ.id}
                onClick={() => handleSelect(occ.nco_code)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-sunken/60 text-foreground-secondary hover:bg-surface-hover border border-border/60 transition-colors"
              >
                {occ.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground py-2">No occupations match this search. Try a broader term or clear the category filter.</div>
        )}
        {filtered.map((occ) => {
          const avail = availability[occ.nco_code.toFixed(2)]
          const isSelected = Math.abs(selectedOccupationCode - occ.nco_code) < 0.001
          const isSufficient = avail ? avail.is_sufficient : null
          return (
            <button
              key={occ.id}
              onClick={() => handleSelect(occ.nco_code)}
              title={
                avail
                  ? avail.is_sufficient
                    ? `${avail.observations_count} real observations - Grade ${avail.evidence_grade}`
                    : avail.gating_reason ?? "Insufficient history for a reliable forecast"
                  : undefined
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                isSelected
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-semibold"
                  : "bg-surface-sunken/60 text-muted-foreground hover:text-foreground border-border/80 hover:border-border"
              }`}
            >
              <span className="font-mono text-[10px] opacity-70">{occ.nco_code.toFixed(2)}</span>
              <span>{occ.title}</span>
              {isSufficient === true && <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
              {isSufficient === false && <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
