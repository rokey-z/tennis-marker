import { zoneFor, zoneId } from './court'
import type { ErrorType, Point, Session, Stroke } from './types'
import { ERROR_TYPES, STROKES } from './types'

export type ForcedFilter = 'all' | 'forced' | 'unforced'

export interface Filters {
  sessionId?: string | 'all'
  stroke?: Stroke | 'all'
  error?: ErrorType | 'all'
  forced?: ForcedFilter
}

export const DEFAULT_FILTERS: Required<Filters> = { sessionId: 'all', stroke: 'all', error: 'all', forced: 'all' }

/** Live (non-deleted) points, optionally narrowed by filters. */
export function filterPoints(points: Iterable<Point>, f: Filters = {}): Point[] {
  const out: Point[] = []
  for (const p of points) {
    if (p.deleted_at) continue
    if (f.sessionId && f.sessionId !== 'all' && p.session_id !== f.sessionId) continue
    if (f.stroke && f.stroke !== 'all' && p.stroke !== f.stroke) continue
    if (f.error && f.error !== 'all' && p.error_type !== f.error) continue
    if (f.forced === 'forced' && !p.forced) continue
    if (f.forced === 'unforced' && p.forced) continue
    out.push(p)
  }
  return out
}

export interface Summary {
  total: number
  byStroke: Record<Stroke, number>
  byError: Record<ErrorType, number>
  byForced: { forced: number; unforced: number }
  /** zoneId → count */
  byZone: Record<string, number>
  maxZone: number
  matrix: Record<Stroke, Record<ErrorType, number>>
}

export function summarize(points: Iterable<Point>): Summary {
  const s: Summary = {
    total: 0,
    byStroke: { fh: 0, bh: 0 },
    byError: { long: 0, net: 0, wide: 0 },
    byForced: { forced: 0, unforced: 0 },
    byZone: {},
    maxZone: 0,
    matrix: { fh: { long: 0, net: 0, wide: 0 }, bh: { long: 0, net: 0, wide: 0 } },
  }
  for (const p of points) {
    if (p.deleted_at) continue
    s.total++
    if (STROKES.includes(p.stroke)) s.byStroke[p.stroke]++
    if (ERROR_TYPES.includes(p.error_type)) s.byError[p.error_type]++
    if (p.forced) s.byForced.forced++
    else s.byForced.unforced++
    const id = zoneId(zoneFor(p.x, p.y))
    s.byZone[id] = (s.byZone[id] ?? 0) + 1
    if (s.byZone[id] > s.maxZone) s.maxZone = s.byZone[id]
    if (STROKES.includes(p.stroke) && ERROR_TYPES.includes(p.error_type)) s.matrix[p.stroke][p.error_type]++
  }
  return s
}

export function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

export interface SessionCount {
  session: Session
  count: number
  fh: number
  bh: number
}

/** Counts per live session (newest first) — a simple trend across sessions. */
export function perSessionCounts(sessions: Iterable<Session>, points: Iterable<Point>): SessionCount[] {
  const bySession = new Map<string, SessionCount>()
  for (const s of sessions) {
    if (s.deleted_at) continue
    bySession.set(s.id, { session: s, count: 0, fh: 0, bh: 0 })
  }
  for (const p of points) {
    if (p.deleted_at) continue
    const row = bySession.get(p.session_id)
    if (!row) continue
    row.count++
    if (p.stroke === 'fh') row.fh++
    else if (p.stroke === 'bh') row.bh++
  }
  return [...bySession.values()].sort(compareSessionsDesc)
}

export function compareSessionsDesc(a: SessionCount, b: SessionCount): number {
  return compareSessionDesc(a.session, b.session)
}

/** Newest date first, then newest created first. */
export function compareSessionDesc(a: Session, b: Session): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}
