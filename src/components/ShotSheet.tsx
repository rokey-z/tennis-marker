import { useEffect } from 'react'
import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKE_SHORT, STROKES, type ErrorType, type Stroke } from '../domain/types'
import { CloseIcon } from './Icons'

export interface ShotSheetProps {
  open: boolean
  /** e.g. "Baseline · deuce side" */
  where: string
  forced: boolean
  onForcedChange: (forced: boolean) => void
  onPick: (stroke: Stroke, error: ErrorType) => void
  onCancel: () => void
  /** 'sheet' = bottom sheet overlay (mobile); 'inline' = static panel (desktop) */
  variant: 'sheet' | 'inline'
}

const ERROR_HINT: Record<ErrorType, string> = { long: 'past baseline', net: 'into the net', wide: 'past sideline' }

export function ShotSheet({ open, where, forced, onForcedChange, onPick, onCancel, variant }: ShotSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const body = (
    <>
      <div className="sheet-head">
        <div className="where">{where}</div>
        {variant === 'sheet' && (
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel}>
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="sheet-sub">
        <span className="muted">How did she lose it?</span>
        <div className="segmented" role="radiogroup" aria-label="Forced or unforced">
          <button type="button" role="radio" aria-checked={!forced} className={!forced ? 'on' : ''} onClick={() => onForcedChange(false)}>
            Unforced
          </button>
          <button type="button" role="radio" aria-checked={forced} className={forced ? 'on forced' : ''} onClick={() => onForcedChange(true)}>
            Forced
          </button>
        </div>
      </div>
      <div className="shot-grid">
        {STROKES.map((stroke) => (
          <ShotRow key={stroke} stroke={stroke} onPick={onPick} />
        ))}
      </div>
      {variant === 'inline' && (
        <button type="button" className="btn ghost block shot-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </>
  )

  if (variant === 'inline') return <div className="sheet-inline">{body}</div>

  return (
    <>
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Log the lost point">
        {body}
      </div>
    </>
  )
}

function ShotRow({ stroke, onPick }: { stroke: Stroke; onPick: (s: Stroke, e: ErrorType) => void }) {
  return (
    <>
      <div className={`shot-row-label ${stroke}`} title={STROKE_LABEL[stroke]}>
        {STROKE_SHORT[stroke]}
      </div>
      {ERROR_TYPES.map((err) => (
        <button key={err} type="button" className={`shot-btn ${stroke}`} onClick={() => onPick(stroke, err)} aria-label={`${STROKE_LABEL[stroke]} ${ERROR_LABEL[err]}`}>
          {ERROR_LABEL[err]}
          <small>{ERROR_HINT[err]}</small>
        </button>
      ))}
    </>
  )
}
