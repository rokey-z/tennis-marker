import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatDate } from '../lib/format'
import { ErrorsModeIcon, PlacementModeIcon, PlusIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { usePlayer } from '../components/hooks'
import { store, useAppState } from '../data/app'
import { liveSessions } from '../data/store'
import { sessionLabel } from '../domain/session'
import { perSessionCounts } from '../domain/stats'
import { KIND_LABEL, MODE_LABEL, type SessionKind } from '../domain/types'

export function SessionsPage() {
  const state = useAppState()
  const player = usePlayer()
  const nav = useNavigate()
  // oldest first, so the newest session sits at the bottom — next to the thumb, next to the buttons
  const rows = useMemo(() => perSessionCounts(liveSessions(state), Object.values(state.points)).reverse(), [state])

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

      {rows.length === 0 ? (
        <div className="empty">
          <strong>No sessions yet</strong>
          Start a practice or match, then tap the court where {player.subject} loses each point.
        </div>
      ) : (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>
            Sessions
          </div>
          <ul className="session-list">
            {rows.map(({ session, count, fh, bh }) => (
              <li key={session.id}>
                <Link to={`/session/${session.id}`} className="session-card">
                  <span className={`s-mode ${session.mode}`} title={`${MODE_LABEL[session.mode]} session`} aria-hidden="true">
                    {session.mode === 'placement' ? <PlacementModeIcon /> : <ErrorsModeIcon />}
                  </span>
                  <div className="grow">
                    <div className="title">{sessionLabel(session)}</div>
                    <div className="sub">
                      {MODE_LABEL[session.mode]} · {KIND_LABEL[session.kind]} · {formatDate(session.date)}
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
        </>
      )}
    </Shell>
  )
}
