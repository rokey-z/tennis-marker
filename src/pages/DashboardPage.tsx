import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Delta, SequenceStrip, ShareBars, Sparkline, StackedColumns, type Category, type Series } from '../components/charts'
import { CHART } from '../components/chartUtils'
import { Court } from '../components/Court'
import { Shell } from '../components/Shell'
import { useAppState } from '../data/app'
import { liveSessions } from '../data/store'
import {
  RANGES,
  buildInsights,
  elapsedBuckets,
  filterSessions,
  longestStreak,
  movingAverage,
  recentTrend,
  sequence,
  sessionStats,
  summarizeKind,
  thirds,
  type Bucket,
  type Range,
  type SessionStat,
} from '../domain/analytics'
import { describeZone, zoneFromId } from '../domain/court'
import { pct, summarize } from '../domain/stats'
import { STROKE_LABEL, STROKE_SHORT, type SessionKind } from '../domain/types'
import { formatDate } from '../lib/format'

type StackMode = 'total' | 'stroke' | 'error' | 'forced'

const SERIES: Record<StackMode, Series[]> = {
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

function valuesFor(mode: StackMode, r: { total: number; fh: number; bh: number; long: number; net: number; wide: number; forced: number; unforced: number }): number[] {
  switch (mode) {
    case 'total':
      return [r.total]
    case 'stroke':
      return [r.fh, r.bh]
    case 'error':
      return [r.long, r.net, r.wide]
    case 'forced':
      return [r.unforced, r.forced]
  }
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtMin(min: number): string {
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export function DashboardPage() {
  const state = useAppState()
  const [range, setRange] = useState<Range>('all')
  const [kind, setKind] = useState<SessionKind | 'all'>('all')
  const [mode, setMode] = useState<StackMode>('stroke')
  const [showTable, setShowTable] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const sessionCardRef = useRef<HTMLDivElement>(null)

  const sessions = useMemo(() => filterSessions(liveSessions(state), range, kind, new Date()), [state, range, kind])
  const stats = useMemo(() => sessionStats(sessions, Object.values(state.points)), [sessions, state])
  const allPoints = useMemo(() => stats.flatMap((s) => s.points), [stats])
  const summary = useMemo(() => summarize(allPoints), [allPoints])
  const insights = useMemo(() => buildInsights(stats, summary), [stats, summary])
  const withPoints = useMemo(() => stats.filter((s) => s.total > 0), [stats])
  const trend = useMemo(() => recentTrend(stats), [stats])
  const perSession = withPoints.length ? summary.total / withPoints.length : 0
  const totalsSeries = withPoints.slice(-12).map((s) => s.total)

  const selected: SessionStat | null = useMemo(() => stats.find((s) => s.session.id === selId) ?? withPoints.at(-1) ?? stats.at(-1) ?? null, [stats, withPoints, selId])

  useEffect(() => {
    // keep the selection valid when filters change
    if (selId && !stats.some((s) => s.session.id === selId)) setSelId(null)
  }, [stats, selId])

  // ----- trend chart data -----
  const trendCats: Category[] = stats.map((s) => ({
    key: s.session.id,
    label: shortDate(s.session.date),
    title: s.session.title,
    subtitle: `${formatDate(s.session.date)} · ${s.session.kind === 'match' ? 'Match' : 'Practice'}${s.durationMin ? ` · ${fmtMin(s.durationMin)}` : ''}`,
  }))
  const trendValues = stats.map((s) => valuesFor(mode, s))
  const avg = movingAverage(
    stats.map((s) => s.total),
    3,
  )
  const selectedIndex = selected ? stats.findIndex((s) => s.session.id === selected.session.id) : null

  // ----- selected session timeline -----
  const seq = useMemo(() => (selected ? sequence(selected.points) : []), [selected])
  const buckets: Bucket[] = useMemo(() => (selected ? elapsedBuckets(selected.points, 10) : []), [selected])
  const th = useMemo(() => (selected ? thirds(selected.points) : { first: 0, middle: 0, last: 0 }), [selected])
  const streak = useMemo(() => (selected ? longestStreak(selected.points, (p) => p.stroke) : null), [selected])
  const bucketCats: Category[] = buckets.map((b) => ({ key: b.label, label: `${b.start}′`, title: `${b.label} min`, subtitle: 'since the first error' }))
  const bucketValues = buckets.map((b) => valuesFor(mode, b))

  // ----- breakdowns -----
  const matchK = summarizeKind(stats, 'match')
  const practiceK = summarizeKind(stats, 'practice')
  const zonesSorted = Object.entries(summary.byZone).sort((a, b) => b[1] - a[1])

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
              <button key={r.key} type="button" className={`chip${range === r.key ? ' on' : ''}`} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="chip-group" role="group" aria-label="Session type">
            {(['all', 'match', 'practice'] as const).map((k) => (
              <button key={k} type="button" className={`chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'all' ? 'All types' : k === 'match' ? 'Matches' : 'Practice'}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="kbd-hint">Stack by</span>
            <div className="segmented small" role="radiogroup" aria-label="Stack by">
              {(
                [
                  ['total', 'Total'],
                  ['stroke', 'Stroke'],
                  ['error', 'Error type'],
                  ['forced', 'Forced'],
                ] as Array<[StackMode, string]>
              ).map(([m, label]) => (
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
              <Kpi label="Errors" value={summary.total} sub={`${summary.byForced.unforced} unforced · ${summary.byForced.forced} forced`} spark={totalsSeries} />
              <Kpi
                label="Errors per session"
                value={perSession ? perSession.toFixed(1) : '—'}
                sub={<Delta pct={trend ? trend.changePct : null} label="vs previous" upIsGood={false} />}
                spark={totalsSeries}
              />
              <Kpi label="Forehand share" value={`${pct(summary.byStroke.fh, summary.total)}%`} sub={`${summary.byStroke.fh} errors`} spark={withPoints.slice(-12).map((s) => s.fh)} />
              <Kpi label="Backhand share" value={`${pct(summary.byStroke.bh, summary.total)}%`} sub={`${summary.byStroke.bh} errors`} spark={withPoints.slice(-12).map((s) => s.bh)} />
              <Kpi label="Forced share" value={`${pct(summary.byForced.forced, summary.total)}%`} sub={`${summary.byForced.forced} of ${summary.total}`} spark={withPoints.slice(-12).map((s) => s.forced)} />
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
                  <table className="data-table">
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
                      {[...stats].reverse().map((s) => (
                        <tr key={s.session.id} className={selected?.session.id === s.session.id ? 'sel' : ''} onClick={() => selectSession(s.session.id)}>
                          <td>{formatDate(s.session.date)}</td>
                          <td>
                            {s.session.title} <span className="muted">· {s.session.kind}</span>
                          </td>
                          <td>{s.total}</td>
                          <td>{s.fh}</td>
                          <td>{s.bh}</td>
                          <td>{s.long}</td>
                          <td>{s.net}</td>
                          <td>{s.wide}</td>
                          <td>{s.forced}</td>
                          <td>{s.durationMin ? fmtMin(s.durationMin) : '—'}</td>
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
            <div className="card" ref={sessionCardRef}>
              <div className="section-title">Session timeline</div>
              <label className="field" style={{ marginBottom: 10 }}>
                <span className="sr-only">Session</span>
                <select className="input" value={selected?.session.id ?? ''} onChange={(e) => selectSession(e.target.value)}>
                  {[...stats].reverse().map((s) => (
                    <option key={s.session.id} value={s.session.id}>
                      {s.session.title} · {formatDate(s.session.date)} · {s.total} errors
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  <div className="facts">
                    <Fact label="Errors" value={selected.total} />
                    <Fact label="Duration" value={selected.durationMin ? fmtMin(selected.durationMin) : '—'} />
                    <Fact label="Per 10 min" value={selected.durationMin >= 5 ? (selected.total / (selected.durationMin / 10)).toFixed(1) : '—'} />
                    <Fact label="Longest run" value={streak && streak.length > 1 ? `${streak.length} ${STROKE_SHORT[streak.key as 'fh' | 'bh']} in a row` : '—'} />
                    <Fact label="Thirds" value={selected.total ? `${th.first} · ${th.middle} · ${th.last}` : '—'} hint="first · middle · last third of the session" />
                    <div className="fact-link">
                      <Link to={`/session/${selected.session.id}`}>Open session →</Link>
                    </div>
                  </div>
                  <div className="section-title">Point by point</div>
                  <SequenceStrip items={seq} />
                  <div className="legend-row" style={{ marginTop: 6 }}>
                    <span className="legend-item">
                      <span className="sw" style={{ background: 'var(--fh)' }} />
                      FH
                    </span>
                    <span className="legend-item">
                      <span className="sw" style={{ background: 'var(--bh)' }} />
                      BH
                    </span>
                    <span className="legend-item muted">hollow = forced · L/N/W = long/net/wide · “12m” = quiet gap</span>
                  </div>
                  {selected.total > 0 && (
                    <>
                      <div className="section-title">When in the session</div>
                      <StackedColumns categories={bucketCats} series={SERIES[mode]} values={bucketValues} height={120} ariaLabel="Errors per 10 minutes of the session" emptyText="No timing data." />
                      <div className="kbd-hint">Minutes since the first error, in 10-minute buckets.</div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* breakdowns */}
            <div className="dash-grid">
              <div className="card">
                <div className="section-title">Error mix by stroke</div>
                <ShareBars
                  series={SERIES.error}
                  rows={(['fh', 'bh'] as const).map((s) => ({
                    label: STROKE_LABEL[s],
                    total: summary.byStroke[s],
                    parts: SERIES.error.map((se) => ({ key: se.key, label: se.label, color: se.color, value: summary.matrix[s][se.key as 'long' | 'net' | 'wide'] })),
                  }))}
                />
                <div className="section-title">Forced vs unforced by stroke</div>
                <ShareBars
                  series={SERIES.forced}
                  rows={(['fh', 'bh'] as const).map((s) => {
                    const forced = allPoints.filter((p) => p.stroke === s && p.forced).length
                    const total = summary.byStroke[s]
                    return {
                      label: STROKE_LABEL[s],
                      total,
                      parts: [
                        { key: 'unforced', label: 'Unforced', color: CHART.unforced, value: total - forced },
                        { key: 'forced', label: 'Forced', color: CHART.forced, value: forced },
                      ],
                    }
                  })}
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
                        <td>Sessions</td>
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
                  Errors per zone · <Link to="/stats">see every point on the Stats page</Link>
                </div>
                {zonesSorted.length > 0 && (
                  <ol className="zone-list">
                    {zonesSorted.slice(0, 3).map(([zid, n]) => (
                      <li key={zid}>
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
                {[...stats].reverse().map((s) => {
                  const items = sequence(s.points)
                  const isSel = selected?.session.id === s.session.id
                  return (
                    <li key={s.session.id} className={`tl-item${isSel ? ' sel' : ''}`}>
                      <div className="tl-date">
                        <span className="tl-day">{shortDate(s.session.date)}</span>
                        <span className="tl-wd">{new Date(s.session.date + 'T00:00').toLocaleDateString([], { weekday: 'short' })}</span>
                      </div>
                      <div className="tl-body">
                        <div className="row wrap" style={{ gap: 6 }}>
                          <Link to={`/session/${s.session.id}`} className="tl-title">
                            {s.session.title}
                          </Link>
                          <span className="pill unforced">{s.session.kind}</span>
                          {s.durationMin > 0 && <span className="muted">· {fmtMin(s.durationMin)}</span>}
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
                        {items.length > 0 && <SequenceStrip items={items.slice(0, 40)} onSelect={() => selectSession(s.session.id, true)} />}
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
