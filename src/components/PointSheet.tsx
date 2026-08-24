import { useEffect } from 'react'
import { describeMark, isOut } from '../domain/court'
import { SHOT_TYPE_GROUPS, SHOT_TYPE_LABEL, isPlacementStroke, isShotType, type ErrorType, type Point, type Stroke } from '../domain/types'
import { formatTime } from '../lib/format'
import { CloseIcon, TrashIcon } from './Icons'
import { MarkDot, ShotGrid, markLabel } from './marks'
import { WinnerStrokeToggle } from './WinnerStrokeToggle'

export interface PointSheetProps {
  point: Point
  /** 1-based position in the session, as shown in the log */
  index: number
  onChange: (patch: Partial<Pick<Point, 'stroke' | 'error_type' | 'forced' | 'outcome' | 'shot_type'>>) => void
  onDelete: () => void
  onClose: () => void
}

export function PointSheet({ point, index, onChange, onDelete, onClose }: PointSheetProps) {
  const winner = point.outcome === 'winner'
  const playerWinner = point.outcome === 'player_winner'
  const placement = point.outcome === 'placement'
  const out = placement && point.stroke !== 'serve' && isOut(point.x, point.y)
  // a placement lives on the far half: the only thing to correct is which stroke played it
  const pick = (stroke: Stroke, error: ErrorType) => {
    onChange(placement ? { stroke } : { stroke, error_type: error, outcome: 'error' })
    if (placement) onClose()
  }
  // a winner is the opponent's shot: it keeps only the position
  const makeWinner = () => {
    onChange({ stroke: '', error_type: '', outcome: 'winner', forced: false })
    onClose()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="point-edit-pop" role="dialog" aria-label={`Change point ${index}`}>
      <button type="button" className="pop-close" aria-label="Close point editor" onClick={onClose}>
        <CloseIcon />
      </button>
      <div className="point-edit-title">Point {index}</div>
      <div className="point-sheet">
        <div className="ps-head">
          <MarkDot stroke={point.stroke} error={point.error_type} forced={point.forced} outcome={point.outcome} out={out} size={34} />
          <div className="grow">
            <div className="ps-now">{markLabel(point.stroke, point.error_type, point.forced, point.outcome, out, point.placement_result)}{isShotType(point.shot_type) ? ` · ${SHOT_TYPE_LABEL[point.shot_type]}` : ''}</div>
            <div className="ps-meta">
              {describeMark(point.x, point.y, point.outcome)} · {formatTime(point.created_at)}
            </div>
          </div>
          {!winner && !playerWinner && !placement && (
            <button
              type="button"
              className={`forced-toggle${point.forced ? ' on' : ''}`}
              aria-pressed={point.forced}
              onClick={() => onChange({ forced: !point.forced })}
              title="Mark as a forced error"
            >
              {point.forced ? 'Forced' : 'Unforced'}
            </button>
          )}
        </div>

        <div className="section-title">{playerWinner ? 'Winner stroke' : placement ? 'Change the stroke' : 'Change it to'}</div>
        {playerWinner && (
          <WinnerStrokeToggle
            value={isPlacementStroke(point.stroke) ? point.stroke : 'fh'}
            onChange={(stroke) => onChange(stroke === 'serve' ? { stroke, shot_type: null } : { stroke })}
          />
        )}
        {!winner && !playerWinner && (
          <ShotGrid
            current={{ stroke: point.stroke, error: point.error_type, outcome: point.outcome }}
            forced={point.forced}
            strokeOnly={placement}
            onPick={pick}
          />
        )}
        {!winner && !placement && (!playerWinner || point.stroke !== 'serve') && (
          <div className="point-shot-types">
            <div className="section-title">Ball type</div>
            {SHOT_TYPE_GROUPS.map((group, index) => (
              <div className="shot-type-group" key={index}>
                {group.map((type) => {
                  const selected = point.shot_type === type
                  return (
                    <button
                      type="button"
                      className={`shot-type-btn${selected ? ' sel' : ''}`}
                      key={type}
                      aria-pressed={selected}
                      onClick={() => onChange({ shot_type: type })}
                    >
                      {SHOT_TYPE_LABEL[type]}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {!winner && !playerWinner && !placement && (
          <>
            <div className="section-title">or</div>
            <button type="button" className="winner-toggle block" onClick={makeWinner} title="The opponent hit a winner here">
              ★ Opponent winner
            </button>
          </>
        )}

        <button type="button" className="btn danger block ps-delete" onClick={onDelete}>
          <TrashIcon /> Delete this point
        </button>
      </div>
    </div>
  )
}
