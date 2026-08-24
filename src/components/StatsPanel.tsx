import { pct, type Filters, type Summary } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, PLACEMENT_STROKES, SHOT_TYPES, SHOT_TYPE_LABEL, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type PlacementResult, type Stroke } from '../domain/types'
import { Chip } from './Bits'
import { DownloadIcon } from './Icons'

export interface StatsFilterState {
  stroke: Stroke | 'all'
  error: ErrorType | 'all'
  forced: NonNullable<Filters['forced']>
}

/** Stroke / error / forced chip row that scopes the heat court and the panel below it. */
export function StatsFilters({ value, onChange }: { value: StatsFilterState; onChange: (v: StatsFilterState) => void }) {
  const set = (patch: Partial<StatsFilterState>) => onChange({ ...value, ...patch })
  return (
    <div className="stats-filters" role="group" aria-label="Filters">
      <div className="chip-group" role="group" aria-label="Stroke">
        <Chip on={value.stroke === 'all'} onClick={() => set({ stroke: 'all' })}>
          All strokes
        </Chip>
        {STROKES.map((s) => (
          <Chip key={s} on={value.stroke === s} cls={s} onClick={() => set({ stroke: s })}>
            {STROKE_SHORT[s]}
          </Chip>
        ))}
      </div>
      <div className="chip-group" role="group" aria-label="Error type">
        <Chip on={value.error === 'all'} onClick={() => set({ error: 'all' })}>
          All errors
        </Chip>
        {ERROR_TYPES.map((e) => (
          <Chip key={e} on={value.error === e} onClick={() => set({ error: e })}>
            {ERROR_LABEL[e]}
          </Chip>
        ))}
      </div>
      <div className="chip-group" role="group" aria-label="Forced">
        <Chip on={value.forced === 'all'} onClick={() => set({ forced: 'all' })}>
          All
        </Chip>
        <Chip on={value.forced === 'unforced'} onClick={() => set({ forced: 'unforced' })}>
          Unforced
        </Chip>
        <Chip on={value.forced === 'forced'} onClick={() => set({ forced: 'forced' })}>
          Forced
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
  const errorFocus = STROKES.flatMap((stroke) => ERROR_TYPES.map((error) => ({ stroke, error, count: summary.matrix[stroke][error] }))).sort((a, b) => b.count - a.count)[0]
  return (
    <div className="stack stats-panel">
      {errorFocus?.count > 0 && (
        <div className="card insight-card">
          <div className="section-title">Next focus</div>
          <strong>{STROKE_LABEL[errorFocus.stroke]} {ERROR_LABEL[errorFocus.error]}</strong>
          <span>{errorFocus.count} {errorFocus.count === 1 ? 'error' : 'errors'} in this session</span>
        </div>
      )}
      <div className="tiles">
        <div className="tile">
          <div className="label">Errors</div>
          <div className="value">
            {summary.total}
            {summary.winners > 0 && <small>{summary.winners} {summary.winners === 1 ? 'winner' : 'winners'}</small>}
          </div>
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
            <small>{pct(summary.byForced.forced, summary.lost)}%</small>
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
        <div className="section-title">Ball types · {summary.total - summary.untypedErrors} tagged</div>
        <div className="bars">
          {SHOT_TYPES.map((type) => (
            <div className="bar-row" key={type}>
              <span>{SHOT_TYPE_LABEL[type]}</span>
              <div className="track">
                <div className="fill" style={{ width: `${pct(summary.byShotType[type], summary.total)}%` }} />
              </div>
              <span className="val">
                {summary.byShotType[type]} · {pct(summary.byShotType[type], summary.total)}%
              </span>
            </div>
          ))}
          {summary.untypedErrors > 0 && (
            <div className="bar-row">
              <span>Not selected</span>
              <div className="track">
                <div className="fill untyped" style={{ width: `${pct(summary.untypedErrors, summary.total)}%` }} />
              </div>
              <span className="val">{summary.untypedErrors} · {pct(summary.untypedErrors, summary.total)}%</span>
            </div>
          )}
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
