import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ERROR_LABEL, SHOT_TYPE_GROUPS, SHOT_TYPE_LABEL, STROKE_SHORT, WINNER_SERVE_TYPES, type ErrorType, type PlacementStroke, type PointShotType, type ShotType, type Stroke } from '../domain/types'
import { ShotGrid } from './marks'
import { capitalise, type PlayerWords } from '../domain/session'
import { CloseIcon } from './Icons'
import { WinnerStrokeToggle } from './WinnerStrokeToggle'

export interface ShotPopoverProps {
  /** Screen position of the tap; the popover is placed next to it. */
  anchor: { clientX: number; clientY: number }
  /** The positioned container the popover lives in (position: relative). */
  containerRef: RefObject<HTMLElement | null>
  /** e.g. "Baseline · deuce side" */
  where: string
  forced: boolean
  onForcedChange: (forced: boolean) => void
  onPick: (stroke: Stroke, error: ErrorType, shotType?: ShotType) => void
  /** A drag wheel has already chosen FH/BH × Wide/Long/Net; open directly on ball type. */
  initialErrorPick?: { stroke: Stroke; error: ErrorType } | null
  /** The opponent hit a winner: nothing of hers to pick, so this logs the point straight away. */
  onWinner: () => void
  /** A long press opens directly on Lily's winner details instead of the error chooser. */
  winnerOnly?: boolean
  onPlayerWinner?: (stroke: PlacementStroke, shotType: PointShotType) => void
  /** Placement mode fallback for a tap: just the two strokes. */
  strokeOnly?: boolean
  /** How to name the player in the tooltips. */
  player: PlayerWords
  onCancel: () => void
}

/** Gap between the tapped spot and the popover so the ghost marker stays visible. */
const OFFSET = 16
const EDGE = 6

/**
 * Compact chooser anchored at the tap, top to bottom: the unforced/forced toggle, two columns
 * (BH / FH) × Long / Net / Wide, and a ★ Winner button that logs the point on its own (an opponent
 * winner has no stroke of hers, so it needs nothing above it).
 * Placed below the tap when there is room, otherwise above; clamped inside the container.
 */
export function ShotPopover({ anchor, containerRef, where, forced, onForcedChange, onPick, initialErrorPick = null, onWinner, winnerOnly = false, onPlayerWinner, strokeOnly = false, player, onCancel }: ShotPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'below' | 'above' } | null>(null)
  const [errorPick, setErrorPick] = useState<{ stroke: Stroke; error: ErrorType } | null>(initialErrorPick)
  const [winnerStroke, setWinnerStroke] = useState<PlacementStroke>('fh')
  const [winnerShotType, setWinnerShotType] = useState<PointShotType | null>(null)

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
  }, [anchor.clientX, anchor.clientY, containerRef, errorPick, winnerOnly, winnerShotType, winnerStroke])

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
        {!strokeOnly && !winnerOnly && (
          <button
            type="button"
            className={`forced-toggle${forced ? ' on' : ''}`}
            aria-pressed={forced}
            onClick={() => onForcedChange(!forced)}
            title={forced ? 'Change to an unforced error' : `${capitalise(player.subject)} was forced into this error`}
          >
            {forced ? 'Forced' : 'Unforced'}
          </button>
        )}
        {winnerOnly ? (
          <div className="shot-type-step winner-type-step">
            <div className="shot-type-title">{capitalise(player.possessive)} winner</div>
            <WinnerStrokeToggle value={winnerStroke} onChange={(stroke) => {
              setWinnerStroke(stroke)
              setWinnerShotType(null)
            }} />
            {winnerStroke === 'serve' ? (
              <>
                <div className="shot-type-title">Serve result</div>
                <div className="shot-type-group winner-serve-group">
                  {WINNER_SERVE_TYPES.map((type) => (
                    <button type="button" className={`shot-type-btn${winnerShotType === type ? ' sel' : ''}`} key={type} aria-pressed={winnerShotType === type} onClick={() => setWinnerShotType(type)}>
                      {SHOT_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="shot-type-title">Ball type</div>
                {SHOT_TYPE_GROUPS.map((group, index) => (
                  <div className="shot-type-group" key={index}>
                    {group.map((type) => (
                      <button type="button" className={`shot-type-btn${winnerShotType === type ? ' sel' : ''}`} key={type} aria-pressed={winnerShotType === type} onClick={() => setWinnerShotType(type)}>
                        {SHOT_TYPE_LABEL[type]}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
            <button
              type="button"
              className="winner-confirm"
              disabled={!winnerShotType}
              onClick={() => winnerShotType && onPlayerWinner?.(winnerStroke, winnerShotType)}
            >
              ✓ Winner
            </button>
          </div>
        ) : errorPick ? (
          <div className="shot-type-step">
            <button type="button" className="shot-type-back" onClick={() => setErrorPick(null)}>
              ← {STROKE_SHORT[errorPick.stroke]} {ERROR_LABEL[errorPick.error]}
            </button>
            <div className="shot-type-title">Ball type</div>
            {SHOT_TYPE_GROUPS.map((group, index) => (
              <div className="shot-type-group" key={index}>
                {group.map((type) => (
                  <button type="button" className="shot-type-btn" key={type} onClick={() => onPick(errorPick.stroke, errorPick.error, type)}>
                    {SHOT_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ShotGrid forced={forced} strokeOnly={strokeOnly} onPick={(stroke, error) => strokeOnly ? onPick(stroke, error) : setErrorPick({ stroke, error })} />
        )}
        {!strokeOnly && !winnerOnly && !errorPick && (
          <button type="button" className="winner-toggle block" onClick={onWinner} title={`The opponent hit a winner past ${player.subject === 'she' ? 'her' : player.subject} — logs it right away`}>
            ★ Winner
          </button>
        )}
      </div>
    </>
  )
}
