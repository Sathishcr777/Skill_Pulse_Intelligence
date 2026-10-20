import {
  Region,
  Occupation,
  ForecastDetailResponse,
  MarketOverviewResponse,
  ModelStatusResponse,
  BacktestDetailResponse,
  DataTrustManifestResponse,
  OccupationAvailability,
  SkillGraphResponse,
} from "@/types/api"

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // response had no JSON body
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => get<{ status: string; service: string; version: string; database: string; timestamp: string }>("/health"),
  regions: () => get<Region[]>("/regions"),
  occupations: (tradeCategory?: string) =>
    get<Occupation[]>(`/occupations${tradeCategory ? `?trade_category=${encodeURIComponent(tradeCategory)}` : ""}`),
  occupationAvailability: (region: string) =>
    get<OccupationAvailability[]>(`/occupations/availability?region=${encodeURIComponent(region)}`),
  forecast: (nco: number, region: string) =>
    get<ForecastDetailResponse>(`/forecast/${nco}/${region}`),
  marketOverview: (region?: string, tradeCategory?: string) => {
    const params = new URLSearchParams()
    if (region) params.set("region", region)
    if (tradeCategory) params.set("trade_category", tradeCategory)
    const qs = params.toString()
    return get<MarketOverviewResponse>(`/market/overview${qs ? `?${qs}` : ""}`)
  },
  modelStatus: () => get<ModelStatusResponse>("/models/status"),
  backtest: (nco: number, region: string) =>
    get<BacktestDetailResponse>(`/backtest/${nco}/${region}`),
  dataTrust: () => get<DataTrustManifestResponse>("/data-trust"),
  skillGraph: () => get<SkillGraphResponse>("/skill-graph"),
}
