import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Modal, PointList, SyncBadge, Tally, Toast, type ToastState } from '../components/Bits'
import { useIsDesktop } from '../components/hooks'
import { formatDate } from '../lib/format'
import { Court } from '../components/Court'
import { BackIcon, ChartIcon, FlipIcon, ListIcon, UndoIcon } from '../components/Icons'
import { ShotSheet } from '../components/ShotSheet'
import { store, useAppState } from '../data/app'
import { livePointsForSession } from '../data/store'
import { describeZone, zoneFor } from '../domain/court'
import { summarize } from '../domain/stats'
import { ERROR_LABEL, KIND_LABEL, STROKE_SHORT, type ErrorType, type Session, type Stroke } from '../domain/types'

const FLIP_KEY = 'tennis-marker.flip'
const AFTER_SAVE_IGNORE_MS = 300

export function RecordPage() {
  const { id = '' } = useParams()
  const state = useAppState()
  const nav = useNavigate()
  const isDesktop = useIsDesktop()
  const session = state.sessions[id]
  const points = useMemo(() => livePointsForSession(state, id), [state, id])
  const summary = useMemo(() => summarize(points), [points])

  const [flipped, setFlipped] = useState(() => localStorage.getItem(FLIP_KEY) === '1')
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)
  const [forced, setForced] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [showList, setShowList] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const ignoreUntil = useRef(0)

  useEffect(() => {
    localStorage.setItem(FLIP_KEY, flipped ? '1' : '0')
  }, [flipped])

  const onTap = useCallback((x: number, y: number) => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const pick = (stroke: Stroke, error: ErrorType) => {
    if (!pending) return
    const p = store.addPoint({ session_id: id, x: pending.x, y: pending.y, stroke, error_type: error, forced })
    setPending(null)
    ignoreUntil.current = performance.now() + AFTER_SAVE_IGNORE_MS
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
    setToast({
      id: Date.now(),
      text: `${STROKE_SHORT[stroke]} ${ERROR_LABEL[error].toLowerCase()} · ${forced ? 'forced' : 'unforced'} · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`,
      actionLabel: 'Undo',
      onAction: () => store.deletePoint(p.id),
    })
  }

  const undo = () => {
    const p = store.undoLastPoint(id)
    if (p) setToast({ id: Date.now(), text: `Removed ${STROKE_SHORT[p.stroke]} ${ERROR_LABEL[p.error_type].toLowerCase()}` })
  }

  const dismissToast = useCallback(() => setToast(null), [])

  if (!session || session.deleted_at) {
    return (
      <div className="shell">
        <main className="shell-main">
          <div className="empty">
            <strong>Session not found</strong>
            <Link to="/">Back to sessions</Link>
          </div>
        </main>
      </div>
    )
  }

  const where = pending ? describeZone(zoneFor(pending.x, pending.y)) : ''
  const sheet = (
    <ShotSheet
      open={!!pending}
      where={where}
      forced={forced}
      onForcedChange={setForced}
      onPick={pick}
      onCancel={cancel}
      variant={isDesktop ? 'inline' : 'sheet'}
    />
  )

  const actions = (
    <div className="record-actions">
      <button type="button" className="btn" onClick={undo} disabled={points.length === 0}>
        <UndoIcon /> Undo
      </button>
      {!isDesktop && (
        <button type="button" className="btn" onClick={() => setShowList(true)}>
          <ListIcon /> {points.length}
        </button>
      )}
      <button type="button" className="btn" onClick={() => nav(`/stats?session=${id}`)}>
        <ChartIcon /> Stats
      </button>
    </div>
  )

  return (
    <div className="record">
      <header className="record-head">
        <Link to="/" className="icon-btn" aria-label="Back to sessions">
          <BackIcon />
        </Link>
        <button type="button" className="title-btn" onClick={() => setShowDetails(true)} title="Edit session">
          <strong>{session.title}</strong>
          <small>
            {KIND_LABEL[session.kind]} · {formatDate(session.date)}
          </small>
        </button>
        <button type="button" className={`flip-btn${flipped ? ' on' : ''}`} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} title="Flip ends (she is on the far side)">
          <FlipIcon /> {flipped ? 'Far end' : 'Near end'}
        </button>
        <SyncBadge compact />
      </header>

      <div className="record-court">
        <Court flipped={flipped} onTap={onTap} disabled={!!pending} points={points} pending={pending} showZones />
      </div>

      {isDesktop ? (
        <aside className="record-side">
          <div className="card">
            <Tally s={summary} />
          </div>
          {pending ? sheet : <div className="record-hint">Click the court where she lost the point.</div>}
          {actions}
          <div className="card side-list">
            <div className="section-title">Points</div>
            <PointList points={points} onDelete={(pid) => store.deletePoint(pid)} />
          </div>
        </aside>
      ) : (
        <div className="record-bottom">
          <Tally s={summary} />
          {actions}
          {sheet}
        </div>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />

      {showList && (
        <Modal title={`Points (${points.length})`} onClose={() => setShowList(false)}>
          <PointList points={points} onDelete={(pid) => store.deletePoint(pid)} />
        </Modal>
      )}
      {showDetails && (
        <SessionDetails
          session={session}
          onClose={() => setShowDetails(false)}
          onDeleted={() => {
            setShowDetails(false)
            nav('/')
          }}
        />
      )}
    </div>
  )
}

function SessionDetails({ session, onClose, onDeleted }: { session: Session; onClose: () => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const [kind, setKind] = useState(session.kind)
  const [notes, setNotes] = useState(session.notes)
  const [confirm, setConfirm] = useState(false)

  const save = () => {
    store.updateSession(session.id, { title: title.trim() || session.title, date, kind, notes })
    onClose()
  }

  return (
    <Modal title="Session" onClose={onClose}>
      <label className="field">
        <span>Title</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. vs Emma — club league" />
      </label>
      <div className="row">
        <label className="field grow">
          <span>Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Session['kind'])}>
            <option value="practice">Practice</option>
            <option value="match">Match</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opponent, conditions, what to work on…" />
      </label>
      <div className="row">
        <button type="button" className="btn primary grow" onClick={save}>
          Save
        </button>
        {confirm ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              store.deleteSession(session.id)
              onDeleted()
            }}
          >
            Really delete?
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
            Delete session
          </button>
        )}
      </div>
    </Modal>
  )
}
