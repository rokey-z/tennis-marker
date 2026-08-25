/**
 * Court geometry. All numbers are feet, in the player's frame:
 * x: 0 = center line, +x = deuce side (her right when facing the net), -x = ad side
 * y: 0 = net, 39 = baseline, y > 39 = behind the baseline
 */
export const COURT = {
  halfLength: 39,
  serviceLine: 21,
  singlesHalfWidth: 13.5,
  doublesHalfWidth: 18,
  netPostX: 21,
  sideMargin: 6,
  backMargin: 12,
  centerMarkLength: 0.33,
} as const

/** Drawn / tappable area (SVG viewBox), in feet. */
export const VIEW = {
  minX: -(COURT.doublesHalfWidth + COURT.sideMargin), // -24
  minY: 0,
  width: 2 * (COURT.doublesHalfWidth + COURT.sideMargin), // 48
  height: COURT.halfLength + COURT.backMargin, // 51
} as const

export const VIEW_MAX_X = VIEW.minX + VIEW.width // 24
export const VIEW_MAX_Y = VIEW.minY + VIEW.height // 51

/** Maximum regulation tennis-ball radius (2.70 in diameter), expressed in feet. */
export const BALL_RADIUS = 1.35 / 12

/** Center of the drawn area — the pivot for the 180° "flip ends" rotation. */
export const FLIP_CENTER = { x: VIEW.minX + VIEW.width / 2, y: VIEW.minY + VIEW.height / 2 } as const

/** Zone grid — tunable. Columns use singles-court thirds; rows split at the service line and 5 ft inside the baseline. */
export const ZONE_COL_SPLIT = COURT.singlesHalfWidth / 3 // 4.5
export const ZONE_ROW_SPLITS = [COURT.serviceLine, COURT.halfLength - 5] as const // [21, 34]

export type ZoneCol = 'ad' | 'middle' | 'deuce'
export type ZoneRow = 'net' | 'mid' | 'baseline'
export interface Zone {
  col: ZoneCol
  row: ZoneRow
}

export const ZONE_COLS: readonly ZoneCol[] = ['ad', 'middle', 'deuce']
export const ZONE_ROWS: readonly ZoneRow[] = ['net', 'mid', 'baseline']

export const ZONE_COL_LABEL: Record<ZoneCol, string> = { ad: 'Ad side', middle: 'Middle', deuce: 'Deuce side' }
export const ZONE_ROW_LABEL: Record<ZoneRow, string> = { net: 'Net', mid: 'Mid-court', baseline: 'Baseline' }

export function zoneFor(x: number, y: number): Zone {
  const col: ZoneCol = x < -ZONE_COL_SPLIT ? 'ad' : x > ZONE_COL_SPLIT ? 'deuce' : 'middle'
  const row: ZoneRow = y < ZONE_ROW_SPLITS[0] ? 'net' : y < ZONE_ROW_SPLITS[1] ? 'mid' : 'baseline'
  return { col, row }
}

export function zoneId(z: Zone): string {
  return `${z.row}-${z.col}`
}

export function zoneFromId(id: string): Zone {
  const [row, col] = id.split('-') as [ZoneRow, ZoneCol]
  return { row, col }
}

export function describeZone(z: Zone): string {
  return `${ZONE_ROW_LABEL[z.row]} · ${ZONE_COL_LABEL[z.col].toLowerCase()}`
}

/**
 * A placement is where the BALL LANDED, not where the player stood, so it is described by depth
 * from the net rather than by the court region a player occupies.
 */
export const DEPTH_LABEL: Record<ZoneRow, string> = { net: 'Short', mid: 'Mid', baseline: 'Deep' }

/**
 * Whether a ball landed outside the singles court — the umpire's "out" call. The stored coordinate
 * is the ball's center, so a center up to one ball radius beyond a boundary is still in when the
 * ball touches the line. Singles lines are the ones that count for her matches.
 */
export function isOut(x: number, y: number): boolean {
  return Math.abs(x) > COURT.singlesHalfWidth + BALL_RADIUS || y > COURT.halfLength + BALL_RADIUS
}

/** Placement result inferred from the landing location, excluding a net strike (the UI detects that surface). */
export function placementResultFor(x: number, y: number): 'in' | 'wide' | 'long' {
  if (Math.abs(x) > COURT.singlesHalfWidth + BALL_RADIUS) return 'wide'
  return y > COURT.halfLength + BALL_RADIUS ? 'long' : 'in'
}

export function describeLanding(x: number, y: number): string {
  const z = zoneFor(x, y)
  // the out call rides on the mark itself (see components/marks), so this stays pure position
  return `${DEPTH_LABEL[z.row]} · ${ZONE_COL_LABEL[z.col].toLowerCase()}`
}

/** One description helper for both kinds of mark, so callers never mix the two vocabularies. */
export function describeMark(x: number, y: number, outcome: 'error' | 'winner' | 'player_winner' | 'winning_serve' | 'placement'): string {
  return outcome === 'placement' ? describeLanding(x, y) : describeZone(zoneFor(x, y))
}

/** Rectangle covering a zone in view coordinates (feet), for heat-map overlays. */
export function zoneRect(z: Zone): { x: number; y: number; width: number; height: number } {
  const colBounds: Record<ZoneCol, [number, number]> = {
    ad: [VIEW.minX, -ZONE_COL_SPLIT],
    middle: [-ZONE_COL_SPLIT, ZONE_COL_SPLIT],
    deuce: [ZONE_COL_SPLIT, VIEW_MAX_X],
  }
  const rowBounds: Record<ZoneRow, [number, number]> = {
    net: [VIEW.minY, ZONE_ROW_SPLITS[0]],
    mid: [ZONE_ROW_SPLITS[0], ZONE_ROW_SPLITS[1]],
    baseline: [ZONE_ROW_SPLITS[1], VIEW_MAX_Y],
  }
  const [x0, x1] = colBounds[z.col]
  const [y0, y1] = rowBounds[z.row]
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function isInsideView(x: number, y: number): boolean {
  return x >= VIEW.minX && x <= VIEW_MAX_X && y >= VIEW.minY && y <= VIEW_MAX_Y
}

export function clampToView(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(VIEW_MAX_X, Math.max(VIEW.minX, x)),
    y: Math.min(VIEW_MAX_Y, Math.max(VIEW.minY, y)),
  }
}

/** 180° rotation about the view center: what the parent sees when she plays the far end. */
export function flipPoint(x: number, y: number): { x: number; y: number } {
  return { x: 2 * FLIP_CENTER.x - x, y: 2 * FLIP_CENTER.y - y }
}

/** Round to a sane precision for storage (0.1 ft). */
export function roundFeet(v: number): number {
  return Math.round(v * 10) / 10
}
