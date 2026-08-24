import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Point } from '../domain/types'
import { PointList } from './Bits'

vi.mock('../data/app', () => ({
  useSyncStatus: () => ({ phase: 'local', pending: 0, blocked: 0, lastSyncAt: null, error: null }),
}))

const at = '2026-08-24T12:00:00.000Z'
const point = (id: string): Point => ({
  id,
  user_id: null,
  session_id: 'session',
  x: 0,
  y: 30,
  stroke: 'fh',
  error_type: 'long',
  outcome: 'error',
  placement_result: null,
  shot_type: 'ground',
  forced: false,
  created_at: at,
  updated_at: at,
  deleted_at: null,
})

describe('PointList', () => {
  it('keeps original point numbers when the visible list is filtered', () => {
    const all = [point('one'), point('two'), point('three')]
    const html = renderToStaticMarkup(createElement(PointList, { points: [all[0], all[2]], indexSource: all }))

    expect(html).toContain('<span class="n">3</span>')
    expect(html).toContain('<span class="n">1</span>')
    expect(html).not.toContain('<span class="n">2</span>')
  })
})
