import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Modal, PointList, SyncBadge, Tally, Toast, type ToastState } from '../components/Bits'
import { useIsDesktop } from '../components/hooks'
import { formatDate } from '../lib/format'
import { Court } from '../components/Court'
import { StatsFilters, StatsPanel, type StatsFilterState } from '../components/StatsPanel'
import { BackIcon, ChartIcon, FlipIcon, ListIcon, UndoIcon } from '../components/Icons'
import { ShotPopover } from '../components/ShotPopover'
import { store, useAppState } from '../data/app'
import { livePointsForSession } from '../data/store'
import { describeZone, zoneFor } from '../domain/court'
import { opponentRows, sessionLabel, venueRows } from '../domain/session'
import { OpponentPicker } from '../components/OpponentPicker'
import { VenuePicker } from '../components/VenuePicker'
import { filterPoints, summarize } from '../domain/stats'
import { pointsToCsv, safeFilename, toExportBundle } from '../domain/export'
import { downloadText } from '../lib/format'
import { ERROR_LABEL, KIND_LABEL, STROKE_SHORT, type ErrorType, type Session, type Stroke } from '../domain/types'

const LOG_KEY = 'tennis-marker.logOpen'
const FLIP_KEY = 'tennis-marker.flip'
const AFTER_SAVE_IGNORE_MS = 300
const DEFAULT_STATS_FILTERS: StatsFilterState = { stroke: 'all', error: 'all', forced: 'all' }

export function RecordPage() {
  const { id = '' } = useParams()
  const state = useAppState()
  const nav = useNavigate()
  const isDesktop = useIsDesktop()
  const session = state.sessions[id]
  const points = useMemo(() => livePointsForSession(state, id), [state, id])
  const summary = useMemo(() => summarize(points), [points])

  const [flipped, setFlipped] = useState(() => localStorage.getItem(FLIP_KEY) === '1')
  const [pending, setPending] = useState<{ x: number; y: number; at: { clientX: number; clientY: number } } | null>(null)
  const courtRef = useRef<HTMLDivElement>(null)
  const [forced, setForced] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [logOpen, setLogOpen] = useState(() => localStorage.getItem(LOG_KEY) !== '0')
  const [view, setView] = useState<'court' | 'stats'>('court')
  const [filters, setFilters] = useState<StatsFilterState>(DEFAULT_STATS_FILTERS)
  const statsMode = view === 'stats'
  const shownPoints = useMemo(() => (statsMode ? filterPoints(points, filters) : points), [statsMode, points, filters])
  const statsSummary = useMemo(() => summarize(shownPoints), [shownPoints])
  const [showDetails, setShowDetails] = useState(false)
  const ignoreUntil = useRef(0)

  useEffect(() => {
    localStorage.setItem(FLIP_KEY, flipped ? '1' : '0')
  }, [flipped])
  useEffect(() => {
    localStorage.setItem(LOG_KEY, logOpen ? '1' : '0')
  }, [logOpen])

  const onTap = useCallback((x: number, y: number, at: { clientX: number; clientY: number }) => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y, at })
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

  const exportCsv = () => {
    downloadText(safeFilename(`tennis-${session?.title ?? 'session'}`, 'csv'), pointsToCsv(shownPoints, state.sessions), 'text/csv;charset=utf-8')
  }
  const exportJson = () => {
    const bundle = toExportBundle(Object.values(state.sessions), Object.values(state.points))
    downloadText(safeFilename('tennis-marker-backup', 'json'), JSON.stringify(bundle, null, 2), 'application/json')
  }

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

  const actions = (
    <div className="record-actions">
      <button type="button" className="btn" onClick={undo} disabled={points.length === 0}>
        <UndoIcon /> Undo
      </button>
      <button type="button" className={`btn${statsMode ? ' primary' : ''}`} onClick={() => setView((v) => (v === 'stats' ? 'court' : 'stats'))} aria-pressed={statsMode}>
        <ChartIcon /> {statsMode ? 'Court' : 'Stats'}
      </button>
    </div>
  )

  return (
    <div className={`record${statsMode ? ' stats' : ''}`}>
      <header className="record-head">
        <Link to="/" className="icon-btn" aria-label="Back to sessions">
          <BackIcon />
        </Link>
        <button type="button" className="title-btn" onClick={() => setShowDetails(true)} title="Edit session">
          <strong>{sessionLabel(session)}</strong>
          <small>
            {KIND_LABEL[session.kind]} · {formatDate(session.date)}
            {!session.opponent && session.kind === 'match' ? ' · add opponent' : ''}
          </small>
        </button>
        <button type="button" className={`flip-btn${flipped ? ' on' : ''}`} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} title="Flip ends (she is on the far side)">
          <FlipIcon /> {flipped ? 'Far end' : 'Near end'}
        </button>
        <SyncBadge compact />
      </header>

      <div className="record-court">
        {statsMode && <StatsFilters value={filters} onChange={setFilters} />}
        <div className="court-box" ref={courtRef}>
          {statsMode ? (
            <Court flipped={flipped} points={shownPoints} heat={statsSummary.byZone} heatTotal={statsSummary.total} showZones />
          ) : (
            <Court flipped={flipped} onTap={onTap} disabled={!!pending} points={points} pending={pending} showZones />
          )}
          {pending && !statsMode && (
            <ShotPopover anchor={pending.at} containerRef={courtRef} where={where} forced={forced} onForcedChange={setForced} onPick={pick} onCancel={cancel} />
          )}
        </div>
      </div>

      {isDesktop ? (
        <aside className="record-side">
          {!statsMode && (
            <div className="card">
              <Tally s={summary} />
            </div>
          )}
          {!statsMode && <div className="record-hint">Click the court where she lost the point, then pick FH/BH × Long/Net/Wide right there.</div>}
          {actions}
          {statsMode ? (
            <StatsPanel summary={statsSummary} count={shownPoints.length} onExportCsv={exportCsv} onExportJson={exportJson} />
          ) : (
            <div className="card side-list">
              <div className="section-title">Points</div>
              <PointList points={points} onDelete={(pid) => store.deletePoint(pid)} />
            </div>
          )}
        </aside>
      ) : statsMode ? (
        <>
          <div className="record-bottom">{actions}</div>
          <section className="record-stats" aria-label="Session stats">
            <StatsPanel summary={statsSummary} count={shownPoints.length} onExportCsv={exportCsv} onExportJson={exportJson} />
          </section>
        </>
      ) : (
        <>
          <div className="record-bottom">
            <Tally s={summary} />
            {actions}
          </div>
          <section className={`record-log${logOpen ? ' open' : ''}`} aria-label="Logged points">
            <button type="button" className="log-head" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
              <ListIcon />
              <span className="grow">Log · {points.length} {points.length === 1 ? 'point' : 'points'}</span>
              <span className="chev" aria-hidden="true">{logOpen ? '▾' : '▴'}</span>
            </button>
            {logOpen && (
              <div className="log-body">
                <PointList points={points} onDelete={(pid) => store.deletePoint(pid)} />
              </div>
            )}
          </section>
        </>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />

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
  const state = useAppState()
  const [opponent, setOpponent] = useState(session.opponent ?? '')
  const [venue, setVenue] = useState(session.venue ?? '')
  const [date, setDate] = useState(session.date)
  const [kind, setKind] = useState(session.kind)
  const [notes, setNotes] = useState(session.notes)
  const [confirm, setConfirm] = useState(false)
  const known = useMemo(() => opponentRows(Object.values(state.sessions)), [state.sessions])
  const venues = useMemo(() => venueRows(Object.values(state.sessions)), [state.sessions])

  const save = () => {
    store.updateSession(session.id, { opponent, venue, date, kind, notes })
    onClose()
  }

  return (
    <Modal title={sessionLabel({ kind, opponent, title: session.title })} onClose={onClose}>
      <OpponentPicker value={opponent} onChange={setOpponent} kind={kind} known={known} />
      <VenuePicker value={venue} onChange={setVenue} known={venues} />
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
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, what to work on…" />
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
