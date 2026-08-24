import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { summarize } from '../domain/stats'
import type { Point } from '../domain/types'
import { StatsFilters, StatsPanel } from './StatsPanel'

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
  shot_type: outcome === 'error' || outcome === 'player_winner' ? shot_type : null,
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
    expect(html).toContain('Error ball types')
    expect(html).toContain('<strong>100%</strong><small class="ball-type-count">3</small>')
    expect(html).toContain('<div class="ball-type-strokes"><span class="fh">FH 3</span><span class="bh">BH 0</span></div>')
    expect(html).not.toContain('3 errors</small>')
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

  it('shows player-winner ball types separately from error ball types', () => {
    const summary = summarize([
      point('error', 'long', 'error', 'ground'),
      point('winner-1', '', 'player_winner', 'volley'),
      point('winner-2', '', 'player_winner', 'volley'),
      point('winner-3', '', 'player_winner', 'lob'),
      { ...point('winner-4', '', 'player_winner', 'ace'), stroke: 'serve' },
    ])
    const html = renderToStaticMarkup(createElement(StatsPanel, { summary, count: 5, showExports: false }))

    expect(html).toContain('Winner ball types · 4')
    expect(html).toContain('<strong>50%</strong><span>Volley</span><small>2</small>')
    expect(html).toContain('<strong>25%</strong><span>Lob</span><small>1</small>')
    expect(html).toContain('<strong>25%</strong><span>ACE</span><small>1</small>')
    expect(summary.total).toBe(1)
  })
})

describe('StatsFilters', () => {
  it('hides filter options whose available count is zero', () => {
    const html = renderToStaticMarkup(createElement(StatsFilters, {
      value: { stroke: 'all', error: 'all', shotType: 'all', forced: 'all' },
      points: [point('only', 'long', 'error', 'ground')],
      onChange: vi.fn(),
    }))

    const filterLabel = (text: string) => `>${text}<span class="stats-filter-count"`
    for (const visible of ['Unforced', 'FH', 'Long', 'Neutral']) expect(html).toContain(filterLabel(visible))
    for (const hidden of ['Forced', 'BH', 'Net', 'Wide', 'Attack', 'Slice', 'Volley', 'Swing volley', 'Overhead', 'Lob', 'Drop shot']) {
      expect(html).not.toContain(filterLabel(hidden))
    }
    expect(html).not.toContain('>0</span>')
  })
})
