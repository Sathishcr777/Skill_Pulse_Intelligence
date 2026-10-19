import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { App } from './App'

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header and fetches health status on mount', async () => {
    const mockHealth = {
      status: 'healthy',
      service: 'SkillPulse Intelligence API',
      version: '0.1.0',
      database: 'connected',
      timestamp: '2026-10-19T10:00:00Z',
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealth,
    }) as unknown as typeof fetch

    render(<App />)

    expect(screen.getByText('SkillPulse Intelligence')).toBeInTheDocument()
    expect(screen.getByText(/Live API Backend Telemetry/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/Live & Connected/i)).toBeInTheDocument()
      expect(screen.getByText('healthy')).toBeInTheDocument()
      expect(screen.getByText('v0.1.0')).toBeInTheDocument()
    })
  })

  it('handles backend connection failure gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Connection Failed/i)).toBeInTheDocument()
      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    })
  })
})
