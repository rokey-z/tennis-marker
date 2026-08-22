import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatDate } from '../lib/format'
import { ErrorsModeIcon, PlacementModeIcon, PlusIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { usePlayer } from '../components/hooks'
import { store, useAppState } from '../data/app'
import { livePointsForSession, liveSessions } from '../data/store'
import { sessionLabel } from '../domain/session'
import { perSessionCounts, summarize, type Summary } from '../domain/stats'
import { KIND_LABEL, KIND_PLURAL, SESSION_KINDS, STROKE_LABEL, type SessionKind } from '../domain/types'

type KindFilter = SessionKind | 'all'

export function SessionsPage() {
  const state = useAppState()
  const player = usePlayer()
  const nav = useNavigate()
  const [kind, setKind] = useState<KindFilter>('all')
  // oldest first, so the newest session sits at the bottom — next to the thumb, next to the buttons
  const all = useMemo(() => perSessionCounts(liveSessions(state), Object.values(state.points)).reverse(), [state])
  const summaries = useMemo(() => new Map(all.map(({ session }) => [session.id, summarize(livePointsForSession(state, session.id))])), [all, state])
  const rows = useMemo(() => (kind === 'all' ? all : all.filter((r) => r.session.kind === kind)), [all, kind])
  const countFor = (k: KindFilter) => (k === 'all' ? all.length : all.filter((r) => r.session.kind === k).length)

  const create = (kind: SessionKind) => {
    const s = store.createSession({ kind })
    // open the details sheet first so opponent, court and mode are set before the first tap
    nav(`/session/${s.id}`, { state: { justCreated: true } })
  }

  return (
    <Shell title="Tennis Marker">
      <div className="cta-row">
        <button type="button" className="btn primary" onClick={() => create('practice')}>
          <PlusIcon /> Practice
        </button>
        <button type="button" className="btn primary" onClick={() => create('match')}>
          <PlusIcon /> Match
        </button>
      </div>

      {all.length === 0 ? (
        <div className="empty">
          <strong>No sessions yet</strong>
          Start a practice or match, then tap the court where {player.subject} loses each point.
        </div>
      ) : (
        <>
          {/* matches and practices are read differently, so they get their own lists */}
          <div className="list-tabs" role="group" aria-label="Which sessions to show">
            {(['all', ...SESSION_KINDS] as KindFilter[]).map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k === 'all' ? 'All' : KIND_PLURAL[k]}
                <small>{countFor(k)}</small>
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="empty">
              <strong>No {KIND_PLURAL[kind as SessionKind].toLowerCase()} yet</strong>
              Start one with the button above.
            </div>
          ) : (
          <ul className="session-list">
            {rows.map(({ session }) => {
              const summary = summaries.get(session.id)!
              const placement = session.mode === 'placement'
              const count = placement ? summary.placements : summary.total
              const focus = sessionFocus(summary, placement)
              return (
              <li key={session.id}>
                <Link to={`/session/${session.id}`} className="session-card">
                  <span className={`s-mode ${session.mode}`}>
                    <span className="s-mode-chip" aria-hidden="true">{session.mode === 'placement' ? <PlacementModeIcon /> : <ErrorsModeIcon />}</span>
                    <small>{placement ? 'Ball placement' : `${player.name || 'Player'}’s errors`}</small>
                  </span>
                  <div className="grow">
                    <div className="title">{sessionLabel(session)}</div>
                    <div className="sub">
                      {KIND_LABEL[session.kind]} · {formatDate(session.date)}
                      {session.venue ? ` · ${session.venue}` : ''}
                      {session.self_rating ? ` · ${session.self_rating}/100` : ''}
                    </div>
                    <div className={`session-focus${focus ? '' : ' ready'}`}>{focus ?? 'Ready to record'}</div>
                  </div>
                  <div className="count">
                    {count}
                    <small>{placement ? (count === 1 ? 'mark' : 'marks') : count === 1 ? 'error' : 'errors'}</small>
                  </div>
                </Link>
              </li>
              )})}
          </ul>
          )}
        </>
      )}
    </Shell>
  )
}

function sessionFocus(summary: Summary, placement: boolean): string | null {
  if (placement) {
    const candidates = (['fh', 'bh', 'serve'] as const).flatMap((stroke) =>
      (['net', 'wide', 'long'] as const).map((result) => ({
        stroke,
        result,
        count: result === 'net' ? (stroke === 'serve' ? 0 : summary.matrix[stroke].net) : summary.placementMatrix[stroke][result],
      })),
    )
    const best = candidates.sort((a, b) => b.count - a.count)[0]
    return best?.count >= 3 ? `Focus: ${STROKE_LABEL[best.stroke]} ${best.result} — ${best.count} marks` : null
  }
  const candidates = (['fh', 'bh'] as const).flatMap((stroke) =>
    (['net', 'wide', 'long'] as const).map((error) => ({ stroke, error, count: summary.matrix[stroke][error] })),
  )
  const best = candidates.sort((a, b) => b.count - a.count)[0]
  return best?.count >= 3 ? `Focus: ${STROKE_LABEL[best.stroke]} ${best.error} — ${best.count} errors` : null
}
