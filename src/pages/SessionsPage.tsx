import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatDate } from '../lib/format'
import { ErrorsModeIcon, PlacementModeIcon, PlusIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { usePlayer } from '../components/hooks'
import { store, useAppState } from '../data/app'
import { liveSessions } from '../data/store'
import { sessionLabel } from '../domain/session'
import { perSessionCounts } from '../domain/stats'
import { KIND_LABEL, KIND_PLURAL, MODE_LABEL, SESSION_KINDS, type SessionKind } from '../domain/types'

type KindFilter = SessionKind | 'all'

export function SessionsPage() {
  const state = useAppState()
  const player = usePlayer()
  const nav = useNavigate()
  const [kind, setKind] = useState<KindFilter>('all')
  // oldest first, so the newest session sits at the bottom — next to the thumb, next to the buttons
  const all = useMemo(() => perSessionCounts(liveSessions(state), Object.values(state.points)).reverse(), [state])
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
            {rows.map(({ session, count, fh, bh }) => (
              <li key={session.id}>
                <Link to={`/session/${session.id}`} className="session-card">
                  <span className={`s-mode ${session.mode}`}>
                    <span className="s-mode-chip" aria-hidden="true">{session.mode === 'placement' ? <PlacementModeIcon /> : <ErrorsModeIcon />}</span>
                    <small>{MODE_LABEL[session.mode]}</small>
                  </span>
                  <div className="grow">
                    <div className="title">{sessionLabel(session)}</div>
                    <div className="sub">
                      {KIND_LABEL[session.kind]} · {formatDate(session.date)}
                      {session.venue ? ` · ${session.venue}` : ''}
                      {session.notes ? ` · ${session.notes.slice(0, 40)}${session.notes.length > 40 ? '…' : ''}` : ''}
                    </div>
                    {count > 0 && (
                      <div className="split-bar" title={`FH ${fh} · BH ${bh}`}>
                        <span className="fh" style={{ width: `${(fh / count) * 100}%` }} />
                        <span className="bh" style={{ width: `${(bh / count) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="count">
                    {count}
                    <small>{session.mode === 'placement' ? (count === 1 ? 'ball' : 'balls') : count === 1 ? 'mark' : 'marks'}</small>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          )}
        </>
      )}
    </Shell>
  )
}
