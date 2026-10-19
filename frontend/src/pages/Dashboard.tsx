import React, { useEffect, useState, useCallback } from "react"
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Database,
  Cpu,
  Layers,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface HealthResponse {
  status: string
  service: string
  version: string
  database: string
  timestamp: string
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export const Dashboard: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    const startTime = performance.now()
    try {
      const response = await fetch(`${API_BASE_URL}/health`)
      const elapsed = Math.round(performance.now() - startTime)
      setLatency(elapsed)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data: HealthResponse = await response.json()
      setHealthData(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to SkillPulse API backend"
      )
      setHealthData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10">
                SIH26246
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                Stage 1 — Skeleton & Data Foundation
              </Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              SkillPulse Intelligence
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              AI-Enabled Labour Market Intelligence & Skill Demand-Supply Forecasting Engine
              (Ministry of Skill Development and Entrepreneurship).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHealth}
              disabled={loading}
              className="border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh Health
            </Button>
          </div>
        </header>

        {/* Live System Health Card */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-sm shadow-xl">
          <CardHeader className="pb-3 border-b border-slate-800/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-lg font-semibold text-slate-100">
                  Live API Backend Telemetry
                </CardTitle>
              </div>
              <div>
                {loading ? (
                  <Badge variant="secondary">Checking...</Badge>
                ) : error ? (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Offline
                  </Badge>
                ) : (
                  <Badge variant="success" className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Live & Connected
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription className="text-slate-400 text-xs">
              Live response polled directly from FastAPI endpoint:{" "}
              <code className="text-indigo-300 bg-slate-800/80 px-1 py-0.5 rounded">
                GET {API_BASE_URL}/health
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {loading && !healthData && (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <p className="text-sm">Connecting to backend service...</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 text-sm space-y-1">
                <div className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  Connection Failed
                </div>
                <p className="text-xs text-red-300">{error}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Ensure the backend FastAPI service is running on port 8000 via{" "}
                  <code className="text-slate-200">uvicorn backend.app.main:app --reload</code>.
                </p>
              </div>
            )}

            {healthData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      Service Status
                    </div>
                    <div className="text-lg font-bold text-emerald-400 capitalize flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      {healthData.status}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{healthData.service}</div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-indigo-400" />
                      Database Engine
                    </div>
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {healthData.database}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">PostgreSQL Connection</div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Build Version
                    </div>
                    <div className="text-lg font-bold text-slate-100">v{healthData.version}</div>
                    <div className="text-xs text-slate-500 mt-1">FastAPI + Pydantic v2</div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      Response Latency
                    </div>
                    <div className="text-lg font-bold text-slate-100">
                      {latency !== null ? `${latency} ms` : "—"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      {new Date(healthData.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Raw JSON Payload */}
                <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800/80 font-mono text-xs">
                  <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-2">
                    Raw Live JSON Response:
                  </div>
                  <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(healthData, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Architecture & Five Priority Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <ShieldCheck className="w-5 h-5 text-indigo-400 mb-1" />
              <CardTitle className="text-base text-slate-200">
                Core Differentiator
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Evidence-Graded Forecasting
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-slate-300 leading-relaxed">
              Forecasts only where statistically justified. Cells graded "low evidence" demonstrably show higher backtest errors than "high evidence" cells — falsifiable proof, not marketing claims.
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-1" />
              <CardTitle className="text-base text-slate-200">
                Supply Proxy Rigor
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                No Invented Capacity
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-slate-300 leading-relaxed">
              Uses unit-level PLFS microdata employment base rates as the real supply proxy. Planners input custom capacity numbers directly into what-if scenario calculators without fabrication.
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <Layers className="w-5 h-5 text-amber-400 mb-1" />
              <CardTitle className="text-base text-slate-200">
                Opportunity Radar
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Emerging Skill Clusters
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-slate-300 leading-relaxed">
              Detects co-occurring skill pairs across NCO-2015 occupations, cross-referenced with O*NET and ESCO taxonomies for transparent curriculum alignment.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
<div>GET http://localhost:8000/models/status &rarr; Walk-Forward Provenance Metrics</div>
              </div >
            </div >
          </div >
        )}
      </div >
    </div >
  )
}
