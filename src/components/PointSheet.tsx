import { describeZone, zoneFor } from '../domain/court'
import type { ErrorType, Point, Stroke } from '../domain/types'
import { formatTime } from '../lib/format'
import { Modal } from './Bits'
import { TrashIcon } from './Icons'
import { MarkDot, ShotGrid, markLabel } from './marks'

export interface PointSheetProps {
  point: Point
  /** 1-based position in the session, as shown in the log */
  index: number
  onChange: (patch: Partial<Pick<Point, 'stroke' | 'error_type' | 'forced'>>) => void
  onDelete: () => void
  onClose: () => void
}

export function PointSheet({ point, index, onChange, onDelete, onClose }: PointSheetProps) {
  const pick = (stroke: Stroke, error: ErrorType) => {
    onChange({ stroke, error_type: error })
    onClose()
  }

  return (
    <Modal title={`Point ${index}`} onClose={onClose}>
      <div className="point-sheet">
        <div className="ps-head">
          <MarkDot stroke={point.stroke} error={point.error_type} forced={point.forced} size={34} />
          <div className="grow">
            <div className="ps-now">{markLabel(point.stroke, point.error_type, point.forced)}</div>
            <div className="ps-meta">
              {describeZone(zoneFor(point.x, point.y))} · {formatTime(point.created_at)}
            </div>
          </div>
          <button
            type="button"
            className={`forced-toggle${point.forced ? ' on' : ''}`}
            aria-pressed={point.forced}
            onClick={() => onChange({ forced: !point.forced })}
            title="Mark as a forced error"
          >
            Forced
          </button>
        </div>

        <div className="section-title">Change it to</div>
        <ShotGrid current={{ stroke: point.stroke, error: point.error_type }} forced={point.forced} onPick={pick} />

        <button type="button" className="btn danger block ps-delete" onClick={onDelete}>
          <TrashIcon /> Delete this point
        </button>
      </div>
    </Modal>
  )
}
