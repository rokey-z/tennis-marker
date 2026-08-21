import { describeMark, isOut } from '../domain/court'
import type { ErrorType, Point, Stroke } from '../domain/types'
import { formatTime } from '../lib/format'
import { Modal } from './Bits'
import { TrashIcon } from './Icons'
import { MarkDot, ShotGrid, markLabel } from './marks'

export interface PointSheetProps {
  point: Point
  /** 1-based position in the session, as shown in the log */
  index: number
  onChange: (patch: Partial<Pick<Point, 'stroke' | 'error_type' | 'forced' | 'outcome'>>) => void
  onDelete: () => void
  onClose: () => void
}

export function PointSheet({ point, index, onChange, onDelete, onClose }: PointSheetProps) {
  const winner = point.outcome === 'winner'
  const placement = point.outcome === 'placement'
  const out = placement && point.stroke !== 'serve' && isOut(point.x, point.y)
  // a placement lives on the far half: the only thing to correct is which stroke played it
  const pick = (stroke: Stroke, error: ErrorType) => {
    onChange(placement ? { stroke } : { stroke, error_type: error, outcome: 'error' })
    onClose()
  }
  // a winner is the opponent's shot: it keeps only the position
  const makeWinner = () => {
    onChange({ stroke: '', error_type: '', outcome: 'winner', forced: false })
    onClose()
  }

  return (
    <Modal title={`Point ${index}`} onClose={onClose}>
      <div className="point-sheet">
        <div className="ps-head">
          <MarkDot stroke={point.stroke} error={point.error_type} forced={point.forced} outcome={point.outcome} out={out} size={34} />
          <div className="grow">
            <div className="ps-now">{markLabel(point.stroke, point.error_type, point.forced, point.outcome, out, point.placement_result)}</div>
            <div className="ps-meta">
              {describeMark(point.x, point.y, point.outcome)} · {formatTime(point.created_at)}
            </div>
          </div>
          {!winner && !placement && (
            <button
              type="button"
              className={`forced-toggle${point.forced ? ' on' : ''}`}
              aria-pressed={point.forced}
              onClick={() => onChange({ forced: !point.forced })}
              title="Mark as a forced error"
            >
              Forced
            </button>
          )}
        </div>

        <div className="section-title">{placement ? 'Change the stroke' : 'Change it to'}</div>
        <ShotGrid current={{ stroke: point.stroke, error: point.error_type, outcome: point.outcome }} forced={point.forced} strokeOnly={placement} onPick={pick} />
        {!winner && !placement && (
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
    </Modal>
  )
}
