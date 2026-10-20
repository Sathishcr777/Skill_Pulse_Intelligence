import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { App } from './App'
import { ThemeProvider } from './lib/theme'

const renderApp = () => render(<ThemeProvider><App /></ThemeProvider>)

const mockRegions = [{ id: 1, state_code: 'MH', state_name: 'Maharashtra', zone: 'West' }]
const mockOccupations = [
  { id: 1, nco_code: 7411.01, nco_code_str: '7411.0100', title: 'Electrician General', trade_category: 'ITI/PMKVY', skills: [] },
]
const mockMarketOverview = {
  total_regions: 8,
  total_occupations: 24,
  total_segments: 192,
  sufficient_segments: 187,
  excluded_segments: 5,
  latest_data_vintage: '2023-12-31',
  grade_distribution: { A: 49, B: 138, Insufficient: 5 },
  top_deficit_trades: [],
  top_surplus_trades: [],
  regions_covered: ['MH'],
  trade_categories: ['ITI/PMKVY'],
}
const mockModelStatus = {
  pipeline_version: '1.0.0',
  data_version: 'panel_v1',
  training_window: { start_date: '2022-01-01', end_date: '2023-12-01' },
  candidate_model: 'Holt-Winters Exponential Smoothing',
  baseline_model: 'Seasonal-Naive (lag=12, ma=3)',
  overall_candidate_metrics: { mae: 5.618, rmse: 7.1, mape: 190 },
  overall_baseline_metrics: { mae: 6.387, rmse: 8.1, mape: 200 },
  total_evaluated_segments: 187,
  candidate_losses_to_baseline_count: 55,
  excluded_segments_count: 5,
  grade_distribution: { A: 49, B: 138, Insufficient: 5 },
  category_metrics: {},
  evidence_grade_validation: { status: 'computed', n_sufficient_graded_segments: 187 },
}

function mockApiResponses() {
  global.fetch = vi.fn((url: string) => {
    const u = url.toString()
    const body = u.includes('/regions')
      ? mockRegions
      : u.includes('/occupations')
      ? mockOccupations
      : u.includes('/market/overview')
      ? mockMarketOverview
      : u.includes('/models/status')
      ? mockModelStatus
      : u.includes('/forecast/')
      ? { region: mockRegions[0], occupation: mockOccupations[0], evidence_grade: { grade: 'A', score: 90, volume_score: 40, agreement_score: 35, recency_score: 25, observations_count: 24, is_sufficient: true, gating_reason: null, data_vintage: '2023-12-31' }, is_sufficient: true, gating_reason: null, historical_series: [], forecasts: [], data_vintage: '2023-12-31' }
      : u.includes('/backtest/')
      ? { region: mockRegions[0], occupation: mockOccupations[0], evidence_grade: 'A', evidence_score: 90, backtest_steps: 0, candidate_mean_abs_error: null, baseline_mean_abs_error: null, points: [], data_vintage: '2023-12-31' }
      : {}
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response)
  }) as unknown as typeof fetch
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiResponses()
  })

  it('renders the real product shell and loads live market data', async () => {
    renderApp()

    expect(screen.getByText('SkillPulse Intelligence')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/Segments Forecastable/i)).toBeInTheDocument()
      expect(screen.getByText(/187/)).toBeInTheDocument()
    })
  })

  it('handles backend connection failure with a visible retry, not a blank page', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch

    renderApp()

    await waitFor(() => {
      expect(screen.getByText(/Failed to connect to SkillPulse API backend/i)).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })
})
