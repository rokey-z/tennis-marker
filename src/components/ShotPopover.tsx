import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ErrorType, Stroke } from '../domain/types'
import { ShotGrid } from './marks'
import { CloseIcon } from './Icons'

export interface ShotPopoverProps {
  /** Screen position of the tap; the popover is placed next to it. */
  anchor: { clientX: number; clientY: number }
  /** The positioned container the popover lives in (position: relative). */
  containerRef: RefObject<HTMLElement | null>
  /** e.g. "Baseline · deuce side" */
  where: string
  forced: boolean
  onForcedChange: (forced: boolean) => void
  /** Winner mode: the grid offers one button per stroke instead of the error types. */
  winner: boolean
  onWinnerChange: (winner: boolean) => void
  onPick: (stroke: Stroke, error: ErrorType) => void
  onPickWinner: (stroke: Stroke) => void
  /** Placement mode fallback for a tap: just the two strokes. */
  strokeOnly?: boolean
  onCancel: () => void
}

/** Gap between the tapped spot and the popover so the ghost marker stays visible. */
const OFFSET = 16
const EDGE = 6

/**
 * Compact chooser anchored at the tap: two rows (FH / BH) × Long / Net / Wide, plus a Forced toggle.
 * Placed below the tap when there is room, otherwise above; clamped inside the container.
 */
export function ShotPopover({ anchor, containerRef, where, forced, onForcedChange, winner, onWinnerChange, onPick, onPickWinner, strokeOnly = false, onCancel }: ShotPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'below' | 'above' } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const container = containerRef.current
    if (!el || !container) return
    const c = container.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const x = anchor.clientX - c.left
    const y = anchor.clientY - c.top
    let left = x - w / 2
    left = Math.max(EDGE, Math.min(c.width - w - EDGE, left))
    const fitsBelow = y + OFFSET + h <= c.height - EDGE
    const fitsAbove = y - OFFSET - h >= EDGE
    let top: number
    let placement: 'below' | 'above'
    if (fitsBelow) {
      top = y + OFFSET
      placement = 'below'
    } else if (fitsAbove) {
      top = y - OFFSET - h
      placement = 'above'
    } else {
      // container shorter than the popover: pin to whichever side has more room
      placement = y > c.height / 2 ? 'above' : 'below'
      top = Math.max(EDGE, Math.min(c.height - h - EDGE, placement === 'below' ? y + OFFSET : y - OFFSET - h))
    }
    setPos({ left, top, placement })
  }, [anchor.clientX, anchor.clientY, containerRef, winner])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <>
      {/* tap anywhere else on the court to cancel */}
      <div className="pop-backdrop" onClick={onCancel} />
      <div
        ref={ref}
        className={`shot-pop ${pos?.placement ?? 'below'}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Log the point at ${where}`}
        style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { left: 0, top: 0, visibility: 'hidden' }}
      >
        <button type="button" className="pop-close" aria-label="Cancel" onClick={onCancel}>
          <CloseIcon />
        </button>
        {!strokeOnly && (
          <div className="pop-toggles">
            <button
              type="button"
              className={`forced-toggle${forced ? ' on' : ''}`}
              aria-pressed={forced}
              onClick={() => {
                onForcedChange(!forced)
                if (!forced) onWinnerChange(false)
              }}
              title="She was forced into this error"
            >
              Forced
            </button>
            <button
              type="button"
              className={`winner-toggle${winner ? ' on' : ''}`}
              aria-pressed={winner}
              onClick={() => {
                onWinnerChange(!winner)
                if (!winner) onForcedChange(false)
              }}
              title="She hit a winner here"
            >
              ★ Winner
            </button>
          </div>
        )}
        <ShotGrid forced={forced} winner={winner} strokeOnly={strokeOnly} onPick={onPick} onPickWinner={onPickWinner} />
      </div>
    </>
  )
}
