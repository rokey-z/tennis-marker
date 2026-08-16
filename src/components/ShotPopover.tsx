import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, type ErrorType, type Stroke } from '../domain/types'
import { StrokeTag, markLabel } from './marks'
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
  onPick: (stroke: Stroke, error: ErrorType) => void
  onCancel: () => void
}

/** Gap between the tapped spot and the popover so the ghost marker stays visible. */
const OFFSET = 16
const EDGE = 6

/**
 * Compact chooser anchored at the tap: two rows (FH / BH) × Long / Net / Wide, plus a Forced toggle.
 * Placed below the tap when there is room, otherwise above; clamped inside the container.
 */
export function ShotPopover({ anchor, containerRef, where, forced, onForcedChange, onPick, onCancel }: ShotPopoverProps) {
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
  }, [anchor.clientX, anchor.clientY, containerRef])

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
        aria-label="Log the lost point"
        style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { left: 0, top: 0, visibility: 'hidden' }}
      >
        <div className="pop-head">
          <div className="where">{where}</div>
          <button type="button" className={`forced-toggle${forced ? ' on' : ''}`} aria-pressed={forced} onClick={() => onForcedChange(!forced)} title="Mark as a forced error">
            Forced
          </button>
          <button type="button" className="pop-close" aria-label="Cancel" onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>
        {/* BH column on the left, FH on the right — like the court for a right-hander; rows = Long / Net / Wide */}
        <div className="pop-grid">
          {ERROR_TYPES.map((err) => (
            <PopRowPair key={err} err={err} onPick={onPick} />
          ))}
        </div>
      </div>
    </>
  )
}

const COLUMNS: Stroke[] = ['bh', 'fh']

function PopRowPair({ err, onPick }: { err: ErrorType; onPick: (s: Stroke, e: ErrorType) => void }) {
  return (
    <>
      {COLUMNS.map((stroke) => (
        <button key={stroke} type="button" className={`pop-btn ${stroke}`} onClick={() => onPick(stroke, err)} aria-label={`${STROKE_LABEL[stroke]} ${ERROR_LABEL[err]}`} title={markLabel(stroke, err, false)}>
          <StrokeTag stroke={stroke} />
          <span className="pop-err">{ERROR_LABEL[err]}</span>
        </button>
      ))}
    </>
  )
}
