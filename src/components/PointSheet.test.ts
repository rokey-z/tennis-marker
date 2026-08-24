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
  shot_type: outcome === 'error' ? 'volley' : null,
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
})
