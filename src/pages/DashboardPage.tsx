import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Chip } from '../components/Bits'
import { Delta, SequenceStrip, ShareBars, Sparkline, StackedColumns, type Category, type Series } from '../components/charts'
import { CHART } from '../components/chartUtils'
import { Court } from '../components/Court'
import { MarkLegend } from '../components/marks'
import { useToday } from '../components/hooks'
import { Shell } from '../components/Shell'
import { useAppState } from '../data/app'
import {
  RANGES,
  buildInsights,
  elapsedBuckets,
  filterSessions,
  longestStreak,
  movingAverage,
  pickBucketMin,
  recentTrend,
  sequence,
  sessionStats,
  summarizeKind,
  thirds,
  type Range,
  type SequenceItem,
  type SessionStat,
} from '../domain/analytics'
import { describeZone, zoneFromId } from '../domain/court'
import { sessionLabel } from '../domain/session'
import { pct, summarize } from '../domain/stats'
import { KIND_LABEL, STROKE_LABEL, STROKE_SHORT, type SessionKind, type Stroke } from '../domain/types'
import { formatDate, formatMinutes, parseYMD, shortDate, weekday } from '../lib/format'

type StackMode = 'total' | 'stroke' | 'error' | 'forced'
/** Numeric fields shared by SessionStat and Bucket that a stacked series can read. */
type CountKey = 'total' | 'fh' | 'bh' | 'long' | 'net' | 'wide' | 'unforced' | 'forced'
type CountRow = Record<CountKey, number>
type StackSeries = Series & { key: CountKey }

/** One table drives series order, colors, legend and values — no parallel switch to keep in sync. */
const SERIES: Record<StackMode, StackSeries[]> = {
  total: [{ key: 'total', label: 'Errors', color: CHART.total }],
  stroke: [
    { key: 'fh', label: 'Forehand', color: CHART.fh },
    { key: 'bh', label: 'Backhand', color: CHART.bh },
  ],
  error: [
    { key: 'long', label: 'Long', color: CHART.long },
    { key: 'net', label: 'Net', color: CHART.net },
    { key: 'wide', label: 'Wide', color: CHART.wide },
  ],
  forced: [
    { key: 'unforced', label: 'Unforced', color: CHART.unforced },
    { key: 'forced', label: 'Forced', color: CHART.forced },
  ],
}
const valuesFor = (mode: StackMode, row: CountRow): number[] => SERIES[mode].map((s) => row[s.key])

const MODES: Array<[StackMode, string]> = [
  ['total', 'Total'],
  ['stroke', 'Stroke'],
  ['error', 'Error type'],
  ['forced', 'Forced'],
]

export function DashboardPage() {
  const state = useAppState()
  const today = useToday()
  const [range, setRange] = useState<Range>('all')
  const [kind, setKind] = useState<SessionKind | 'all'>('all')
  const [mode, setMode] = useState<StackMode>('stroke')
  const [showTable, setShowTable] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const sessionCardRef = useRef<HTMLDivElement>(null)

  // key on the row maps, not the whole state, so sync bookkeeping (dirty flags, meta) doesn't recompute analytics
  const sessionsMap = state.sessions
  const pointsMap = state.points
  const sessions = useMemo(() => filterSessions(Object.values(sessionsMap), range, kind, parseYMD(today) ?? new Date()), [sessionsMap, range, kind, today])
  const stats = useMemo(() => sessionStats(sessions, Object.values(pointsMap)), [sessions, pointsMap])
  const newestFirst = useMemo(() => [...stats].reverse(), [stats])
  const allPoints = useMemo(() => stats.flatMap((s) => s.points), [stats])
  const summary = useMemo(() => summarize(allPoints), [allPoints])
  const insights = useMemo(() => buildInsights(stats, summary), [stats, summary])
  const withPoints = useMemo(() => stats.filter((s) => s.total > 0), [stats])
  const trend = useMemo(() => recentTrend(stats), [stats])
  const perSession = withPoints.length ? summary.total / withPoints.length : 0
  const recent = useMemo(() => withPoints.slice(-12), [withPoints])
  const spark = (f: (s: SessionStat) => number) => recent.map(f)
  const share = (n: (s: SessionStat) => number) => (s: SessionStat) => (s.total ? n(s) / s.total : 0)

  const selected: SessionStat | null = useMemo(() => stats.find((s) => s.session.id === selId) ?? withPoints.at(-1) ?? stats.at(-1) ?? null, [stats, withPoints, selId])
  useEffect(() => {
    // a session filtered out of view is no longer "the selection" (don't silently re-select it when the filter widens)
    if (selId && !stats.some((s) => s.session.id === selId)) setSelId(null)
  }, [stats, selId])

  // ----- trend chart data -----
  const trendCats: Category[] = useMemo(
    () =>
      stats.map((s) => ({
        key: s.session.id,
        label: shortDate(s.session.date),
        title: sessionLabel(s.session),
        subtitle: `${formatDate(s.session.date)} · ${KIND_LABEL[s.session.kind]}${s.durationMin ? ` · ${formatMinutes(s.durationMin)}` : ''}`,
      })),
    [stats],
  )
  const trendValues = useMemo(() => stats.map((s) => valuesFor(mode, s)), [stats, mode])
  const avg = useMemo(() => movingAverage(stats.map((s) => s.total), 3), [stats])
  const selectedIndex = selected ? stats.findIndex((s) => s.session.id === selected.session.id) : null

  // ----- selected session timeline -----
  const seq = useMemo(() => (selected ? sequence(selected.points) : []), [selected])
  const buckets = useMemo(() => (selected ? elapsedBuckets(selected.points) : []), [selected])
  const bucketMin = selected ? pickBucketMin(selected.durationMin) : 10
  const th = useMemo(() => (selected ? thirds(selected.points) : { first: 0, middle: 0, last: 0 }), [selected])
  const streak = useMemo(() => (selected ? longestStreak(selected.points, (p) => p.stroke) : null), [selected])
  const bucketCats: Category[] = useMemo(
    () => buckets.map((b) => ({ key: b.label, label: `${b.start}′`, title: `${b.label} min`, subtitle: 'since the first error' })),
    [buckets],
  )
  const bucketValues = useMemo(() => buckets.map((b) => valuesFor(mode, b)), [buckets, mode])
  const lateCount = selected ? selected.total - selected.activeCount : 0

  // ----- breakdowns -----
  const matchK = summarizeKind(stats, 'match')
  const practiceK = summarizeKind(stats, 'practice')
  const zonesSorted = useMemo(() => Object.entries(summary.byZone).sort((a, b) => b[1] - a[1]), [summary])
  const strokeRows = (parts: (s: Stroke) => StackSeries[], value: (s: Stroke, key: CountKey) => number) =>
    (['fh', 'bh'] as const).map((s) => ({
      label: STROKE_LABEL[s],
      total: summary.byStroke[s],
      parts: parts(s).map((se) => ({ key: se.key, label: se.label, color: se.color, value: value(s, se.key) })),
    }))

  // ----- timeline items (memoized once per data change, not per render) -----
  const timelineItems = useMemo(() => new Map(stats.map((s) => [s.session.id, sequence(s.points)] as [string, SequenceItem[]])), [stats])

  const selectSession = (id: string, scroll = false) => {
    setSelId(id)
    if (scroll) sessionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Shell title="Dashboard">
      <div className="stack">
        {/* one filter row scopes everything below */}
        <div className="filters-row">
          <div className="chip-group" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <Chip key={r.key} on={range === r.key} onClick={() => setRange(r.key)}>
                {r.label}
              </Chip>
            ))}
          </div>
          <div className="chip-group" role="group" aria-label="Session type">
            {(['all', 'match', 'practice'] as const).map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
                {k === 'all' ? 'All types' : k === 'match' ? 'Matches' : 'Practice'}
              </Chip>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="kbd-hint">Stack by</span>
            <div className="segmented small" role="radiogroup" aria-label="Stack by">
              {MODES.map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {stats.length === 0 ? (
          <div className="empty">
            <strong>No sessions in this range</strong>
            Widen the date range, or record a session first.
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="kpi-grid">
              <Kpi label="Sessions" value={stats.length} sub={`${withPoints.length} with errors logged`} />
              <Kpi label="Errors" value={summary.total} sub={`${summary.byForced.unforced} unforced · ${summary.byForced.forced} forced`} spark={spark((s) => s.total)} />
              <Kpi
                label="Errors per session"
                value={perSession ? perSession.toFixed(1) : '—'}
                sub={<Delta pct={trend ? trend.changePct : null} label="vs previous" upIsGood={false} />}
                spark={spark((s) => s.total)}
              />
              <Kpi label="Forehand share" value={`${pct(summary.byStroke.fh, summary.total)}%`} sub={`${summary.byStroke.fh} errors`} spark={spark(share((s) => s.fh))} />
              <Kpi label="Backhand share" value={`${pct(summary.byStroke.bh, summary.total)}%`} sub={`${summary.byStroke.bh} errors`} spark={spark(share((s) => s.bh))} />
              <Kpi label="Forced share" value={`${pct(summary.byForced.forced, summary.total)}%`} sub={`${summary.byForced.forced} of ${summary.total}`} spark={spark(share((s) => s.forced))} />
            </div>

            {/* insights */}
            {insights.length > 0 && (
              <div className="card">
                <div className="section-title">What stands out</div>
                <ul className="insights">
                  {insights.map((i) => (
                    <li key={i.id} className={i.tone}>
                      <span className="ins-icon" aria-hidden="true">
                        {i.tone === 'good' ? '↓' : i.tone === 'bad' ? '↑' : '•'}
                      </span>
                      <span>{i.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* trend across sessions */}
            <div className="card">
              <div className="row" style={{ alignItems: 'baseline' }}>
                <div className="grow">
                  <div className="section-title" style={{ marginBottom: 2 }}>
                    Errors per session
                  </div>
                  <div className="kbd-hint">Chronological · click a column to open that session below</div>
                </div>
                <button type="button" className="btn sm ghost" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
                  {showTable ? 'Chart' : 'Table'}
                </button>
              </div>
              {showTable ? (
                <div className="table-wrap">
                  <table className="data-table clickable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Session</th>
                        <th>Errors</th>
                        <th>FH</th>
                        <th>BH</th>
                        <th>Long</th>
                        <th>Net</th>
                        <th>Wide</th>
                        <th>Forced</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newestFirst.map((s) => (
                        <tr key={s.session.id} className={selected?.session.id === s.session.id ? 'sel' : ''} onClick={() => selectSession(s.session.id)}>
                          <td>{formatDate(s.session.date)}</td>
                          <td>
                            {sessionLabel(s.session)} <span className="muted">· {KIND_LABEL[s.session.kind]}</span>
                          </td>
                          <td>{s.total}</td>
                          <td>{s.fh}</td>
                          <td>{s.bh}</td>
                          <td>{s.long}</td>
                          <td>{s.net}</td>
                          <td>{s.wide}</td>
                          <td>{s.forced}</td>
                          <td>{s.durationMin ? formatMinutes(s.durationMin) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <StackedColumns
                  categories={trendCats}
                  series={SERIES[mode]}
                  values={trendValues}
                  avgLine={stats.length > 1 ? avg : null}
                  avgLabel="3-session avg"
                  selectedIndex={selectedIndex}
                  onSelect={(i) => selectSession(stats[i].session.id, true)}
                  ariaLabel="Errors per session over time"
                />
              )}
            </div>

            {/* within-session timeline */}
            <div className="card scroll-target" ref={sessionCardRef}>
              <div className="section-title">Session timeline</div>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="sr-only">Session</span>
                <select className="input" value={selected?.session.id ?? ''} onChange={(e) => selectSession(e.target.value)}>
                  {newestFirst.map((s) => (
                    <option key={s.session.id} value={s.session.id}>
                      {sessionLabel(s.session)} · {formatDate(s.session.date)} · {s.total} errors
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  <div className="facts">
                    <Fact label="Errors" value={selected.total} />
                    <Fact label="Duration" value={selected.durationMin ? formatMinutes(selected.durationMin) : '—'} hint="Span of the main activity; points added long after are not counted in the span" />
                    <Fact label={`Per ${bucketMin} min`} value={selected.durationMin >= 5 ? (selected.activeCount / (selected.durationMin / bucketMin)).toFixed(1) : '—'} />
                    <Fact label="Longest run" value={streak && streak.length > 1 ? `${streak.length} ${STROKE_SHORT[streak.key as 'fh' | 'bh'] ?? streak.key} in a row` : '—'} />
                    <Fact label="Thirds" value={selected.total ? `${th.first} · ${th.middle} · ${th.last}` : '—'} hint="first · middle · last third of the session" />
                    <div className="fact-link">
                      <Link to={`/session/${selected.session.id}`}>Open session →</Link>
                    </div>
                  </div>
                  <div className="section-title">Point by point</div>
                  <SequenceStrip items={seq} />
                  <div className="legend-row" style={{ marginTop: 6 }}>
                    <MarkLegend />
                    <span className="legend-item muted">“12m” = quiet gap</span>
                  </div>
                  {selected.total > 0 && (
                    <>
                      <div className="section-title">When in the session</div>
                      <StackedColumns
                        categories={bucketCats}
                        series={SERIES[mode]}
                        values={bucketValues}
                        height={120}
                        resetKey={selected.session.id}
                        ariaLabel={`Errors per ${bucketMin} minutes of the session`}
                        emptyText="No timing data."
                      />
                      <div className="kbd-hint">
                        Minutes since the first error, in {bucketMin}-minute buckets.
                        {lateCount > 0 && ` ${lateCount} ${lateCount === 1 ? 'point' : 'points'} logged well after the session (e.g. added later) ${lateCount === 1 ? 'is' : 'are'} not shown here.`}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* breakdowns */}
            <div className="dash-grid">
              <div className="card">
                <div className="section-title">Error mix by stroke</div>
                <ShareBars series={SERIES.error} rows={strokeRows(() => SERIES.error, (s, key) => summary.matrix[s][key as 'long' | 'net' | 'wide'])} />
                <div className="section-title">Forced vs unforced by stroke</div>
                <ShareBars
                  series={SERIES.forced}
                  rows={strokeRows(
                    () => SERIES.forced,
                    (s, key) => (key === 'forced' ? summary.byStrokeForced[s] : summary.byStroke[s] - summary.byStrokeForced[s]),
                  )}
                />
              </div>

              <div className="card">
                <div className="section-title">Match vs practice</div>
                <div className="table-wrap">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th />
                        <th>Matches</th>
                        <th>Practice</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Sessions with errors</td>
                        <td>{matchK.sessions}</td>
                        <td>{practiceK.sessions}</td>
                      </tr>
                      <tr>
                        <td>Errors</td>
                        <td>{matchK.errors}</td>
                        <td>{practiceK.errors}</td>
                      </tr>
                      <tr>
                        <td>Errors / session</td>
                        <td>{matchK.sessions ? matchK.perSession.toFixed(1) : '—'}</td>
                        <td>{practiceK.sessions ? practiceK.perSession.toFixed(1) : '—'}</td>
                      </tr>
                      <tr>
                        <td>Forehand share</td>
                        <td>{matchK.errors ? `${matchK.fhPct}%` : '—'}</td>
                        <td>{practiceK.errors ? `${practiceK.fhPct}%` : '—'}</td>
                      </tr>
                      <tr>
                        <td>Forced share</td>
                        <td>{matchK.errors ? `${matchK.forcedPct}%` : '—'}</td>
                        <td>{practiceK.errors ? `${practiceK.forcedPct}%` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="section-title">Where on the court</div>
                <div className="stats-court" style={{ maxWidth: 360 }}>
                  <Court heat={summary.byZone} heatTotal={summary.total} showZones />
                </div>
                <div className="kbd-hint" style={{ textAlign: 'center', marginTop: 4 }}>
                  Errors per zone · open a session and tap <strong>Stats</strong> to see every point
                </div>
                {zonesSorted.length > 0 && (
                  <ol className="zone-list">
                    {zonesSorted.slice(0, 3).map(([zid, n], i) => (
                      <li key={zid}>
                        <span className="rank">{i + 1}.</span>
                        <span className="grow">{describeZone(zoneFromId(zid))}</span>
                        <strong>{n}</strong>
                        <span className="muted"> · {pct(n, summary.total)}%</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* activity timeline */}
            <div className="card">
              <div className="section-title">Timeline</div>
              <ol className="timeline">
                {newestFirst.map((s) => {
                  const items = timelineItems.get(s.session.id) ?? []
                  const isSel = selected?.session.id === s.session.id
                  return (
                    <li key={s.session.id} className={`tl-item${isSel ? ' sel' : ''}`}>
                      <div className="tl-date">
                        <span className="tl-day">{shortDate(s.session.date)}</span>
                        <span className="tl-wd">{weekday(s.session.date)}</span>
                      </div>
                      <div className="tl-body">
                        <div className="row wrap" style={{ gap: 6 }}>
                          <Link to={`/session/${s.session.id}`} className="tl-title">
                            {sessionLabel(s.session)}
                          </Link>
                          <span className="pill unforced">{KIND_LABEL[s.session.kind]}</span>
                          {s.durationMin > 0 && <span className="muted">· {formatMinutes(s.durationMin)}</span>}
                        </div>
                        <div className="tl-stats">
                          <strong>{s.total}</strong> {s.total === 1 ? 'error' : 'errors'}
                          {s.total > 0 && (
                            <span className="muted">
                              {' '}
                              · FH {s.fh} · BH {s.bh} · long {s.long} · net {s.net} · wide {s.wide}
                              {s.forced ? ` · forced ${s.forced}` : ''}
                            </span>
                          )}
                        </div>
                        {items.length > 0 && <SequenceStrip items={items.slice(0, 40)} />}
                        {items.length > 40 && <div className="kbd-hint">+{items.length - 40} more</div>}
                        {s.session.notes && <div className="tl-notes">{s.session.notes}</div>}
                        <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => selectSession(s.session.id, true)}>
                          Analyze this session
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

function Kpi({ label, value, sub, spark }: { label: string; value: ReactNode; sub?: ReactNode; spark?: number[] }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-row">
        <div className="kpi-value">{value}</div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function Fact({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="fact" title={hint}>
      <span className="fact-label">{label}</span>
      <span className="fact-value">{value}</span>
    </div>
  )
}
