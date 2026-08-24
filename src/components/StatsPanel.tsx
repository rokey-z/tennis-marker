import type { CSSProperties } from 'react'
import { filterPoints, pct, type Filters, type Summary } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, PLACEMENT_STROKES, SHOT_TYPES, SHOT_TYPE_LABEL, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type PlacementResult, type Point, type Stroke } from '../domain/types'
import { Chip } from './Bits'
import { DownloadIcon } from './Icons'

export interface StatsFilterState {
  stroke: Stroke | 'all'
  error: ErrorType | 'all'
  forced: NonNullable<Filters['forced']>
}

/** Stroke / error / forced chip row that scopes the heat court and the panel below it. */
export function StatsFilters({ value, points, onChange }: { value: StatsFilterState; points: Point[]; onChange: (v: StatsFilterState) => void }) {
  const set = (patch: Partial<StatsFilterState>) => onChange({ ...value, ...patch })
  const count = (patch: Partial<StatsFilterState>) => filterPoints(points, { ...value, ...patch }).length
  const label = (text: string, n: number) => <>{text}<span className="stats-filter-count">{n}</span></>
  return (
    <div className="stats-filters" role="group" aria-label="Filters">
      <div className="chip-group" role="group" aria-label="Stroke">
        <Chip on={value.stroke === 'all'} onClick={() => set({ stroke: 'all' })}>
          {label('All strokes', count({ stroke: 'all' }))}
        </Chip>
        {STROKES.map((s) => (
          <Chip key={s} on={value.stroke === s} cls={s} onClick={() => set({ stroke: s })}>
            {label(STROKE_SHORT[s], count({ stroke: s }))}
          </Chip>
        ))}
      </div>
      <div className="chip-group" role="group" aria-label="Error type">
        <Chip on={value.error === 'all'} onClick={() => set({ error: 'all' })}>
          {label('All errors', count({ error: 'all' }))}
        </Chip>
        {ERROR_TYPES.map((e) => (
          <Chip key={e} on={value.error === e} onClick={() => set({ error: e })}>
            {label(ERROR_LABEL[e], count({ error: e }))}
          </Chip>
        ))}
      </div>
      <div className="chip-group" role="group" aria-label="Forced">
        <Chip on={value.forced === 'all'} onClick={() => set({ forced: 'all' })}>
          {label('All', count({ forced: 'all' }))}
        </Chip>
        <Chip on={value.forced === 'unforced'} onClick={() => set({ forced: 'unforced' })}>
          {label('Unforced', count({ forced: 'unforced' }))}
        </Chip>
        <Chip on={value.forced === 'forced'} onClick={() => set({ forced: 'forced' })}>
          {label('Forced', count({ forced: 'forced' }))}
        </Chip>
      </div>
    </div>
  )
}

export interface StatsPanelProps {
  summary: Summary
  /** number of points in scope (for the CSV button) */
  count: number
  /** what the scope records; placement scopes have no errors to break down */
  mode?: 'errors' | 'placement'
  onExportCsv?: () => void
  onExportJson?: () => void
  /** Public shared stats suppress every data/export action. */
  showExports?: boolean
}

/** KPI tiles, "where the ball went", stroke × error matrix, export — for one scope of points. */
export function StatsPanel({ summary, count, mode = 'errors', onExportCsv, onExportJson, showExports = true }: StatsPanelProps) {
  const exportRow = showExports && onExportCsv && onExportJson ? (
    <div className="row wrap">
      <button type="button" className="btn" onClick={onExportCsv} disabled={count === 0}>
        <DownloadIcon /> CSV ({count})
      </button>
      <button type="button" className="btn" onClick={onExportJson}>
        <DownloadIcon /> Backup (JSON)
      </button>
    </div>
  ) : null
  // a placement scope counts balls and where they landed: none of the error breakdowns apply
  if (mode === 'placement') {
    const resultTotal = (result: 'in' | 'net' | 'wide' | 'long') => PLACEMENT_STROKES.reduce((n, stroke) => n + summary.placementMatrix[stroke][result], 0)
    const inCourt = resultTotal('in')
    const net = summary.placementNet
    const wideLong = resultTotal('wide') + resultTotal('long')
    // A net strike is an error outcome too. Keep it with the other misses so the
    // headline answers the useful question: what share of attempts landed in?
    const errors = net + wideLong
    const scoredLandings = inCourt + errors
    const inDepth = (row: 'net' | 'mid' | 'baseline') =>
      Object.entries(summary.placementInZones).reduce((total, [id, count]) => total + (id.startsWith(`${row}-`) ? count : 0), 0)
    const inAreas = [
      { label: 'Short', count: inDepth('net') },
      { label: 'Mid', count: inDepth('mid') },
      { label: 'Deep', count: inDepth('baseline') },
    ]
    const outAreas = [
      { label: 'Wide', count: resultTotal('wide') },
      { label: 'Long', count: resultTotal('long') },
      { label: 'Net', count: net },
    ]
    const resultLabels: Record<PlacementResult, string> = { in: 'In', net: 'Net', wide: 'Wide', long: 'Long', unknown: 'Unrated' }
    const misses: { stroke: typeof PLACEMENT_STROKES[number]; result: Exclude<PlacementResult, 'in' | 'unknown'>; count: number }[] = []
    for (const stroke of PLACEMENT_STROKES) {
      for (const result of ['net', 'wide', 'long'] as const) {
        const count = result === 'net' ? (stroke === 'serve' ? 0 : summary.matrix[stroke].net + summary.placementMatrix[stroke].net) : summary.placementMatrix[stroke][result]
        misses.push({ stroke, result, count })
      }
    }
    const focus = misses.sort((a, b) => b.count - a.count)[0]
    return (
      <div className="stack stats-panel">
        {focus?.count > 0 && (
          <div className="card insight-card">
            <div className="section-title">Next focus</div>
            <strong>{STROKE_LABEL[focus.stroke]} {resultLabels[focus.result]}</strong>
            <span>{focus.count} {focus.count === 1 ? 'mark' : 'marks'} in this session</span>
          </div>
        )}
        <div className="tiles">
          <div className="tile">
            <div className="label">Balls placed</div>
            <div className="value">{summary.placements}</div>
          </div>
          <div className="tile">
            <div className="label">In</div>
            <div className="value">
              {pct(inCourt, scoredLandings)}%
              <small>{inCourt} {inCourt === 1 ? 'ball' : 'balls'}</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">Out</div>
            <div className="value">
              {pct(errors, scoredLandings)}%
              <small>{errors} {errors === 1 ? 'ball' : 'balls'}</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">Forehand</div>
            <div className="value">
              {summary.placementsByStroke.fh}
              <small>{pct(summary.placementsByStroke.fh, summary.placements)}%</small>
            </div>
          </div>
          <div className="tile">
            <div className="label">Serve</div>
            <div className="value">
              {summary.placementsByStroke.serve}
              <small>{pct(summary.placementsByStroke.serve, summary.placements)}%</small>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="section-title">In types · {pct(inCourt, scoredLandings)}% overall</div>
          <div className="bars">
            {inAreas.map((area) => (
              <div className="bar-row" key={area.label}>
                <span>{area.label}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${pct(area.count, inCourt)}%` }} />
                </div>
                <span className="val">{area.count} · {pct(area.count, inCourt)}%</span>
              </div>
            ))}
          </div>
          <div className="section-title">Out types · {pct(errors, scoredLandings)}% overall</div>
          <div className="bars">
            {outAreas.map((area) => (
              <div className="bar-row" key={area.label}>
                <span>{area.label}</span>
                <div className="track">
                  <div className="fill out" style={{ width: `${pct(area.count, errors)}%` }} />
                </div>
                <span className="val">{area.count} · {pct(area.count, errors)}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-title">In / out by placement type</div>
          <table className="matrix">
            <thead>
              <tr>
                <th rowSpan={2} />
                <th colSpan={1} scope="colgroup">In court</th>
                <th colSpan={3} scope="colgroup">Out / errors</th>
                <th rowSpan={2}>Total</th>
              </tr>
              <tr><th>In</th><th>Net</th><th>Wide</th><th>Long</th></tr>
            </thead>
            <tbody>
              {PLACEMENT_STROKES.map((stroke) => (
                <tr key={stroke}>
                  <td><span className={`pill ${stroke}`}>{STROKE_SHORT[stroke]}</span> {STROKE_LABEL[stroke]}</td>
                  {(['in', 'net', 'wide', 'long'] as const).map((result) => (
                    <td className="big" key={result}>{result === 'net' ? (stroke === 'serve' ? 0 : summary.matrix[stroke].net + summary.placementMatrix[stroke].net) : summary.placementMatrix[stroke][result]}</td>
                  ))}
                  <td className="big">{summary.placementsByStroke[stroke] + (stroke === 'serve' ? 0 : summary.matrix[stroke].net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.serveLandings > 0 && <p className="kbd-hint">Serve landings are shown as recorded; they are not rated in or out.</p>}
        </div>
        {exportRow}
      </div>
    )
  }
  const errorTypeParts = [
    { key: 'long', label: 'Long', count: summary.byError.long, color: 'var(--err-long)' },
    { key: 'net', label: 'Net', count: summary.byError.net, color: 'var(--err-net)' },
    { key: 'wide', label: 'Wide', count: summary.byError.wide, color: 'var(--err-wide)' },
    { key: 'winners', label: 'Winners', count: summary.winners, color: 'var(--win)' },
  ]
  const ballTypeItems: Array<{ key: string; label: string; count: number; muted?: boolean }> = SHOT_TYPES
    .map((type) => ({ key: type, label: SHOT_TYPE_LABEL[type], count: summary.byShotType[type] }))
    .filter((item) => item.count > 0)
  if (summary.untypedErrors > 0) ballTypeItems.push({ key: 'untyped', label: 'Not selected', count: summary.untypedErrors, muted: true })
  ballTypeItems.sort((a, b) => b.count - a.count)
  return (
    <div className="stack stats-panel">
      <div className="card">
        <div className="section-title">Error types</div>
        <div className="error-types-summary">
          <div
            className="error-types-track"
            role="img"
            aria-label={errorTypeParts.map((part) => `${part.label} ${part.count}, ${pct(part.count, summary.lost)}%`).join('; ')}
          >
            {errorTypeParts.map((part) => part.count > 0 && (
              <span
                key={part.key}
                className={`error-types-segment ${part.key}`}
                style={{ width: `${pct(part.count, summary.lost)}%`, background: part.color }}
              />
            ))}
          </div>
          <div className="error-types-values">
            {errorTypeParts.map((part) => (
              <div key={part.key} className="error-types-value" style={{ '--part-color': part.color } as CSSProperties}>
                <span>{part.label}</span>
                <strong>{part.count} · {pct(part.count, summary.lost)}%</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="section-title">Ball types · {summary.total - summary.untypedErrors} tagged</div>
        <div className="ball-type-bubbles">
          {ballTypeItems.map((item) => {
            const percentage = pct(item.count, summary.total)
            // The visible area above a 40px legibility floor tracks the value, up to 112px at 100%.
            const size = Math.round(Math.sqrt(40 ** 2 + (112 ** 2 - 40 ** 2) * percentage / 100))
            return (
              <div className="ball-type-item" key={item.key}>
                <div className="ball-type-stage">
                  <div
                    className={`ball-type-bubble${item.muted ? ' untyped' : ''}`}
                    style={{ '--bubble-size': `${size}px` } as CSSProperties}
                    role="img"
                    aria-label={`${item.label}: ${item.count} ${item.count === 1 ? 'error' : 'errors'}, ${percentage}%`}
                  >
                    <strong>{percentage}%</strong>
                    <small>{item.count} {item.count === 1 ? 'error' : 'errors'}</small>
                  </div>
                </div>
                <span>{item.label}</span>
              </div>
            )
          })}
          {ballTypeItems.length === 0 && <p className="muted">No ball types tagged.</p>}
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

      {exportRow}
      <p className="kbd-hint">Counts, not rates — points won aren’t tracked (yet).</p>
    </div>
  )
}
