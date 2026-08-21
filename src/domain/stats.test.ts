import { describe, expect, it } from 'vitest'
import { compareSessionDesc, filterPoints, pct, perSessionCounts, summarize } from './stats'
import type { Point, Session } from './types'

const t0 = '2026-08-15T10:00:00.000Z'

function session(over: Partial<Session> = {}): Session {
  return {
    id: over.id ?? 's1',
    user_id: null,
    title: '',
    opponent: '',
    venue: '',
    date: '2026-08-15',
    kind: 'practice',
    mode: 'errors',
    notes: '',
    created_at: t0,
    updated_at: t0,
    deleted_at: null,
    ...over,
  }
}

let n = 0
function point(over: Partial<Point> = {}): Point {
  n++
  return {
    id: over.id ?? `p${n}`,
    user_id: null,
    session_id: 's1',
    x: 10,
    y: 40,
    stroke: 'fh',
    error_type: 'long',
    outcome: 'error',
    forced: false,
    created_at: t0,
    updated_at: t0,
    deleted_at: null,
    ...over,
  }
}

describe('filterPoints', () => {
  const pts = [
    point({ stroke: 'fh', error_type: 'long' }),
    point({ stroke: 'bh', error_type: 'net', forced: true }),
    point({ stroke: 'bh', error_type: 'wide', session_id: 's2' }),
    point({ deleted_at: t0 }),
  ]

  it('drops deleted points and applies each filter independently', () => {
    expect(filterPoints(pts)).toHaveLength(3)
    expect(filterPoints(pts, { stroke: 'bh' })).toHaveLength(2)
    expect(filterPoints(pts, { error: 'net' })).toHaveLength(1)
    expect(filterPoints(pts, { forced: 'forced' })).toHaveLength(1)
    expect(filterPoints(pts, { forced: 'unforced' })).toHaveLength(2)
    expect(filterPoints(pts, { sessionId: 's2' })).toHaveLength(1)
    expect(filterPoints(pts, { sessionId: 'all', stroke: 'all', error: 'all', forced: 'all' })).toHaveLength(3)
    expect(filterPoints(pts, { stroke: 'bh', error: 'wide', sessionId: 's1' })).toHaveLength(0)
  })

  it('never calls a winner or a placement "unforced" — forced is a question about her errors', () => {
    const mixed = [...pts, point({ stroke: '', error_type: '', outcome: 'winner' }), point({ stroke: 'fh', error_type: '', outcome: 'placement' })]
    expect(filterPoints(mixed)).toHaveLength(5)
    expect(filterPoints(mixed, { forced: 'unforced' })).toHaveLength(2) // the two unforced errors, nothing else
    expect(filterPoints(mixed, { forced: 'forced' })).toHaveLength(1)
    expect(filterPoints(mixed, { outcome: 'winner' })).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('counts by stroke, error, forced, zone and matrix', () => {
    const s = summarize([
      point({ x: 10, y: 40, stroke: 'fh', error_type: 'long' }),
      point({ x: 12, y: 45, stroke: 'fh', error_type: 'net' }),
      point({ x: -10, y: 30, stroke: 'bh', error_type: 'wide', forced: true }),
      point({ x: 0, y: 5, stroke: 'bh', error_type: 'long' }),
      point({ deleted_at: t0 }),
    ])
    expect(s.total).toBe(4)
    expect(s.byStroke).toEqual({ fh: 2, bh: 2 })
    expect(s.byError).toEqual({ long: 2, net: 1, wide: 1 })
    expect(s.byForced).toEqual({ forced: 1, unforced: 3 })
    expect(s.byZone).toEqual({ 'baseline-deuce': 2, 'mid-ad': 1, 'net-middle': 1 })
    expect(s.maxZone).toBe(2)
    expect(s.matrix.fh).toEqual({ long: 1, net: 1, wide: 0 })
    expect(s.matrix.bh).toEqual({ long: 1, net: 0, wide: 1 })
    expect(s.byStrokeForced).toEqual({ fh: 0, bh: 1 })
  })

  it('counts winners apart from errors — they are the opponent’s, so they carry no stroke', () => {
    const s = summarize([
      point({ stroke: 'fh', error_type: 'long' }),
      point({ stroke: 'bh', error_type: 'net', forced: true }),
      point({ stroke: '', error_type: '', outcome: 'winner' }),
      point({ stroke: '', error_type: '', outcome: 'winner' }),
      point({ stroke: '', error_type: '', outcome: 'winner', deleted_at: t0 }),
    ])
    expect(s.total).toBe(2) // errors only
    expect(s.byStroke).toEqual({ fh: 1, bh: 1 })
    expect(s.byError).toEqual({ long: 1, net: 1, wide: 0 })
    expect(s.winners).toBe(2)
    // a winner is still a point she lost, so it counts in the headline — but not in the breakdowns
    expect(s.lost).toBe(4)
    // a winner never lands in the error breakdowns, but it is still a spot on her half
    expect(s.matrix.fh).toEqual({ long: 1, net: 0, wide: 0 })
    expect(s.byStroke).toEqual({ fh: 1, bh: 1 })
    expect(Object.values(s.byZone).reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('keeps a landing map of its own, separate from the error zones', () => {
    const s = summarize([
      point({ stroke: 'fh', error_type: 'long', x: 10, y: 45 }),
      point({ stroke: 'fh', error_type: '', outcome: 'placement', x: 10, y: 5 }),
      point({ stroke: 'bh', error_type: '', outcome: 'placement', x: 10, y: 5 }),
    ])
    expect(Object.values(s.byZone).reduce((a, b) => a + b, 0)).toBe(1) // the error only
    expect(s.placementZones).toEqual({ 'net-deuce': 2 })
    expect(s.maxPlacementZone).toBe(2)
  })

  it('counts the placements that landed out', () => {
    const s = summarize([
      point({ stroke: 'fh', error_type: '', outcome: 'placement', x: 5, y: 30 }),
      point({ stroke: 'fh', error_type: '', outcome: 'placement', x: 16, y: 30 }),
      point({ stroke: 'bh', error_type: '', outcome: 'placement', x: 0, y: 44 }),
    ])
    expect(s.placements).toBe(3)
    expect(s.placementsOut).toBe(2)
  })

  it('records serve landings without assigning them an in or out result', () => {
    const s = summarize([point({ stroke: 'serve', error_type: '', outcome: 'placement', x: 16, y: 44 })])
    expect(s.placements).toBe(1)
    expect(s.serveLandings).toBe(1)
    expect(s.placementsOut).toBe(0)
    expect(s.placementsByStroke.serve).toBe(1)
  })

  it('counts placements apart from errors and winners', () => {
    const s = summarize([
      point({ error_type: 'long' }),
      point({ stroke: 'bh', error_type: '', outcome: 'placement' }),
      point({ stroke: 'fh', error_type: '', outcome: 'placement' }),
      point({ stroke: '', error_type: '', outcome: 'winner' }),
    ])
    expect(s.total).toBe(1)
    expect(s.lost).toBe(2) // placements are not points lost; the winner is
    expect(s.placements).toBe(2)
    expect(s.placementsByStroke).toEqual({ fh: 1, bh: 1, serve: 0 })
    expect(s.winners).toBe(1)
    // placements never enter the error views; the error and the winner both mark her half
    expect(Object.values(s.byZone).reduce((a, b) => a + b, 0)).toBe(2)
    expect(s.byStroke).toEqual({ fh: 1, bh: 0 })
  })

  it('filters by outcome', () => {
    const pts = [point({ error_type: 'long' }), point({ error_type: '', outcome: 'winner' })]
    expect(filterPoints(pts, { outcome: 'winner' })).toHaveLength(1)
    expect(filterPoints(pts, { outcome: 'error' })).toHaveLength(1)
    expect(filterPoints(pts, { outcome: 'all' })).toHaveLength(2)
    expect(filterPoints(pts)).toHaveLength(2)
  })

  it('handles empty input', () => {
    const s = summarize([])
    expect(s.total).toBe(0)
    expect(s.maxZone).toBe(0)
    expect(pct(0, 0)).toBe(0)
    expect(pct(1, 3)).toBe(33)
  })
})

describe('perSessionCounts', () => {
  it('counts live points per live session, newest first', () => {
    const sessions = [
      session({ id: 'a', date: '2026-08-01' }),
      session({ id: 'b', date: '2026-08-10' }),
      session({ id: 'c', date: '2026-08-05', deleted_at: t0 }),
    ]
    const points = [
      point({ session_id: 'a', stroke: 'fh' }),
      point({ session_id: 'a', stroke: 'bh' }),
      point({ session_id: 'b', stroke: 'bh' }),
      point({ session_id: 'c' }),
      point({ session_id: 'a', deleted_at: t0 }),
      point({ session_id: 'zzz' }),
    ]
    const rows = perSessionCounts(sessions, points)
    expect(rows.map((r) => r.session.id)).toEqual(['b', 'a'])
    expect(rows[0]).toMatchObject({ count: 1, fh: 0, bh: 1 })
    expect(rows[1]).toMatchObject({ count: 2, fh: 1, bh: 1 })
  })

  it('counts what the session records, not marks left over from the other mode', () => {
    const sessions = [session({ id: 'p', mode: 'placement' }), session({ id: 'e', date: '2026-08-01' })]
    const points = [
      point({ session_id: 'p', stroke: 'fh', error_type: '', outcome: 'placement' }),
      point({ session_id: 'p', stroke: 'bh', error_type: '', outcome: 'placement' }),
      // recorded before the session was switched to Placement: hidden on the court, so not counted
      point({ session_id: 'p', stroke: 'fh', error_type: 'long' }),
      point({ session_id: 'e', stroke: 'fh', error_type: 'net' }),
      point({ session_id: 'e', stroke: 'fh', error_type: '', outcome: 'placement' }),
    ]
    const rows = perSessionCounts(sessions, points)
    expect(rows.find((r) => r.session.id === 'p')).toMatchObject({ count: 2, fh: 1, bh: 1 })
    expect(rows.find((r) => r.session.id === 'e')).toMatchObject({ count: 1, fh: 1, bh: 0 })
  })

  it('orders same-date sessions by created_at desc', () => {
    const a = session({ id: 'a', created_at: '2026-08-15T09:00:00Z' })
    const b = session({ id: 'b', created_at: '2026-08-15T11:00:00Z' })
    expect([a, b].sort(compareSessionDesc).map((s) => s.id)).toEqual(['b', 'a'])
  })
})
