import { placementResultFor, zoneFor, zoneId } from './court'
import type { ErrorType, Outcome, PlacementResult, PlacementStroke, Point, PointShotType, Session, ShotType, Stroke } from './types'
import { POINT_SHOT_TYPES, SHOT_TYPES, isErrorType, isPlacementResult, isPlacementStroke, isPointShotType, isShotType, isStroke } from './types'

export type ForcedFilter = 'all' | 'forced' | 'unforced'
export type PlacementFilter = 'all' | 'in' | 'out' | 'serve'

export interface Filters {
  sessionId?: string | 'all'
  stroke?: PlacementStroke | 'all'
  error?: ErrorType | 'all'
  shotType?: PointShotType | 'all'
  forced?: ForcedFilter
  /** 'error' (the default view), 'winner', or 'all' */
  outcome?: Outcome | 'all'
}

export const DEFAULT_FILTERS: Required<Filters> = { sessionId: 'all', stroke: 'all', error: 'all', shotType: 'all', forced: 'all', outcome: 'all' }

/** Live (non-deleted) points, optionally narrowed by filters. */
export function filterPoints(points: Iterable<Point>, f: Filters = {}): Point[] {
  const out: Point[] = []
  for (const p of points) {
    if (p.deleted_at) continue
    if (f.sessionId && f.sessionId !== 'all' && p.session_id !== f.sessionId) continue
    if (f.stroke && f.stroke !== 'all' && p.stroke !== f.stroke) continue
    if (f.error && f.error !== 'all' && p.error_type !== f.error) continue
    if (f.shotType && f.shotType !== 'all' && p.shot_type !== f.shotType) continue
    // An opponent winner is treated as forced; player winners and placements are neither.
    if (f.forced && f.forced !== 'all') {
      const outcome = p.outcome ?? 'error'
      if (outcome === 'placement' || outcome === 'player_winner' || outcome === 'winning_serve') continue
      const forced = outcome === 'winner' || p.forced
      if (f.forced === 'forced' && !forced) continue
      if (f.forced === 'unforced' && forced) continue
    }
    if (f.outcome && f.outcome !== 'all' && (p.outcome ?? 'error') !== f.outcome) continue
    out.push(p)
  }
  return out
}

/** Placement-page filter. Serves are independent; net strikes belong to Out. */
export function filterPlacementPoints(points: Iterable<Point>, filter: PlacementFilter): Point[] {
  const out: Point[] = []
  for (const point of points) {
    if (point.deleted_at) continue
    const outcome = point.outcome ?? 'error'
    if (filter === 'all') {
      out.push(point)
      continue
    }
    if (filter === 'serve') {
      if (outcome === 'placement' && point.stroke === 'serve') out.push(point)
      continue
    }
    if (point.error_type === 'net') {
      if (filter === 'out') out.push(point)
      continue
    }
    if (outcome !== 'placement' || point.stroke === 'serve') continue
    const result = isPlacementResult(point.placement_result) && point.placement_result !== 'unknown'
      ? point.placement_result
      : placementResultFor(point.x, point.y)
    if (filter === 'in' ? result === 'in' : result === 'wide' || result === 'long' || result === 'net') out.push(point)
  }
  return out
}

export interface Summary {
  total: number
  byStroke: Record<Stroke, number>
  byError: Record<ErrorType, number>
  byForced: { forced: number; unforced: number }
  /** Error counts by attempted ball type; winners and placements never enter this breakdown. */
  byShotType: Record<ShotType, number>
  /** FH/BH split inside each attempted ball type. */
  byShotTypeStroke: Record<ShotType, Record<Stroke, number>>
  /** Legacy errors recorded before ball type was introduced. */
  untypedErrors: number
  /** FH/BH split for legacy errors without a selected ball type. */
  untypedErrorsByStroke: Record<Stroke, number>
  /** zoneId → count */
  byZone: Record<string, number>
  maxZone: number
  matrix: Record<Stroke, Record<ErrorType, number>>
  /** forced errors per stroke (unforced = byStroke[s] - byStrokeForced[s]) */
  byStrokeForced: Record<Stroke, number>
  /**
   * Points she lost: her errors plus the winners the opponent hit past her. The breakdowns below
   * stay on `total` (errors only), except `byForced`, where an opponent winner counts as forced.
   */
  lost: number
  /** winners and placements are counted apart — neither is an error */
  winners: number
  /** Winners hit by the player, kept apart from both errors and opponent winners. */
  playerWinners: number
  /** Serve points won through a return error; deliberately not counted as winners. */
  winningServes: number
  playerWinnersByStroke: Record<PlacementStroke, number>
  playerWinnersByShotType: Record<PointShotType, number>
  /** Non-serve placement landings. Serves are counted only in `serveLandings`. */
  placements: number
  /** Serves are tracked separately and never enter placement, zone, or in/out totals. */
  serveLandings: number
  /** placements that landed outside the singles lines */
  placementsOut: number
  /** zoneId → count for placements — where the BALL landed, never mixed with the error zones */
  placementZones: Record<string, number>
  maxPlacementZone: number
  /** Successful placement zones, kept separate so the court map never blends them with misses. */
  placementInZones: Record<string, number>
  /** Long-placement zones, drawn above the baseline on the placement analysis map. */
  placementLongZones: Record<string, number>
  /** Wide-placement zones, drawn outside the singles sidelines on the placement analysis map. */
  placementWideZones: Record<string, number>
  /** Net strikes shown on the placement map's net band. */
  placementNet: number
  placementsByStroke: Record<PlacementStroke, number>
  placementMatrix: Record<PlacementStroke, Record<PlacementResult, number>>
}

export function summarize(points: Iterable<Point>): Summary {
  const s: Summary = {
    total: 0,
    byStroke: { fh: 0, bh: 0 },
    byError: { long: 0, net: 0, wide: 0 },
    byForced: { forced: 0, unforced: 0 },
    byShotType: Object.fromEntries(SHOT_TYPES.map((type) => [type, 0])) as Record<ShotType, number>,
    byShotTypeStroke: Object.fromEntries(SHOT_TYPES.map((type) => [type, { fh: 0, bh: 0 }])) as Record<ShotType, Record<Stroke, number>>,
    untypedErrors: 0,
    untypedErrorsByStroke: { fh: 0, bh: 0 },
    byZone: {},
    maxZone: 0,
    matrix: { fh: { long: 0, net: 0, wide: 0 }, bh: { long: 0, net: 0, wide: 0 } },
    byStrokeForced: { fh: 0, bh: 0 },
    lost: 0,
    winners: 0,
    playerWinners: 0,
    winningServes: 0,
    playerWinnersByStroke: { fh: 0, bh: 0, serve: 0 },
    playerWinnersByShotType: Object.fromEntries(POINT_SHOT_TYPES.map((type) => [type, 0])) as Record<PointShotType, number>,
    placements: 0,
    serveLandings: 0,
    placementsOut: 0,
    placementZones: {},
    maxPlacementZone: 0,
    placementInZones: {},
    placementLongZones: {},
    placementWideZones: {},
    placementNet: 0,
    placementsByStroke: { fh: 0, bh: 0, serve: 0 },
    placementMatrix: {
      fh: { in: 0, net: 0, wide: 0, long: 0, unknown: 0 },
      bh: { in: 0, net: 0, wide: 0, long: 0, unknown: 0 },
      serve: { in: 0, net: 0, wide: 0, long: 0, unknown: 0 },
    },
  }
  for (const p of points) {
    if (p.deleted_at) continue
    const outcome = p.outcome ?? 'error'
    if (outcome === 'winner') {
      // The opponent forced the result. Its recorded tap location is not a meaningful ball
      // placement, so winners stay out of every zone/map count.
      s.winners++
      s.lost++
      s.byForced.forced++
      continue
    }
    if (outcome === 'player_winner') {
      s.playerWinners++
      if (isPlacementStroke(p.stroke)) s.playerWinnersByStroke[p.stroke]++
      if (isPointShotType(p.shot_type)) s.playerWinnersByShotType[p.shot_type]++
      continue
    }
    if (outcome === 'winning_serve') {
      s.winningServes++
      continue
    }
    if (outcome === 'placement') {
      if (p.stroke === 'serve') {
        s.serveLandings++
        s.placementsByStroke.serve++
        continue
      }
      s.placements++
      if (isPlacementStroke(p.stroke)) s.placementsByStroke[p.stroke]++
      if (isPlacementStroke(p.stroke)) {
        // Old marks only have their landing coordinates. Reconstruct Wide/Long from those so
        // their map areas still receive a count.
        const result: PlacementResult = isPlacementResult(p.placement_result)
          ? p.placement_result
          : placementResultFor(p.x, p.y)
        s.placementMatrix[p.stroke][result]++
        if (result === 'wide' || result === 'long') s.placementsOut++
        if (result === 'net') s.placementNet++
        const placementZone = zoneId(zoneFor(p.x, p.y))
        if (result === 'in') s.placementInZones[placementZone] = (s.placementInZones[placementZone] ?? 0) + 1
        else if (result === 'long') s.placementLongZones[placementZone] = (s.placementLongZones[placementZone] ?? 0) + 1
        else if (result === 'wide') s.placementWideZones[placementZone] = (s.placementWideZones[placementZone] ?? 0) + 1
      }
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
    if (p.error_type === 'net') s.placementNet++
    if (p.forced) s.byForced.forced++
    else s.byForced.unforced++
    if (isShotType(p.shot_type)) {
      s.byShotType[p.shot_type]++
      if (isStroke(p.stroke)) s.byShotTypeStroke[p.shot_type][p.stroke]++
    } else {
      s.untypedErrors++
      if (isStroke(p.stroke)) s.untypedErrorsByStroke[p.stroke]++
    }
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
    // count what the session is for: marks of the other mode live in the other half and are hidden
    const outcome = p.outcome ?? 'error'
    if (row.session.mode === 'placement') {
      // Placement sessions include their landing marks plus net strikes, which are errors.
      if (outcome !== 'placement' && p.error_type !== 'net') continue
      if (outcome === 'placement' && p.stroke === 'serve') continue
    } else if (outcome === 'placement') continue
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
