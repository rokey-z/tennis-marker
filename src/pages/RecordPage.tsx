import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Modal, PointList, SyncBadge, Tally, Toast, type ToastState } from '../components/Bits'
import { useIsDesktop, usePlayer } from '../components/hooks'
import { shortDate } from '../lib/format'
import { Court, type CourtRotation } from '../components/Court'
import { StatsFilters, StatsPanel, type StatsFilterState } from '../components/StatsPanel'
import { BackIcon, ChartIcon, CloseIcon, FullscreenIcon, ListIcon, LockIcon, PencilIcon, Rotate90Icon, UndoIcon } from '../components/Icons'
import { ShotPopover } from '../components/ShotPopover'
import { store, useAppState } from '../data/app'
import { livePointsForSession } from '../data/store'
import { describeMark, describeZone, placementResultFor, zoneFor } from '../domain/court'
import { capitalise, cleanOpponent } from '../domain/session'
import { opponentRowsWithRoster, sessionLabel, venueRows } from '../domain/session'
import { MarkLegend, markLabel } from '../components/marks'
import { PointSheet } from '../components/PointSheet'
import { OpponentPicker } from '../components/OpponentPicker'
import { VenuePicker } from '../components/VenuePicker'
import { filterPoints, summarize } from '../domain/stats'
import { pointsToCsv, safeFilename, toExportBundle } from '../domain/export'
import { downloadText } from '../lib/format'
import { ERROR_LABEL, KIND_LABEL, MODE_HINT, MODE_LABEL, SESSION_MODES, STROKE_SHORT, type ErrorType, type Outcome, type PlacementStroke, type Point, type Session, type Stroke } from '../domain/types'

const LOG_KEY = 'tennis-marker.logOpen'
const ROTATE_90_KEY = 'tennis-marker.rotate90'
const AFTER_SAVE_IGNORE_MS = 300
const DEFAULT_STATS_FILTERS: StatsFilterState = { stroke: 'all', error: 'all', forced: 'all' }

export function RecordPage() {
  const { id = '' } = useParams()
  const state = useAppState()
  const nav = useNavigate()
  const isDesktop = useIsDesktop()
  const session = state.sessions[id]
  const placementMode = session?.mode === 'placement'
  const finished = !!session?.finished_at
  const player = usePlayer()
  // name whose half is on screen: hers when recording her errors, her opponent's when placing balls
  const opponentName = cleanOpponent(session?.opponent)
  const sideLabel = placementMode ? `${opponentName ? `${opponentName}’s` : 'Opponent’s'} side` : `${capitalise(player.possessive)} side`
  const allPoints = useMemo(() => livePointsForSession(state, id), [state, id])
  // each mode shows its own marks: they live in different halves of the court
  const points = useMemo(
    // Placement sessions also retain net strikes on the court: they are errors, but the net is
    // part of the placement workflow and should not vanish immediately after being recorded.
    () => allPoints.filter((p) => placementMode ? p.outcome === 'placement' || p.error_type === 'net' : p.outcome !== 'placement'),
    [allPoints, placementMode],
  )
  // the tally counts what the court and the log show: the marks of the mode being recorded
  const summary = useMemo(() => summarize(points), [points])
  /** marks of the other kind, recorded before the session's mode was switched — hidden here, not lost */
  const otherMode = allPoints.length - points.length

  const [rotation, setRotation] = useState<CourtRotation>(() => {
    const saved = Number(localStorage.getItem(ROTATE_90_KEY))
    // Versions before multi-turn rotation stored "1" for a single 90° turn.
    return saved === 1 ? 90 : [0, 90, 180, 270].includes(saved) ? saved as CourtRotation : 0
  })
  const [pending, setPending] = useState<{ x: number; y: number; at: { clientX: number; clientY: number }; surface: 'court' | 'net' } | null>(null)
  const courtRef = useRef<HTMLDivElement>(null)
  const rotationBeforeFullscreen = useRef<CourtRotation | null>(null)
  const [courtFullscreen, setCourtFullscreen] = useState(false)
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
  const [showFinish, setShowFinish] = useState(false)
  const [openPoint, setOpenPoint] = useState<{ id: string; index: number } | null>(null)
  const ignoreUntil = useRef(0)

  useEffect(() => {
    localStorage.setItem(ROTATE_90_KEY, String(rotation))
  }, [rotation])
  useEffect(() => {
    localStorage.setItem(LOG_KEY, logOpen ? '1' : '0')
  }, [logOpen])
  useEffect(() => {
    setPending(null)
  }, [placementMode])

  const finishCourtFullscreen = useCallback(() => {
    setCourtFullscreen(false)
    const previous = rotationBeforeFullscreen.current
    if (previous !== null) {
      setRotation(previous)
      rotationBeforeFullscreen.current = null
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      if (courtFullscreen && !document.fullscreenElement) finishCourtFullscreen()
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [courtFullscreen, finishCourtFullscreen])

  const enterCourtFullscreen = async () => {
    if (courtFullscreen) return
    rotationBeforeFullscreen.current = rotation
    // Portrait full screen always presents the half court vertically. Preserve which baseline is
    // nearest when possible, then restore the user's exact rotation on exit.
    setRotation(rotation === 180 || rotation === 270 ? 180 : 0)
    setCourtFullscreen(true)
    try {
      await courtRef.current?.requestFullscreen?.()
    } catch {
      // The fixed-position fallback still fills browsers that do not support element full screen.
    }
  }

  const exitCourtFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* the state cleanup below also exits the CSS fallback */
    }
    finishCourtFullscreen()
  }

  const onTap = useCallback((x: number, y: number, at: { clientX: number; clientY: number }, surface: 'court' | 'net' = 'court') => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y, at, surface })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const logPoint = (stroke: PlacementStroke | '', error: ErrorType | '', outcome: Outcome, placementResult: Point['placement_result'] = null) => {
    if (!pending) return
    const p = store.addPoint({ session_id: id, x: pending.x, y: pending.y, stroke, error_type: error, forced: outcome === 'error' && forced, outcome, placement_result: placementResult })
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

  const pick = (stroke: Stroke, error: ErrorType) => {
    const net = pending?.surface === 'net'
    if (placementMode && net) logPoint(stroke, 'net', 'error')
    else logPoint(stroke, error, placementMode ? 'placement' : 'error', placementMode ? placementResultFor(pending!.x, pending!.y) : null)
  }
  /** The opponent hit a winner past her: one tap, nothing of hers to attribute. */
  const logWinner = () => logPoint('', '', 'winner')

  /** Placement mode: one motion — press where the ball landed, drag left for BH or right for FH. */
  const onStrokeDrag = useCallback(
    (x: number, y: number, stroke: PlacementStroke, surface: 'court' | 'net' = 'court') => {
      if (performance.now() < ignoreUntil.current) return
      const net = surface === 'net'
      const placement_result = stroke === 'serve' ? 'unknown' : placementResultFor(x, y)
      const p = store.addPoint({ session_id: id, x, y, stroke, error_type: net ? 'net' : '', forced: false, outcome: net ? 'error' : 'placement', placement_result: net ? null : placement_result })
      ignoreUntil.current = performance.now() + AFTER_SAVE_IGNORE_MS
      try {
        navigator.vibrate?.(12)
      } catch {
        /* ignore */
      }
      setToast({
        id: Date.now(),
        text: net ? `${STROKE_SHORT[stroke]} net error` : `${STROKE_SHORT[stroke]} · ${placement_result === 'unknown' ? 'serve landing' : placement_result === 'in' ? describeMark(p.x, p.y, 'placement').toLowerCase() : placement_result}`,
        actionLabel: 'Undo',
        onAction: () => store.deletePoint(p.id),
      })
    },
    [id],
  )

  const undo = () => {
    if (finished) return
    // only the marks this mode shows: a placement session must never quietly drop an error mark
    const p = store.undoLastPoint(id, (q) => placementMode ? (q.outcome ?? 'error') === 'placement' || q.error_type === 'net' : (q.outcome ?? 'error') !== 'placement')
    if (!p) return
    setToast({
      id: Date.now(),
      text: `Removed ${markLabel(p.stroke, p.error_type, p.forced, p.outcome, false, p.placement_result)}`,
      actionLabel: 'Undo',
      onAction: () => store.restorePoint(p.id),
    })
  }

  const dismissToast = useCallback(() => setToast(null), [])

  const deletePoint = useCallback((p: Point) => {
    if (finished) return
    store.deletePoint(p.id)
    setToast({
      id: Date.now(),
      text: `Removed ${markLabel(p.stroke, p.error_type, p.forced, p.outcome, false, p.placement_result)}`,
      actionLabel: 'Undo',
      onAction: () => store.restorePoint(p.id),
    })
  }, [finished])

  const openFinish = () => {
    setPending(null)
    setOpenPoint(null)
    setToast(null)
    setShowFinish(true)
  }

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

  const where = pending ? pending.surface === 'net' ? 'Net' : describeZone(zoneFor(pending.x, pending.y)) : ''

  const actions = (
    <div className="record-actions">
      <button type="button" className="btn" onClick={undo} disabled={finished || points.length === 0}>
        <UndoIcon /> Undo
      </button>
      <button type="button" className={`btn${statsMode ? ' primary' : ''}`} onClick={() => setView((v) => (v === 'stats' ? 'court' : 'stats'))} aria-pressed={statsMode}>
        <ChartIcon /> {statsMode ? 'Court' : 'Stats'}
      </button>
      <button type="button" className={`btn${finished ? ' primary' : ''}`} onClick={openFinish} aria-pressed={finished} title={finished ? 'Edit rating or unlock this session' : 'Finish, rate, and lock this session'}>
        <LockIcon /> {finished && session.self_rating ? `${session.self_rating}/5` : 'Finish'}
      </button>
    </div>
  )

  return (
    <div key={id} className={`record page-in${statsMode ? ' stats' : ''}${courtFullscreen ? ' court-fullscreen' : ''}`}>
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
              {!session.opponent && session.kind === 'match' ? ' · add opponent' : ''}
              {finished ? ' · finished' : ''}
              {session.self_rating ? ` · ${session.self_rating}/5` : ''}
            </span>
            <SyncBadge compact interactive={false} />
          </span>
        </button>
        <button
          type="button"
          className={`flip-fab${rotation ? ' on' : ''}`}
          onClick={() => setRotation((value) => ((value + 90) % 360) as CourtRotation)}
          aria-pressed={rotation !== 0}
          aria-label={`Rotate court 90 degrees clockwise (currently ${rotation} degrees)`}
          title={`Rotate 90° clockwise (currently ${rotation}°)`}
        >
          <Rotate90Icon />
        </button>
        {!isDesktop && (
          <button
            type="button"
            className="flip-fab fullscreen-fab"
            onClick={() => void enterCourtFullscreen()}
            aria-label="Open full-screen landscape court"
            title="Full-screen landscape court"
          >
            <FullscreenIcon />
          </button>
        )}
      </header>

      <div className="record-court">
        {statsMode && !placementMode && <StatsFilters value={filters} onChange={setFilters} />}
        <div className="court-box" ref={courtRef}>
          {courtFullscreen && (
            <button type="button" className="court-fullscreen-exit" onClick={() => void exitCourtFullscreen()} aria-label="Exit full-screen court" title="Exit full screen">
              <CloseIcon />
            </button>
          )}
          {statsMode ? (
            <Court
              rotation={rotation}
              fillViewport={courtFullscreen}
              points={shownPoints}
              compactMarks={finished ? 'overview' : 'analysis'}
              half={placementMode ? 'opposite' : 'own'}
              sideLabel={sideLabel}
              heat={placementMode ? statsSummary.placementZones : statsSummary.byZone}
              heatTotal={placementMode ? statsSummary.placements : statsSummary.lost}
              showZones
            />
          ) : (
            <Court
              rotation={rotation}
              fillViewport={courtFullscreen}
              onTap={finished ? undefined : onTap}
              onStrokeDrag={!finished && placementMode ? onStrokeDrag : undefined}
              half={placementMode ? 'opposite' : 'own'}
              sideLabel={sideLabel}
              disabled={finished || !!pending}
              points={points}
              emphasizeLast={!finished}
              compactMarks={finished ? 'overview' : undefined}
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
              {finished
                ? 'Session finished and locked. Unlock it to record or edit points.'
                : placementMode
                ? `Click where the ball landed, then pick the stroke ${player.name ? `${player.name} hit it with` : 'she hit it with'}. Swipe up to record a serve; mark the net for a Net error.`
                : `Click the court where ${player.subject} lost the point, then pick FH/BH × Long/Net/Wide right there.`}
            </div>
          )}
          {actions}
          {statsMode ? (
            <StatsPanel summary={statsSummary} count={shownPoints.length} mode={placementMode ? 'placement' : 'errors'} onExportCsv={exportCsv} onExportJson={exportJson} />
          ) : (
            <div className="card side-list">
              <div className="section-title">Points</div>
              <PointList points={points} onOpen={finished ? undefined : (p, index) => setOpenPoint({ id: p.id, index })} onDelete={finished ? undefined : deletePoint} />
            </div>
          )}
        </aside>
      ) : statsMode ? (
        <>
          <div className="record-bottom">{actions}</div>
          <section className="record-stats" aria-label="Session stats">
            <StatsPanel summary={statsSummary} count={shownPoints.length} mode={placementMode ? 'placement' : 'errors'} onExportCsv={exportCsv} onExportJson={exportJson} />
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
                <PointList points={points} onOpen={finished ? undefined : (p, index) => setOpenPoint({ id: p.id, index })} onDelete={finished ? undefined : deletePoint} />
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

      {showFinish && <FinishSessionModal session={session} onClose={() => setShowFinish(false)} />}

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

const RATING_LABELS = ['Rough', 'Below par', 'Okay', 'Good', 'Great'] as const

function FinishSessionModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [rating, setRating] = useState(session.self_rating ?? 3)
  const finished = !!session.finished_at

  const save = () => {
    store.updateSession(session.id, {
      self_rating: rating,
      finished_at: session.finished_at ?? new Date().toISOString(),
    })
    onClose()
  }

  const unlock = () => {
    store.updateSession(session.id, { finished_at: null })
    onClose()
  }

  return (
    <Modal title={finished ? 'Session rating' : 'Finish session'} onClose={onClose}>
      <div className="field">
        <span>How did you play?</span>
        <div className="rating-picker" role="radiogroup" aria-label="Self rating from 1 to 5">
          {RATING_LABELS.map((label, index) => {
            const value = index + 1
            return (
              <button key={value} type="button" role="radio" aria-checked={rating === value} className={rating === value ? 'on' : ''} onClick={() => setRating(value)}>
                <strong>{value}</strong>
                <small>{label}</small>
              </button>
            )
          })}
        </div>
      </div>
      <div className="row finish-rating-actions">
        <button type="button" className="btn primary grow" onClick={save}>
          {finished ? 'Save rating' : 'Finish & lock'}
        </button>
        {finished && (
          <button type="button" className="btn" onClick={unlock}>
            <LockIcon open /> Unlock
          </button>
        )}
      </div>
    </Modal>
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
