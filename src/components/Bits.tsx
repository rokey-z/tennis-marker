import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSyncStatus } from '../data/app'
import { describeMark, isOut } from '../domain/court'
import { ERROR_LABEL, ERROR_TYPES, PLACEMENT_STROKES, SHOT_TYPE_LABEL, STROKE_LABEL, STROKES, isPointShotType, type Point } from '../domain/types'
import type { Summary } from '../domain/stats'
import { CloseIcon, TrashIcon } from './Icons'
import { ErrorLetter, MarkChip, StrokeTag } from './marks'
import { formatTime } from '../lib/format'

// ---------- chip (filter toggle) ----------
export function Chip({ on, cls, onClick, children }: { on: boolean; cls?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip${cls ? ` ${cls}` : ''}${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

// ---------- sync badge ----------
export function SyncBadge({ compact = false, interactive = true }: { compact?: boolean; interactive?: boolean }) {
  const s = useSyncStatus()
  const nav = useNavigate()
  let cls = ''
  let text = ''
  switch (s.phase) {
    case 'local':
      cls = ''
      text = compact ? 'Local' : 'Local only'
      break
    case 'signed-out':
      cls = 'warn'
      text = compact ? 'Sign in' : 'Not signed in'
      break
    case 'syncing':
      cls = 'busy'
      text = 'Syncing…'
      break
    case 'offline':
      cls = 'warn'
      text = 'Offline'
      break
    case 'error':
      cls = 'err'
      text = compact ? 'Sync error' : 'Sync error'
      break
    default:
      cls = s.pending ? 'warn' : 'ok'
      text = s.pending ? 'Unsynced' : 'Synced'
  }
  const pending = s.pending && s.phase !== 'local' && s.phase !== 'syncing' ? ` · ${s.pending}` : ''
  const body = (
    <>
      <span className="dot" />
      {text}
      {pending}
    </>
  )
  // inside another button (the session header) it is a status, not a way out to Settings
  if (!interactive) {
    return (
      <span className={`badge ${cls}`} title={s.error ?? text}>
        {body}
      </span>
    )
  }
  return (
    <button type="button" className={`badge ${cls}`} onClick={() => nav('/settings')} title={s.error ?? text}>
      {body}
    </button>
  )
}

// ---------- tally ----------
export function Tally({ s, mode = 'errors' }: { s: Summary; mode?: 'errors' | 'placement' }) {
  // placement sessions count balls, not points lost: the two never share a headline
  if (mode === 'placement') {
    return (
      <div className="tally" aria-live="polite">
        <span className="total">
          {s.placements} {s.placements === 1 ? 'ball placed' : 'balls placed'}
        </span>
        <span className="sep" />
        {PLACEMENT_STROKES.map((k) => (
          <span key={k} className="t-item" title={`${STROKE_LABEL[k]}: ${s.placementsByStroke[k]}`}>
            <StrokeTag stroke={k} />
            {s.placementsByStroke[k]}
          </span>
        ))}
        {s.placementsOut > 0 && (
          <>
            <span className="sep" />
            <span className="t-item" title={`Landed out: ${s.placementsOut}`}>
              <span className="ml-out" aria-hidden="true">
                ✕
              </span>
              {s.placementsOut}
            </span>
          </>
        )}
        {s.byError.net > 0 && (
          <span className="t-item" title={`Net errors: ${s.byError.net}`}>
            <ErrorLetter type="net" />
            {s.byError.net}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="tally" aria-live="polite">
      {/* every mark is a point she lost: her errors plus the opponent's winners */}
      <span className="total" title={`${s.total} errors · ${s.winners} opponent winners`}>
        {s.lost} {s.lost === 1 ? 'point lost' : 'points lost'}
      </span>
      <span className="sep" />
      {STROKES.map((k) => (
        <span key={k} className="t-item" title={`${STROKE_LABEL[k]}: ${s.byStroke[k]}`}>
          <StrokeTag stroke={k} />
          {s.byStroke[k]}
        </span>
      ))}
      <span className="sep" />
      {ERROR_TYPES.map((e) => (
        <span key={e} className="t-item" title={`${ERROR_LABEL[e]}: ${s.byError[e]}`}>
          <ErrorLetter type={e} />
          {s.byError[e]}
        </span>
      ))}
      {s.byForced.forced > 0 && (
        <>
          <span className="sep" />
          <span className="t-item" title={`Forced: ${s.byForced.forced}`}>
            <span className="ml-ring" aria-hidden="true" />
            {s.byForced.forced}
          </span>
        </>
      )}
      {s.winners > 0 && (
        <>
          <span className="sep" />
          <span className="t-item" title={`Opponent winners: ${s.winners}`}>
            <span className="ml-win" aria-hidden="true">
              ★
            </span>
            {s.winners}
          </span>
        </>
      )}
      {s.playerWinners > 0 && (
        <>
          <span className="sep" />
          <span className="t-item" title={`Winners hit: ${s.playerWinners}`}>
            <span className="ml-player-win" aria-hidden="true">★</span>
            {s.playerWinners}
          </span>
        </>
      )}
      {s.winningServes > 0 && (
        <>
          <span className="sep" />
          <span className="t-item" title={`Winning serves: ${s.winningServes}`}>
            <span className="tag serve" aria-hidden="true">S</span>
            {s.winningServes}
          </span>
        </>
      )}
    </div>
  )
}

// ---------- point list ----------
export function PointList({ points, indexSource = points, onOpen, onDelete }: { points: Point[]; indexSource?: Point[]; onOpen?: (point: Point, index: number) => void; onDelete?: (point: Point) => void }) {
  if (!points.length) return <p className="muted">No points logged yet.</p>
  const originalIndex = new Map(indexSource.map((point, index) => [point.id, index + 1]))
  const rows = [...points].reverse()
  return (
    <ul className="point-list">
      {rows.map((p, i) => {
        const index = originalIndex.get(p.id) ?? points.length - i
        return (
          <li key={p.id} className="row-btn">
            {onOpen ? <button type="button" className="row-open" onClick={() => onOpen(p, index)}>
              <span className="n">{index}</span>
              <span className="desc">
                  <MarkChip stroke={p.stroke} error={p.error_type} forced={p.forced} outcome={p.outcome} out={(p.outcome ?? 'error') === 'placement' && p.stroke !== 'serve' && isOut(p.x, p.y)} placementResult={p.placement_result} />
                <small>
                  {isPointShotType(p.shot_type) && p.outcome !== 'winning_serve' ? `${SHOT_TYPE_LABEL[p.shot_type]} · ` : ''}{describeMark(p.x, p.y, p.outcome ?? 'error')} · {formatTime(p.created_at)}
                </small>
              </span>
            </button> : <div className="row-open">
              <span className="n">{index}</span>
              <span className="desc">
                <MarkChip stroke={p.stroke} error={p.error_type} forced={p.forced} outcome={p.outcome} out={(p.outcome ?? 'error') === 'placement' && p.stroke !== 'serve' && isOut(p.x, p.y)} placementResult={p.placement_result} />
                <small>{isPointShotType(p.shot_type) && p.outcome !== 'winning_serve' ? `${SHOT_TYPE_LABEL[p.shot_type]} · ` : ''}{describeMark(p.x, p.y, p.outcome ?? 'error')} · {formatTime(p.created_at)}</small>
              </span>
            </div>}
            {onDelete && <button type="button" className="icon-btn row-del" aria-label={`Delete point ${index}`} onClick={() => onDelete(p)}>
              <TrashIcon />
            </button>}
          </li>
        )
      })}
    </ul>
  )
}

// ---------- toast ----------
export interface ToastState {
  id: number
  text: string
  actionLabel?: string
  onAction?: () => void
}

export function Toast({ toast, onDismiss, ms = 5000 }: { toast: ToastState | null; onDismiss: () => void; ms?: number }) {
  useEffect(() => {
    if (!toast) return
    const h = setTimeout(onDismiss, ms)
    return () => clearTimeout(h)
  }, [toast, onDismiss, ms])
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.()
            onDismiss()
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  )
}

// ---------- modal ----------
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
