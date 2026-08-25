import { isValidIso, todayLocalISO } from '../lib/format'
import { describeZone, zoneFor, zoneFromId, zoneId } from './court'
import { pct, type Summary } from './stats'
import { STROKE_LABEL, isErrorType, isStroke, type ErrorType, type Point, type Session, type SessionKind, type Stroke } from './types'

// ---------- ranges ----------

export type Range = '30d' | '90d' | 'year' | 'all'
export const RANGES: Array<{ key: Range; label: string }> = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

/** Inclusive lower bound (YYYY-MM-DD) for a range, or null for all time. */
export function rangeStart(range: Range, today: Date): string | null {
  if (range === 'all') return null
  if (range === 'year') return `${today.getFullYear()}-01-01`
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  d.setDate(d.getDate() - (range === '30d' ? 30 : 90))
  return todayLocalISO(d)
}

export function filterSessions(sessions: Session[], range: Range, kind: SessionKind | 'all', today: Date): Session[] {
  const start = rangeStart(range, today)
  return sessions.filter((s) => !s.deleted_at && (kind === 'all' || s.kind === kind) && (!start || s.date >= start))
}

// ---------- per-session stats ----------

export interface SessionStat {
  session: Session
  /** live points, oldest first */
  points: Point[]
  total: number
  fh: number
  bh: number
  long: number
  net: number
  wide: number
  forced: number
  unforced: number
  /** her errors + the opponent's winners: every point she lost */
  lost: number
  /** kept apart from the error counts above */
  winners: number
  playerWinners: number
  winningServes: number
  /** Non-serve placement landings. */
  placements: number
  /** Successful serve landings, kept out of placement totals. */
  serveLandings: number
  /** Serve net misses, kept out of placement and ordinary net-error totals. */
  serveNetMisses: number
  firstAt: string | null
  lastAt: string | null
  /** minutes spanned by the main activity window (see activeWindow); 0 with < 2 points */
  durationMin: number
  /** points inside the main activity window */
  activeCount: number
  byZone: Record<string, number>
}

const byCreated = (a: Point, b: Point) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)

/** Minutes from a to b (≥ 0); 0 when either timestamp is unparsable. */
export function minutesBetween(aIso: string, bIso: string): number {
  const d = (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000
  return Number.isFinite(d) ? Math.max(0, d) : 0
}

/** Consecutive points more than this many minutes apart are treated as separate activity (e.g. a point added the next day). */
export const ACTIVE_GAP_MIN = 90

/**
 * The session's main activity window: the longest run of live, time-stamped points where consecutive
 * points are ≤ ACTIVE_GAP_MIN apart (ties → earliest). Late additions/outliers fall outside it, so
 * durations, buckets and thirds are not stretched by a point tapped into an old session.
 */
export function activeWindow(points: Point[], maxGapMin = ACTIVE_GAP_MIN): Point[] {
  const pts = points.filter((p) => !p.deleted_at && isValidIso(p.created_at)).sort(byCreated)
  if (pts.length <= 1) return pts
  let best: Point[] = []
  let run: Point[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    if (minutesBetween(pts[i - 1].created_at, pts[i].created_at) <= maxGapMin) run.push(pts[i])
    else {
      if (run.length > best.length) best = run
      run = [pts[i]]
    }
  }
  if (run.length > best.length) best = run
  return best
}

/** One stat row per session, oldest first (chronological — the x-axis of the trend chart). */
export function sessionStats(sessions: Session[], points: Iterable<Point>): SessionStat[] {
  const bySession = new Map<string, Point[]>()
  for (const p of points) {
    if (p.deleted_at) continue
    const arr = bySession.get(p.session_id)
    if (arr) arr.push(p)
    else bySession.set(p.session_id, [p])
  }
  const rows: SessionStat[] = []
  for (const s of sessions) {
    if (s.deleted_at) continue
    const pts = (bySession.get(s.id) ?? []).sort(byCreated)
    const win = activeWindow(pts)
    const row: SessionStat = {
      session: s,
      points: pts,
      total: pts.filter((p) => (p.outcome ?? 'error') === 'error').length,
      fh: 0,
      bh: 0,
      long: 0,
      net: 0,
      wide: 0,
      forced: 0,
      unforced: 0,
      lost: 0,
      winners: 0,
      playerWinners: 0,
      winningServes: 0,
      placements: 0,
      serveLandings: 0,
      serveNetMisses: 0,
      firstAt: pts[0]?.created_at ?? null,
      lastAt: pts.at(-1)?.created_at ?? null,
      durationMin: win.length >= 2 ? minutesBetween(win[0].created_at, win[win.length - 1].created_at) : 0,
      activeCount: win.length,
      byZone: {},
    }
    for (const p of pts) {
      const outcome = p.outcome ?? 'error'
      if (outcome === 'winner') {
        row.winners++
        row.forced++
        continue
      }
      if (outcome === 'player_winner') {
        row.playerWinners++
        continue
      }
      if (outcome === 'winning_serve') {
        row.winningServes++
        continue
      }
      if (outcome === 'placement') {
        if (p.stroke === 'serve') {
          if (p.placement_result === 'net') row.serveNetMisses++
          else row.serveLandings++
        }
        else row.placements++
        continue
      }
      if (isStroke(p.stroke)) row[p.stroke]++
      if (isErrorType(p.error_type)) row[p.error_type]++
      if (p.forced) row.forced++
      else row.unforced++
      const z = zoneId(zoneFor(p.x, p.y))
      row.byZone[z] = (row.byZone[z] ?? 0) + 1
    }
    row.lost = row.total + row.winners
    rows.push(row)
  }
  return rows.sort((a, b) => {
    if (a.session.date !== b.session.date) return a.session.date < b.session.date ? -1 : 1
    return a.session.created_at < b.session.created_at ? -1 : a.session.created_at > b.session.created_at ? 1 : 0
  })
}

/** Trailing average over the last k values (fewer at the start). */
export function movingAverage(values: number[], k = 3): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - k + 1)
    const slice = values.slice(from, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

// ---------- within-session timeline ----------

export interface SequenceItem {
  point: Point
  /** minutes since the previous point (null for the first) */
  gapMin: number | null
  /** minutes since the first point */
  elapsedMin: number
}

export function sequence(points: Point[]): SequenceItem[] {
  const pts = points.filter((p) => !p.deleted_at && isValidIso(p.created_at)).sort(byCreated)
  if (!pts.length) return []
  const t0 = pts[0].created_at
  return pts.map((p, i) => ({
    point: p,
    gapMin: i === 0 ? null : minutesBetween(pts[i - 1].created_at, p.created_at),
    elapsedMin: minutesBetween(t0, p.created_at),
  }))
}

export interface Bucket {
  /** start minute (inclusive) */
  start: number
  end: number
  label: string
  total: number
  fh: number
  bh: number
  long: number
  net: number
  wide: number
  forced: number
  unforced: number
}

/** Bucket width (minutes) that keeps a window of `durationMin` at ≤ ~24 buckets. */
export function pickBucketMin(durationMin: number): number {
  for (const b of [10, 15, 30, 60, 120]) if (durationMin / b <= 24) return b
  return 240
}

/**
 * Errors per elapsed-time bucket within the session's main activity window (see activeWindow).
 * `bucketMin` defaults to pickBucketMin(window duration). Always ≥ 1 bucket when there are points.
 */
export function elapsedBuckets(points: Point[], bucketMin?: number): Bucket[] {
  const active = sequence(activeWindow(points))
  if (!active.length) return []
  const last = active[active.length - 1].elapsedMin
  const bm = bucketMin ?? pickBucketMin(last)
  const n = Math.min(1000, Math.max(1, Math.floor(last / bm) + 1))
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({
    start: i * bm,
    end: (i + 1) * bm,
    label: `${i * bm}–${(i + 1) * bm}`,
    total: 0,
    fh: 0,
    bh: 0,
    long: 0,
    net: 0,
    wide: 0,
    forced: 0,
    unforced: 0,
  }))
  // Buckets describe errors, not placements or either player's winners. Keep the activity-window
  // clock based on all marks, then exclude non-errors from the actual counts.
  for (const { point: p, elapsedMin } of active) {
    if ((p.outcome ?? 'error') !== 'error') continue
    const b = buckets[Math.min(n - 1, Math.max(0, Math.floor(elapsedMin / bm)))]
    b.total++
    if (isStroke(p.stroke)) b[p.stroke]++
    if (isErrorType(p.error_type)) b[p.error_type]++
    if (p.forced) b.forced++
    else b.unforced++
  }
  return buckets
}

export interface Thirds {
  first: number
  middle: number
  last: number
}

/** Errors in the first / middle / last third of the session by elapsed time (by order if the session has no duration). */
export function thirds(points: Point[]): Thirds {
  const active = sequence(activeWindow(points))
  const out: Thirds = { first: 0, middle: 0, last: 0 }
  if (!active.length) return out
  const seq = active.filter(({ point }) => (point.outcome ?? 'error') === 'error')
  if (!seq.length) return out
  const dur = active[active.length - 1].elapsedMin
  seq.forEach((item, i) => {
    const frac = dur > 0 ? item.elapsedMin / dur : seq.length > 1 ? i / (seq.length - 1) : 0
    if (frac < 1 / 3) out.first++
    else if (frac < 2 / 3) out.middle++
    else out.last++
  })
  return out
}

/** Longest run of consecutive items sharing a key. */
export function longestStreak<T>(items: T[], key: (t: T) => string): { key: string; length: number } | null {
  let best: { key: string; length: number } | null = null
  let cur: { key: string; length: number } | null = null
  for (const it of items) {
    const k = key(it)
    if (cur && cur.key === k) cur.length++
    else cur = { key: k, length: 1 }
    if (!best || cur.length > best.length) best = { ...cur }
  }
  return best
}

// ---------- comparisons & insights ----------

export interface KindSummary {
  sessions: number
  errors: number
  perSession: number
  fhPct: number
  forcedPct: number
}

export function summarizeKind(stats: SessionStat[], kind: SessionKind): KindSummary {
  const rows = stats.filter((r) => r.session.kind === kind && r.total > 0)
  const errors = rows.reduce((a, r) => a + r.total, 0)
  const fh = rows.reduce((a, r) => a + r.fh, 0)
  const forced = rows.reduce((a, r) => a + r.forced, 0)
  return {
    sessions: rows.length,
    errors,
    perSession: rows.length ? errors / rows.length : 0,
    fhPct: pct(fh, errors),
    forcedPct: pct(forced, rows.reduce((a, r) => a + r.lost, 0)),
  }
}

/** Average errors of the last k sessions (with points) vs the k before them; k shrinks to fit (min 2 per side). */
export function recentTrend(stats: SessionStat[], k = 3): { k: number; recent: number; previous: number; changePct: number } | null {
  const rows = stats.filter((r) => r.total > 0)
  const kk = Math.min(k, Math.floor(rows.length / 2))
  if (kk < 2) return null
  const recent = rows.slice(-kk)
  const previous = rows.slice(-2 * kk, -kk)
  const avg = (rs: SessionStat[]) => rs.reduce((a, r) => a + r.total, 0) / rs.length
  const r = avg(recent)
  const p = avg(previous)
  return { k: kk, recent: r, previous: p, changePct: p === 0 ? 0 : Math.round(((r - p) / p) * 100) }
}

export interface Insight {
  id: string
  text: string
  /** 'good' | 'bad' | 'neutral' — used only for an icon, never color alone */
  tone: 'good' | 'bad' | 'neutral'
}

export function buildInsights(stats: SessionStat[], summary: Summary): Insight[] {
  const out: Insight[] = []
  const total = summary.total
  if (total >= 5) {
    // most common stroke × error combination
    let best: { s: Stroke; e: ErrorType; n: number } | null = null
    for (const s of ['fh', 'bh'] as Stroke[]) {
      for (const e of ['long', 'net', 'wide'] as ErrorType[]) {
        const n = summary.matrix[s][e]
        if (!best || n > best.n) best = { s, e, n }
      }
    }
    if (best && best.n > 0) {
      out.push({
        id: 'combo',
        tone: 'neutral',
        text: `Most common error: ${STROKE_LABEL[best.s].toLowerCase()} ${describeError(best.e)} — ${pct(best.n, total)}% of all errors (${best.n}).`,
      })
    }
    // hottest zone
    const zones = Object.entries(summary.byZone).sort((a, b) => b[1] - a[1])
    if (zones.length && zones[0][1] > 0) {
      const [zid, n] = zones[0]
      out.push({ id: 'zone', tone: 'neutral', text: `Hottest zone: ${describeZone(zoneFromId(zid))} — ${pct(n, total)}% of errors.` })
    }
    // stroke bias
    const fhPct = pct(summary.byStroke.fh, total)
    if (fhPct >= 60) out.push({ id: 'stroke', tone: 'neutral', text: `Forehand accounts for ${fhPct}% of errors.` })
    else if (fhPct <= 40) out.push({ id: 'stroke', tone: 'neutral', text: `Backhand accounts for ${100 - fhPct}% of errors.` })
  }
  // trend
  const t = recentTrend(stats)
  if (t) {
    const k = t.k
    if (Math.abs(t.changePct) < 5) {
      out.push({ id: 'trend', tone: 'neutral', text: `Errors per session are steady: ${t.recent.toFixed(1)} over the last ${k} vs ${t.previous.toFixed(1)} before.` })
    } else if (t.changePct < 0) {
      out.push({ id: 'trend', tone: 'good', text: `Errors per session are down ${Math.abs(t.changePct)}% over the last ${k} sessions (${t.recent.toFixed(1)} vs ${t.previous.toFixed(1)}).` })
    } else {
      out.push({ id: 'trend', tone: 'bad', text: `Errors per session are up ${t.changePct}% over the last ${k} sessions (${t.recent.toFixed(1)} vs ${t.previous.toFixed(1)}).` })
    }
  }
  // timing across sessions (only sessions long enough to have thirds)
  const timed = stats.filter((r) => r.durationMin >= 10 && r.total >= 3)
  if (timed.length >= 2) {
    const agg = { first: 0, middle: 0, last: 0 }
    for (const r of timed) {
      const th = thirds(r.points)
      agg.first += th.first
      agg.middle += th.middle
      agg.last += th.last
    }
    const n = agg.first + agg.middle + agg.last
    const parts: Array<[keyof Thirds, number]> = [
      ['first', agg.first],
      ['middle', agg.middle],
      ['last', agg.last],
    ]
    parts.sort((a, b) => b[1] - a[1])
    if (n > 0 && pct(parts[0][1], n) >= 40) {
      out.push({ id: 'timing', tone: 'neutral', text: `Most errors come in the ${parts[0][0]} third of sessions (${pct(parts[0][1], n)}%).` })
    }
  }
  // match vs practice
  const m = summarizeKind(stats, 'match')
  const p = summarizeKind(stats, 'practice')
  if (m.sessions >= 2 && p.sessions >= 2) {
    out.push({
      id: 'kind',
      tone: 'neutral',
      text: `Matches average ${m.perSession.toFixed(1)} errors vs ${p.perSession.toFixed(1)} in practice.`,
    })
  }
  // forced share (lowest information — last so it never crowds out the derived insights)
  if (summary.lost >= 5) {
    out.push({ id: 'forced', tone: 'neutral', text: `${pct(summary.byForced.forced, summary.lost)}% of lost points were forced or opponent winners (${summary.byForced.forced} of ${summary.lost}).` })
  }
  return out.slice(0, 7)
}

function describeError(e: ErrorType): string {
  return e === 'net' ? 'into the net' : e === 'long' ? 'long' : 'wide'
}
