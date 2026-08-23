import { Link, useParams } from 'react-router'
import { Court } from '../components/Court'
import { MarkLegend } from '../components/marks'
import { Shell } from '../components/Shell'
import { Tally } from '../components/Bits'
import { summarize } from '../domain/stats'
import { decodeSharedMatch } from '../domain/share'
import { sessionLabel } from '../domain/session'
import { formatDate } from '../lib/format'

/** Read-only public viewer for a self-contained match link. */
export function SharedMatchPage() {
  const { payload = '' } = useParams()
  const shared = decodeSharedMatch(payload)

  if (!shared) {
    return (
      <Shell title="Shared match">
        <div className="empty">
          <strong>This match link is invalid or incomplete.</strong>
          <Link to="/">Open Tennis Marker</Link>
        </div>
      </Shell>
    )
  }

  const { session, points } = shared
  const placement = session.mode === 'placement'
  const summary = summarize(points)
  return (
    <Shell title="Shared match">
      <section className="shared-match page-in">
        <div className="shared-head">
          <div>
            <div className="eyebrow">Read-only shared match</div>
            <h1>{sessionLabel(session)}</h1>
            <p className="muted">{formatDate(session.date)}{session.venue ? ` · ${session.venue}` : ''}</p>
          </div>
          <Link className="btn" to="/">Open app</Link>
        </div>
        <div className="card">
          <Tally s={summary} mode={placement ? 'placement' : 'errors'} />
        </div>
        <div className="shared-court">
          <Court
            points={points}
            compactMarks="overview"
            half={placement ? 'opposite' : 'own'}
            sideLabel={placement ? 'Opponent’s side' : 'Player’s side'}
            showZones
          />
        </div>
        <MarkLegend mode={placement ? 'placement' : 'errors'} />
        {session.notes && <div className="card shared-notes">{session.notes}</div>}
      </section>
    </Shell>
  )
}
