import type { ErrorType, Stroke } from './types'

export interface ErrorDragChoice {
  stroke: Stroke
  error: ErrorType
}

export type ErrorWheelSelection = ErrorDragChoice | { winner: true }

const ERROR_DRAG_PX = 26

/** Six directional sectors, matching the wheel clockwise from upper-left. */
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

/** Moving past the visible wheel boundary is the fast gesture for an opponent winner. */
export function errorWheelSelection(dx: number, dy: number, wheelRadiusPx: number): ErrorWheelSelection | null {
  if (Math.hypot(dx, dy) > wheelRadiusPx) return { winner: true }
  return errorDragChoice(dx, dy)
}
