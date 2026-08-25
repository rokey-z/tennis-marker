import type { CSSProperties } from 'react'
import { filterPoints, pct, type Filters, type Summary } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, PLACEMENT_STROKES, POINT_SHOT_TYPES, SHOT_TYPES, SHOT_TYPE_LABEL, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type PlacementStroke, type Point } from '../domain/types'
import { Chip } from './Bits'
import { DownloadIcon } from './Icons'

export interface StatsFilterState {
  stroke: PlacementStroke | 'all'
  error: ErrorType | 'all'
  shotType: NonNullable<Filters['shotType']>
  forced: NonNullable<Filters['forced']>
}

/** Stroke / error / forced chip row that scopes the heat court and the panel below it. */
export function StatsFilters({ value, points, onChange }: { value: StatsFilterState; points: Point[]; onChange: (v: StatsFilterState) => void }) {
  const set = (patch: Partial<StatsFilterState>) => onChange({ ...value, ...patch })
  const count = (patch: Partial<StatsFilterState>) => filterPoints(points, { ...value, ...patch }).length
  const label = (text: string, n: number) => <>{text}<span className="stats-filter-count">{n}</span></>
  const forcedCounts = {
    all: count({ forced: 'all' }),
    unforced: count({ forced: 'unforced' }),
    forced: count({ forced: 'forced' }),
  }
  const strokeCounts = Object.fromEntries(['all', ...PLACEMENT_STROKES].map((stroke) => [stroke, count({ stroke: stroke as StatsFilterState['stroke'] })])) as Record<StatsFilterState['stroke'], number>
  const errorCounts = Object.fromEntries(['all', ...ERROR_TYPES].map((error) => [error, count({ error: error as StatsFilterState['error'] })])) as Record<StatsFilterState['error'], number>
  const shotTypeCounts = Object.fromEntries(['all', ...POINT_SHOT_TYPES].map((shotType) => [shotType, count({ shotType: shotType as StatsFilterState['shotType'] })])) as Record<StatsFilterState['shotType'], number>
  return (
    <div className="stats-filters" role="group" aria-label="Filters">
      <div className="stats-filters-track">
        <div className="stats-filters-row">
          {forcedCounts.all > 0 && <div className="chip-group" role="group" aria-label="Forced">
            {forcedCounts.all > 0 && <Chip on={value.forced === 'all'} onClick={() => set({ forced: 'all' })}>{label('All', forcedCounts.all)}</Chip>}
            {forcedCounts.unforced > 0 && <Chip on={value.forced === 'unforced'} onClick={() => set({ forced: 'unforced' })}>{label('Unforced', forcedCounts.unforced)}</Chip>}
            {forcedCounts.forced > 0 && <Chip on={value.forced === 'forced'} onClick={() => set({ forced: 'forced' })}>{label('Forced', forcedCounts.forced)}</Chip>}
          </div>}
          {strokeCounts.all > 0 && <div className="chip-group" role="group" aria-label="Stroke">
            {strokeCounts.all > 0 && <Chip on={value.stroke === 'all'} onClick={() => set({ stroke: 'all' })}>{label('All strokes', strokeCounts.all)}</Chip>}
            {PLACEMENT_STROKES.map((s) => (
              strokeCounts[s] > 0 && <Chip key={s} on={value.stroke === s} cls={s} onClick={() => set({ stroke: s })}>{label(STROKE_SHORT[s], strokeCounts[s])}</Chip>
            ))}
          </div>}
          {errorCounts.all > 0 && <div className="chip-group" role="group" aria-label="Error type">
            {errorCounts.all > 0 && <Chip on={value.error === 'all'} onClick={() => set({ error: 'all' })}>{label('All errors', errorCounts.all)}</Chip>}
            {ERROR_TYPES.map((e) => (
              errorCounts[e] > 0 && <Chip key={e} on={value.error === e} onClick={() => set({ error: e })}>{label(ERROR_LABEL[e], errorCounts[e])}</Chip>
            ))}
          </div>}
        </div>
        <div className="stats-filters-row">
          {shotTypeCounts.all > 0 && <div className="chip-group" role="group" aria-label="Ball type">
            {shotTypeCounts.all > 0 && <Chip on={value.shotType === 'all'} onClick={() => set({ shotType: 'all' })}>{label('All types', shotTypeCounts.all)}</Chip>}
            {POINT_SHOT_TYPES.map((type) => (
              shotTypeCounts[type] > 0 && <Chip key={type} on={value.shotType === type} onClick={() => set({ shotType: type })}>{label(SHOT_TYPE_LABEL[type], shotTypeCounts[type])}</Chip>
            ))}
          </div>}
        </div>
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
    const placementStrokes = ['fh', 'bh'] as const
    const resultTotal = (result: 'in' | 'net' | 'wide' | 'long') => placementStrokes.reduce((n, stroke) => n + summary.placementMatrix[stroke][result], 0)
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
    return (
      <div className="stack stats-panel">
        <div className="card placement-overview">
          <div className="placement-overview-head">
            <div>
              <div className="section-title">Placement results</div>
              <p>Serves are tracked separately from court placement.</p>
            </div>
            <div className="placement-total">
              <div className="label">Balls placed</div>
              <div className="value">{summary.placements}</div>
            </div>
          </div>
          <div className="placement-outcomes">
            <div className="placement-outcome in">
              <div className="label">In</div>
              <div className="value">
                {pct(inCourt, scoredLandings)}%
                <small>{inCourt} {inCourt === 1 ? 'ball' : 'balls'}</small>
              </div>
            </div>
            <div className="placement-outcome out">
              <div className="label">Out</div>
              <div className="value">
                {pct(errors, scoredLandings)}%
                <small>{errors} {errors === 1 ? 'ball' : 'balls'}</small>
              </div>
            </div>
            <div className="placement-outcome serve">
              <div className="label">Serve</div>
              <div className="value">
                {summary.serveLandings + summary.serveNetMisses}
                <small>{summary.serveLandings} landed · {summary.serveNetMisses} net {summary.serveNetMisses === 1 ? 'miss' : 'misses'}</small>
              </div>
            </div>
          </div>
        </div>
        {(inCourt > 0 || errors > 0) && <div className="card placement-breakdown">
          {inCourt > 0 && <section className="placement-breakdown-group in">
            <div className="placement-breakdown-head">
              <div className="section-title">In by depth</div>
              <strong>{inCourt} · {pct(inCourt, scoredLandings)}%</strong>
            </div>
            <div className="bars">
              {inAreas.filter((area) => area.count > 0).map((area) => (
                <div className="bar-row" key={area.label}>
                  <span>{area.label}</span>
                  <div className="track">
                    <div className="fill" style={{ width: `${pct(area.count, inCourt)}%` }} />
                  </div>
                  <span className="val">{area.count} · {pct(area.count, inCourt)}%</span>
                </div>
              ))}
            </div>
          </section>}
          {errors > 0 && <section className="placement-breakdown-group out">
            <div className="placement-breakdown-head">
              <div className="section-title">Out by result</div>
              <strong>{errors} · {pct(errors, scoredLandings)}%</strong>
            </div>
            <div className="bars">
              {outAreas.filter((area) => area.count > 0).map((area) => (
                <div className="bar-row" key={area.label}>
                  <span>{area.label}</span>
                  <div className="track">
                    <div className="fill out" style={{ width: `${pct(area.count, errors)}%` }} />
                  </div>
                  <span className="val">{area.count} · {pct(area.count, errors)}%</span>
                </div>
              ))}
            </div>
          </section>}
        </div>}
        <div className="card">
          <div className="section-title">In / out by stroke</div>
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
              {placementStrokes.map((stroke) => (
                <tr key={stroke}>
                  <td><span className={`pill ${stroke}`}>{STROKE_SHORT[stroke]}</span> {STROKE_LABEL[stroke]}</td>
                  {(['in', 'net', 'wide', 'long'] as const).map((result) => (
                    <td className="big" key={result}>{result === 'net' ? summary.matrix[stroke].net + summary.placementMatrix[stroke].net : summary.placementMatrix[stroke][result]}</td>
                  ))}
                  <td className="big">{summary.placementsByStroke[stroke] + summary.matrix[stroke].net}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.serveLandings + summary.serveNetMisses > 0 && <p className="kbd-hint">{summary.serveLandings} landed · {summary.serveNetMisses} net {summary.serveNetMisses === 1 ? 'miss' : 'misses'}. Serves are excluded from every placement and in/out total.</p>}
        </div>
        {exportRow}
      </div>
    )
  }
  const errorTypeParts = [
    { key: 'long', label: 'Long', count: summary.byError.long, color: 'var(--err-long)' },
    { key: 'net', label: 'Net', count: summary.byError.net, color: 'var(--err-net)' },
    { key: 'wide', label: 'Wide', count: summary.byError.wide, color: 'var(--err-wide)' },
    { key: 'double-fault', label: 'Double faults', count: summary.doubleFaults, color: 'var(--err-double-fault)' },
    { key: 'winners', label: 'Winners', count: summary.winners, color: 'var(--win)' },
  ]
  const ballTypeItems: Array<{ key: string; label: string; count: number; fh: number; bh: number; muted?: boolean }> = SHOT_TYPES
    .map((type) => ({ key: type, label: SHOT_TYPE_LABEL[type], count: summary.byShotType[type], ...summary.byShotTypeStroke[type] }))
    .filter((item) => item.count > 0)
  if (summary.untypedErrors > 0) {
    ballTypeItems.push({ key: 'untyped', label: 'Not selected', count: summary.untypedErrors, ...summary.untypedErrorsByStroke, muted: true })
  }
  ballTypeItems.sort((a, b) => b.count - a.count)
  const winnerBallTypes = POINT_SHOT_TYPES
    .map((type) => ({ key: type, label: SHOT_TYPE_LABEL[type], count: summary.playerWinnersByShotType[type] }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
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
                style={{ flexGrow: part.count, background: part.color }}
              />
            ))}
          </div>
          <div className="error-types-values">
            {errorTypeParts.map((part) => part.count > 0 && (
              <div key={part.key} className="error-types-value" style={{ '--part-color': part.color, flexGrow: part.count } as CSSProperties}>
                <span>{part.label}</span>
                <strong>{part.count} · {pct(part.count, summary.lost)}%</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="section-title">Error ball types</div>
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
                    <small className="ball-type-count">{item.count}</small>
                  </div>
                </div>
                <span>{item.label}</span>
                <div className="ball-type-strokes">
                  <span className="fh">FH {item.fh}</span>
                  <span className="bh">BH {item.bh}</span>
                </div>
              </div>
            )
          })}
          {ballTypeItems.length === 0 && <p className="muted">No ball types tagged.</p>}
        </div>
        {summary.playerWinners > 0 && (
          <>
            <div className="section-title">Winner ball types · {summary.playerWinners}</div>
            <div className="winner-type-pills">
              {winnerBallTypes.map((item) => (
                <div className="winner-type-pill" key={item.key}>
                  <strong>{pct(item.count, summary.playerWinners)}%</strong>
                  <span>{item.label}</span>
                  <small>{item.count}</small>
                </div>
              ))}
            </div>
          </>
        )}
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
      <p className="kbd-hint">Counts, not rates.</p>
    </div>
  )
}
