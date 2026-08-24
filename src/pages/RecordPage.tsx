import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Modal, PointList, SyncBadge, Tally, Toast, type ToastState } from '../components/Bits'
import { useIsDesktop, usePlayer } from '../components/hooks'
import { shortDate } from '../lib/format'
import { Court, type CourtRotation } from '../components/Court'
import { StatsFilters, StatsPanel, type StatsFilterState } from '../components/StatsPanel'
import { BackIcon, LinkIcon, ListIcon, LockIcon, Rotate90Icon, UndoIcon } from '../components/Icons'
import { ShotPopover } from '../components/ShotPopover'
import { store, supabase, sync, useAppState } from '../data/app'
import { defaultId, livePointsForSession } from '../data/store'
import { describeMark, describeZone, placementResultFor, zoneFor } from '../domain/court'
import { capitalise, cleanOpponent, cleanUtr, formatUtr } from '../domain/session'
import { opponentRowsWithRoster, sessionLabel, venueRows } from '../domain/session'
import { MarkLegend, markLabel } from '../components/marks'
import { PointSheet } from '../components/PointSheet'
import { OpponentPicker } from '../components/OpponentPicker'
import { VenuePicker } from '../components/VenuePicker'
import { filterPoints, summarize } from '../domain/stats'
import { pointsToCsv, safeFilename, toExportBundle } from '../domain/export'
import { decodeLiveSharedMatch } from '../domain/share'
import { downloadText } from '../lib/format'
import { isUuid } from '../domain/validate'
import { ERROR_LABEL, KIND_LABEL, MODE_HINT, MODE_LABEL, SESSION_MODES, SHOT_TYPE_LABEL, STROKE_SHORT, type ErrorType, type Outcome, type PlacementStroke, type Point, type Session, type ShotType, type Stroke } from '../domain/types'

const LOG_KEY = 'tennis-marker.logOpen'
const ROTATE_90_KEY = 'tennis-marker.rotate90'
const AFTER_SAVE_IGNORE_MS = 300
const DEFAULT_STATS_FILTERS: StatsFilterState = { stroke: 'all', error: 'all', shotType: 'all', forced: 'all' }

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
  const [pending, setPending] = useState<{ x: number; y: number; at: { clientX: number; clientY: number }; surface: 'court' | 'net'; intent?: 'error' | 'player_winner'; selection?: { stroke: Stroke; error: ErrorType } } | null>(null)
  const courtRef = useRef<HTMLDivElement>(null)
  const [forced, setForced] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [logOpen, setLogOpen] = useState(() => localStorage.getItem(LOG_KEY) !== '0')
  const [view, setView] = useState<'court' | 'stats'>('court')
  const [statsMapCompact, setStatsMapCompact] = useState(false)
  const statsPanelScrollTop = useRef(0)
  const [filters, setFilters] = useState<StatsFilterState>(DEFAULT_STATS_FILTERS)
  const statsMode = view === 'stats'
  const shownPoints = useMemo(() => (statsMode ? filterPoints(points, filters) : points), [statsMode, points, filters])
  const statsSummary = useMemo(() => summarize(shownPoints), [shownPoints])
  const justCreated = (useLocation().state as { justCreated?: boolean } | null)?.justCreated === true
  const [showDetails, setShowDetails] = useState(justCreated)
  const [showFinish, setShowFinish] = useState(false)
  const [statsShareStatus, setStatsShareStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
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
  useEffect(() => {
    if (!statsMode || isDesktop) {
      statsPanelScrollTop.current = 0
      setStatsMapCompact(false)
      return
    }
    const update = () => {
      const distance = Math.max(window.scrollY, statsPanelScrollTop.current)
      setStatsMapCompact((compact) => compact ? distance > 8 : distance > 56)
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [isDesktop, statsMode])

  const onTap = useCallback((x: number, y: number, at: { clientX: number; clientY: number }, surface: 'court' | 'net' = 'court') => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y, at, surface, intent: 'error' })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const onErrorDrag = useCallback((x: number, y: number, stroke: Stroke, error: ErrorType, at: { clientX: number; clientY: number }) => {
    if (performance.now() < ignoreUntil.current) return
    setForced(false)
    setPending({ x, y, at, surface: 'court', intent: 'error', selection: { stroke, error } })
  }, [])

  const onPlayerWinnerPress = useCallback((x: number, y: number, at: { clientX: number; clientY: number }, surface: 'court' | 'net' = 'court') => {
    if (performance.now() < ignoreUntil.current || surface === 'net') return
    setForced(false)
    setPending({ x, y, at, surface, intent: 'player_winner' })
  }, [])

  const onErrorWinner = useCallback((x: number, y: number) => {
    if (performance.now() < ignoreUntil.current) return
    const p = store.addPoint({ session_id: id, x, y, stroke: '', error_type: '', forced: false, outcome: 'winner', placement_result: null, shot_type: null })
    ignoreUntil.current = performance.now() + AFTER_SAVE_IGNORE_MS
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
    setToast({
      id: Date.now(),
      text: `Opponent winner · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`,
      actionLabel: 'Undo',
      onAction: () => store.deletePoint(p.id),
    })
  }, [id])

  useEffect(() => setStatsShareStatus('idle'), [id, statsMode])

  const logPoint = (stroke: PlacementStroke | '', error: ErrorType | '', outcome: Outcome, placementResult: Point['placement_result'] = null, shotType: ShotType | null = null) => {
    if (!pending) return
    const p = store.addPoint({ session_id: id, x: pending.x, y: pending.y, stroke, error_type: error, forced: outcome === 'error' && forced, outcome, placement_result: placementResult, shot_type: shotType })
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
          : outcome === 'player_winner'
          ? `${player.subject} winner · ${STROKE_SHORT[stroke as Stroke]} ${shotType ? SHOT_TYPE_LABEL[shotType] : 'ball'} · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`
          : outcome === 'winner'
          ? `Opponent winner · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`
          : `${STROKE_SHORT[stroke as Stroke]} ${ERROR_LABEL[error as ErrorType].toLowerCase()} · ${shotType ? SHOT_TYPE_LABEL[shotType] : 'ball'} · ${forced ? 'forced' : 'unforced'} · ${describeZone(zoneFor(p.x, p.y)).toLowerCase()}`,
      actionLabel: 'Undo',
      onAction: () => store.deletePoint(p.id),
    })
  }

  const pick = (stroke: Stroke, error: ErrorType, shotType?: ShotType) => {
    const net = pending?.surface === 'net'
    if (placementMode && net) logPoint(stroke, 'net', 'error')
    else logPoint(stroke, error, placementMode ? 'placement' : 'error', placementMode ? placementResultFor(pending!.x, pending!.y) : null, shotType ?? null)
  }
  /** The opponent hit a winner past her: one tap, nothing of hers to attribute. */
  const logWinner = () => logPoint('', '', 'winner')

  /** Lily hit a winner from this position; retain both her stroke and the selected ball type. */
  const logPlayerWinner = (stroke: Stroke, shotType: ShotType) => logPoint(stroke, '', 'player_winner', null, shotType)

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
  const copyMatchLink = async (match: Session) => {
    if (match.kind !== 'match' || !supabase) return false
    const token = isUuid(match.share_token) ? match.share_token : defaultId()
    store.updateSession(match.id, {
      opponent: match.opponent,
      opponent_utr: match.opponent_utr ?? null,
      venue: match.venue,
      date: match.date,
      kind: match.kind,
      mode: match.mode,
      notes: match.notes,
      share_token: token,
    })
    await sync.flush()
    // Verify the public function can see this token before handing out the link. This also gives a
    // useful failure when migration 0010 has not been applied yet.
    const { data, error } = await supabase.rpc('get_shared_match', { p_token: token })
    if (error || !decodeLiveSharedMatch(data)) return false
    const url = `${window.location.origin}${window.location.pathname}#/share/${token}`
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
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
      {statsMode ? (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            setStatsShareStatus('copying')
            setStatsShareStatus(await copyMatchLink(session) ? 'copied' : 'error')
          }}
          disabled={session.kind !== 'match' || statsShareStatus === 'copying'}
          title={session.kind === 'match' ? 'Copy live public stats link' : 'Public links are available for matches'}
        >
          <LinkIcon /> {statsShareStatus === 'copying' ? 'Copying…' : statsShareStatus === 'copied' ? 'Copied' : statsShareStatus === 'error' ? 'Try again' : 'Copy link'}
        </button>
      ) : (
        <button type="button" className="btn" onClick={undo} disabled={finished || points.length === 0}>
          <UndoIcon /> Undo
        </button>
      )}
      <div className="view-mode-toggle" role="group" aria-label="Court view mode">
        <button type="button" className={!statsMode ? 'active' : ''} onClick={() => setView('court')} aria-pressed={!statsMode}>
          Marker mode
        </button>
        <button type="button" className={statsMode ? 'active' : ''} onClick={() => setView('stats')} aria-pressed={statsMode}>
          Stats mode
        </button>
      </div>
    </div>
  )

  return (
    <div key={id} className={`record page-in${statsMode ? ' stats' : ''}${statsMapCompact ? ' stats-map-compact' : ''}`}>
      <header className="record-head">
        <Link to="/" className="icon-btn" aria-label="Back to sessions">
          <BackIcon />
        </Link>
        <button type="button" className="title-btn" onClick={() => setShowDetails(true)} aria-label="Edit session details">
          <span className="tb-name">
            <strong>{cleanOpponent(session.opponent) || (session.kind === 'match' ? 'Add opponent' : 'Practice')}</strong>
            {formatUtr(session.opponent_utr) && <span className="tb-utr">UTR {formatUtr(session.opponent_utr)}</span>}
          </span>
          <span className="tb-meta">
            <span className="tb-kind">{KIND_LABEL[session.kind]}</span>
            <span className="tb-time">{shortDate(session.date)}</span>
            <SyncBadge compact interactive={false} />
          </span>
        </button>
        <div className="record-head-actions">
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
          <button type="button" className={`btn header-finish${finished ? ' primary' : ''}`} onClick={openFinish} aria-pressed={finished} title={finished ? 'Edit rating or unlock this session' : 'Finish, rate, and lock this session'}>
            <LockIcon />
            {finished && session.self_rating ? (
              <span className="header-rating">
                <small>Self-rating</small>
                <span>{session.self_rating}/100</span>
              </span>
            ) : 'Finish'}
          </button>
        </div>
      </header>

      <div className="record-court">
        {statsMode && !placementMode && <StatsFilters value={filters} points={points} onChange={setFilters} />}
        <div className="court-box" ref={courtRef}>
          {statsMode ? (
            <Court
              rotation={rotation}
              points={placementMode ? shownPoints : shownPoints.filter((point) => point.outcome !== 'winner')}
              highlightedPointId={openPoint?.id}
              compactMarks={finished ? 'overview' : 'analysis'}
              half={placementMode ? 'opposite' : 'own'}
              sideLabel={sideLabel}
              heat={placementMode ? null : statsSummary.byZone}
              placementHeat={placementMode ? { in: statsSummary.placementInZones, long: statsSummary.placementLongZones, wide: statsSummary.placementWideZones, net: statsSummary.placementNet } : null}
              heatTotal={placementMode ? statsSummary.placements : statsSummary.total}
              showZones
            />
          ) : (
            <Court
              rotation={rotation}
              onTap={finished ? undefined : onTap}
              onLongPress={!finished && !placementMode ? onPlayerWinnerPress : undefined}
              onStrokeDrag={!finished && placementMode ? onStrokeDrag : undefined}
              onErrorSelect={!finished && !placementMode ? onErrorDrag : undefined}
              onErrorWinner={!finished && !placementMode ? onErrorWinner : undefined}
              half={placementMode ? 'opposite' : 'own'}
              sideLabel={sideLabel}
              disabled={finished || !!pending || !!openPoint}
              points={points}
              highlightedPointId={openPoint?.id}
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
            initialErrorPick={pending.selection}
            onPick={pick}
            onWinner={logWinner}
            winnerOnly={pending.intent === 'player_winner'}
            onPlayerWinner={logPlayerWinner}
            player={player}
            onCancel={cancel}
          />
          )}
          {statsMode && !placementMode && (
            <div className="stats-map-winners">
              {statsSummary.winners > 0 && <span aria-label={`${statsSummary.winners} opponent winners`}><span className="stats-map-winner-mark" aria-hidden="true">×</span> Opponent winners <strong>{statsSummary.winners}</strong></span>}
              {statsSummary.playerWinners > 0 && <span aria-label={`${statsSummary.playerWinners} ${player.subject} winners`}><span className="stats-map-player-winner-mark" aria-hidden="true">★</span> {player.subject} winners <strong>{statsSummary.playerWinners}</strong></span>}
            </div>
          )}
        </div>
      </div>

      {isDesktop ? (
        <aside className="record-side">
          {!statsMode && (
            <div className="record-hint">
              {finished
                ? 'Session finished and locked. Unlock it to record or edit points.'
                : placementMode
                ? `Click where the ball landed, then pick the stroke ${player.name ? `${player.name} hit it with` : 'she hit it with'}. Swipe up to record a serve; mark the net for a Net error.`
                : `Press where ${player.subject} lost the point, drag toward FH/BH × Wide/Long/Net, then choose the ball type. Drag beyond the wheel for an opponent winner. Long-press where ${player.subject} stood to record ${player.possessive} winner.`}
            </div>
          )}
          {actions}
          {statsMode ? (
            <StatsPanel summary={statsSummary} count={shownPoints.length} mode={placementMode ? 'placement' : 'errors'} onExportCsv={exportCsv} onExportJson={exportJson} />
          ) : (
            <div className="card side-list">
              <div className="side-list-head">
                <div className="section-title">Points</div>
                <Tally s={summary} mode={placementMode ? 'placement' : 'errors'} />
              </div>
              <PointList points={points} onOpen={finished ? undefined : (p, index) => setOpenPoint({ id: p.id, index })} onDelete={finished ? undefined : deletePoint} />
            </div>
          )}
        </aside>
      ) : statsMode ? (
        <>
          <div className="record-bottom">{actions}</div>
          <section
            className="record-stats"
            aria-label="Session stats"
            onScroll={(event) => {
              statsPanelScrollTop.current = event.currentTarget.scrollTop
              const distance = Math.max(window.scrollY, statsPanelScrollTop.current)
              setStatsMapCompact((compact) => compact ? distance > 8 : distance > 56)
            }}
          >
            <StatsPanel summary={statsSummary} count={shownPoints.length} mode={placementMode ? 'placement' : 'errors'} onExportCsv={exportCsv} onExportJson={exportJson} />
          </section>
        </>
      ) : (
        <>
          <div className="record-bottom">
            {actions}
          </div>
          <section className={`record-log${logOpen ? ' open' : ''}`} aria-label="Logged points">
            <button type="button" className="log-head" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
              <ListIcon />
              <Tally s={summary} mode={placementMode ? 'placement' : 'errors'} />
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

      {showFinish && (
        <FinishSessionModal
          session={session}
          onClose={() => setShowFinish(false)}
          onFinished={() => {
            setShowFinish(false)
            setPending(null)
            setOpenPoint(null)
            setView('stats')
          }}
        />
      )}

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

function FinishSessionModal({
  session,
  onClose,
  onFinished,
}: {
  session: Session
  onClose: () => void
  onFinished: () => void
}) {
  const [rating, setRating] = useState(session.self_rating ?? 50)
  const finished = !!session.finished_at

  const save = () => {
    store.updateSession(session.id, {
      self_rating: rating,
      finished_at: session.finished_at ?? new Date().toISOString(),
    })
    if (finished) onClose()
    else onFinished()
  }

  const unlock = () => {
    store.updateSession(session.id, { finished_at: null })
    onClose()
  }

  return (
    <Modal title={finished ? 'Session rating' : 'Finish session'} onClose={onClose}>
      <div className="field">
        <span>How did you play?</span>
        <div className="rating-score">
          <output htmlFor="self-rating"><strong>{rating}</strong><span>/100</span></output>
          <input
            id="self-rating"
            className="rating-slider"
            type="range"
            min="1"
            max="100"
            step="1"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            aria-label="Self rating out of 100"
          />
          <div className="rating-scale" aria-hidden="true"><span>1</span><span>50</span><span>100</span></div>
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
  const [opponentUtr, setOpponentUtr] = useState(session.opponent_utr === null || session.opponent_utr === undefined ? '' : String(session.opponent_utr))
  const [venue, setVenue] = useState(session.venue ?? '')
  const [date, setDate] = useState(session.date)
  const [kind, setKind] = useState(session.kind)
  const [notes, setNotes] = useState(session.notes)
  const [confirm, setConfirm] = useState(false)
  const known = useMemo(() => opponentRowsWithRoster(Object.values(state.sessions), state.meta.roster), [state.sessions, state.meta.roster])
  const venues = useMemo(() => venueRows(Object.values(state.sessions)), [state.sessions])
  const utrValue = cleanUtr(opponentUtr)
  const utrInvalid = kind === 'match' && opponentUtr.trim() !== '' && utrValue === null

  const save = () => {
    if (utrInvalid) return
    store.updateSession(session.id, { opponent, opponent_utr: kind === 'match' ? utrValue : null, venue, date, kind, mode, notes })
    onClose()
  }

  return (
    <Modal title={sessionLabel({ kind, opponent, opponent_utr: kind === 'match' ? utrValue : null, title: session.title })} onClose={onClose}>
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
      <OpponentPicker
        value={opponent}
        onChange={setOpponent}
        kind={kind}
        known={known}
        afterInput={kind === 'match' ? (
          <label className="field opponent-utr-field">
            <span>UTR</span>
            <input
              className="input"
              type="number"
              min="0.01"
              max="16.5"
              step="0.01"
              inputMode="decimal"
              value={opponentUtr}
              onChange={(e) => setOpponentUtr(e.target.value)}
              placeholder="8.25"
              aria-label="Opponent UTR for this session"
            />
          </label>
        ) : undefined}
      />
      {utrInvalid && <div className="notice err" style={{ margin: '-6px 0 12px' }}>Enter a UTR from 0.01 to 16.50.</div>}
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
        <button type="button" className="btn primary grow" onClick={save} disabled={utrInvalid}>
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
