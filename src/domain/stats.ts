import { isOut, zoneFor, zoneId } from './court'
import type { ErrorType, Outcome, Point, Session, Stroke } from './types'
import { isErrorType, isStroke } from './types'

export type ForcedFilter = 'all' | 'forced' | 'unforced'

export interface Filters {
  sessionId?: string | 'all'
  stroke?: Stroke | 'all'
  error?: ErrorType | 'all'
  forced?: ForcedFilter
  /** 'error' (the default view), 'winner', or 'all' */
  outcome?: Outcome | 'all'
}

export const DEFAULT_FILTERS: Required<Filters> = { sessionId: 'all', stroke: 'all', error: 'all', forced: 'all', outcome: 'all' }

/** Live (non-deleted) points, optionally narrowed by filters. */
export function filterPoints(points: Iterable<Point>, f: Filters = {}): Point[] {
  const out: Point[] = []
  for (const p of points) {
    if (p.deleted_at) continue
    if (f.sessionId && f.sessionId !== 'all' && p.session_id !== f.sessionId) continue
    if (f.stroke && f.stroke !== 'all' && p.stroke !== f.stroke) continue
    if (f.error && f.error !== 'all' && p.error_type !== f.error) continue
    // forced/unforced is a question about her errors — winners and placements are neither
    if (f.forced && f.forced !== 'all') {
      if ((p.outcome ?? 'error') !== 'error') continue
      if (f.forced === 'forced' && !p.forced) continue
      if (f.forced === 'unforced' && p.forced) continue
    }
    if (f.outcome && f.outcome !== 'all' && (p.outcome ?? 'error') !== f.outcome) continue
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
  /** forced errors per stroke (unforced = byStroke[s] - byStrokeForced[s]) */
  byStrokeForced: Record<Stroke, number>
  /**
   * Points she lost: her errors plus the winners the opponent hit past her. The breakdowns below
   * stay on `total` (errors only), since a winner has no stroke or error type to break down.
   */
  lost: number
  /** winners and placements are counted apart — neither is an error */
  winners: number
  placements: number
  /** placements that landed outside the singles lines */
  placementsOut: number
  /** zoneId → count for placements — where the BALL landed, never mixed with the error zones */
  placementZones: Record<string, number>
  maxPlacementZone: number
  placementsByStroke: Record<Stroke, number>
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
    byStrokeForced: { fh: 0, bh: 0 },
    lost: 0,
    winners: 0,
    placements: 0,
    placementsOut: 0,
    placementZones: {},
    maxPlacementZone: 0,
    placementsByStroke: { fh: 0, bh: 0 },
  }
  for (const p of points) {
    if (p.deleted_at) continue
    const outcome = p.outcome ?? 'error'
    if (outcome === 'winner') {
      // the opponent's shot — nothing of hers to break down, but she was standing somewhere and
      // she lost the point, so it counts in the total and on the zone map
      s.winners++
      s.lost++
      countZone(s, p)
      continue
    }
    if (outcome === 'placement') {
      s.placements++
      if (isOut(p.x, p.y)) s.placementsOut++
      if (isStroke(p.stroke)) s.placementsByStroke[p.stroke]++
      const pz = zoneId(zoneFor(p.x, p.y))
      s.placementZones[pz] = (s.placementZones[pz] ?? 0) + 1
      if (s.placementZones[pz] > s.maxPlacementZone) s.maxPlacementZone = s.placementZones[pz]
      continue
    }
    s.total++
    s.lost++
    if (isStroke(p.stroke)) {
      s.byStroke[p.stroke]++
      if (p.forced) s.byStrokeForced[p.stroke]++
    }
    if (isErrorType(p.error_type)) s.byError[p.error_type]++
    if (p.forced) s.byForced.forced++
    else s.byForced.unforced++
    countZone(s, p)
    if (isStroke(p.stroke) && isErrorType(p.error_type)) s.matrix[p.stroke][p.error_type]++
  }
  return s
}

function countZone(s: Summary, p: Point): void {
  const id = zoneId(zoneFor(p.x, p.y))
  s.byZone[id] = (s.byZone[id] ?? 0) + 1
  if (s.byZone[id] > s.maxZone) s.maxZone = s.byZone[id]
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
