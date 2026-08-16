import { describe, expect, it } from 'vitest'
import {
  activeWindow,
  buildInsights,
  elapsedBuckets,
  filterSessions,
  longestStreak,
  minutesBetween,
  movingAverage,
  pickBucketMin,
  rangeStart,
  recentTrend,
  sequence,
  sessionStats,
  summarizeKind,
  thirds,
} from './analytics'
import { summarize } from './stats'
import type { Point, Session } from './types'

const T = (min: number) => new Date(Date.UTC(2026, 7, 15, 10, min, 0)).toISOString()

function sess(over: Partial<Session> = {}): Session {
  return {
    id: over.id ?? 's1',
    user_id: null,
    title: '',
    opponent: '',
    venue: '',
    date: '2026-08-15',
    kind: 'practice',
    notes: '',
    created_at: T(0),
    updated_at: T(0),
    deleted_at: null,
    ...over,
  }
}
let n = 0
function pt(over: Partial<Point> = {}): Point {
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
    created_at: T(0),
    updated_at: T(0),
    deleted_at: null,
    ...over,
  }
}

describe('ranges', () => {
  const today = new Date(2026, 7, 15)
  it('computes inclusive lower bounds', () => {
    expect(rangeStart('all', today)).toBeNull()
    expect(rangeStart('year', today)).toBe('2026-01-01')
    expect(rangeStart('30d', today)).toBe('2026-07-16')
    expect(rangeStart('90d', today)).toBe('2026-05-17')
  })
  it('filters by range and kind, dropping deleted', () => {
    const list = [
      sess({ id: 'a', date: '2026-08-15', kind: 'match' }),
      sess({ id: 'b', date: '2026-06-01' }),
      sess({ id: 'c', date: '2025-12-31' }),
      sess({ id: 'd', date: '2026-08-10', deleted_at: T(1) }),
    ]
    expect(filterSessions(list, 'all', 'all', today).map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(filterSessions(list, 'year', 'all', today).map((s) => s.id)).toEqual(['a', 'b'])
    expect(filterSessions(list, '30d', 'all', today).map((s) => s.id)).toEqual(['a'])
    expect(filterSessions(list, 'all', 'match', today).map((s) => s.id)).toEqual(['a'])
  })
})

describe('sessionStats', () => {
  it('aggregates per session in chronological order with duration and zones', () => {
    const sessions = [sess({ id: 'late', date: '2026-08-15' }), sess({ id: 'early', date: '2026-08-01' })]
    const points = [
      pt({ session_id: 'late', created_at: T(0), stroke: 'fh', error_type: 'long' }),
      pt({ session_id: 'late', created_at: T(30), stroke: 'bh', error_type: 'net', forced: true, x: -10, y: 45 }),
      pt({ session_id: 'late', created_at: T(15), stroke: 'bh', error_type: 'wide' }),
      pt({ session_id: 'late', deleted_at: T(1) }),
      pt({ session_id: 'early' }),
    ]
    const rows = sessionStats(sessions, points)
    expect(rows.map((r) => r.session.id)).toEqual(['early', 'late'])
    const late = rows[1]
    expect(late).toMatchObject({ total: 3, fh: 1, bh: 2, long: 1, net: 1, wide: 1, forced: 1, unforced: 2, durationMin: 30, activeCount: 3 })
    expect(late.points.map((p) => p.created_at)).toEqual([T(0), T(15), T(30)])
    expect(late.byZone).toEqual({ 'baseline-deuce': 2, 'baseline-ad': 1 })
    expect(rows[0].durationMin).toBe(0)
  })
})

describe('movingAverage', () => {
  it('uses a trailing window that grows at the start', () => {
    expect(movingAverage([2, 4, 6, 8], 3)).toEqual([2, 3, 4, 6])
    expect(movingAverage([], 3)).toEqual([])
  })
})

describe('within-session timeline', () => {
  const pts = [
    pt({ created_at: T(0), stroke: 'fh' }),
    pt({ created_at: T(4), stroke: 'fh' }),
    pt({ created_at: T(12), stroke: 'bh', forced: true }),
    pt({ created_at: T(31), stroke: 'bh' }),
    pt({ created_at: T(33), stroke: 'bh' }),
  ]

  it('sequence reports gaps and elapsed minutes in time order', () => {
    const seq = sequence([pts[3], pts[0], pts[2], pts[1], pts[4]])
    expect(seq.map((s) => s.elapsedMin)).toEqual([0, 4, 12, 31, 33])
    expect(seq.map((s) => s.gapMin)).toEqual([null, 4, 8, 19, 2])
  })

  it('buckets by elapsed 10-minute windows', () => {
    const b = elapsedBuckets(pts, 10)
    expect(b.map((x) => x.label)).toEqual(['0–10', '10–20', '20–30', '30–40'])
    expect(b.map((x) => x.total)).toEqual([2, 1, 0, 2])
    expect(b[0]).toMatchObject({ fh: 2, bh: 0 })
    expect(b[3]).toMatchObject({ fh: 0, bh: 2 })
    expect(elapsedBuckets([])).toEqual([])
    expect(elapsedBuckets([pts[0]])).toHaveLength(1)
  })

  it('splits into thirds by time (or by order without duration)', () => {
    expect(thirds(pts)).toEqual({ first: 2, middle: 1, last: 2 })
    expect(thirds([pt({ created_at: T(0) }), pt({ created_at: T(0) }), pt({ created_at: T(0) })])).toEqual({ first: 1, middle: 1, last: 1 })
    expect(thirds([])).toEqual({ first: 0, middle: 0, last: 0 })
  })

  it('finds the longest streak', () => {
    expect(longestStreak(pts, (p) => p.stroke)).toEqual({ key: 'bh', length: 3 })
    expect(longestStreak([], (p: Point) => p.stroke)).toBeNull()
  })
})

describe('comparisons & insights', () => {
  function build(counts: number[], kind: 'match' | 'practice' = 'practice') {
    const sessions: Session[] = []
    const points: Point[] = []
    counts.forEach((c, i) => {
      const id = `${kind}${i}`
      sessions.push(sess({ id, kind, date: `2026-08-${String(i + 1).padStart(2, '0')}` }))
      for (let j = 0; j < c; j++) points.push(pt({ session_id: id, created_at: T(j * 5), stroke: j % 3 === 0 ? 'bh' : 'fh', error_type: j % 2 ? 'net' : 'long' }))
    })
    return { sessions, points }
  }

  it('summarizeKind and recentTrend', () => {
    const { sessions, points } = build([10, 10, 10, 6, 6, 6])
    const stats = sessionStats(sessions, points)
    expect(summarizeKind(stats, 'practice')).toMatchObject({ sessions: 6, errors: 48, perSession: 8 })
    expect(summarizeKind(stats, 'match').sessions).toBe(0)
    expect(recentTrend(stats, 3)).toEqual({ k: 3, recent: 6, previous: 10, changePct: -40 })
    expect(recentTrend(stats.slice(0, 3))).toBeNull()
    expect(recentTrend(stats.slice(0, 4))?.k).toBe(2)
  })

  it('builds insights only when the data supports them', () => {
    expect(buildInsights([], summarize([]))).toEqual([])
    const { sessions, points } = build([10, 10, 10, 6, 6, 6])
    const stats = sessionStats(sessions, points)
    const ins = buildInsights(stats, summarize(points))
    const ids = ins.map((i) => i.id)
    expect(ids).toContain('combo')
    expect(ids).toContain('zone')
    expect(ids).toContain('trend')
    expect(ins.find((i) => i.id === 'trend')?.tone).toBe('good')
    expect(ins.find((i) => i.id === 'trend')?.text).toMatch(/down 40%/)
    expect(ins.find((i) => i.id === 'stroke')?.text).toMatch(/Forehand accounts for 6\d%/)
  })
})

describe('robustness', () => {
  it('unparsable timestamps never produce NaN or crash', () => {
    const bad = [pt({ created_at: 'garbage' }), pt({ created_at: T(5) }), pt({ created_at: '' })]
    expect(minutesBetween('garbage', T(1))).toBe(0)
    expect(sequence(bad)).toHaveLength(1)
    expect(elapsedBuckets(bad)).toHaveLength(1)
    expect(thirds(bad)).toEqual({ first: 1, middle: 0, last: 0 })
    const rows = sessionStats([sess()], bad)
    expect(rows[0]).toMatchObject({ total: 3, durationMin: 0, activeCount: 1 })
  })

  it('unknown stroke/error values are not counted (same rule as summarize)', () => {
    const rows = sessionStats([sess()], [pt(), pt({ stroke: 'volley' as never, error_type: 'frame' as never })])
    expect(rows[0]).toMatchObject({ total: 2, fh: 1, bh: 0, long: 1, net: 0, wide: 0 })
    expect(elapsedBuckets(rows[0].points)[0]).toMatchObject({ total: 2, fh: 1, bh: 0 })
  })

  it('a point added long after the session is excluded from the active window, buckets and thirds', () => {
    const pts = [pt({ created_at: T(0) }), pt({ created_at: T(20) }), pt({ created_at: T(40) }), pt({ created_at: T(24 * 60 + 5) })]
    expect(activeWindow(pts)).toHaveLength(3)
    const rows = sessionStats([sess()], pts)
    expect(rows[0]).toMatchObject({ total: 4, activeCount: 3, durationMin: 40 })
    expect(elapsedBuckets(pts).map((b) => b.total)).toEqual([1, 0, 1, 0, 1])
    expect(thirds(pts)).toEqual({ first: 1, middle: 1, last: 1 })
  })

  it('bucket width adapts so long windows stay readable', () => {
    expect(pickBucketMin(45)).toBe(10)
    expect(pickBucketMin(240)).toBe(10)
    expect(pickBucketMin(300)).toBe(15)
    expect(pickBucketMin(700)).toBe(30)
    const long = Array.from({ length: 30 }, (_, i) => pt({ created_at: T(i * 20) })) // 580 min, gaps of 20
    const b = elapsedBuckets(long)
    expect(b.length).toBeLessThanOrEqual(24)
    expect(b[1].start).toBe(30)
  })

  it('insights: forced share is last and never crowds out the match-vs-practice line', () => {
    const sessions: Session[] = []
    const points: Point[] = []
    for (let i = 0; i < 6; i++) {
      const kind = i % 2 ? 'match' : 'practice'
      const id = `k${i}`
      sessions.push(sess({ id, kind, date: `2026-08-${String(i + 1).padStart(2, '0')}` }))
      for (let j = 0; j < 8; j++) points.push(pt({ session_id: id, created_at: T(j * 5), stroke: 'fh', error_type: j % 2 ? 'net' : 'long' }))
    }
    const ins = buildInsights(sessionStats(sessions, points), summarize(points))
    const ids = ins.map((i) => i.id)
    expect(ids).toContain('kind')
    expect(ids.at(-1)).toBe('forced')
  })
})
