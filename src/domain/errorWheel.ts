import type { ErrorType, Stroke } from './types'

export interface ErrorDragChoice {
  stroke: Stroke
  error: ErrorType
}

export type ErrorWheelSelection = ErrorDragChoice | { winner: true }

const ERROR_DRAG_PX = 26

/** Six directional targets, matching the visible balls clockwise from upper-left. */
export function errorDragChoice(dx: number, dy: number): ErrorDragChoice | null {
  if (Math.hypot(dx, dy) < ERROR_DRAG_PX) return null
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  if (angle >= -135 && angle < -90) return { stroke: 'bh', error: 'wide' }
  if (angle >= -90 && angle < -45) return { stroke: 'fh', error: 'wide' }
  if (angle >= -45 && angle < 45) return { stroke: 'fh', error: 'long' }
  if (angle >= 45 && angle < 90) return { stroke: 'fh', error: 'net' }
  if (angle >= 90 && angle < 135) return { stroke: 'bh', error: 'net' }
  return { stroke: 'bh', error: 'long' }
}

/**
 * The opponent-winner target sits beyond the two Wide balls at twelve o'clock.
 * Crossing the wheel elsewhere keeps the chosen error instead of silently changing the result.
 */
export function errorWheelSelection(dx: number, dy: number, wheelRadiusPx: number): ErrorWheelSelection | null {
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  if (Math.hypot(dx, dy) > wheelRadiusPx && Math.abs(angle + 90) <= 20) return { winner: true }
  return errorDragChoice(dx, dy)
}
