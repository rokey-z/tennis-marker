import { useEffect, useState, type ReactNode } from 'react'
import type { SequenceItem } from '../domain/analytics'
import { describeZone, zoneFor } from '../domain/court'
import { ERROR_LABEL, STROKE_SHORT, isErrorType, isStroke } from '../domain/types'
import { formatTime } from '../lib/format'
import { CHART, niceTicks, useMeasure } from './chartUtils'

export interface Series {
  key: string
  label: string
  color: string
}
export interface Category {
  key: string
  label: string
  /** full text for the tooltip title */
  title?: string
  subtitle?: string
}

// ---------- helpers ----------

function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  if (rr <= 0) return `M${x},${y}h${w}v${h}h${-w}z`
  return `M${x},${y + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - rr}h${-w}z`
}

// ---------- legend ----------

export function Legend({ series, line }: { series: Series[]; line?: { label: string; color: string } | null }) {
  if (series.length < 2 && !line) return null
  return (
    <div className="legend-row" aria-hidden="true">
      {series.map((s) => (
        <span key={s.key} className="legend-item">
          <span className="sw" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
      {line && (
        <span className="legend-item">
          <span className="sw line" style={{ background: line.color }} />
          {line.label}
        </span>
      )}
    </div>
  )
}

// ---------- stacked columns ----------

export interface StackedColumnsProps {
  categories: Category[]
  series: Series[]
  /** values[categoryIndex][seriesIndex] */
  values: number[][]
  height?: number
  avgLine?: number[] | null
  avgLabel?: string
  selectedIndex?: number | null
  onSelect?: (index: number) => void
  /** Change this (e.g. the selected session id) to drop any pinned tooltip when the underlying dataset changes. */
  resetKey?: string
  ariaLabel: string
  emptyText?: string
}

export function StackedColumns({ categories, series, values, height = 170, avgLine, avgLabel = 'avg', selectedIndex = null, onSelect, resetKey, ariaLabel, emptyText = 'No data in this range.' }: StackedColumnsProps) {
  const [ref, width] = useMeasure<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  // pinned tooltip is stored by category KEY so it survives reordering and never points at the wrong column
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const n = categories.length
  const catKeys = categories.map((c) => c.key).join('\u0000')
  useEffect(() => {
    // dataset or selection changed underneath us → drop stale hover/pin
    setHover(null)
    setPinnedKey(null)
  }, [catKeys, resetKey])
  useEffect(() => {
    // parent moved the selection elsewhere (select box, table, timeline) → un-pin
    if (pinnedKey !== null && selectedIndex !== null && categories[selectedIndex]?.key !== pinnedKey) setPinnedKey(null)
  }, [selectedIndex, pinnedKey, categories])
  const pinned = pinnedKey === null ? null : categories.findIndex((c) => c.key === pinnedKey)
  const totals = values.map((row) => row.reduce((a, b) => a + b, 0))
  const maxVal = Math.max(...totals, ...(avgLine ?? []), 0)
  const { max, ticks } = niceTicks(maxVal)

  const M = { left: 30, right: 10, top: 14, bottom: 30 }
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = height
  const band = n ? plotW / n : 0
  const barW = Math.max(3, Math.min(24, band * 0.66))
  const y = (v: number) => M.top + plotH - (v / max) * plotH
  const cx = (i: number) => M.left + band * i + band / 2

  const labelEvery = n <= 6 ? 1 : Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 52))))
  const shown = hover ?? (pinned !== null && pinned >= 0 ? pinned : null)
  // highlight band: hover wins, then the parent's selection, then a pin (charts without selection)
  const active = hover ?? selectedIndex ?? shown

  return (
    <div className="chart" ref={ref}>
      <Legend series={series} line={avgLine ? { label: avgLabel, color: CHART.avg } : null} />
      {n === 0 ? (
        <p className="muted chart-empty">{emptyText}</p>
      ) : (
        width > 0 && (
          <div className="chart-plot" onPointerLeave={() => setHover(null)}>
            <svg width={width} height={plotH + M.top + M.bottom} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
              {/* grid + y ticks */}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} shapeRendering="crispEdges" />
                  <text x={M.left - 6} y={y(t) + 3.5} fontSize={11} textAnchor="end" fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t}
                  </text>
                </g>
              ))}
              {/* selection highlight */}
              {active !== null && active >= 0 && active < n && (
                <rect x={M.left + band * active} y={M.top - 4} width={band} height={plotH + 4} fill="var(--surface-2)" opacity={0.7} rx={4} />
              )}
              {/* columns */}
              {values.map((row, i) => {
                let acc = 0
                const x0 = cx(i) - barW / 2
                const segs = row.map((v, si) => {
                  const y1 = y(acc)
                  const y0 = y(acc + v)
                  acc += v
                  return { v, si, y0, y1 }
                })
                const topIdx = [...segs].reverse().find((s) => s.v > 0)?.si ?? -1
                return (
                  <g key={categories[i].key}>
                    {segs.map((s) => {
                      if (s.v <= 0) return null
                      const gapTop = s.si === topIdx ? 0 : 1
                      const gapBottom = s.si === 0 ? 0 : 1
                      const yy = s.y0 + gapTop
                      const hh = Math.max(0, s.y1 - s.y0 - gapTop - gapBottom)
                      const color = series[s.si].color
                      return s.si === topIdx ? (
                        <path key={s.si} d={topRoundedRect(x0, yy, barW, hh, 4)} fill={color} />
                      ) : (
                        <rect key={s.si} x={x0} y={yy} width={barW} height={hh} fill={color} />
                      )
                    })}
                    {/* value cap on the active column */}
                    {shown === i && totals[i] > 0 && (
                      <text x={cx(i)} y={y(totals[i]) - 5} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--text)">
                        {totals[i]}
                      </text>
                    )}
                    {/* x label */}
                    {(i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery)) && (
                      <text x={cx(i)} y={M.top + plotH + 16} fontSize={11} textAnchor="middle" fill="var(--muted)">
                        {categories[i].label}
                      </text>
                    )}
                    {/* hit target */}
                    <rect
                      x={M.left + band * i}
                      y={M.top - 4}
                      width={band}
                      height={plotH + M.bottom}
                      fill="transparent"
                      style={{ cursor: onSelect ? 'pointer' : 'default' }}
                      onPointerEnter={() => setHover(i)}
                      onPointerMove={() => setHover(i)}
                      onClick={() => {
                        const key = categories[i].key
                        if (pinnedKey === key) {
                          setPinnedKey(null) // just un-pin; don't re-trigger selection/scroll
                          return
                        }
                        setPinnedKey(key)
                        onSelect?.(i)
                      }}
                    />
                  </g>
                )
              })}
              {/* average line */}
              {avgLine && avgLine.length === n && n > 1 && (
                <>
                  <polyline points={avgLine.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={CHART.avg} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={cx(n - 1)} cy={y(avgLine[n - 1])} r={4} fill={CHART.avg} stroke="var(--surface)" strokeWidth={2} />
                </>
              )}
              {/* baseline */}
              <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges" />
            </svg>
            {shown !== null && shown >= 0 && shown < n && (
              <div className="chart-tip" style={{ left: Math.min(Math.max(cx(shown), 90), Math.max(90, width - 90)) }}>
                <div className="tip-title">{categories[shown].title ?? categories[shown].label}</div>
                {categories[shown].subtitle && <div className="tip-sub">{categories[shown].subtitle}</div>}
                {series.map((s, si) => (
                  <div key={s.key} className="tip-row">
                    <span className="sw" style={{ background: s.color }} />
                    <span className="grow">{s.label}</span>
                    <span>{values[shown][si]}</span>
                  </div>
                ))}
                {series.length > 1 && (
                  <div className="tip-row total">
                    <span className="grow">Total</span>
                    <span>{totals[shown]}</span>
                  </div>
                )}
                {avgLine && avgLine[shown] !== undefined && (
                  <div className="tip-row">
                    <span className="sw line" style={{ background: CHART.avg }} />
                    <span className="grow">{avgLabel}</span>
                    <span>{avgLine[shown].toFixed(1)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

// ---------- sparkline ----------

export function Sparkline({ values, width = 56, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const gap = 2
  const bw = Math.max(2, Math.min(6, (width - gap * (values.length - 1)) / values.length))
  const total = bw * values.length + gap * (values.length - 1)
  return (
    <svg width={total} height={height} aria-hidden="true" style={{ display: 'block' }}>
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * (height - 2))
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={1} fill={i === values.length - 1 ? CHART.total : CHART.spark} />
      })}
    </svg>
  )
}

// ---------- sequence strip ----------

export function SequenceStrip({ items, gapThresholdMin = 5, onSelect }: { items: SequenceItem[]; gapThresholdMin?: number; onSelect?: (index: number) => void }) {
  if (!items.length) return <p className="muted">No points in this session.</p>
  return (
    <div className="seq-strip" role="list" aria-label="Points in order">
      {items.map((it, i) => {
        const p = it.point
        const gap = it.gapMin !== null && it.gapMin >= gapThresholdMin ? it.gapMin : null
        const stroke = isStroke(p.stroke) ? p.stroke : null
        const errLabel = isErrorType(p.error_type) ? ERROR_LABEL[p.error_type] : '?'
        const title = `#${i + 1} · ${stroke ? STROKE_SHORT[stroke] : '?'} ${errLabel.toLowerCase()} · ${p.forced ? 'forced' : 'unforced'} · ${describeZone(zoneFor(p.x, p.y))} · ${formatTime(p.created_at)}`
        const cls = `seq-dot ${stroke ?? 'unknown'}${p.forced ? ' forced' : ''}`
        return (
          <span key={p.id} className="seq-item" role="listitem">
            {gap !== null && <span className="seq-gap" title={`${Math.round(gap)} min without an error`}>{Math.round(gap)}m</span>}
            {onSelect ? (
              <button type="button" className={cls} title={title} aria-label={title} onClick={() => onSelect(i)}>
                {errLabel[0]}
              </button>
            ) : (
              <span className={cls} title={title} aria-label={title}>
                {errLabel[0]}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ---------- share bars (horizontal, part-to-whole) ----------

export interface ShareRow {
  label: ReactNode
  total: number
  parts: Array<{ key: string; label: string; color: string; value: number }>
}

export function ShareBars({ rows, series }: { rows: ShareRow[]; series: Series[] }) {
  return (
    <div className="share-bars">
      <Legend series={series} />
      {rows.map((r, i) => (
        <div className="share-row" key={i}>
          <div className="share-label">{r.label}</div>
          <div className="share-track" role="img" aria-label={`${r.parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
            {r.total > 0 &&
              r.parts.map((p) => {
                const w = (p.value / r.total) * 100
                if (w <= 0) return null
                return (
                  <div key={p.key} className="share-seg" style={{ width: `${w}%`, background: p.color }} title={`${p.label}: ${p.value} (${Math.round(w)}%)`}>
                    {w >= 14 ? `${Math.round(w)}%` : ''}
                  </div>
                )
              })}
          </div>
          <div className="share-total">{r.total}</div>
        </div>
      ))}
    </div>
  )
}

// ---------- delta ----------

export function Delta({ pct, upIsGood = false, label }: { pct: number | null; upIsGood?: boolean; label: string }) {
  if (pct === null) return <span className="delta muted">—</span>
  if (Math.abs(pct) < 1) return <span className="delta muted">flat {label}</span>
  const up = pct > 0
  const good = up === upIsGood
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% {label}
    </span>
  )
}
