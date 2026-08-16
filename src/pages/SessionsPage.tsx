import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { formatDate } from '../lib/format'
import { PlusIcon } from '../components/Icons'
import { Shell } from '../components/Shell'
import { store, useAppState } from '../data/app'
import { liveSessions } from '../data/store'
import { perSessionCounts } from '../domain/stats'
import { KIND_LABEL, type SessionKind } from '../domain/types'

export function SessionsPage() {
  const state = useAppState()
  const nav = useNavigate()
  const rows = useMemo(() => perSessionCounts(liveSessions(state), Object.values(state.points)), [state])

  const create = (kind: SessionKind) => {
    const s = store.createSession({ kind })
    nav(`/session/${s.id}`)
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
          Start a practice or match, then tap the court where she loses each point.
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
                  <div className="grow">
                    <div className="title">{session.title}</div>
                    <div className="sub">
                      {KIND_LABEL[session.kind]} · {formatDate(session.date)}
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
                    <small>{count === 1 ? 'error' : 'errors'}</small>
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
