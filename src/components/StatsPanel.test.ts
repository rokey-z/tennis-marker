import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { summarize } from '../domain/stats'
import type { Point } from '../domain/types'
import { StatsPanel } from './StatsPanel'

vi.mock('../data/app', () => ({
  useSyncStatus: () => ({ phase: 'local', pending: 0, blocked: 0, lastSyncAt: null, error: null }),
}))

const at = '2026-08-23T12:00:00.000Z'
const point = (id: string, error_type: Point['error_type'], outcome: Point['outcome'] = 'error', shot_type: Point['shot_type'] = 'ground'): Point => ({
  id,
  user_id: null,
  session_id: 'session',
  x: 0,
  y: 30,
  stroke: outcome === 'winner' ? '' : 'fh',
  error_type: outcome === 'winner' ? '' : error_type,
  outcome,
  placement_result: null,
  shot_type: outcome === 'error' ? shot_type : null,
  forced: false,
  created_at: at,
  updated_at: at,
  deleted_at: null,
})

describe('StatsPanel error type summary', () => {
  it('renders Long, Net, Wide, and Winners in one bar with values underneath', () => {
    const summary = summarize([
      point('long', 'long'),
      point('net', 'net'),
      point('wide', 'wide'),
      point('winner', '', 'winner'),
    ])
    const html = renderToStaticMarkup(createElement(StatsPanel, { summary, count: 4, showExports: false }))

    expect(html).toContain('Error types')
    expect(html).not.toContain('Where the ball went')
    expect(html.match(/class="error-types-track"/g)).toHaveLength(1)
    for (const label of ['Long', 'Net', 'Wide', 'Winners']) expect(html).toContain(`<span>${label}</span><strong>1 · 25%</strong>`)
    expect(html.match(/class="ball-type-bubble(?: |")/g)).toHaveLength(1)
    expect(html).toContain('--bubble-size:112px')
    expect(html).toContain('<strong>100%</strong><small>3 errors</small>')
    expect(html).not.toContain('<strong>0%</strong>')
  })

  it('ranks non-zero ball types from largest count to smallest', () => {
    const summary = summarize([
      point('neutral', 'long', 'error', 'ground'),
      point('volley-1', 'net', 'error', 'volley'),
      point('volley-2', 'net', 'error', 'volley'),
      point('lob-1', 'wide', 'error', 'lob'),
      point('lob-2', 'wide', 'error', 'lob'),
      point('lob-3', 'wide', 'error', 'lob'),
    ])
    const html = renderToStaticMarkup(createElement(StatsPanel, { summary, count: 6, showExports: false }))

    expect(html.match(/class="ball-type-bubble(?: |")/g)).toHaveLength(3)
    expect(html.indexOf('<span>Lob</span>')).toBeLessThan(html.indexOf('<span>Volley</span>'))
    expect(html.indexOf('<span>Volley</span>')).toBeLessThan(html.indexOf('<span>Neutral</span>'))
    expect(html).not.toContain('<strong>0%</strong>')
  })
})
