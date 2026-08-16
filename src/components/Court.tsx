import { useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  COURT,
  VIEW,
  ZONE_COLS,
  ZONE_COL_SPLIT,
  ZONE_ROWS,
  ZONE_ROW_SPLITS,
  clampToView,
  zoneFor,
  zoneId,
  zoneRect,
} from '../domain/court'
import { isErrorType, isStroke, type Point } from '../domain/types'
import { errorShapePath, markLabel } from './marks'

/** Extra headroom above the net line so the net band is visible (presentational only). */
const NET_BAND = 1.5
/**
 * Drawn margins. The data model keeps 6 ft beside the lines and 12 ft behind the baseline (VIEW);
 * the drawing trims those so the court itself fills the screen — the sidelines sit at the edges on a
 * phone. Taps land inside the drawn area; points further out are pinned to the drawn edge.
 */
const DRAW_SIDE_MARGIN = 0.75
const DRAW_BACK_MARGIN = 6
export const DRAW_MIN_X = -(COURT.doublesHalfWidth + DRAW_SIDE_MARGIN)
export const DRAW_WIDTH = 2 * (COURT.doublesHalfWidth + DRAW_SIDE_MARGIN)
const DRAW_MAX_X = DRAW_MIN_X + DRAW_WIDTH
const VB_MIN_Y = VIEW.minY - NET_BAND
const VB_HEIGHT = COURT.halfLength + DRAW_BACK_MARGIN + NET_BAND
const DRAW_MAX_Y = VB_MIN_Y + VB_HEIGHT
const VIEWBOX = `${DRAW_MIN_X} ${VB_MIN_Y} ${DRAW_WIDTH} ${VB_HEIGHT}`
/** CSS aspect ratio of the drawn box (keep in sync with .court-svg). */
export const COURT_ASPECT = `${DRAW_WIDTH} / ${VB_HEIGHT}`
/** Visual pivot for the 180° flip: the center of the drawn box (any pivot yields correct taps via the CTM inverse). */
const PIVOT = { x: DRAW_MIN_X + DRAW_WIDTH / 2, y: VB_MIN_Y + VB_HEIGHT / 2 }
const drawX = (x: number) => Math.min(DRAW_MAX_X - 1.4, Math.max(DRAW_MIN_X + 1.4, x))
const drawY = (y: number) => Math.min(DRAW_MAX_Y - 1.4, Math.max(VB_MIN_Y + 1.4, y))

/** A mouse press that travels further than this before release is a drag, not a tap. */
const DRAG_PX = 12

export interface CourtProps {
  /** Rotate 180° so the parent taps what they see when she plays the far end. */
  flipped?: boolean
  /** Receives coordinates in feet, in the player's frame (already clamped to the court area), plus where on screen the tap landed. */
  onTap?: (x: number, y: number, at: { clientX: number; clientY: number }) => void
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

  // Taps are driven by the browser's own `click`: every platform synthesises it for a real tap and
  // withholds it for scrolls/drags/long-press menus, which is exactly the tap-vs-gesture rule we want.
  // We only remember where the pointer went down to reject mouse drags (mouse fires click regardless).
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
  }
  const onPointerCancel = () => {
    down.current = null
  }
  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!interactive || disabled) return
    const d = down.current
    down.current = null
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return
    const c = toCourt(e.clientX, e.clientY)
    if (c) onTap?.(c.x, c.y, { clientX: e.clientX, clientY: e.clientY })
  }

  const flipTransform = flipped ? `rotate(180 ${PIVOT.x} ${PIVOT.y})` : undefined
  const pendingZone = pending ? zoneId(zoneFor(pending.x, pending.y)) : null

  const heatCells = useMemo(() => {
    if (!heat) return null
    const max = Math.max(1, ...Object.values(heat))
    return ZONE_ROWS.flatMap((row) =>
      ZONE_COLS.map((col) => {
        const id = zoneId({ row, col })
        const r = clampRect(zoneRect({ row, col }))
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
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g ref={gRef} transform={flipTransform}>
        {/* surround + court */}
        <rect x={DRAW_MIN_X} y={VB_MIN_Y} width={DRAW_WIDTH} height={VB_HEIGHT} fill="var(--surround)" />
        <rect x={-COURT.doublesHalfWidth} y={0} width={2 * COURT.doublesHalfWidth} height={COURT.halfLength} fill="var(--court)" />

        {/* zone grid (subtle) */}
        {showZones && (
          <g stroke="rgba(255,255,255,0.45)" strokeWidth={0.15} strokeDasharray="0.8 0.8" fill="none">
            <line x1={-ZONE_COL_SPLIT} y1={0} x2={-ZONE_COL_SPLIT} y2={DRAW_MAX_Y} />
            <line x1={ZONE_COL_SPLIT} y1={0} x2={ZONE_COL_SPLIT} y2={DRAW_MAX_Y} />
            <line x1={DRAW_MIN_X} y1={ZONE_ROW_SPLITS[1]} x2={DRAW_MAX_X} y2={ZONE_ROW_SPLITS[1]} />
            <line x1={DRAW_MIN_X} y1={ZONE_ROW_SPLITS[0]} x2={-COURT.singlesHalfWidth} y2={ZONE_ROW_SPLITS[0]} />
            <line x1={COURT.singlesHalfWidth} y1={ZONE_ROW_SPLITS[0]} x2={DRAW_MAX_X} y2={ZONE_ROW_SPLITS[0]} />
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
          <rect {...clampRect(zoneRect(zoneFor(pending!.x, pending!.y)))} fill="rgba(255,255,255,0.18)" />
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
        x={DRAW_MIN_X + 0.8}
        y={flipped ? VB_MIN_Y + VB_HEIGHT - 0.7 : VB_MIN_Y + NET_BAND / 2 + 0.55}
        fontSize={1.4}
        fontWeight={700}
        fill="rgba(255,255,255,0.9)"
        fontFamily="var(--font)"
        letterSpacing={0.08}
      >
        NET
      </text>
      <text
        x={DRAW_MAX_X - 0.8}
        y={flipped ? VB_MIN_Y + 1.9 : VB_MIN_Y + VB_HEIGHT - 1}
        fontSize={1.4}
        fontWeight={700}
        fill="rgba(255,255,255,0.9)"
        fontFamily="var(--font)"
        textAnchor="end"
        letterSpacing={0.08}
      >
        HER BASELINE
      </text>
    </svg>
  )
}


/** Sequential heat scale: pale amber → deep orange-red. t in [0,1]. */
function heatColor(t: number): string {
  const a = [255, 224, 130] // #ffe082
  const b = [232, 89, 12] // #e8590c
  const k = Math.max(0, Math.min(1, t))
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/** Zone rectangles cover the data area (VIEW); crop them to what is actually drawn. */
function clampRect(r: { x: number; y: number; width: number; height: number }) {
  const x = Math.max(DRAW_MIN_X, r.x)
  const y = Math.max(VB_MIN_Y, r.y)
  return { x, y, width: Math.min(DRAW_MAX_X, r.x + r.width) - x, height: Math.min(DRAW_MAX_Y, r.y + r.height) - y }
}

function Marker({ p: pt, flipped }: { p: Point; flipped: boolean }) {
  const p = { ...pt, x: drawX(pt.x), y: drawY(pt.y) }
  const stroke = isStroke(p.stroke) ? p.stroke : 'fh'
  const error = isErrorType(p.error_type) ? p.error_type : 'long'
  const color = `var(--${stroke})`
  const ink = `var(--${stroke}-ink)`
  const r = 1.3
  return (
    <g transform={flipped ? `rotate(180 ${p.x} ${p.y})` : undefined}>
      <title>{markLabel(stroke, error, p.forced)}</title>
      {/* white ring: keeps overlapping marks separable on a busy court */}
      <circle cx={p.x} cy={p.y} r={r} fill={p.forced ? 'var(--surface)' : color} stroke="var(--surface)" strokeWidth={0.28} />
      {p.forced && <circle cx={p.x} cy={p.y} r={r - 0.2} fill="none" stroke={color} strokeWidth={0.4} />}
      <path d={errorShapePath(error, r * 0.46)} transform={`translate(${p.x} ${p.y})`} fill={p.forced ? color : ink} />
    </g>
  )
}
