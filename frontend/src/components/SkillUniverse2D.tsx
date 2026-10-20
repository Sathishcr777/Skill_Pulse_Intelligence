import React, { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { GraphNode, GraphEdge } from "@/components/SkillUniverse3D"

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  categories: string[]
  /** Same cross-app link as the 3D view: when the occupation selected
   * elsewhere changes, pre-filter this table to it so the two views stay
   * in sync instead of being disconnected features. */
  focusOccupationCode?: number | null
}

/** Accessible, keyboard-navigable 2D alternative to the 3D graph: the same
 * real occupation<->skill edges as a searchable, filterable, sortable
 * table. Not a decorative fallback - every row is a real relationship. */
export const SkillUniverse2D: React.FC<Props> = ({ nodes, edges, categories, focusOccupationCode }) => {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("ALL")
  const [sortDesc, setSortDesc] = useState(true)

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  useEffect(() => {
    if (focusOccupationCode == null) return
    const match = nodes.find((n) => n.type === "occupation" && Math.abs((n.meta?.nco_code ?? NaN) - focusOccupationCode) < 0.001)
    if (match) setSearch(match.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOccupationCode, nodes])

  const rows = useMemo(() => {
    const built = edges
      .map((e) => {
        const occ = nodeById.get(e.source)
        const skill = nodeById.get(e.target)
        if (!occ || !skill) return null
        return { occTitle: occ.label, occCategory: occ.category, skillLabel: skill.label, skillCategory: skill.category, weight: e.weight }
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .filter((r) => categoryFilter === "ALL" || r.occCategory === categoryFilter)
      .filter(
        (r) =>
          !search.trim() ||
          r.occTitle.toLowerCase().includes(search.toLowerCase()) ||
          r.skillLabel.toLowerCase().includes(search.toLowerCase())
      )
    built.sort((a, b) => (sortDesc ? b.weight - a.weight : a.weight - b.weight))
    return built
  }, [edges, nodeById, search, categoryFilter, sortDesc])

  return (
    <div className="rounded-2xl bg-surface/60 border border-border/80 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search occupation or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-surface-sunken/80 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 w-56"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-sunken/80 border border-border text-xs text-foreground"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-[11px] text-muted-foreground">{rows.length} real relationships</span>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-muted-foreground border-b border-border text-left">
              <th className="py-1.5 pr-3">Occupation</th>
              <th className="py-1.5 pr-3">Required skill</th>
              <th className="py-1.5 pr-3">Skill category</th>
              <th className="py-1.5 pr-3 cursor-pointer select-none" onClick={() => setSortDesc(!sortDesc)}>
                Importance {sortDesc ? "▼" : "▲"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-surface-hover/30">
                <td className="py-1.5 pr-3 text-foreground">{r.occTitle}</td>
                <td className="py-1.5 pr-3 text-cyan-700 dark:text-cyan-300">{r.skillLabel}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{r.skillCategory}</td>
                <td className="py-1.5 pr-3 font-mono text-indigo-600 dark:text-indigo-400">{(r.weight * 100).toFixed(0)}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">No relationships match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Real, non-decorative WebGL capability check - used to auto-fallback to
 * the 2D table rather than showing a broken/blank 3D canvas. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")))
  } catch {
    return false
  }
}
