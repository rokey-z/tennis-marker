import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSyncStatus } from '../data/app'
import { describeZone, zoneFor } from '../domain/court'
import { ERROR_LABEL, ERROR_TYPES, STROKE_LABEL, STROKES, type Point } from '../domain/types'
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
export function SyncBadge({ compact = false }: { compact?: boolean }) {
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
  return (
    <button type="button" className={`badge ${cls}`} onClick={() => nav('/settings')} title={s.error ?? text}>
      <span className="dot" />
      {text}
      {pending}
    </button>
  )
}

// ---------- tally ----------
export function Tally({ s }: { s: Summary }) {
  return (
    <div className="tally" aria-live="polite">
      <span className="total">
        {s.total} {s.total === 1 ? 'error' : 'errors'}
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
          <span className="t-item" title={`Winners: ${s.winners}`}>
            <span className="ml-win" aria-hidden="true">
              ★
            </span>
            {s.winners}
          </span>
        </>
      )}
    </div>
  )
}

// ---------- point list ----------
export function PointList({ points, onOpen, onDelete }: { points: Point[]; onOpen: (point: Point, index: number) => void; onDelete: (point: Point) => void }) {
  if (!points.length) return <p className="muted">No points logged yet.</p>
  const rows = [...points].reverse()
  return (
    <ul className="point-list">
      {rows.map((p, i) => {
        const index = points.length - i
        return (
          <li key={p.id} className="row-btn">
            <button type="button" className="row-open" onClick={() => onOpen(p, index)}>
              <span className="n">{index}</span>
              <span className="desc">
                <MarkChip stroke={p.stroke} error={p.error_type} forced={p.forced} outcome={p.outcome} />
                <small>
                  {describeZone(zoneFor(p.x, p.y))} · {formatTime(p.created_at)}
                </small>
              </span>
            </button>
            <button type="button" className="icon-btn row-del" aria-label={`Delete point ${index}`} onClick={() => onDelete(p)}>
              <TrashIcon />
            </button>
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
