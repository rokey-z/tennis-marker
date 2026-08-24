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
  placementResultFor,
  zoneFor,
  zoneId,
  zoneRect,
} from '../domain/court'
import { SHOT_TYPES, SHOT_TYPE_LABEL, isErrorType, isPlacementResult, isPlacementStroke, isShotType, type ErrorType, type PlacementStroke, type Point, type ShotType, type Stroke } from '../domain/types'
import { errorWheelSelection, type ErrorDragChoice } from '../domain/errorWheel'
import { ERROR_LETTER, markLabel } from './marks'

/** Extra headroom above the net line so the net band is visible (presentational only). */
// A deliberately thick target keeps a net strike easy to mark courtside.
const NET_BAND = 5
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
const ERROR_WHEEL_RADIUS = 8.4

export type CourtRotation = 0 | 90 | 180 | 270

/**
 * Text drawn inside the court group inherits the half's flip, which turns it upside down or
 * mirrored. This cancels it about the text's own anchor, so the words read normally where they are.
 * This cancels every view transform around a text's own anchor, so labels and mark letters
 * remain readable even while the court is rotated or showing its far half.
 */
function uprightAt(x: number, y: number, verticallyMirrored: boolean, rotation: CourtRotation): string | undefined {
  const transforms = [
    rotation ? `rotate(${-rotation} ${x} ${y})` : '',
    verticallyMirrored ? `translate(0 ${2 * y}) scale(1 -1)` : '',
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
  /** Visible wheel radius converted through the current SVG transform. */
  wheelRadiusPx: number
}

const ERROR_WHEEL_SECTORS: Array<ErrorDragChoice & { start: number; end: number }> = [
  { stroke: 'bh', error: 'wide', start: -135, end: -90 },
  { stroke: 'fh', error: 'wide', start: -90, end: -45 },
  { stroke: 'fh', error: 'long', start: -45, end: 45 },
  { stroke: 'fh', error: 'net', start: 45, end: 90 },
  { stroke: 'bh', error: 'net', start: 90, end: 135 },
  { stroke: 'bh', error: 'long', start: 135, end: 225 },
]

function polarPoint(cx: number, cy: number, radius: number, degrees: number) {
  const radians = degrees * Math.PI / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

function wheelSectorPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const a = polarPoint(cx, cy, radius, start)
  const b = polarPoint(cx, cy, radius, end)
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y} Z`
}

function ErrorDragWheel({ x, y, radius, rotation, selected, winner }: { x: number; y: number; radius: number; rotation: CourtRotation; selected: ErrorDragChoice | null; winner: boolean }) {
  return (
    <g transform={uprightAt(x, y, false, rotation)} pointerEvents="none">
      <circle cx={x} cy={y} r={radius + 0.3} fill="#171b21" opacity={0.96} stroke="#ffffff" strokeWidth={0.34} />
      {ERROR_WHEEL_SECTORS.map((sector) => {
        const active = selected?.stroke === sector.stroke && selected.error === sector.error
        const dimmed = winner || !!selected && !active
        const mid = (sector.start + sector.end) / 2
        const label = polarPoint(x, y, radius * 0.62, mid)
        return (
          <g key={`${sector.stroke}-${sector.error}`} opacity={dimmed ? 0.24 : 1}>
            <path
              d={wheelSectorPath(x, y, radius, sector.start, sector.end)}
              fill={`var(--${sector.stroke})`}
              stroke="rgba(255,255,255,0.72)"
              strokeWidth={0.22}
            />
            <text x={label.x} y={label.y - 0.25} textAnchor="middle" fill="rgba(255,255,255,0.62)" fontFamily="var(--font)" fontSize={1.15} fontWeight={700}>
              {sector.stroke.toUpperCase()}
            </text>
            <text x={label.x} y={label.y + 1.25} textAnchor="middle" fill="#ffffff" fontFamily="var(--font)" fontSize={1.65} fontWeight={850}>
              {sector.error.toUpperCase()}
            </text>
          </g>
        )
      })}
      <circle cx={x} cy={y} r={0.48} fill="#73777c" stroke="#ffffff" strokeWidth={0.18} />
      {winner && (
        <g>
          <circle cx={x} cy={y} r={radius + 0.55} fill="none" stroke="var(--win)" strokeWidth={0.72} />
          <rect x={x - 3.5} y={y - 1.15} width={7} height={2.3} rx={1.15} fill="var(--win)" stroke="#ffffff" strokeWidth={0.18} />
          <text x={x} y={y + 0.48} textAnchor="middle" fill="var(--win-ink)" fontFamily="var(--font)" fontSize={1.18} fontWeight={850}>★ WINNER</text>
        </g>
      )}
    </g>
  )
}

export interface CourtProps {
  /** Rotate the court clockwise by a quarter-turn increment. */
  rotation?: CourtRotation
  /** Receives coordinates in feet, in the player's frame (already clamped to the court area), plus where on screen the tap landed. */
  onTap?: (x: number, y: number, at: { clientX: number; clientY: number }, surface?: 'court' | 'net') => void
  /** Ignore input (e.g. while the shot sheet is open). */
  disabled?: boolean
  points?: Point[]
  /** Point selected from the log; its map mark is restored to full size and ringed. */
  highlightedPointId?: string | null
  /** Recording view: the newest mark stays full size, earlier ones shrink and fade back. */
  emphasizeLast?: boolean
  /** Compact all marks for analysis, or show a brighter compact overview after finishing. */
  compactMarks?: 'analysis' | 'overview'
  /** 'own' = her half (errors); 'opposite' = the far half, mirrored, for ball placements. */
  half?: 'own' | 'opposite'
  /** Dimmed watermark naming whose half is on screen, so the two modes are never confused. */
  sideLabel?: string
  /** Placement mode: press where the ball landed and drag left for backhand, right for forehand. */
  onStrokeDrag?: (x: number, y: number, stroke: PlacementStroke, surface?: 'court' | 'net') => void
  /** Errors mode: drag from the mark into one of six FH/BH × Wide/Long/Net wheel sectors. */
  onErrorSelect?: (x: number, y: number, stroke: Stroke, error: ErrorType, at: { clientX: number; clientY: number }) => void
  /** Errors mode: releasing beyond the wheel records an opponent winner. */
  onErrorWinner?: (x: number, y: number) => void
  /** Only start the stroke gesture on the net; ordinary court taps remain taps. */
  dragNetOnly?: boolean
  pending?: { x: number; y: number } | null
  showZones?: boolean
  /** zoneId → count; draws a heat overlay with labels. */
  heat?: Record<string, number> | null
  /** Placement analysis keeps made shots and long misses in their real court areas. */
  placementHeat?: { in: Record<string, number>; long: Record<string, number>; wide: Record<string, number>; net: number } | null
  heatTotal?: number
  className?: string
}

export function Court({ rotation = 0, onTap, disabled = false, points, highlightedPointId = null, emphasizeLast = false, compactMarks, half = 'own', sideLabel, onStrokeDrag, onErrorSelect, onErrorWinner, dragNetOnly = false, pending, showZones = false, heat, placementHeat, heatTotal = 0, className }: CourtProps) {
  const gRef = useRef<SVGGElement>(null)
  const down = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  // the ref is authoritative (pointer events can arrive faster than React re-renders); state drives the drawing
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoveredPlacementCell, setHoveredPlacementCell] = useState<string | null>(null)
  const [placementHoverClient, setPlacementHoverClient] = useState<{ x: number; y: number } | null>(null)
  const [hoveredHeatCell, setHoveredHeatCell] = useState<string | null>(null)
  const [heatHoverClient, setHeatHoverClient] = useState<{ x: number; y: number } | null>(null)
  const interactive = !!onTap
  const hasDrag = !!onStrokeDrag || !!onErrorSelect
  const errorWheelRadius = typeof window !== 'undefined' && window.innerWidth <= 600 ? ERROR_WHEEL_RADIUS * 1.15 : ERROR_WHEEL_RADIUS

  const toCourt = useCallback((clientX: number, clientY: number): { x: number; y: number; net: boolean } | null => {
    const g = gRef.current
    if (!g) return null
    const m = g.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
    // The visible net band is an input target in either recording mode. Its mark is stored on the
    // net line (y = 0), but we preserve which surface was tapped so it can become a Net error.
    const net = p.y >= -NET_BAND && p.y < 0 && Math.abs(p.x) <= COURT.netPostX
    return { ...clampToView(p.x, p.y), net }
  }, [half])

  // Taps are driven by the browser's own `click`: every platform synthesises it for a real tap and
  // withholds it for scrolls/drags/long-press menus, which is exactly the tap-vs-gesture rule we want.
  // We only remember where the pointer went down to reject mouse drags (mouse fires click regardless).
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }
    if (!hasDrag || disabled) return
    const c = toCourt(e.clientX, e.clientY)
    if (!c || (!onErrorSelect && dragNetOnly && !c.net)) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture is a nicety, not a requirement */
    }
    const matrix = gRef.current?.getScreenCTM()
    const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1
    const next: DragState = { start: c, dx: 0, dy: 0, at: { x: e.clientX, y: e.clientY }, cur: c, net: c.net, wheelRadiusPx: errorWheelRadius * scale }
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
    const dragDistance = onErrorSelect ? Math.hypot(dx, dy) : Math.max(Math.abs(dx), Math.abs(dy))
    if (dragDistance < STROKE_DRAG_PX) {
      // too short to mean a direction — fall back to the tap chooser
      onTap?.(d.start.x, d.start.y, { clientX: d.at.x, clientY: d.at.y }, d.net ? 'net' : 'court')
      return
    }
    if (onErrorSelect) {
      const selection = errorWheelSelection(dx, dy, d.wheelRadiusPx)
      if (selection && 'winner' in selection) onErrorWinner?.(d.start.x, d.start.y)
      else if (selection) onErrorSelect(d.start.x, d.start.y, selection.stroke, selection.error, { clientX: d.at.x, clientY: d.at.y })
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
    // Placement mode handles short taps at pointer-up. In errors mode only the net owns a drag,
    // so a regular court press still falls through to the normal tap chooser.
    if (!interactive || disabled || (hasDrag && (onErrorSelect || !dragNetOnly || down.current === null))) return
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
  const rotationTransform = rotation ? `rotate(${rotation} ${PIVOT.x} ${PIVOT.y})` : ''
  const viewTransform = [mirror, rotationTransform].filter(Boolean).join(' ') || undefined
  const quarterTurned = rotation === 90 || rotation === 270
  const pendingZone = pending ? zoneId(zoneFor(pending.x, pending.y)) : null
  const previewStroke: PlacementStroke | null = drag
    ? drag.net
      ? drag.dx < 0 ? 'bh' : 'fh'
      : drag.dy < -STROKE_DRAG_PX && Math.abs(drag.dy) > Math.abs(drag.dx) ? 'serve' : drag.dx < 0 ? 'bh' : 'fh'
    : null

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

  /** Visible FH/BH distribution for every error-map zone; winners and placements never enter it. */
  const heatStrokes = useMemo(() => {
    const counts = new Map<string, { fh: number; bh: number }>()
    if (!heat) return counts
    for (const p of points ?? []) {
      if ((p.outcome ?? 'error') !== 'error' || (p.stroke !== 'fh' && p.stroke !== 'bh')) continue
      const id = zoneId(zoneFor(p.x, p.y))
      const row = counts.get(id) ?? { fh: 0, bh: 0 }
      row[p.stroke]++
      counts.set(id, row)
    }
    return counts
  }, [heat, points])

  /** Ball-type counts per error zone, including legacy errors that have no selected type. */
  const heatShotTypes = useMemo(() => {
    type StrokeCounts = { fh: number; bh: number }
    type ZoneTypes = { counts: Record<ShotType, StrokeCounts>; untyped: StrokeCounts }
    const byZone = new Map<string, ZoneTypes>()
    if (!heat) return byZone
    for (const p of points ?? []) {
      if ((p.outcome ?? 'error') !== 'error' || (p.stroke !== 'fh' && p.stroke !== 'bh')) continue
      const id = zoneId(zoneFor(p.x, p.y))
      const row = byZone.get(id) ?? {
        counts: Object.fromEntries(SHOT_TYPES.map((type) => [type, { fh: 0, bh: 0 }])) as Record<ShotType, StrokeCounts>,
        untyped: { fh: 0, bh: 0 },
      }
      if (isShotType(p.shot_type)) row.counts[p.shot_type][p.stroke]++
      else row.untyped[p.stroke]++
      byZone.set(id, row)
    }
    return byZone
  }, [heat, points])

  const placementSplit = useMemo(() => {
    if (!placementHeat) return null
    const sum = (values: Record<string, number>) => Object.values(values).reduce((total, count) => total + count, 0)
    const inTotal = sum(placementHeat.in)
    const wide = sum(placementHeat.wide)
    const long = sum(placementHeat.long)
    const outTotal = wide + long + placementHeat.net
    const inDepth = (row: 'net' | 'mid' | 'baseline') => Object.entries(placementHeat.in).reduce((total, [id, count]) => total + (id.startsWith(`${row}-`) ? count : 0), 0)
    return {
      inTotal,
      outTotal,
      scored: inTotal + outTotal,
      short: inDepth('net'),
      mid: inDepth('mid'),
      deep: inDepth('baseline'),
      wide,
      long,
      net: placementHeat.net,
    }
  }, [placementHeat])

  // Placement maps are deliberately not a generic 3 × 3 heat map: made balls belong inside the
  // singles lines, while long balls live above the baseline. Wide and net misses remain visible as
  // their × marks in their own areas rather than being blended into an in-court cell.
  const placementHeatCells = useMemo(() => {
    if (!placementHeat) return null
    const cols = [-COURT.singlesHalfWidth, -ZONE_COL_SPLIT, ZONE_COL_SPLIT, COURT.singlesHalfWidth]
    const rows = [0, ZONE_ROW_SPLITS[0], ZONE_ROW_SPLITS[1], COURT.halfLength]
    const max = Math.max(1, ...Object.values(placementHeat.in), ...Object.values(placementHeat.long), ...Object.values(placementHeat.wide), placementHeat.net)
    const cells = ZONE_ROWS.flatMap((row, rowIndex) =>
      ZONE_COLS.map((col, colIndex) => {
        const id = zoneId({ row, col })
        const n = placementHeat.in[id] ?? 0
        return {
          id: `in-${id}`,
          r: { x: cols[colIndex], y: rows[rowIndex], width: cols[colIndex + 1] - cols[colIndex], height: rows[rowIndex + 1] - rows[rowIndex] },
          n,
          fill: placementHeatColor(row === 'net' ? 'short' : row, n / max),
          a: n === 0 ? 0 : 0.52 + 0.36 * (n / max),
        }
      }),
    )
    const longCells = ZONE_COLS.map((col, colIndex) => {
      const id = zoneId({ row: 'baseline', col })
      const n = placementHeat.long[id] ?? 0
      return {
        id: `long-${id}`,
        r: { x: cols[colIndex], y: COURT.halfLength, width: cols[colIndex + 1] - cols[colIndex], height: DRAW_MAX_Y - COURT.halfLength },
        n,
        fill: placementHeatColor('long', n / max),
        a: n === 0 ? 0 : 0.52 + 0.36 * (n / max),
      }
    })
    const wideCells = ZONE_ROWS.flatMap((row, rowIndex) => {
      const y = rows[rowIndex]
      const height = rows[rowIndex + 1] - y
      return [
        { col: 'ad' as const, x: DRAW_MIN_X, width: -COURT.singlesHalfWidth - DRAW_MIN_X },
        { col: 'deuce' as const, x: COURT.singlesHalfWidth, width: DRAW_MAX_X - COURT.singlesHalfWidth },
      ].map(({ col, x, width }) => {
        const id = zoneId({ row, col })
        const n = placementHeat.wide[id] ?? 0
        return { id: `wide-${id}`, r: { x, y, width, height }, n, fill: placementHeatColor('wide', n / max), a: n === 0 ? 0 : 0.52 + 0.36 * (n / max) }
      })
    })
    const netCell = { id: 'net', r: { x: -COURT.singlesHalfWidth, y: -NET_BAND, width: 2 * COURT.singlesHalfWidth, height: NET_BAND }, n: placementHeat.net, fill: placementHeatColor('net', placementHeat.net / max), a: placementHeat.net === 0 ? 0 : 0.52 + 0.36 * (placementHeat.net / max) }
    return [...cells, ...longCells, ...wideCells, netCell]
  }, [placementHeat])

  /** Hovering a placement-map area answers the natural follow-up: which stroke made those marks? */
  const placementHeatStrokes = useMemo(() => {
    const counts = new Map<string, { fh: number; bh: number }>()
    if (!placementHeat) return counts
    for (const p of points ?? []) {
      if (p.stroke !== 'fh' && p.stroke !== 'bh') continue
      const outcome = p.outcome ?? 'error'
      let id: string | null = null
      if (outcome === 'placement') {
        const result = isPlacementResult(p.placement_result) ? p.placement_result : placementResultFor(p.x, p.y)
        const zone = zoneId(zoneFor(p.x, p.y))
        if (result === 'in' || result === 'long' || result === 'wide') id = `${result}-${zone}`
        else if (result === 'net') id = 'net'
      } else if (outcome === 'error' && p.error_type === 'net') {
        id = 'net'
      }
      if (!id) continue
      const row = counts.get(id) ?? { fh: 0, bh: 0 }
      row[p.stroke]++
      counts.set(id, row)
    }
    return counts
  }, [placementHeat, points])
  const hoveredPlacement = placementHeatCells?.find((cell) => cell.id === hoveredPlacementCell) ?? null
  const updatePlacementHover = (id: string, e: ReactPointerEvent<SVGRectElement>) => {
    setHoveredPlacementCell(id)
    setPlacementHoverClient({ x: e.clientX, y: e.clientY })
  }
  const clearPlacementHover = () => {
    setHoveredPlacementCell(null)
    setPlacementHoverClient(null)
  }
  const hoveredHeat = heatCells?.find((cell) => cell.id === hoveredHeatCell) ?? null
  const updateHeatHover = (id: string, e: ReactPointerEvent<SVGRectElement>) => {
    setHoveredHeatCell(id)
    setHeatHoverClient({ x: e.clientX, y: e.clientY })
  }
  const clearHeatHover = () => {
    setHoveredHeatCell(null)
    setHeatHoverClient(null)
  }

  return (
    <>
    <svg
      className={`court-svg${interactive ? ' interactive' : ''}${quarterTurned ? ' quarter-turned' : ''}${className ? ` ${className}` : ''}`}
      viewBox={quarterTurned ? ROTATED_VIEWBOX : VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      role={interactive ? 'button' : 'img'}
      aria-label={interactive ? 'Half tennis court — tap where the point was lost' : 'Half tennis court'}
      onPointerDown={onPointerDown}
      onPointerMove={hasDrag ? onPointerMove : undefined}
      onPointerUp={hasDrag ? endDrag : undefined}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      style={hasDrag ? { touchAction: !onErrorSelect && dragNetOnly ? 'pan-y' : 'none' } : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g ref={gRef} transform={viewTransform}>
        {/* surround + court */}
        <rect x={DRAW_MIN_X} y={VB_MIN_Y} width={DRAW_WIDTH} height={VB_HEIGHT} fill="var(--surround)" />
        <rect x={-COURT.doublesHalfWidth} y={0} width={2 * COURT.doublesHalfWidth} height={COURT.halfLength} fill="var(--court)" />

        {/* whose half this is — dimmed, behind every mark, and always upright */}
        {sideLabel && (
          <g transform={uprightAt(0, VB_MIN_Y + 4.6, half === 'opposite', rotation)} pointerEvents="none">
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
        {/* Keep the placement result areas visible in analysis too: the heat layer then shows
            where balls landed, while the court itself still explains whether that area is in,
            wide, or long. */}
        {(interactive || heat || placementHeat) && half === 'opposite' && (
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
              <g key={label} transform={uprightAt(0, y as number, true, rotation)}>
                <text x={0} y={y as number} fontSize={1.35} fontWeight={800} textAnchor="middle" fill="#ffffff" opacity={0.28} fontFamily="var(--font)" letterSpacing={0.2}>{label}</text>
              </g>
            ))}
            <g transform={uprightAt(-19.8, 19.5, true, rotation)}><text x={-19.8} y={19.5} fontSize={1.15} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.5} fontFamily="var(--font)" transform="rotate(-90 -19.8 19.5)">WIDE</text></g>
            <g transform={uprightAt(19.8, 19.5, true, rotation)}><text x={19.8} y={19.5} fontSize={1.15} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.5} fontFamily="var(--font)" transform="rotate(90 19.8 19.5)">WIDE</text></g>
            <g transform={uprightAt(0, 45, true, rotation)}><text x={0} y={45} fontSize={1.35} fontWeight={800} textAnchor="middle" fill="#704018" opacity={0.52} fontFamily="var(--font)" letterSpacing={0.18}>LONG</text></g>
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
            {heatCells.map((c) => {
              const hovered = c.id === hoveredHeatCell
              return (
                <rect
                  key={c.id}
                  x={c.r.x}
                  y={c.r.y}
                  width={c.r.width}
                  height={c.r.height}
                  fill={c.fill}
                  fillOpacity={hovered ? Math.min(1, c.a + 0.14) : c.a}
                  stroke={hovered ? '#ffffff' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={hovered ? 0.5 : 0.15}
                  style={{ cursor: 'help' }}
                  onPointerEnter={(e) => updateHeatHover(c.id, e)}
                  onPointerMove={(e) => updateHeatHover(c.id, e)}
                  onPointerLeave={clearHeatHover}
                />
              )
            })}
          </g>
        )}
        {placementHeatCells && (
          <g>
            {placementHeatCells.map((c) => {
              const strokes = placementHeatStrokes.get(c.id) ?? { fh: 0, bh: 0 }
              const hovered = c.id === hoveredPlacementCell
              return (
                <rect
                  key={c.id}
                  x={c.r.x}
                  y={c.r.y}
                  width={c.r.width}
                  height={c.r.height}
                  fill={c.fill}
                  fillOpacity={hovered ? Math.min(1, c.a + 0.18) : c.a}
                  stroke={hovered ? "#ffffff" : "rgba(255,255,255,0.48)"}
                  strokeWidth={hovered ? 0.58 : 0.2}
                  style={{ cursor: 'help' }}
                  onPointerEnter={(e) => updatePlacementHover(c.id, e)}
                  onPointerMove={(e) => updatePlacementHover(c.id, e)}
                  onPointerLeave={clearPlacementHover}
                >
                  <title>FH {strokes.fh} · BH {strokes.bh}</title>
                </rect>
              )
            })}
          </g>
        )}

        {/* live drag: the press point is the placement, the direction picks the stroke */}
        {drag && onStrokeDrag && !onErrorSelect && (
          <g pointerEvents="none">
            <line
              x1={drag.start.x}
              y1={drag.start.y}
              x2={drag.cur.x}
              y2={drag.cur.y}
              stroke={Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) < STROKE_DRAG_PX ? 'rgba(255,255,255,0.7)' : `var(--${previewStroke})`}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
            <circle cx={drag.start.x} cy={drag.start.y} r={1.5} fill="none" stroke="#ffffff" strokeWidth={0.4} />
            {Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) >= STROKE_DRAG_PX && (
              <g transform={uprightAt(drag.cur.x, drag.cur.y, half === 'opposite', rotation)}>
                <circle cx={drag.cur.x} cy={drag.cur.y} r={2.4} fill={`var(--${previewStroke})`} />
                <text
                  x={drag.cur.x}
                  y={drag.cur.y + 0.85}
                  fontSize={2.4}
                  fontWeight={800}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontFamily="var(--font)"
                >
                  {previewStroke === 'serve' ? 'S' : previewStroke === 'bh' ? 'BH' : 'FH'}
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
          <rect
            x={-COURT.netPostX}
            y={-NET_BAND}
            width={2 * COURT.netPostX}
            height={NET_BAND}
            fill={heat || placementHeat ? '#f1a65c' : '#1c1f26'}
            opacity={heat || placementHeat ? 1 : 0.85}
          />
          <line x1={-COURT.netPostX} y1={-NET_BAND} x2={COURT.netPostX} y2={-NET_BAND} stroke="#ffffff" strokeWidth={0.45} />
          <rect x={-COURT.netPostX - 0.4} y={-NET_BAND - 0.3} width={0.8} height={NET_BAND + 0.6} fill="#1c1f26" />
          <rect x={COURT.netPostX - 0.4} y={-NET_BAND - 0.3} width={0.8} height={NET_BAND + 0.6} fill="#1c1f26" />
        </g>

        {/* The visible net paints over the heat cell, so give it its own hover target in stats. */}
        {placementHeatCells && (() => {
          const net = placementHeatCells.find((cell) => cell.id === 'net')
          if (!net) return null
          const strokes = placementHeatStrokes.get('net') ?? { fh: 0, bh: 0 }
          return (
            <rect
              x={net.r.x}
              y={net.r.y}
              width={net.r.width}
              height={net.r.height}
              fill="rgba(0,0,0,0.001)"
              style={{ cursor: 'help' }}
              onPointerEnter={(e) => updatePlacementHover('net', e)}
              onPointerMove={(e) => updatePlacementHover('net', e)}
              onPointerLeave={clearPlacementHover}
            >
              <title>FH {strokes.fh} · BH {strokes.bh}</title>
            </rect>
          )
        })()}

        {/* The net itself is a deliberately large target in both recording modes. */}
        {(interactive || heat || placementHeat) && (
          <g pointerEvents="none">
            <defs>
              <pattern id="net-error-mesh" width="1.2" height="1.2" patternUnits="userSpaceOnUse">
                <rect width="1.2" height="1.2" fill="#f1a65c" />
                <path d="M-0.3 0.3L0.3 -0.3M0 1.2L1.2 0M0.9 1.5L1.5 0.9M-0.3 0.9L0.3 1.5M0 0L1.2 1.2M0.9 -0.3L1.5 0.3" stroke="rgba(126, 68, 18, 0.72)" strokeWidth="0.12" />
              </pattern>
            </defs>
            <rect x={-COURT.netPostX} y={-NET_BAND} width={2 * COURT.netPostX} height={NET_BAND} fill="url(#net-error-mesh)" />
            <g transform={uprightAt(0, -NET_BAND / 2, half === 'opposite', rotation)}>
              <text x={0} y={-0.9} fontSize={0.9} fontWeight={800} textAnchor="middle" fill="#55300e" fontFamily="var(--font)" letterSpacing={0.16}>
                NET
              </text>
            </g>
          </g>
        )}

        {/* Logged points sit below analysis labels, so aggregate values remain legible even in
            dense zones. The live drag wheel and pending mark still render above both layers. */}
        {points && points.length > 0 && (
          <g pointerEvents="none">
            {points.map((p) => (
              <Marker
                key={p.id}
                p={p}
                rotation={rotation}
                compact={compactMarks ?? (newestId !== null && p.id !== newestId ? 'past' : undefined)}
                selected={p.id === highlightedPointId}
              />
            ))}
          </g>
        )}

        {/* heat labels stay upright in every rotated view */}
        {heatCells && (
          <g fontFamily="var(--font)" fontWeight={800} textAnchor="middle" pointerEvents="none">
            {heatCells.map((c) => {
              const cx = c.r.x + c.r.width / 2
              const cy = c.r.y + c.r.height / 2
              const pctLabel = heatTotal > 0 ? `${Math.round((c.n / heatTotal) * 100)}%` : '0%'
              const strokes = heatStrokes.get(c.id) ?? { fh: 0, bh: 0 }
              const strokeTotal = strokes.fh + strokes.bh
              return (
                <g key={c.id} transform={uprightAt(cx, cy, half === 'opposite', rotation)}>
                  {c.n > 0 && (
                    <text x={cx} y={cy + 0.74} fontSize={2.55} fill="rgba(255,255,255,0.46)">
                      {pctLabel} · {c.n}
                    </text>
                  )}
                  {strokeTotal > 0 && (
                    <text x={cx} y={cy + 2.65} fontSize={0.94} fill="rgba(255,255,255,0.5)">
                      FH {Math.round((strokes.fh / strokeTotal) * 100)}% ({strokes.fh}) · BH {Math.round((strokes.bh / strokeTotal) * 100)}% ({strokes.bh})
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )}
        {placementHeatCells && (
          <g fontFamily="var(--font)" fontWeight={800} textAnchor="middle" pointerEvents="none">
            {placementHeatCells.filter((c) => c.n > 0).map((c) => {
              const cx = c.r.x + c.r.width / 2
              const cy = c.r.y + c.r.height / 2
              const parentTotal = c.id.startsWith('in-') ? placementSplit?.inTotal ?? 0 : placementSplit?.outTotal ?? 0
              const pctLabel = parentTotal > 0 ? `${Math.round((c.n / parentTotal) * 100)}%` : ''
              const inCourt = c.id.startsWith('in-')
              const textColor = c.id === 'net' ? '#ffffff' : inCourt ? '#155d32' : '#8b220f'
              const strokes = placementHeatStrokes.get(c.id) ?? { fh: 0, bh: 0 }
              const strokeTotal = strokes.fh + strokes.bh
              const mainSize = c.id === 'net' ? 1.15 : 1.65
              const circleRadius = c.id === 'net' ? 0.78 : 1.05
              const circleX = cx + (c.id === 'net' ? 0.82 : 1.15)
              return (
                <g key={c.id} transform={uprightAt(cx, cy, half === 'opposite', rotation)}>
                  <text x={cx - 0.25} y={cy + mainSize * 0.3} textAnchor="end" fontSize={mainSize} fill={textColor}>{pctLabel}</text>
                  <circle cx={circleX} cy={cy} r={circleRadius} fill="rgba(255,255,255,0.28)" stroke={textColor} strokeWidth={0.16} />
                  <text x={circleX} y={cy + mainSize * 0.3} fontSize={mainSize} fill={textColor}>{c.n}</text>
                  {strokeTotal > 0 && (
                    <text x={cx} y={cy + (c.id === 'net' ? 1.45 : 1.85)} fontSize={c.id === 'net' ? 0.48 : 0.57}>
                      <tspan fill="var(--fh-text)">FH {Math.round((strokes.fh / strokeTotal) * 100)}% ({strokes.fh})</tspan>
                      <tspan fill={c.id === 'net' ? '#ffffff' : '#5b6672'}> · </tspan>
                      <tspan fill="var(--bh-text)">BH {Math.round((strokes.bh / strokeTotal) * 100)}% ({strokes.bh})</tspan>
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )}
        {/* Error selection stays above the court, net, and existing marks while the finger moves. */}
        {drag && onErrorSelect && (
          (() => {
            const selection = errorWheelSelection(drag.dx, drag.dy, drag.wheelRadiusPx)
            const winner = !!selection && 'winner' in selection
            const selected = selection && !('winner' in selection) ? selection : null
            return <ErrorDragWheel x={drag.start.x} y={drag.start.y} radius={errorWheelRadius} rotation={rotation} selected={selected} winner={winner} />
          })()
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
    {placementSplit && placementSplit.scored > 0 && (
      <div className="placement-split" aria-label="In and out placement breakdown">
        <div className="placement-split-group in">
          <div><span>IN</span><strong>{Math.round((placementSplit.inTotal / placementSplit.scored) * 100)}%</strong></div>
          <small>
            Short {placementSplit.inTotal ? Math.round((placementSplit.short / placementSplit.inTotal) * 100) : 0}% · Mid {placementSplit.inTotal ? Math.round((placementSplit.mid / placementSplit.inTotal) * 100) : 0}% · Deep {placementSplit.inTotal ? Math.round((placementSplit.deep / placementSplit.inTotal) * 100) : 0}%
          </small>
        </div>
        <div className="placement-split-group out">
          <div><span>OUT</span><strong>{Math.round((placementSplit.outTotal / placementSplit.scored) * 100)}%</strong></div>
          <small>
            Wide {placementSplit.outTotal ? Math.round((placementSplit.wide / placementSplit.outTotal) * 100) : 0}% · Long {placementSplit.outTotal ? Math.round((placementSplit.long / placementSplit.outTotal) * 100) : 0}% · Net {placementSplit.outTotal ? Math.round((placementSplit.net / placementSplit.outTotal) * 100) : 0}%
          </small>
        </div>
      </div>
    )}
    {hoveredPlacement && placementHoverClient && (
      <div className="court-hover-tooltip" style={{ left: placementHoverClient.x + 14, top: placementHoverClient.y + 14 }}>
        <div>
          <span className="fh">FH {placementHeatStrokes.get(hoveredPlacement.id)?.fh ?? 0}</span>
          <span className="sep"> · </span>
          <span className="bh">BH {placementHeatStrokes.get(hoveredPlacement.id)?.bh ?? 0}</span>
        </div>
        <small>{hoveredPlacement.n} mark{hoveredPlacement.n === 1 ? '' : 's'} in this area</small>
      </div>
    )}
    {hoveredHeat && heatHoverClient && (() => {
      const zoneTypes = heatShotTypes.get(hoveredHeat.id)
      const typed = zoneTypes ? SHOT_TYPES.filter((type) => zoneTypes.counts[type].fh + zoneTypes.counts[type].bh > 0) : []
      const untypedTotal = zoneTypes ? zoneTypes.untyped.fh + zoneTypes.untyped.bh : 0
      return (
        <div className="court-hover-tooltip ball-type-tooltip" style={{ left: heatHoverClient.x + 14, top: heatHoverClient.y + 14 }}>
          <div className="ball-type-chart-head" aria-hidden="true">
            <span>Type</span>
            <span className="fh">FH</span>
            <span className="bh">BH</span>
            <span>All</span>
          </div>
          {typed.map((type) => (
            <div className="ball-type-row" key={type}>
              <span>{SHOT_TYPE_LABEL[type]}</span>
              <strong className="fh">{zoneTypes!.counts[type].fh}</strong>
              <strong className="bh">{zoneTypes!.counts[type].bh}</strong>
              <strong>{zoneTypes!.counts[type].fh + zoneTypes!.counts[type].bh}</strong>
            </div>
          ))}
          {untypedTotal > 0 && (
            <div className="ball-type-row muted">
              <span>Not selected</span>
              <strong className="fh">{zoneTypes!.untyped.fh}</strong>
              <strong className="bh">{zoneTypes!.untyped.bh}</strong>
              <strong>{untypedTotal}</strong>
            </div>
          )}
          {typed.length === 0 && untypedTotal === 0 && <small>No errors in this area</small>}
        </div>
      )
    })()}
    </>
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

/** The analysis map reuses the same region language as the marking court. */
function placementHeatColor(area: 'short' | 'net' | 'mid' | 'baseline' | 'wide' | 'long', t: number): string {
  const base: Record<typeof area, [number, number, number]> = {
    short: [114, 184, 151],
    net: [241, 166, 92],
    mid: [105, 161, 203],
    baseline: [124, 146, 206],
    wide: [248, 202, 145],
    long: [245, 184, 117],
  }
  const source = base[area]
  const k = Math.max(0, Math.min(1, t))
  const pale = source.map((v) => Math.round(242 + (v - 242) * 0.48))
  const deep = source.map((v) => Math.round(v * 0.72))
  const c = pale.map((v, i) => Math.round(v + (deep[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

/** Zone rectangles cover the data area (VIEW); crop them to what is actually drawn. */
function clampRect(r: { x: number; y: number; width: number; height: number }) {
  const x = Math.max(DRAW_MIN_X, r.x)
  const y = Math.max(VB_MIN_Y, r.y)
  return { x, y, width: Math.min(DRAW_MAX_X, r.x + r.width) - x, height: Math.min(DRAW_MAX_Y, r.y + r.height) - y }
}

function Marker({ p: pt, rotation, compact, selected = false }: { p: Point; rotation: CourtRotation; compact?: 'past' | 'analysis' | 'overview'; selected?: boolean }) {
  const p = { ...pt, x: drawX(pt.x), y: drawY(pt.y) }
  const stroke = isPlacementStroke(p.stroke) ? p.stroke : 'fh'
  const error = isErrorType(p.error_type) ? p.error_type : 'long'
  const color = `var(--${stroke})`
  const ink = `var(--${stroke}-ink)`
  // placements only: a ball past the singles lines was called out
  const out = p.outcome === 'placement' && p.stroke !== 'serve' && isOut(pt.x, pt.y)
  const net = error === 'net'
  const miss = p.outcome === 'error' || out
  const label = markLabel(p.outcome === 'winner' ? '' : stroke, error, p.forced, p.outcome, out, p.placement_result)

  // Previous points are positional context only. Keep them visible without letting their symbols,
  // letters, or outlines compete with the newest mark.
  if (compact && !selected) {
    const overview = compact === 'overview'
    const compactRadius = overview ? 0.56 : 0.45
    const compactOpacity = overview ? 0.76 : 0.62
    return (
      <g transform={uprightAt(p.x, p.y, false, rotation)}>
        <title>{label}</title>
        {miss ? (
          <g stroke={color} strokeWidth={0.34} strokeLinecap="round">
            <line x1={p.x - compactRadius} y1={p.y - compactRadius} x2={p.x + compactRadius} y2={p.y + compactRadius} />
            <line x1={p.x - compactRadius} y1={p.y + compactRadius} x2={p.x + compactRadius} y2={p.y - compactRadius} />
          </g>
        ) : (
          <circle cx={p.x} cy={p.y} r={compactRadius} fill={p.outcome === 'winner' ? 'var(--win)' : color} opacity={compactOpacity} />
        )}
      </g>
    )
  }

  const r = 1.4
  const a = r * 0.9
  return (
    <g transform={uprightAt(p.x, p.y, false, rotation)}>
      <title>{label}</title>
      {selected && (
        <g aria-hidden="true">
          <circle cx={p.x} cy={p.y} r={2.45} fill="rgba(255,255,255,0.42)" stroke="#ffffff" strokeWidth={0.42}>
            <animate attributeName="r" values="2.15;2.75;2.15" dur="1.05s" repeatCount="indefinite" />
          </circle>
          <circle cx={p.x} cy={p.y} r={2.8} fill="none" stroke="var(--mark-outline)" strokeWidth={0.22} />
        </g>
      )}
      {/* colour carries her stroke; a dark outline marks a forced error. A winner is the opponent's
          shot, so it is a green diamond with no stroke colour at all. */}
      {net ? (
        <g strokeLinecap="round">
          <g stroke="#ffffff" strokeWidth={1} opacity={0.85}>
            <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
            <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
          </g>
          <g stroke={color} strokeWidth={0.55}>
            <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
            <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
          </g>
        </g>
      ) : p.outcome === 'placement' ? (
        out ? (
          // the umpire's call: a ball outside the singles lines is a cross, never a solid dot
          <g strokeLinecap="round">
            <g stroke="#ffffff" strokeWidth={1} opacity={0.85}>
              <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
              <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
            </g>
            <g stroke={color} strokeWidth={0.55}>
              <line x1={p.x - a} y1={p.y - a} x2={p.x + a} y2={p.y + a} />
              <line x1={p.x - a} y1={p.y + a} x2={p.x + a} y2={p.y - a} />
            </g>
          </g>
        ) : (
          <circle cx={p.x} cy={p.y} r={r * 0.82} fill={color} stroke="#ffffff" strokeWidth={0.26} />
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
          strokeWidth={0.32}
          transform={`rotate(45 ${p.x} ${p.y})`}
        />
      ) : (
        <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={p.forced ? 'var(--mark-outline)' : 'none'} strokeWidth={p.forced ? 0.36 : 0} />
      )}
      {p.outcome !== 'placement' && !net && (
      <text
        x={p.x}
        y={p.y + 0.54}
        fontSize={1.55}
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
