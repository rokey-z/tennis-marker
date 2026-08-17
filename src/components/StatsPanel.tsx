import { pct, type Filters, type Summary } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type Stroke } from '../domain/types'
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
  onExportCsv: () => void
  onExportJson: () => void
}

/** KPI tiles, "where the ball went", stroke × error matrix, export — for one scope of points. */
export function StatsPanel({ summary, count, onExportCsv, onExportJson }: StatsPanelProps) {
  return (
    <div className="stack stats-panel">
      <div className="tiles">
        <div className="tile">
          <div className="label">Points lost</div>
          <div className="value">
            {summary.lost}
            {summary.winners > 0 && <small>{summary.total} her errors</small>}
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

      <div className="row wrap">
        <button type="button" className="btn" onClick={onExportCsv} disabled={count === 0}>
          <DownloadIcon /> CSV ({count})
        </button>
        <button type="button" className="btn" onClick={onExportJson}>
          <DownloadIcon /> Backup (JSON)
        </button>
      </div>
      <p className="kbd-hint">Counts, not rates — points won aren’t tracked (yet).</p>
    </div>
  )
}
