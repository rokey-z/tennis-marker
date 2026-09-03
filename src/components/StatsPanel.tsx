import { useState, type CSSProperties, type KeyboardEvent } from 'react'
import { describeZone, ZONE_COL_LABEL, ZONE_COLS, ZONE_ROW_LABEL, ZONE_ROWS, zoneFromId, type ZoneCol, type ZoneRow } from '../domain/court'
import { analyzeErrorPositions, filterPoints, pct, type Filters, type PositionCounts, type Summary } from '../domain/stats'
import { ERROR_LABEL, ERROR_TYPES, PLACEMENT_STROKES, POINT_SHOT_TYPES, SHOT_TYPES, SHOT_TYPE_LABEL, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type PlacementStroke, type Point } from '../domain/types'
import { DownloadIcon } from './Icons'
import { toggleStatsFilter } from './statsFilters'

export interface StatsFilterState {
  stroke: PlacementStroke | 'all'
  error: ErrorType | 'all'
  shotType: NonNullable<Filters['shotType']>
  forced: NonNullable<Filters['forced']>
}

interface FilterPieItem {
  key: string
  label: string
  count: number
  color: string
  selected: boolean
  onClick: () => void
}

const SHOT_TYPE_PIE_COLORS = [
  '#2878d8', '#17a673', '#8b5cf6', '#e2843d', '#d94a4a', '#d6a316',
  '#16803c', '#1e40af', '#a855f7', '#0f9d58', '#64748b', '#db2777',
]

interface FilterPieSegment {
  item: FilterPieItem
  start: number
  end: number
  side: 'left' | 'right'
}

function piePoint(angle: number, radius = 44) {
  const radians = (angle * Math.PI) / 180
  return { x: 50 + radius * Math.cos(radians), y: 50 + radius * Math.sin(radians) }
}

function pieSectorPath(start: number, end: number) {
  const startAngle = -90 + start * 3.6
  const endAngle = -90 + end * 3.6
  const first = piePoint(startAngle)
  const last = piePoint(endAngle)
  return `M 50 50 L ${first.x} ${first.y} A 44 44 0 ${end - start > 50 ? 1 : 0} 1 ${last.x} ${last.y} Z`
}

function FilterPie({ label, items, keepZero = false }: { label: string; items: FilterPieItem[]; keepZero?: boolean }) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  let cursor = 0
  const segments = items.filter((item) => item.count > 0).map<FilterPieSegment>((item) => {
    const start = cursor
    const end = cursor + (item.count / total) * 100
    const middleAngle = -90 + ((start + end) / 2) * 3.6
    cursor = end
    return { item, start, end, side: Math.cos((middleAngle * Math.PI) / 180) < 0 ? 'left' : 'right' }
  })
  const zeroItems = keepZero ? items.filter((item) => item.count === 0) : []
  const labelButton = (item: FilterPieItem, side?: 'left' | 'right') => (
    <button
      key={item.key}
      type="button"
      className={`stats-filter-orbit-label${item.selected ? ' on' : ''}${side ? ` ${side}` : ''}`}
      style={{ '--filter-color': item.color } as CSSProperties}
      aria-pressed={item.selected}
      onClick={item.onClick}
    >
      <span className="stats-filter-pie-name">{item.label}</span>
      <span className="stats-filter-count">{item.count} · {pct(item.count, total)}%</span>
    </button>
  )
  return (
    <div className="stats-filter-combined">
      <div className="stats-filter-pie-layout" role="group" aria-label={label}>
        <div className="stats-filter-orbit left">
          {segments.filter((segment) => segment.side === 'left').reverse().map((segment) => labelButton(segment.item, 'left'))}
        </div>
        <svg className="stats-filter-combined-pie" viewBox="0 0 100 100" aria-label={`${label} pie chart`}>
          {segments.length === 0 && <circle className="stats-filter-empty-pie" cx="50" cy="50" r="44" />}
          {segments.map((segment) => {
            const percentage = pct(segment.item.count, total)
            const sharedProps = {
              className: `stats-filter-pie-sector${segment.item.selected ? ' on' : ''}`,
              fill: segment.item.color,
              role: 'button',
              tabIndex: 0,
              'aria-label': `${segment.item.label}, ${segment.item.count}, ${percentage}%`,
              'aria-pressed': segment.item.selected,
              onClick: segment.item.onClick,
              onKeyDown: (event: KeyboardEvent<SVGElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  segment.item.onClick()
                }
              },
            }
            return segment.end - segment.start >= 99.999
              ? <circle key={segment.item.key} {...sharedProps} cx="50" cy="50" r="44" />
              : <path key={segment.item.key} {...sharedProps} d={pieSectorPath(segment.start, segment.end)} />
          })}
        </svg>
        <div className="stats-filter-orbit right">
          {segments.filter((segment) => segment.side === 'right').map((segment) => labelButton(segment.item, 'right'))}
        </div>
      </div>
      {zeroItems.length > 0 && <div className="stats-filter-zero-items">{zeroItems.map((item) => labelButton(item))}</div>}
    </div>
  )
}

/** Stroke / error / forced chip row that scopes the heat court and the panel below it. */
export function StatsFilters({ value, points, onChange }: { value: StatsFilterState; points: Point[]; onChange: (v: StatsFilterState) => void }) {
  const toggle = <K extends keyof StatsFilterState>(key: K, next: StatsFilterState[K]) => onChange(toggleStatsFilter(value, key, next))
  const count = (patch: Partial<StatsFilterState>) => filterPoints(points, { ...value, ...patch }).length
  const forcedCounts = {
    unforced: count({ forced: 'unforced' }),
    forced: count({ forced: 'forced' }),
  }
  const strokeCounts = Object.fromEntries(PLACEMENT_STROKES.map((stroke) => [stroke, count({ stroke })])) as Record<PlacementStroke, number>
  const errorCounts = Object.fromEntries(ERROR_TYPES.map((error) => [error, count({ error })])) as Record<ErrorType, number>
  const shotTypeCounts = Object.fromEntries(POINT_SHOT_TYPES.map((shotType) => [shotType, count({ shotType })])) as Record<(typeof POINT_SHOT_TYPES)[number], number>
  const selectedLabels = [
    value.forced === 'forced' ? 'Forced' : value.forced === 'unforced' ? 'Unforced' : null,
    value.stroke !== 'all' ? STROKE_SHORT[value.stroke] : null,
    value.error !== 'all' ? ERROR_LABEL[value.error] : null,
    value.shotType !== 'all' ? SHOT_TYPE_LABEL[value.shotType] : null,
  ].filter((label): label is string => label !== null)
  return (
    <div className="stats-filters" role="group" aria-label="Filters">
      <div className="stats-filter-selection" aria-live="polite">
        <span>Selected</span><strong>{selectedLabels.length ? selectedLabels.join(' · ') : 'All data'}</strong>
      </div>
      <div className="stats-filters-track">
        <div className="stats-filters-row">
          <span className="stats-filter-row-label">Force</span>
          <FilterPie label="Force" items={[
            { key: 'unforced', label: 'Unforced', count: forcedCounts.unforced, color: 'var(--chart-unforced)', selected: value.forced === 'unforced', onClick: () => toggle('forced', 'unforced') },
            { key: 'forced', label: 'Forced', count: forcedCounts.forced, color: 'var(--err-forced)', selected: value.forced === 'forced', onClick: () => toggle('forced', 'forced') },
          ]} />
        </div>
        <div className="stats-filters-row">
          <span className="stats-filter-row-label">Stroke</span>
          <FilterPie label="Stroke" items={PLACEMENT_STROKES.map((s, index) => ({
            key: s,
            label: STROKE_SHORT[s],
            count: strokeCounts[s],
            color: ['var(--fh)', 'var(--bh)', 'var(--serve)'][index],
            selected: value.stroke === s,
            onClick: () => toggle('stroke', s),
          }))} />
        </div>
        <div className="stats-filters-row">
          <span className="stats-filter-row-label">Error</span>
          <FilterPie label="Error type" items={ERROR_TYPES.map((e, index) => ({
            key: e,
            label: ERROR_LABEL[e],
            count: errorCounts[e],
            color: ['var(--err-long)', 'var(--err-net)', 'var(--err-wide)'][index],
            selected: value.error === e,
            onClick: () => toggle('error', e),
          }))} />
        </div>
        <div className="stats-filters-row">
          <span className="stats-filter-row-label">Ball type</span>
          <FilterPie label="Ball type" keepZero items={POINT_SHOT_TYPES.map((type, index) => ({
            key: type,
            label: SHOT_TYPE_LABEL[type],
            count: shotTypeCounts[type],
            color: SHOT_TYPE_PIE_COLORS[index],
            selected: value.shotType === type,
            onClick: () => toggle('shotType', type),
          }))} />
        </div>
      </div>
    </div>
  )
}

export interface StatsPanelProps {
  summary: Summary
  /** Filtered marks in the same scope as `summary`, used for player-position coaching analysis. */
  points?: Point[]
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
type PositionSelection = { kind: 'depth'; value: ZoneRow } | { kind: 'side'; value: ZoneCol } | null

export function StatsPanel({ summary, points = [], count, mode = 'errors', onExportCsv, onExportJson, showExports = true }: StatsPanelProps) {
  const [positionSelection, setPositionSelection] = useState<PositionSelection>(null)
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
  const position = analyzeErrorPositions(points)
  const shotLabel = (type: typeof position.patterns[number]['shotType']) => type === 'untyped' ? 'Not selected' : SHOT_TYPE_LABEL[type]
  const counted = (value: number, singular: string, plural = `${singular}s`) => `${value} ${value === 1 ? singular : plural}`
  const regularErrors = summary.byStroke.fh + summary.byStroke.bh
  const forcedErrors = summary.byStrokeForced.fh + summary.byStrokeForced.bh
  const unforcedErrors = regularErrors - forcedErrors
  const aces = summary.playerWinnersByShotType.ace
  const nonServePlayerWinners = Math.max(0, summary.playerWinners - aces)
  const trackedParts = [
    { key: 'unforced', label: 'Unforced errors', count: unforcedErrors, color: 'var(--err-long)' },
    { key: 'forced', label: 'Forced errors', count: forcedErrors, color: 'var(--err-wide)' },
    { key: 'opponent-winner', label: 'Opponent winners', count: summary.winners, color: 'var(--danger)' },
    { key: 'double-fault', label: 'Double faults', count: summary.doubleFaults, color: 'var(--err-double-fault)' },
    { key: 'player-winner', label: 'Player winners', count: nonServePlayerWinners, color: 'var(--win)' },
    { key: 'ace', label: 'Aces', count: aces, color: 'var(--fh)' },
    { key: 'winning-serve', label: 'Winning serves', count: summary.winningServes, color: 'var(--accent)' },
  ].filter((part) => part.count > 0)
  const trackedTotal = trackedParts.reduce((total, part) => total + part.count, 0)
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
  const positionMatches = (zone: string) => !positionSelection
    || (positionSelection.kind === 'depth' ? zone.startsWith(`${positionSelection.value}-`) : zone.endsWith(`-${positionSelection.value}`))
  const selectedPatterns = position.patterns.filter((pattern) => !pattern.forced && positionMatches(pattern.zone)).slice(0, 5)
  const nonEmptyZones = Object.entries(position.zones)
    .filter(([, values]) => values.errors + values.opponentWinners + values.playerWinners > 0)
    .sort(([, a], [, b]) => b.errors + b.opponentWinners - a.errors - a.opponentWinners)
  const topPressure = nonEmptyZones
    .map(([zone, values]) => ({ zone, count: values.forced + values.opponentWinners }))
    .sort((a, b) => b.count - a.count)[0]
  const topPattern = position.patterns.find((pattern) => !pattern.forced)
  const mid = position.depth.mid
  const activeShotTypes = SHOT_TYPES.filter((type) => ZONE_ROWS.some((row) => position.depth[row].byShotType[type] > 0))
  const selectedLabel = positionSelection
    ? positionSelection.kind === 'depth' ? ZONE_ROW_LABEL[positionSelection.value] : ZONE_COL_LABEL[positionSelection.value]
    : 'All positions'
  const togglePosition = (next: NonNullable<PositionSelection>) => setPositionSelection((current) =>
    current?.kind === next.kind && current.value === next.value ? null : next,
  )
  const topStrokeZone = (stroke: 'fh' | 'bh') => nonEmptyZones
    .map(([zone, values]) => ({ zone, values, count: values[stroke] }))
    .sort((a, b) => b.count - a.count)[0]
  const fhZone = topStrokeZone('fh')
  const bhZone = topStrokeZone('bh')
  const positionGroups: Array<{ key: string; label: string; values: PositionCounts; selected: boolean; onClick: () => void }> = [
    ...ZONE_ROWS.map((row) => ({ key: `depth-${row}`, label: ZONE_ROW_LABEL[row], values: position.depth[row], selected: positionSelection?.kind === 'depth' && positionSelection.value === row, onClick: () => togglePosition({ kind: 'depth', value: row }) })),
    ...ZONE_COLS.map((col) => ({ key: `side-${col}`, label: ZONE_COL_LABEL[col], values: position.side[col], selected: positionSelection?.kind === 'side' && positionSelection.value === col, onClick: () => togglePosition({ kind: 'side', value: col }) })),
  ]
  return (
    <div className="stack stats-panel">
      <div className="card coaching-snapshot">
        <div className="stats-section-heading">
          <div>
            <div className="section-title">Coaching snapshot</div>
            <p>Start with repeatable patterns, then use the detail below to verify them.</p>
          </div>
          <span className="stats-scope-pill">{selectedLabel}</span>
        </div>
        <div className="coaching-insights">
          <article>
            <span>Top controllable pattern</span>
            <strong>{topPattern ? `${STROKE_SHORT[topPattern.stroke]} ${shotLabel(topPattern.shotType)} ${ERROR_LABEL[topPattern.error]}` : 'Not enough observations'}</strong>
            <small>{topPattern ? `${describeZone(zoneFromId(topPattern.zone))} · ${topPattern.count} unforced` : 'Tag more errors to reveal a repeat pattern.'}</small>
          </article>
          <article>
            <span>Primary pressure position</span>
            <strong>{topPressure?.count ? describeZone(zoneFromId(topPressure.zone)) : 'Not enough observations'}</strong>
            <small>{topPressure?.count ? `${topPressure.count} forced errors or opponent winners` : 'No pressure endings recorded by position.'}</small>
          </article>
          <article>
            <span>Mid-court balance</span>
            <strong>{mid.playerWinners} won · {mid.unforced} donated</strong>
            <small>{mid.errors + mid.playerWinners > 0 ? `${mid.forced} forced errors from mid-court` : 'No mid-court endings recorded.'}</small>
          </article>
          <article>
            <span>Serve &amp; return</span>
            <strong>{summary.doubleFaults} DF · {counted(summary.byShotType.serve_return, 'return error')}</strong>
            <small>{counted(aces, 'ace')} · {counted(summary.winningServes, 'winning serve')}</small>
          </article>
        </div>
      </div>

      {trackedTotal > 0 && <div className="card">
        <div className="section-title">Tracked point endings</div>
        <div className="error-types-summary">
          <div
            className="error-types-track"
            role="img"
            aria-label={trackedParts.map((part) => `${part.label} ${part.count}, ${pct(part.count, trackedTotal)}%`).join('; ')}
          >
            {trackedParts.map((part) => (
              <span
                key={part.key}
                className={`error-types-segment ${part.key}`}
                style={{ flexGrow: part.count, background: part.color }}
              />
            ))}
          </div>
          <div className="error-types-values">
            {trackedParts.map((part) => (
              <div key={part.key} className="error-types-value" style={{ '--part-color': part.color, flexGrow: part.count } as CSSProperties}>
                <span>{part.label}</span>
                <strong>{part.count} · {pct(part.count, trackedTotal)}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {position.errors + position.pressurePoints > 0 && <div className="card position-analysis">
        <div className="stats-section-heading">
          <div>
            <div className="section-title">Errors by player position</div>
            <p>Where the player stood when the point ended. Tap a position to focus the patterns below.</p>
          </div>
          {positionSelection && <button type="button" className="stats-clear-filter" onClick={() => setPositionSelection(null)}>Show all</button>}
        </div>
        <div className="position-group-heading">Depth</div>
        <div className="position-cards">
          {positionGroups.slice(0, 3).map(({ key, ...group }) => <PositionCard key={key} {...group} total={position.errors} />)}
        </div>
        <div className="position-group-heading">Court side</div>
        <div className="position-cards">
          {positionGroups.slice(3).map(({ key, ...group }) => <PositionCard key={key} {...group} total={position.errors} />)}
        </div>
      </div>}

      {nonEmptyZones.length > 0 && <div className="card">
        <div className="section-title">Position profile</div>
        <div className="stats-table-scroll">
          <table className="matrix position-table">
            <thead><tr><th>Position</th><th>Errors</th><th>UE</th><th>FE</th><th>Opp.</th><th>Won</th></tr></thead>
            <tbody>
              {nonEmptyZones.map(([zone, values]) => (
                <tr key={zone} className={positionMatches(zone) ? '' : 'dimmed'}>
                  <td>{describeZone(zoneFromId(zone))}</td><td className="big">{values.errors}</td><td>{values.unforced}</td><td>{values.forced}</td><td>{values.opponentWinners}</td><td>{values.playerWinners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {selectedPatterns.length > 0 && <div className="card">
        <div className="stats-section-heading">
          <div><div className="section-title">Ranked controllable patterns</div><p>Unforced errors only · {selectedLabel}</p></div>
        </div>
        <ol className="error-patterns">
          {selectedPatterns.map((pattern) => (
            <li key={[pattern.zone, pattern.stroke, pattern.shotType, pattern.error].join('-')}>
              <span className={`pill ${pattern.stroke}`}>{STROKE_SHORT[pattern.stroke]}</span>
              <div><strong>{shotLabel(pattern.shotType)} · {ERROR_LABEL[pattern.error]}</strong><small>{describeZone(zoneFromId(pattern.zone))}</small></div>
              <b>{pattern.count}</b>
            </li>
          ))}
        </ol>
      </div>}

      {activeShotTypes.length > 0 && <div className="card">
        <div className="section-title">Position × ball type</div>
        <div className="stats-table-scroll">
          <table className="matrix tactics-matrix">
            <thead><tr><th>Position</th>{activeShotTypes.map((type) => <th key={type}>{SHOT_TYPE_LABEL[type]}</th>)}</tr></thead>
            <tbody>{ZONE_ROWS.map((row) => (
              <tr key={row}><td>{ZONE_ROW_LABEL[row]}</td>{activeShotTypes.map((type) => <td className="big" key={type}>{position.depth[row].byShotType[type] || '—'}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </div>}

      {regularErrors > 0 && <div className="card">
        <div className="section-title">Stroke profiles</div>
        <div className="stroke-profiles">
          {([['fh', fhZone], ['bh', bhZone]] as const).map(([stroke, result]) => {
            const strokeErrors = summary.byStroke[stroke]
            const strokeForced = summary.byStrokeForced[stroke]
            return <article key={stroke}>
              <div><span className={`pill ${stroke}`}>{STROKE_SHORT[stroke]}</span><strong>{STROKE_LABEL[stroke]}</strong></div>
              <b>{strokeErrors} errors</b>
              <small>{strokeErrors - strokeForced} unforced · {strokeForced} forced</small>
              {result?.count > 0 && <small>Most frequent at {describeZone(zoneFromId(result.zone))} · {result.count}</small>}
            </article>
          })}
        </div>
      </div>}

      <div className="card">
        <div className="section-title">Error ball types</div>
        <div className="ball-type-bubbles">
          {ballTypeItems.map((item) => {
            // Double faults are serve outcomes and do not belong in the attempted-ball-type mix.
            const percentage = pct(item.count, regularErrors)
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
      <p className="kbd-hint">These are point-ending counts, not success rates. Player position shows where the player stood; serve outcomes and ball-placement marks are excluded.</p>
    </div>
  )
}

function PositionCard({ label, values, total, selected, onClick }: { label: string; values: PositionCounts; total: number; selected: boolean; onClick: () => void }) {
  const meaningful = values.errors + values.opponentWinners + values.playerWinners > 0
  return (
    <button type="button" className={`position-card${selected ? ' selected' : ''}`} onClick={onClick} disabled={!meaningful} aria-pressed={selected}>
      <span>{label}</span>
      <strong>{values.errors}<small>{pct(values.errors, total)}%</small></strong>
      <small>UE {values.unforced} · FE {values.forced}</small>
      <small>FH {values.fh} · BH {values.bh}</small>
      {(values.opponentWinners > 0 || values.playerWinners > 0) && <small>Opp. {values.opponentWinners} · Won {values.playerWinners}</small>}
    </button>
  )
}
