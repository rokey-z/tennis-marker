import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Modal, PointList, SyncBadge, Tally, Toast, type ToastState } from '../components/Bits'
import { useIsDesktop, usePlayer } from '../components/hooks'
import { shortDate } from '../lib/format'
import { Court } from '../components/Court'
import { StatsFilters, StatsPanel, type StatsFilterState } from '../components/StatsPanel'
import { BackIcon, ChartIcon, FlipIcon, ListIcon, PencilIcon, UndoIcon } from '../components/Icons'
import { ShotPopover } from '../components/ShotPopover'
import { store, useAppState } from '../data/app'
import { livePointsForSession } from '../data/store'
import { describeMark, describeZone, zoneFor } from '../domain/court'
import { capitalise, cleanOpponent } from '../domain/session'
import { opponentRowsWithRoster, sessionLabel, venueRows } from '../domain/session'
import { MarkLegend, markLabel } from '../components/marks'
import { PointSheet } from '../components/PointSheet'
import { OpponentPicker } from '../components/OpponentPicker'
import { VenuePicker } from '../components/VenuePicker'
import { filterPoints, summarize } from '../domain/stats'
import { pointsToCsv, safeFilename, toExportBundle } from '../domain/export'
import { downloadText } from '../lib/format'
import { ERROR_LABEL, KIND_LABEL, MODE_HINT, MODE_LABEL, SESSION_MODES, STROKE_SHORT, type ErrorType, type Outcome, type Point, type Session, type Stroke } from '../domain/types'

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
  const placementMode = session?.mode === 'placement'
  const player = usePlayer()
  // name whose half is on screen: hers when recording her errors, her opponent's when placing balls
  const opponentName = cleanOpponent(session?.opponent)
  const sideLabel = placementMode ? `${opponentName ? `${opponentName}’s` : 'Opponent’s'} side` : `${capitalise(player.possessive)} side`
  const allPoints = useMemo(() => livePointsForSession(state, id), [state, id])
  // each mode shows its own marks: they live in different halves of the court
  const points = useMemo(
    () => allPoints.filter((p) => ((p.outcome ?? 'error') === 'placement') === placementMode),
    [allPoints, placementMode],
  )
  // the tally counts what the court and the log show: the marks of the mode being recorded
  const summary = useMemo(() => summarize(points), [points])
  /** marks of the other kind, recorded before the session's mode was switched — hidden here, not lost */
  const otherMode = allPoints.length - points.length

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
  const justCreated = (useLocation().state as { justCreated?: boolean } | null)?.justCreated === true
  const [showDetails, setShowDetails] = useState(justCreated)
  const [openPoint, setOpenPoint] = useState<{ id: string; index: number } | null>(null)
  const ignoreUntil = useRef(0)

  useEffect(() => {
    localStorage.setItem(FLIP_KEY, flipped ? '1' : '0')
  }, [flipped])
  useEffect(() => {
    localStorage.setItem(LOG_KEY, logOpen ? '1' : '0')
  }, [logOpen])
  useEffect(() => {
    setPending(null)
  }, [placementMode])

  const onTap = useCallback((x: number, y: number, at: { clientX: number; clientY: number }) => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y, at })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const logPoint = (stroke: Stroke | '', error: ErrorType | '', outcome: Outcome) => {
    if (!pending) return
    const p = store.addPoint({ session_id: id, x: pending.x, y: pending.y, stroke, error_type: error, forced: outcome === 'error' && forced, outcome })
    setPending(null)
    ignoreUntil.current = performance.now() + AFTER_SAVE_IGNORE_MS
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
    setToast({
      id: Date.now(),
      text:
        outcome === 'placement'
          ? `${STROKE_SHORT[stroke as Stroke]} landed ${describeMark(p.x, p.y, 'placement').toLowerCase()}`
          : outcome === 'winner'
          ? `Opponent winner · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`
          : `${STROKE_SHORT[stroke as Stroke]} ${ERROR_LABEL[error as ErrorType].toLowerCase()} · ${forced ? 'forced' : 'unforced'} · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`,
      actionLabel: 'Undo',
      onAction: () => store.deletePoint(p.id),
    })
  }

  const pick = (stroke: Stroke, error: ErrorType) => logPoint(stroke, error, placementMode ? 'placement' : 'error')
  /** The opponent hit a winner past her: one tap, nothing of hers to attribute. */
  const logWinner = () => logPoint('', '', 'winner')

  /** Placement mode: one motion — press where the ball landed, drag left for BH or right for FH. */
  const onStrokeDrag = useCallback(
    (x: number, y: number, stroke: Stroke) => {
      if (performance.now() < ignoreUntil.current) return
      const p = store.addPoint({ session_id: id, x, y, stroke, error_type: '', forced: false, outcome: 'placement' })
      ignoreUntil.current = performance.now() + AFTER_SAVE_IGNORE_MS
      try {
        navigator.vibrate?.(12)
      } catch {
        /* ignore */
      }
      setToast({
        id: Date.now(),
        text: `${STROKE_SHORT[stroke]} landed ${describeMark(p.x, p.y, 'placement').toLowerCase()}`,
        actionLabel: 'Undo',
        onAction: () => store.deletePoint(p.id),
      })
    },
    [id],
  )

  const undo = () => {
    const p = store.undoLastPoint(id)
    if (p) setToast({ id: Date.now(), text: `Removed ${markLabel(p.stroke, p.error_type, p.forced, p.outcome)}` })
  }

  const dismissToast = useCallback(() => setToast(null), [])

  const deletePoint = useCallback((p: Point) => {
    store.deletePoint(p.id)
    setToast({
      id: Date.now(),
      text: `Removed ${markLabel(p.stroke, p.error_type, p.forced, p.outcome)}`,
      actionLabel: 'Undo',
      onAction: () => store.restorePoint(p.id),
    })
  }, [])

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
    <div key={id} className={`record page-in${statsMode ? ' stats' : ''}`}>
      <header className="record-head">
        <Link to="/" className="icon-btn" aria-label="Back to sessions">
          <BackIcon />
        </Link>
        <button type="button" className="title-btn" onClick={() => setShowDetails(true)} aria-label="Edit session details">
          <span className="tb-name">
            <strong>{sessionLabel(session)}</strong>
            <PencilIcon />
          </span>
          <span className="tb-meta">
            <span className="tb-line">
              {MODE_LABEL[session.mode]} · {KIND_LABEL[session.kind]} · {shortDate(session.date)}
              {session.venue ? ` · ${session.venue}` : ''}
              {flipped ? ' · far end' : ''}
              {!session.opponent && session.kind === 'match' ? ' · add opponent' : ''}
            </span>
            <SyncBadge compact />
          </span>
        </button>
        <button
          type="button"
          className={`flip-fab${flipped ? ' on' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
          aria-label={flipped ? `${capitalise(player.subject)} is at the far end — tap to flip back` : `Flip ends (${player.subject} is at the far end)`}
          title={flipped ? 'Far end — tap to flip back' : `Flip ends (${player.subject} is at the far end)`}
        >
          <FlipIcon />
        </button>
      </header>

      <div className="record-court">
        {statsMode && <StatsFilters value={filters} onChange={setFilters} />}
        <div className="court-box" ref={courtRef}>
          {statsMode ? (
            <Court flipped={flipped} points={shownPoints} half={placementMode ? 'opposite' : 'own'} sideLabel={sideLabel} heat={statsSummary.byZone} heatTotal={statsSummary.lost} showZones />
          ) : (
            <Court
              flipped={flipped}
              onTap={onTap}
              onStrokeDrag={placementMode ? onStrokeDrag : undefined}
              half={placementMode ? 'opposite' : 'own'}
              sideLabel={sideLabel}
              disabled={!!pending}
              points={points}
              emphasizeLast
              pending={pending}
              showZones
            />
          )}
          {pending && !statsMode && (
            <ShotPopover
            anchor={pending.at}
            containerRef={courtRef}
            where={where}
            forced={forced}
            onForcedChange={setForced}
            strokeOnly={placementMode}
            onPick={pick}
            onWinner={logWinner}
            player={player}
            onCancel={cancel}
          />
          )}
        </div>
      </div>

      {isDesktop ? (
        <aside className="record-side">
          {!statsMode && (
            <div className="card">
              <Tally s={summary} mode={placementMode ? 'placement' : 'errors'} />
            </div>
          )}
          {!statsMode && (
            <div className="record-hint">
              {placementMode
                ? `Click where the ball landed, then pick the stroke ${player.name ? `${player.name} hit it with` : 'she hit it with'}.`
                : `Click the court where ${player.subject} lost the point, then pick FH/BH × Long/Net/Wide right there.`}
            </div>
          )}
          {actions}
          {statsMode ? (
            <StatsPanel summary={statsSummary} count={shownPoints.length} onExportCsv={exportCsv} onExportJson={exportJson} />
          ) : (
            <div className="card side-list">
              <div className="section-title">Points</div>
              <PointList points={points} onOpen={(p, index) => setOpenPoint({ id: p.id, index })} onDelete={deletePoint} />
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
            <Tally s={summary} mode={placementMode ? 'placement' : 'errors'} />
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
                <MarkLegend className="log-legend" mode={placementMode ? 'placement' : 'errors'} />
                <PointList points={points} onOpen={(p, index) => setOpenPoint({ id: p.id, index })} onDelete={deletePoint} />
                {otherMode > 0 && (
                  <p className="log-note">
                    {otherMode} {otherMode === 1 ? 'mark' : 'marks'} recorded in {placementMode ? MODE_LABEL.errors : MODE_LABEL.placement} mode {otherMode === 1 ? 'is' : 'are'} hidden here — switch this session’s mode to see {otherMode === 1 ? 'it' : 'them'}.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {openPoint && state.points[openPoint.id] && !state.points[openPoint.id].deleted_at && (
        <PointSheet
          point={state.points[openPoint.id]}
          index={openPoint.index}
          onChange={(patch) => store.updatePoint(openPoint.id, patch)}
          onDelete={() => {
            deletePoint(state.points[openPoint.id])
            setOpenPoint(null)
          }}
          onClose={() => setOpenPoint(null)}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />

      {showDetails && (
        <SessionDetails
          session={session}
          isNew={justCreated}
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

function SessionDetails({ session, isNew = false, onClose, onDeleted }: { session: Session; isNew?: boolean; onClose: () => void; onDeleted: () => void }) {
  const state = useAppState()
  const [mode, setMode] = useState(session.mode)
  const [opponent, setOpponent] = useState(session.opponent ?? '')
  const [venue, setVenue] = useState(session.venue ?? '')
  const [date, setDate] = useState(session.date)
  const [kind, setKind] = useState(session.kind)
  const [notes, setNotes] = useState(session.notes)
  const [confirm, setConfirm] = useState(false)
  const known = useMemo(() => opponentRowsWithRoster(Object.values(state.sessions), state.meta.roster), [state.sessions, state.meta.roster])
  const venues = useMemo(() => venueRows(Object.values(state.sessions)), [state.sessions])

  const save = () => {
    store.updateSession(session.id, { opponent, venue, date, kind, mode, notes })
    onClose()
  }

  return (
    <Modal title={sessionLabel({ kind, opponent, title: session.title })} onClose={onClose}>
      <div className="field">
        <span>Records</span>
        <div className="segmented mode-pick" role="radiogroup" aria-label="What this session records">
          {SESSION_MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="kbd-hint" style={{ marginTop: 6 }}>{MODE_HINT[mode]}</p>
      </div>
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
          {isNew ? 'Start recording' : 'Save'}
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
