import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Chip } from '../components/Bits'
import { downloadText, formatDate } from '../lib/format'
import { Court } from '../components/Court'
import { DownloadIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { useAppState } from '../data/app'
import { allLivePoints, liveSessions } from '../data/store'
import { pointsToCsv, safeFilename, toExportBundle } from '../domain/export'
import { filterPoints, pct, perSessionCounts, summarize, type Filters } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type Stroke } from '../domain/types'

export function StatsPage() {
  const state = useAppState()
  const [params, setParams] = useSearchParams()
  const sessions = useMemo(() => liveSessions(state), [state])
  const sessionId = params.get('session') && state.sessions[params.get('session')!] ? params.get('session')! : 'all'
  const [stroke, setStroke] = useState<Stroke | 'all'>('all')
  const [error, setError] = useState<ErrorType | 'all'>('all')
  const [forced, setForced] = useState<Filters['forced']>('all')

  const base = useMemo(() => allLivePoints(state), [state])
  const points = useMemo(() => filterPoints(base, { sessionId, stroke, error, forced }), [base, sessionId, stroke, error, forced])
  const summary = useMemo(() => summarize(points), [points])
  const trend = useMemo(() => perSessionCounts(sessions, filterPoints(base, { stroke, error, forced })), [sessions, base, stroke, error, forced])

  const setSession = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'all') next.delete('session')
    else next.set('session', id)
    setParams(next, { replace: true })
  }

  const scopeTitle = sessionId === 'all' ? 'All sessions' : state.sessions[sessionId].title

  const exportCsv = () => {
    downloadText(safeFilename(`tennis-${scopeTitle}`, 'csv'), pointsToCsv(points, state.sessions), 'text/csv;charset=utf-8')
  }
  const exportJson = () => {
    const bundle = toExportBundle(Object.values(state.sessions), Object.values(state.points))
    downloadText(safeFilename('tennis-marker-backup', 'json'), JSON.stringify(bundle, null, 2), 'application/json')
  }

  return (
    <Shell title="Stats">
      <div className="stack">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Scope</span>
          <select className="input" value={sessionId} onChange={(e) => setSession(e.target.value)}>
            <option value="all">All sessions ({sessions.length})</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {formatDate(s.date)}
              </option>
            ))}
          </select>
        </label>

        <div className="row wrap">
          <div className="chip-group" role="group" aria-label="Stroke">
            <Chip on={stroke === 'all'} onClick={() => setStroke('all')}>
              All strokes
            </Chip>
            {STROKES.map((s) => (
              <Chip key={s} on={stroke === s} cls={s} onClick={() => setStroke(s)}>
                {STROKE_SHORT[s]}
              </Chip>
            ))}
          </div>
          <div className="chip-group" role="group" aria-label="Error type">
            <Chip on={error === 'all'} onClick={() => setError('all')}>
              All errors
            </Chip>
            {ERROR_TYPES.map((e) => (
              <Chip key={e} on={error === e} onClick={() => setError(e)}>
                {ERROR_LABEL[e]}
              </Chip>
            ))}
          </div>
          <div className="chip-group" role="group" aria-label="Forced">
            <Chip on={forced === 'all'} onClick={() => setForced('all')}>
              All
            </Chip>
            <Chip on={forced === 'unforced'} onClick={() => setForced('unforced')}>
              Unforced
            </Chip>
            <Chip on={forced === 'forced'} onClick={() => setForced('forced')}>
              Forced
            </Chip>
          </div>
        </div>

        <div className="stats-grid">
          <div>
            <div className="stats-court">
              <Court points={points} heat={summary.byZone} heatTotal={summary.total} showZones />
              <div className="legend">
                <span>
                  <span className="sw" style={{ background: 'var(--fh)' }} />
                  FH
                </span>
                <span>
                  <span className="sw" style={{ background: 'var(--bh)' }} />
                  BH
                </span>
                <span>solid = unforced · hollow = forced · L/N/W = long/net/wide</span>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="tiles">
              <div className="tile">
                <div className="label">Errors</div>
                <div className="value">{summary.total}</div>
              </div>
              <div className="tile">
                <div className="label">Forehand</div>
                <div className="value">
                  {summary.byStroke.fh}
                  <small>{pct(summary.byStroke.fh, summary.total)}%</small>
                </div>
              </div>
              <div className="tile">
                <div className="label">Backhand</div>
                <div className="value">
                  {summary.byStroke.bh}
                  <small>{pct(summary.byStroke.bh, summary.total)}%</small>
                </div>
              </div>
              <div className="tile">
                <div className="label">Forced</div>
                <div className="value">
                  {summary.byForced.forced}
                  <small>{pct(summary.byForced.forced, summary.total)}%</small>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="section-title">Where the ball went</div>
              <div className="bars">
                {ERROR_TYPES.map((e) => (
                  <div className="bar-row" key={e}>
                    <span>{ERROR_LABEL[e]}</span>
                    <div className="track">
                      <div className="fill" style={{ width: `${pct(summary.byError[e], summary.total)}%` }} />
                    </div>
                    <span className="val">
                      {summary.byError[e]} · {pct(summary.byError[e], summary.total)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="section-title">Stroke × error</div>
              <table className="matrix">
                <thead>
                  <tr>
                    <th />
                    {ERROR_TYPES.map((e) => (
                      <th key={e}>{ERROR_LABEL[e]}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {STROKES.map((s) => (
                    <tr key={s}>
                      <td>
                        <span className={`pill ${s}`}>{STROKE_SHORT[s]}</span> {STROKE_LABEL[s]}
                      </td>
                      {ERROR_TYPES.map((e) => (
                        <td key={e} className="big">
                          {summary.matrix[s][e]}
                        </td>
                      ))}
                      <td className="big">{summary.byStroke[s]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sessionId === 'all' && trend.length > 0 && (
              <div className="card">
                <div className="section-title">By session</div>
                <ul className="trend">
                  {trend.map((r) => {
                    const max = Math.max(1, ...trend.map((t) => t.count))
                    return (
                      <li key={r.session.id}>
                        <div className="t">
                          {r.session.title}
                          <small>
                            {formatDate(r.session.date)} · FH {r.fh} · BH {r.bh}
                          </small>
                        </div>
                        <div className="mini">
                          <div className="split-bar" style={{ marginTop: 0 }}>
                            <span className="fh" style={{ width: `${(r.fh / max) * 100}%` }} />
                            <span className="bh" style={{ width: `${(r.bh / max) * 100}%` }} />
                          </div>
                        </div>
                        <div className="c">{r.count}</div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="row wrap">
              <button type="button" className="btn" onClick={exportCsv} disabled={points.length === 0}>
                <DownloadIcon /> CSV ({points.length})
              </button>
              <button type="button" className="btn" onClick={exportJson}>
                <DownloadIcon /> Backup (JSON)
              </button>
            </div>
            <p className="kbd-hint">Counts, not rates — points won aren’t tracked (yet).</p>
          </div>
        </div>
      </div>
    </Shell>
  )
}
