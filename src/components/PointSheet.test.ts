import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SHOT_TYPES, SHOT_TYPE_LABEL, type Point } from '../domain/types'
import { PointSheet } from './PointSheet'

const at = '2026-08-24T12:00:00.000Z'
const point = (outcome: Point['outcome']): Point => ({
  id: 'point',
  user_id: null,
  session_id: 'session',
  x: 0,
  y: 30,
  stroke: 'fh',
  error_type: 'net',
  outcome,
  placement_result: outcome === 'placement' ? 'in' : null,
  shot_type: outcome === 'error' || outcome === 'player_winner' ? 'volley' : null,
  forced: false,
  created_at: at,
  updated_at: at,
  deleted_at: null,
})

describe('PointSheet ball type editor', () => {
  it('shows every ball type together for an error and marks the current type', () => {
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: point('error'), index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    for (const type of SHOT_TYPES) expect(html).toContain(SHOT_TYPE_LABEL[type])
    expect(html).toContain('class="shot-type-btn sel"')
  })

  it('does not show ball types for placement marks', () => {
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: point('placement'), index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).not.toContain('point-shot-types')
  })

  it('shows a Serve net placement as a miss', () => {
    const serveNet = { ...point('placement'), stroke: 'serve' as const, placement_result: 'net' as const }
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: serveNet, index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).toContain('Serve — net')
    expect(html).toContain('✕')
  })

  it('shows the stroke and every ball type for a player winner', () => {
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: point('player_winner'), index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).toContain('Winner stroke')
    expect(html).toContain('>FH<')
    expect(html).toContain('>BH<')
    expect(html).toContain('Serve')
    for (const type of SHOT_TYPES) expect(html).toContain(SHOT_TYPE_LABEL[type])
  })

  it('shows Winning serve and Ace for a serve winner', () => {
    const serveWinner = { ...point('player_winner'), stroke: 'serve' as const, shot_type: 'ace' as const }
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: serveWinner, index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).toContain('Serve result')
    expect(html).toContain('Winning serve')
    expect(html).toContain('ACE')
    expect(html).toContain('class="shot-type-btn sel"')
    expect(html).not.toContain('Neutral')
  })

  it('edits a winning serve as a serve result rather than a winner', () => {
    const winningServe = { ...point('player_winner'), outcome: 'winning_serve' as const, stroke: 'serve' as const, shot_type: 'winning_serve' as const }
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: winningServe, index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).toContain('Winning serve')
    expect(html).toContain('Serve result')
    expect(html).toContain('class="shot-type-btn sel"')
  })

  it('shows a double fault as its own editable serve miss', () => {
    const doubleFault = { ...point('error'), stroke: 'serve' as const, error_type: '' as const, shot_type: 'double_fault' as const }
    const html = renderToStaticMarkup(createElement(PointSheet, {
      point: doubleFault, index: 1, onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(),
    }))

    expect(html).toContain('Double fault')
    expect(html).toContain('DF')
    expect(html).not.toContain('forced-toggle')
  })
})
