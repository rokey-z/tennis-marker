import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  COURT,
  VIEW,
  VIEW_MAX_Y,
  ZONE_COLS,
  ZONE_COL_SPLIT,
  ZONE_ROWS,
  ZONE_ROW_SPLITS,
  clampToView,
  isOut,
  zoneFor,
  zoneId,
  zoneRect,
} from '../domain/court'
import { isErrorType, isPlacementStroke, type PlacementStroke, type Point } from '../domain/types'
import { ERROR_LETTER, markLabel } from './marks'

/** Extra headroom above the net line so the net band is visible (presentational only). */
// A generous, 3 ft target keeps a net strike easy to mark courtside.
const NET_BAND = 3
/**
 * Drawn margins: half of what the data model keeps (6 ft beside the lines, 12 ft behind the
 * baseline), so the court is large on a phone while a band of green stays visible around it.
 * Points recorded further out than this are pinned to the drawn edge.
 */
const DRAW_SIDE_MARGIN = COURT.sideMargin / 2
const DRAW_BACK_MARGIN = 9
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
/** The 90° view needs a swapped viewport, otherwise the court would be clipped at the sidelines. */
const ROTATED_VIEWBOX = `${PIVOT.x - VB_HEIGHT / 2} ${PIVOT.y - DRAW_WIDTH / 2} ${VB_HEIGHT} ${DRAW_WIDTH}`
const drawX = (x: number) => Math.min(DRAW_MAX_X - 1.4, Math.max(DRAW_MIN_X + 1.4, x))
const drawY = (y: number) => Math.min(DRAW_MAX_Y - 1.4, Math.max(VB_MIN_Y + 1.4, y))

/** A mouse press that travels further than this before release is a drag, not a tap. */
const DRAG_PX = 12
/** Horizontal travel that turns a placement drag into a stroke choice: left = backhand, right = forehand. */
const STROKE_DRAG_PX = 26

/**
 * Text drawn inside the court group inherits the half's flip, which turns it upside down or
 * mirrored. This cancels it about the text's own anchor, so the words read normally where they are.
 * This cancels every view transform around a text's own anchor, so labels and mark letters
 * remain readable even while the court is flipped, rotated, or showing its far half.
 */
function uprightAt(x: number, y: number, flipped: boolean, verticallyMirrored: boolean, rotated: boolean): string | undefined {
  const transforms = [
    rotated ? `rotate(-90 ${x} ${y})` : '',
    verticallyMirrored ? `translate(0 ${2 * y}) scale(1 -1)` : '',
    flipped ? `rotate(180 ${x} ${y})` : '',
  ].filter(Boolean)
  return transforms.join(' ') || undefined
}

interface DragState {
  /** where the ball landed, in court feet */
  start: { x: number; y: number }
  cur: { x: number; y: number }
  /** horizontal travel in screen pixels — its sign picks the stroke */
  dx: number
  dy: number
  at: { x: number; y: number }
  /** A placement that struck the net is still an error, not a landing. */
  net: boolean
}

export interface CourtProps {
  /** Rotate 180° so the parent taps what they see when she plays the far end. */
  flipped?: boolean
  /** Turn the court 90° clockwise into a landscape view. */
  rotated?: boolean
  /** Receives coordinates in feet, in the player's frame (already clamped to the court area), plus where on screen the tap landed. */
  onTap?: (x: number, y: number, at: { clientX: number; clientY: number }, surface?: 'court' | 'net') => void
  /** Ignore input (e.g. while the shot sheet is open). */
  disabled?: boolean
  points?: Point[]
  /** Recording view: the newest mark stays full size, earlier ones shrink and fade back. */
  emphasizeLast?: boolean
  /** 'own' = her half (errors); 'opposite' = the far half, mirrored, for ball placements. */
  half?: 'own' | 'opposite'
  /** Dimmed watermark naming whose half is on screen, so the two modes are never confused. */
  sideLabel?: string
  /** Placement mode: press where the ball landed and drag left for backhand, right for forehand. */
  onStrokeDrag?: (x: number, y: number, stroke: PlacementStroke, surface?: 'court' | 'net') => void
  pending?: { x: number; y: number } | null
  showZones?: boolean
  /** zoneId → count; draws a heat overlay with labels. */
  heat?: Record<string, number> | null
  heatTotal?: number
  className?: string
}

export function Court({ flipped = false, rotated = false, onTap, disabled = false, points, emphasizeLast = false, half = 'own', sideLabel, onStrokeDrag, pending, showZones = false, heat, heatTotal = 0, className }: CourtProps) {
  const gRef = useRef<SVGGElement>(null)
  const down = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  // the ref is authoritative (pointer events can arrive faster than React re-renders); state drives the drawing
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const interactive = !!onTap

  const toCourt = useCallback((clientX: number, clientY: number): { x: number; y: number; net: boolean } | null => {
    const g = gRef.current
    if (!g) return null
    const m = g.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    // The visible net band is an input target in Placement mode. Its mark is stored on the net
    // line (y = 0), but we preserve which surface was tapped so it becomes a Net error.
    const net = half === 'opposite' && p.y >= -NET_BAND && p.y < 0 && Math.abs(p.x) <= COURT.netPostX
    return { ...clampToView(p.x, p.y), net }
  }, [half])

  // Taps are driven by the browser's own `click`: every platform synthesises it for a real tap and
  // withholds it for scrolls/drags/long-press menus, which is exactly the tap-vs-gesture rule we want.
  // We only remember where the pointer went down to reject mouse drags (mouse fires click regardless).
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    if (!onStrokeDrag || disabled) return
    const c = toCourt(e.clientX, e.clientY)
    if (!c) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is a nicety, not a requirement */
    }
    const next: DragState = { start: c, dx: 0, dy: 0, at: { x: e.clientX, y: e.clientY }, cur: c, net: c.net }
    dragRef.current = next
    setDrag(next)
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d) return
    const c = toCourt(e.clientX, e.clientY)
    const next: DragState = { ...d, dx: e.clientX - d.at.x, dy: e.clientY - d.at.y, cur: c ?? d.cur }
    dragRef.current = next
    setDrag(next)
  }

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.at.x
    dragRef.current = null
    setDrag(null)
    down.current = null
    const dy = e.clientY - d.at.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < STROKE_DRAG_PX) {
      // too short to mean a direction — fall back to the tap chooser
      onTap?.(d.start.x, d.start.y, { clientX: d.at.x, clientY: d.at.y }, d.net ? 'net' : 'court')
      return
    }
    const stroke: PlacementStroke = !d.net && dy < -STROKE_DRAG_PX && Math.abs(dy) > Math.abs(dx) ? 'serve' : dx < 0 ? 'bh' : 'fh'
    onStrokeDrag?.(d.start.x, d.start.y, stroke, d.net ? 'net' : 'court')
  }

  const onPointerCancel = () => {
    down.current = null
    dragRef.current = null
    setDrag(null)
  }
  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!interactive || disabled || onStrokeDrag) return
    const d = down.current
    down.current = null
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return
    const c = toCourt(e.clientX, e.clientY)
    if (c) onTap?.(c.x, c.y, { clientX: e.clientX, clientY: e.clientY }, c.net ? 'net' : 'court')
  }

  const newestId = useMemo(() => {
    if (!emphasizeLast || !points?.length) return null
    return points.reduce((newest, p) => (!newest || p.created_at > newest.created_at ? p : newest), null as Point | null)?.id ?? null
  }, [emphasizeLast, points])

  // the far half is the same drawing mirrored about the net, so the net stays nearest the player
  const mirror = half === 'opposite' ? `translate(0 ${2 * PIVOT.y}) scale(1 -1)` : ''
  const rotate = flipped ? `rotate(180 ${PIVOT.x} ${PIVOT.y})` : ''
  const quarterTurn = rotated ? `rotate(90 ${PIVOT.x} ${PIVOT.y})` : ''
  const flipTransform = [rotate, mirror, quarterTurn].filter(Boolean).join(' ') || undefined
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
      className={`court-svg${interactive ? ' interactive' : ''}${rotated ? ' rotated' : ''}${className ? ` ${className}` : ''}`}
      viewBox={rotated ? ROTATED_VIEWBOX : VIEWBOX}
      role={interactive ? 'button' : 'img'}
      aria-label={interactive ? 'Half tennis court — tap where the point was lost' : 'Half tennis court'}
      onPointerDown={onPointerDown}
      onPointerMove={onStrokeDrag ? onPointerMove : undefined}
      onPointerUp={onStrokeDrag ? endDrag : undefined}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      style={onStrokeDrag ? { touchAction: 'none' } : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g ref={gRef} transform={flipTransform}>
        {/* surround + court */}
        <rect x={DRAW_MIN_X} y={VB_MIN_Y} width={DRAW_WIDTH} height={VB_HEIGHT} fill="var(--surround)" />
        <rect x={-COURT.doublesHalfWidth} y={0} width={2 * COURT.doublesHalfWidth} height={COURT.halfLength} fill="var(--court)" />

        {/* whose half this is — dimmed, behind every mark, and always upright */}
        {sideLabel && (
          <g transform={uprightAt(0, VB_MIN_Y + 4.6, flipped, half === 'opposite', rotated)} pointerEvents="none">
            <text
              x={0}
              y={VB_MIN_Y + 4.6}
              fontSize={2}
              fontWeight={800}
              textAnchor="middle"
              fill="#ffffff"
              fillOpacity={0.2}
              letterSpacing={0.35}
              fontFamily="var(--font)"
            >
              {sideLabel.toUpperCase()}
            </text>
          </g>
        )}

        {/* Placement mode makes the ways a ball can miss unmistakable: the net is a Net error;
            everything beyond the singles lines or baseline is an out landing. */}
        {interactive && half === 'opposite' && (
          <g pointerEvents="none">
            {/* The three playable landing depths. */}
            <rect x={-COURT.singlesHalfWidth} y={0} width={2 * COURT.singlesHalfWidth} height={ZONE_ROW_SPLITS[0]} fill="rgba(114, 184, 151, 0.18)" />
            <rect x={-COURT.singlesHalfWidth} y={ZONE_ROW_SPLITS[0]} width={2 * COURT.singlesHalfWidth} height={ZONE_ROW_SPLITS[1] - ZONE_ROW_SPLITS[0]} fill="rgba(105, 161, 203, 0.16)" />
            <rect x={-COURT.singlesHalfWidth} y={ZONE_ROW_SPLITS[1]} width={2 * COURT.singlesHalfWidth} height={COURT.halfLength - ZONE_ROW_SPLITS[1]} fill="rgba(124, 146, 206, 0.18)" />
            {/* Misses: side = Wide, past the baseline = Long. */}
            <rect x={VIEW.minX} y={0} width={-COURT.singlesHalfWidth - VIEW.minX} height={VIEW_MAX_Y} fill="#f8ca91" />
            <rect x={COURT.singlesHalfWidth} y={0} width={VIEW.minX + VIEW.width - COURT.singlesHalfWidth} height={VIEW_MAX_Y} fill="#f8ca91" />
            <rect x={-COURT.doublesHalfWidth} y={COURT.halfLength} width={2 * COURT.doublesHalfWidth} height={VIEW_MAX_Y - COURT.halfLength} fill="#f5b875" />
            {[
              ['SHORT', 10.5],
              ['MID', 27.5],
              ['DEEP', 36.8],
            ].map(([label, y]) => (
              <g key={label} transform={uprightAt(0, y as number, flipped, true, rotated)}>
                <text x={0} y={y as number} fontSize={1.35} fontWeight={800} textAnchor="middle" fill="#ffffff" opacity={0.28} fontFamily="var(--font)" letterSpacing={0.2}>{label}</text>
              </g>
            ))}
            <g transform={uprightAt(-19.8, 19.5, flipped, true, rotated)}><text x={-19.8} y={19.5} fontSize={1.15} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.5} fontFamily="var(--font)" transform="rotate(-90 -19.8 19.5)">WIDE</text></g>
            <g transform={uprightAt(19.8, 19.5, flipped, true, rotated)}><text x={19.8} y={19.5} fontSize={1.15} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.5} fontFamily="var(--font)" transform="rotate(90 19.8 19.5)">WIDE</text></g>
            <g transform={uprightAt(0, 45, flipped, true, rotated)}><text x={0} y={45} fontSize={1.35} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.52} fontFamily="var(--font)" letterSpacing={0.18}>LONG</text></g>
          </g>
        )}

        {/* zone grid (subtle) */}
        {showZones && (
          <g stroke="rgba(255,255,255,0.24)" strokeWidth={0.15} strokeDasharray="0.8 0.8" fill="none">
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

        {/* live drag: the press point is the placement, the direction picks the stroke */}
        {drag && (
          <g pointerEvents="none">
            <line
              x1={drag.start.x}
              y1={drag.start.y}
              x2={drag.cur.x}
              y2={drag.cur.y}
              stroke={Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) < STROKE_DRAG_PX ? 'rgba(255,255,255,0.7)' : `var(--${drag.dy < -STROKE_DRAG_PX && Math.abs(drag.dy) > Math.abs(drag.dx) ? 'serve' : drag.dx < 0 ? 'bh' : 'fh'})`}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
            <circle cx={drag.start.x} cy={drag.start.y} r={1.5} fill="none" stroke="#ffffff" strokeWidth={0.4} />
            {Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) >= STROKE_DRAG_PX && (
              <g transform={uprightAt(drag.cur.x, drag.cur.y, flipped, half === 'opposite', rotated)}>
                <circle cx={drag.cur.x} cy={drag.cur.y} r={2.4} fill={`var(--${drag.dy < -STROKE_DRAG_PX && Math.abs(drag.dy) > Math.abs(drag.dx) ? 'serve' : drag.dx < 0 ? 'bh' : 'fh'})`} />
                <text
                  x={drag.cur.x}
                  y={drag.cur.y + 0.85}
                  fontSize={2.4}
                  fontWeight={800}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontFamily="var(--font)"
                >
                  {drag.dy < -STROKE_DRAG_PX && Math.abs(drag.dy) > Math.abs(drag.dx) ? 'S' : drag.dx < 0 ? 'BH' : 'FH'}
                </text>
              </g>
            )}
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

        {/* In Placement mode, the net itself is a deliberately large target: a ball here lost
            the point, so it is recorded as a Net error rather than a placement. */}
        {interactive && half === 'opposite' && (
          <g pointerEvents="none">
            <defs>
              <pattern id="net-error-mesh" width="1.2" height="1.2" patternUnits="userSpaceOnUse">
                <rect width="1.2" height="1.2" fill="#f1a65c" />
                <path d="M-0.3 0.3L0.3 -0.3M0 1.2L1.2 0M0.9 1.5L1.5 0.9M-0.3 0.9L0.3 1.5M0 0L1.2 1.2M0.9 -0.3L1.5 0.3" stroke="rgba(126, 68, 18, 0.72)" strokeWidth="0.12" />
              </pattern>
            </defs>
            <rect x={-COURT.netPostX} y={-NET_BAND} width={2 * COURT.netPostX} height={NET_BAND} fill="url(#net-error-mesh)" />
            <g transform={uprightAt(0, -NET_BAND / 2, flipped, true, rotated)}>
              <text x={0} y={-0.9} fontSize={0.9} fontWeight={800} textAnchor="middle" fill="#55300e" fontFamily="var(--font)" letterSpacing={0.16}>
                NET
              </text>
            </g>
          </g>
        )}

        {/* heat labels — counter-rotated when flipped so they stay readable */}
        {heatCells && (
          <g fontFamily="var(--font)" fontWeight={800} textAnchor="middle" pointerEvents="none">
            {heatCells.map((c) => {
              const cx = c.r.x + c.r.width / 2
              const cy = c.r.y + c.r.height / 2
              const pctLabel = heatTotal > 0 && c.n > 0 ? `${Math.round((c.n / heatTotal) * 100)}%` : ''
              return (
                <g key={c.id} transform={uprightAt(cx, cy, flipped, half === 'opposite', rotated)}>
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
              <Marker key={p.id} p={p} flipped={flipped} rotated={rotated} dim={newestId !== null && p.id !== newestId} />
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

function Marker({ p: pt, flipped, rotated, dim = false }: { p: Point; flipped: boolean; rotated: boolean; dim?: boolean }) {
  const p = { ...pt, x: drawX(pt.x), y: drawY(pt.y) }
  const stroke = isPlacementStroke(p.stroke) ? p.stroke : 'fh'
  const error = isErrorType(p.error_type) ? p.error_type : 'long'
  const color = `var(--${stroke})`
  const ink = `var(--${stroke}-ink)`
  // earlier marks step back so the point just logged is the one you see; they stay solid enough
  // that a backhand blue still reads against the blue court
  const r = dim ? 0.95 : 1.4
  // placements only: a ball past the singles lines was called out
  const out = p.outcome === 'placement' && p.stroke !== 'serve' && isOut(pt.x, pt.y)
  const a = r * 0.9
  return (
    <g transform={uprightAt(p.x, p.y, flipped, false, rotated)} opacity={dim ? 0.78 : 1}>
      <title>{markLabel(p.outcome === 'winner' ? '' : stroke, error, p.forced, p.outcome, out, p.placement_result)}</title>
      {/* colour carries her stroke; a dark outline marks a forced error. A winner is the opponent's
          shot, so it is a green diamond with no stroke colour at all. */}
      {p.outcome === 'placement' ? (
        out ? (
          // the umpire's call: a ball outside the singles lines is a cross, never a solid dot
          <g strokeLinecap="round">
            <g stroke="#ffffff" strokeWidth={dim ? 0.75 : 1} opacity={0.85}>
              <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
              <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
            </g>
            <g stroke={color} strokeWidth={dim ? 0.4 : 0.55}>
              <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
              <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
            </g>
          </g>
        ) : (
          <circle cx={p.x} cy={p.y} r={r * 0.82} fill={color} stroke="#ffffff" strokeWidth={dim ? 0.18 : 0.26} />
        )
      ) : p.outcome === 'winner' ? (
        <rect
          x={p.x - r * 0.82}
          y={p.y - r * 0.82}
          width={r * 1.64}
          height={r * 1.64}
          rx={0.22}
          fill="var(--win)"
          stroke="var(--mark-outline)"
          strokeWidth={dim ? 0.24 : 0.32}
          transform={`rotate(45 ${p.x} ${p.y})`}
        />
      ) : (
        <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={p.forced ? 'var(--mark-outline)' : 'none'} strokeWidth={p.forced ? (dim ? 0.28 : 0.36) : 0} />
      )}
      {p.outcome !== 'placement' && (
      <text
        x={p.x}
        y={p.y + (dim ? 0.38 : 0.54)}
        fontSize={dim ? 1.1 : 1.55}
        fontWeight={800}
        textAnchor="middle"
        fill={p.outcome === 'winner' ? 'var(--win-ink)' : ink}
        fontFamily="var(--font)"
      >
        {p.outcome === 'winner' ? '★' : ERROR_LETTER[error]}
      </text>
      )}
    </g>
  )
}
