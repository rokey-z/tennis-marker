import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  COURT,
  VIEW,
  VIEW_MAX_X,
  VIEW_MAX_Y,
  ZONE_COLS,
  ZONE_COL_SPLIT,
  ZONE_ROWS,
  ZONE_ROW_SPLITS,
  clampToView,
  zoneFor,
  zoneId,
  zoneRect,
} from '../domain/court'
import type { Point } from '../domain/types'

/** Extra headroom above the net line so the net band is visible (presentational only). */
const NET_BAND = 1.5
const VB_MIN_Y = VIEW.minY - NET_BAND
const VB_HEIGHT = VIEW.height + NET_BAND
const VIEWBOX = `${VIEW.minX} ${VB_MIN_Y} ${VIEW.width} ${VB_HEIGHT}`
/** Visual pivot for the 180° flip: the center of the drawn box (any pivot yields correct taps via the CTM inverse). */
const PIVOT = { x: VIEW.minX + VIEW.width / 2, y: VB_MIN_Y + VB_HEIGHT / 2 }

const TAP_MAX_DIST_PX = 8
const TAP_MAX_MS = 400

export interface CourtProps {
  /** Rotate 180° so the parent taps what they see when she plays the far end. */
  flipped?: boolean
  /** Receives coordinates in feet, in the player's frame (already clamped to the court area). */
  onTap?: (x: number, y: number) => void
  /** Ignore input (e.g. while the shot sheet is open). */
  disabled?: boolean
  points?: Point[]
  pending?: { x: number; y: number } | null
  showZones?: boolean
  /** zoneId → count; draws a heat overlay with labels. */
  heat?: Record<string, number> | null
  heatTotal?: number
  className?: string
}

export function Court({ flipped = false, onTap, disabled = false, points, pending, showZones = false, heat, heatTotal = 0, className }: CourtProps) {
  const gRef = useRef<SVGGElement>(null)
  const down = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  const interactive = !!onTap

  const toCourt = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const g = gRef.current
    if (!g) return null
    const m = g.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    return clampToView(p.x, p.y)
  }, [])

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || disabled) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = down.current
    down.current = null
    if (!d || d.id !== e.pointerId || !interactive || disabled) return
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y)
    if (dist > TAP_MAX_DIST_PX || performance.now() - d.t > TAP_MAX_MS) return
    const c = toCourt(e.clientX, e.clientY)
    if (c) onTap?.(c.x, c.y)
  }
  const onPointerCancel = () => {
    down.current = null
  }

  const flipTransform = flipped ? `rotate(180 ${PIVOT.x} ${PIVOT.y})` : undefined
  const pendingZone = pending ? zoneId(zoneFor(pending.x, pending.y)) : null

  const heatCells = useMemo(() => {
    if (!heat) return null
    const max = Math.max(1, ...Object.values(heat))
    return ZONE_ROWS.flatMap((row) =>
      ZONE_COLS.map((col) => {
        const id = zoneId({ row, col })
        const r = zoneRect({ row, col })
        const n = heat[id] ?? 0
        return { id, r, n, fill: heatColor(n / max), a: n === 0 ? 0 : 0.6 + 0.35 * (n / max) }
      }),
    )
  }, [heat])

  return (
    <svg
      className={`court-svg${interactive ? ' interactive' : ''}${className ? ` ${className}` : ''}`}
      viewBox={VIEWBOX}
      role={interactive ? 'button' : 'img'}
      aria-label={interactive ? 'Half tennis court — tap where the point was lost' : 'Half tennis court'}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g ref={gRef} transform={flipTransform}>
        {/* surround + court */}
        <rect x={VIEW.minX} y={VIEW.minY - NET_BAND} width={VIEW.width} height={VIEW.height + NET_BAND} fill="var(--surround)" />
        <rect x={-COURT.doublesHalfWidth} y={0} width={2 * COURT.doublesHalfWidth} height={COURT.halfLength} fill="var(--court)" />

        {/* zone grid (subtle) */}
        {showZones && (
          <g stroke="rgba(255,255,255,0.45)" strokeWidth={0.15} strokeDasharray="0.8 0.8" fill="none">
            <line x1={-ZONE_COL_SPLIT} y1={0} x2={-ZONE_COL_SPLIT} y2={VIEW_MAX_Y} />
            <line x1={ZONE_COL_SPLIT} y1={0} x2={ZONE_COL_SPLIT} y2={VIEW_MAX_Y} />
            <line x1={VIEW.minX} y1={ZONE_ROW_SPLITS[1]} x2={VIEW_MAX_X} y2={ZONE_ROW_SPLITS[1]} />
            <line x1={VIEW.minX} y1={ZONE_ROW_SPLITS[0]} x2={-COURT.singlesHalfWidth} y2={ZONE_ROW_SPLITS[0]} />
            <line x1={COURT.singlesHalfWidth} y1={ZONE_ROW_SPLITS[0]} x2={VIEW_MAX_X} y2={ZONE_ROW_SPLITS[0]} />
          </g>
        )}

        {/* heat overlay */}
        {heatCells && (
          <g>
            {heatCells.map((c) => (
              <rect key={c.id} x={c.r.x} y={c.r.y} width={c.r.width} height={c.r.height} fill={c.fill} fillOpacity={c.a} stroke="rgba(255,255,255,0.35)" strokeWidth={0.15} />
            ))}
          </g>
        )}

        {/* pending zone highlight */}
        {pendingZone && (
          <rect {...zoneRect(zoneFor(pending!.x, pending!.y))} fill="rgba(255,255,255,0.18)" />
        )}

        {/* lines */}
        <g stroke="#ffffff" strokeWidth={0.35} strokeLinecap="square" fill="none">
          <line x1={-COURT.doublesHalfWidth} y1={COURT.halfLength} x2={COURT.doublesHalfWidth} y2={COURT.halfLength} />
          <line x1={-COURT.doublesHalfWidth} y1={0} x2={-COURT.doublesHalfWidth} y2={COURT.halfLength} />
          <line x1={COURT.doublesHalfWidth} y1={0} x2={COURT.doublesHalfWidth} y2={COURT.halfLength} />
          <line x1={-COURT.singlesHalfWidth} y1={0} x2={-COURT.singlesHalfWidth} y2={COURT.halfLength} />
          <line x1={COURT.singlesHalfWidth} y1={0} x2={COURT.singlesHalfWidth} y2={COURT.halfLength} />
          <line x1={-COURT.singlesHalfWidth} y1={COURT.serviceLine} x2={COURT.singlesHalfWidth} y2={COURT.serviceLine} />
          <line x1={0} y1={0} x2={0} y2={COURT.serviceLine} />
          <line x1={0} y1={COURT.halfLength} x2={0} y2={COURT.halfLength - COURT.centerMarkLength * 2} />
        </g>

        {/* net */}
        <g>
          <rect x={-COURT.netPostX} y={-NET_BAND} width={2 * COURT.netPostX} height={NET_BAND} fill="#1c1f26" opacity={0.85} />
          <line x1={-COURT.netPostX} y1={-NET_BAND} x2={COURT.netPostX} y2={-NET_BAND} stroke="#ffffff" strokeWidth={0.45} />
          <rect x={-COURT.netPostX - 0.4} y={-NET_BAND - 0.3} width={0.8} height={NET_BAND + 0.6} fill="#1c1f26" />
          <rect x={COURT.netPostX - 0.4} y={-NET_BAND - 0.3} width={0.8} height={NET_BAND + 0.6} fill="#1c1f26" />
        </g>

        {/* heat labels — counter-rotated when flipped so they stay readable */}
        {heatCells && (
          <g fontFamily="var(--font)" fontWeight={800} textAnchor="middle" pointerEvents="none">
            {heatCells.map((c) => {
              const cx = c.r.x + c.r.width / 2
              const cy = c.r.y + c.r.height / 2
              const pctLabel = heatTotal > 0 && c.n > 0 ? `${Math.round((c.n / heatTotal) * 100)}%` : ''
              return (
                <g key={c.id} transform={flipped ? `rotate(180 ${cx} ${cy})` : undefined}>
                  <text x={cx} y={cy + 0.6} fontSize={3.4} fill={c.n ? '#14181d' : 'rgba(255,255,255,0.7)'}>
                    {c.n}
                  </text>
                  {pctLabel && (
                    <text x={cx} y={cy + 3.4} fontSize={1.8} fill="#14181d" opacity={0.8}>
                      {pctLabel}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )}

        {/* logged points */}
        {points && points.length > 0 && (
          <g pointerEvents="none">
            {points.map((p) => (
              <Marker key={p.id} p={p} flipped={flipped} />
            ))}
          </g>
        )}

        {/* pending (ghost) marker */}
        {pending && (
          <g pointerEvents="none">
            <circle cx={pending.x} cy={pending.y} r={1.3} fill="none" stroke="#ffffff" strokeWidth={0.4}>
              <animate attributeName="r" values="1.3;2.4;1.3" dur="1.1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite" />
            </circle>
            <circle cx={pending.x} cy={pending.y} r={0.9} fill="#ffffff" stroke="#14181d" strokeWidth={0.25} />
          </g>
        )}
      </g>

      {/* orientation labels — outside the flip group so they stay upright */}
      <text
        x={VIEW.minX + 1}
        y={flipped ? VB_MIN_Y + VB_HEIGHT - 0.7 : VB_MIN_Y + NET_BAND / 2 + 0.55}
        fontSize={1.5}
        fontWeight={700}
        fill="rgba(255,255,255,0.9)"
        fontFamily="var(--font)"
        letterSpacing={0.1}
      >
        NET
      </text>
      <text
        x={VIEW_MAX_X - 1}
        y={flipped ? VB_MIN_Y + 1.9 : VB_MIN_Y + VB_HEIGHT - 1}
        fontSize={1.5}
        fontWeight={700}
        fill="rgba(255,255,255,0.9)"
        fontFamily="var(--font)"
        textAnchor="end"
        letterSpacing={0.1}
      >
        {flipped ? 'HER BASELINE (FAR END)' : 'HER BASELINE'}
      </text>
    </svg>
  )
}

const LETTER: Record<Point['error_type'], string> = { long: 'L', net: 'N', wide: 'W' }

/** Sequential heat scale: pale amber → deep orange-red. t in [0,1]. */
function heatColor(t: number): string {
  const a = [255, 224, 130] // #ffe082
  const b = [232, 89, 12] // #e8590c
  const k = Math.max(0, Math.min(1, t))
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

function Marker({ p, flipped }: { p: Point; flipped: boolean }) {
  const color = p.stroke === 'fh' ? 'var(--fh)' : 'var(--bh)'
  const ink = p.stroke === 'fh' ? '#3a2a00' : '#ffffff'
  const r = 1.25
  return (
    <g transform={flipped ? `rotate(180 ${p.x} ${p.y})` : undefined}>
      {p.forced ? (
        <>
          <circle cx={p.x} cy={p.y} r={r} fill="rgba(255,255,255,0.85)" stroke={color} strokeWidth={0.45} />
          <text x={p.x} y={p.y + 0.55} fontSize={1.5} fontWeight={800} textAnchor="middle" fill="#14181d" fontFamily="var(--font)">
            {LETTER[p.error_type]}
          </text>
        </>
      ) : (
        <>
          <circle cx={p.x} cy={p.y} r={r} fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth={0.15} />
          <text x={p.x} y={p.y + 0.55} fontSize={1.5} fontWeight={800} textAnchor="middle" fill={ink} fontFamily="var(--font)">
            {LETTER[p.error_type]}
          </text>
        </>
      )}
    </g>
  )
}
