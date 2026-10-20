import React, { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Html, Line } from "@react-three/drei"
import * as THREE from "three"
import { useTheme } from "@/lib/theme"

export interface GraphNode {
  id: string
  label: string
  type: "occupation" | "skill"
  category: string
  size: number
  meta: Record<string, any>
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  relationship: string
}

interface LaidOutNode extends GraphNode {
  position: [number, number, number]
}

const CATEGORY_COLORS: Record<string, string> = {
  "ITI/PMKVY": "#818cf8",
  "IT-ITES": "#22d3ee",
  "PMKVY": "#f472b6",
  "PMKVY/Healthcare": "#34d399",
  "PMKVY/Retail": "#fbbf24",
  "PMKVY/IT-ITES": "#a78bfa",
  essential_skill: "#38bdf8",
  software_tool: "#facc15",
  knowledge_domain: "#4ade80",
}
const DEFAULT_COLOR = "#94a3b8"

function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

/** Deterministic layout from real graph structure: occupations placed on an
 * outer sphere (golden-angle spiral, grouped by category), skills placed
 * near the centroid of the occupations that really require them. No
 * physics simulation needed, and positions are 100% reproducible from the
 * real edge data - not random. */
function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): LaidOutNode[] {
  const occupationNodes = nodes.filter((n) => n.type === "occupation")
  const skillNodes = nodes.filter((n) => n.type === "skill")
  const positions = new Map<string, [number, number, number]>()

  const OUTER_RADIUS = 9
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  occupationNodes.forEach((n, i) => {
    const y = 1 - (i / Math.max(1, occupationNodes.length - 1)) * 2
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = goldenAngle * i
    positions.set(n.id, [Math.cos(theta) * radiusAtY * OUTER_RADIUS, y * OUTER_RADIUS, Math.sin(theta) * radiusAtY * OUTER_RADIUS])
  })

  const skillToOccupations = new Map<string, string[]>()
  edges.forEach((e) => {
    const list = skillToOccupations.get(e.target) ?? []
    list.push(e.source)
    skillToOccupations.set(e.target, list)
  })

  skillNodes.forEach((n) => {
    const connectedOccIds = skillToOccupations.get(n.id) ?? []
    const connectedPositions = connectedOccIds.map((id) => positions.get(id)).filter(Boolean) as [number, number, number][]
    if (connectedPositions.length === 0) {
      positions.set(n.id, [0, 0, 0])
      return
    }
    const centroid = connectedPositions.reduce(
      (acc, p) => [acc[0] + p[0] / connectedPositions.length, acc[1] + p[1] / connectedPositions.length, acc[2] + p[2] / connectedPositions.length],
      [0, 0, 0]
    ) as [number, number, number]
    // Pull skills inward toward the center, with a small stable jitter so
    // skills shared by multiple occupations don't perfectly overlap.
    const pull = 0.45
    const seed = stableHash(n.id)
    const jitter: [number, number, number] = [
      ((seed % 100) / 100 - 0.5) * 1.2,
      (((seed >> 8) % 100) / 100 - 0.5) * 1.2,
      (((seed >> 16) % 100) / 100 - 0.5) * 1.2,
    ]
    positions.set(n.id, [centroid[0] * pull + jitter[0], centroid[1] * pull + jitter[1], centroid[2] * pull + jitter[2]])
  })

  return nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? [0, 0, 0] }))
}

const NodeMesh: React.FC<{
  node: LaidOutNode
  isSelected: boolean
  isDimmed: boolean
  onSelect: (n: LaidOutNode) => void
}> = ({ node, isSelected, isDimmed, onSelect }) => {
  const ref = useRef<THREE.Mesh>(null)
  const color = CATEGORY_COLORS[node.category] ?? DEFAULT_COLOR
  const radius = node.type === "occupation" ? 0.22 + Math.min(node.size, 6) * 0.05 : 0.1 + Math.min(node.size, 6) * 0.03

  useFrame((state) => {
    if (ref.current && isSelected) {
      ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.08)
    } else if (ref.current) {
      ref.current.scale.setScalar(1)
    }
  })

  return (
    <group position={node.position}>
      {/* Visible sphere, sized by real node.size. Deliberately small for
          visual clarity at this scale. */}
      <mesh ref={ref}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.9 : node.type === "occupation" ? 0.25 : 0.1}
          opacity={isDimmed ? 0.15 : 1}
          transparent
        />
      </mesh>
      {/* Larger hitbox, visually transparent (NOT visible={false} - R3F's
          event system skips invisible objects during raycasting entirely,
          so this must stay "visible" with zero opacity instead). A real
          sphere this small is genuinely hard to click precisely with a
          mouse - this is a usability fix for actual users, not just a
          workaround for automated testing. */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(node) }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer" }}
        onPointerOut={() => { document.body.style.cursor = "auto" }}
      >
        <sphereGeometry args={[Math.max(radius * 3, 0.5), 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {(isSelected || node.type === "occupation") && !isDimmed && (
        <Html distanceFactor={14} center style={{ pointerEvents: "none" }}>
          <div className={`px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap font-mono ${node.type === "occupation" ? "bg-surface/80 text-foreground" : "bg-surface/80 text-cyan-700 dark:text-cyan-300"}`}>
            {node.label}
          </div>
        </Html>
      )}
    </group>
  )
}

const GraphScene: React.FC<{
  laidOutNodes: LaidOutNode[]
  edges: GraphEdge[]
  selectedId: string | null
  highlightIds: Set<string> | null
  onSelect: (n: LaidOutNode) => void
  isDark: boolean
}> = ({ laidOutNodes, edges, selectedId, highlightIds, onSelect, isDark }) => {
  const nodeById = useMemo(() => new Map(laidOutNodes.map((n) => [n.id, n])), [laidOutNodes])
  // WebGL scene colors can't read CSS variables, so the two states that
  // actually need to differ per theme are set explicitly here: a dimmed
  // edge must stay visible-but-faint on a light background too, not use
  // the dark theme's near-black slate (which would vanish on white).
  const dimmedEdgeColor = isDark ? "#1e293b" : "#cbd5e1"
  const activeEdgeColor = isDark ? "#6366f1" : "#4f46e5"

  return (
    <>
      <ambientLight intensity={isDark ? 0.6 : 0.9} />
      <pointLight position={[15, 15, 15]} intensity={1.2} />
      <pointLight position={[-15, -10, -10]} intensity={0.5} color="#818cf8" />

      {edges.map((e, i) => {
        const s = nodeById.get(e.source)
        const t = nodeById.get(e.target)
        if (!s || !t) return null
        const dimmed = highlightIds ? !(highlightIds.has(e.source) && highlightIds.has(e.target)) : false
        return (
          <Line
            key={i}
            points={[s.position, t.position]}
            color={dimmed ? dimmedEdgeColor : activeEdgeColor}
            opacity={dimmed ? (isDark ? 0.1 : 0.25) : Math.max(0.2, e.weight)}
            transparent
            lineWidth={1}
          />
        )
      })}

      {laidOutNodes.map((n) => (
        <NodeMesh
          key={n.id}
          node={n}
          isSelected={selectedId === n.id}
          isDimmed={highlightIds ? !highlightIds.has(n.id) : false}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  categories: string[]
  /** Real nco_code of the occupation currently selected elsewhere in the
   * app (Forecast tab, etc.). When set, the graph auto-selects and
   * focuses that occupation's real node on mount / whenever it changes -
   * this is what actually connects the 3D view to the rest of the app
   * instead of it being an isolated, disconnected feature. */
  focusOccupationCode?: number | null
}

export const SkillUniverse3D: React.FC<Props> = ({ nodes, edges, categories, focusOccupationCode }) => {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [selected, setSelected] = useState<LaidOutNode | null>(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL")

  const laidOutNodes = useMemo(() => layoutGraph(nodes, edges), [nodes, edges])

  useEffect(() => {
    if (focusOccupationCode == null) return
    const match = laidOutNodes.find((n) => n.type === "occupation" && Math.abs((n.meta?.nco_code ?? NaN) - focusOccupationCode) < 0.001)
    if (match) setSelected(match)
    // Intentionally re-runs only when the externally-selected occupation
    // changes or the graph itself reloads - not on every laidOutNodes
    // recompute, so a user's own in-graph click isn't immediately
    // overridden by a stale focus value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOccupationCode, nodes])

  const searchFilterIds = useMemo(() => {
    if (categoryFilter === "ALL" && !search.trim()) return null
    const matches = laidOutNodes.filter((n) => {
      const matchesCategory = categoryFilter === "ALL" || n.category === categoryFilter
      const matchesSearch = !search.trim() || n.label.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
    const ids = new Set(matches.map((n) => n.id))
    // Also include directly-connected neighbors so filtered occupations
    // still show their real required skills, and vice versa.
    edges.forEach((e) => {
      if (ids.has(e.source)) ids.add(e.target)
      if (ids.has(e.target)) ids.add(e.source)
    })
    return ids
  }, [laidOutNodes, edges, search, categoryFilter])

  // When nothing is actively searched/filtered but a node IS selected
  // (whether by click or by the cross-app focus link above), focus the
  // view on that node's real connections instead of showing everything
  // at equal weight - this is what makes "select an occupation" actually
  // highlight its related skills, per the Phase 4 requirement.
  const filteredIds = useMemo(() => {
    if (searchFilterIds) return searchFilterIds
    if (!selected) return null
    const ids = new Set<string>([selected.id])
    edges.forEach((e) => {
      if (e.source === selected.id) ids.add(e.target)
      if (e.target === selected.id) ids.add(e.source)
    })
    return ids
  }, [searchFilterIds, selected, edges])

  const selectedConnections = useMemo(() => {
    if (!selected) return []
    return edges
      .filter((e) => e.source === selected.id || e.target === selected.id)
      .map((e) => {
        const otherId = e.source === selected.id ? e.target : e.source
        const other = laidOutNodes.find((n) => n.id === otherId)
        return { other, weight: e.weight }
      })
      .filter((x): x is { other: LaidOutNode; weight: number } => !!x.other)
      .sort((a, b) => b.weight - a.weight)
  }, [selected, edges, laidOutNodes])

  return (
    <div className="relative rounded-2xl bg-background border border-border/80 overflow-hidden" style={{ height: 480 }}>
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search skill or occupation..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-surface/90 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 backdrop-blur-sm w-48"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface/90 border border-border text-xs text-foreground focus:outline-none backdrop-blur-sm"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {(search || categoryFilter !== "ALL") && (
          <button
            onClick={() => { setSearch(""); setCategoryFilter("ALL") }}
            className="px-2 py-1.5 rounded-lg bg-surface-hover/80 text-foreground-secondary text-xs hover:bg-surface-hover"
          >
            Clear
          </button>
        )}
      </div>

      <Canvas camera={{ position: [0, 0, 20], fov: 50 }} onPointerMissed={() => setSelected(null)}>
        <GraphScene laidOutNodes={laidOutNodes} edges={edges} selectedId={selected?.id ?? null} highlightIds={filteredIds} onSelect={setSelected} isDark={isDark} />
        <OrbitControls enablePan enableZoom enableRotate minDistance={6} maxDistance={40} autoRotate={false} />
      </Canvas>

      {selected && (
        <div className="absolute bottom-3 left-3 w-72 max-h-64 overflow-y-auto p-3 rounded-xl bg-surface/95 border border-border text-xs space-y-2 backdrop-blur-md z-10">
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <span className="font-bold text-foreground">{selected.label}</span>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground-secondary">✕</button>
          </div>
          <div className="text-muted-foreground">
            {selected.type === "occupation" ? "Occupation" : "Skill"} &middot; {selected.category}
          </div>
          {selected.type === "occupation" && selected.meta.nco_code_str && (
            <div className="text-muted-foreground font-mono">NCO {selected.meta.nco_code_str}</div>
          )}
          <div className="pt-1.5 border-t border-border">
            <div className="text-muted-foreground mb-1">
              {selected.type === "occupation" ? "Real required skills (O*NET-derived)" : "Real occupations requiring this skill"}
            </div>
            {selectedConnections.map(({ other, weight }) => (
              <div key={other.id} className="flex items-center justify-between py-0.5">
                <span className="text-foreground-secondary">{other.label}</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{(weight * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 text-[10px] text-muted-foreground bg-surface/80 px-2 py-1 rounded-lg backdrop-blur-sm">
        Drag to rotate &middot; scroll to zoom &middot; click a node
      </div>
    </div>
  )
}
