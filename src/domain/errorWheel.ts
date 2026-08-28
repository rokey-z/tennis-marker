import type { ErrorType, Stroke } from './types'

export interface ErrorDragChoice {
  stroke: Stroke
  error: ErrorType
}

export type ErrorWheelSelection = ErrorDragChoice | { winner: true }

const ERROR_DRAG_PX = 26

/** Six evenly spaced screen directions, clockwise from upper-left. */
export const ERROR_WHEEL_TARGETS: ReadonlyArray<ErrorDragChoice & { angle: number }> = [
  { stroke: 'bh', error: 'wide', angle: -120 },
  { stroke: 'fh', error: 'wide', angle: -60 },
  { stroke: 'fh', error: 'long', angle: 0 },
  { stroke: 'fh', error: 'net', angle: 60 },
  { stroke: 'bh', error: 'net', angle: 120 },
  { stroke: 'bh', error: 'long', angle: 180 },
]

/** Six directional targets, matching the visible balls clockwise from upper-left. */
export function errorDragChoice(dx: number, dy: number): ErrorDragChoice | null {
  if (Math.hypot(dx, dy) < ERROR_DRAG_PX) return null
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const target = ERROR_WHEEL_TARGETS.reduce((closest, candidate) => {
    const closestDistance = Math.abs(((angle - closest.angle + 540) % 360) - 180)
    const candidateDistance = Math.abs(((angle - candidate.angle + 540) % 360) - 180)
    return candidateDistance <= closestDistance ? candidate : closest
  })
  return { stroke: target.stroke, error: target.error }
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
