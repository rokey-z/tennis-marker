import { useParams } from 'react-router'
import { Court } from '../components/Court'
import { MarkLegend } from '../components/marks'
import { StatsPanel } from '../components/StatsPanel'
import { summarize } from '../domain/stats'
import { decodeSharedMatch } from '../domain/share'
import { sessionLabel } from '../domain/session'
import { formatDate } from '../lib/format'

/** Isolated, read-only public stats viewer with no navigation into the private app. */
export function SharedMatchPage() {
  const { payload = '' } = useParams()
  const shared = decodeSharedMatch(payload)

  if (!shared) {
    return (
      <main className="public-share public-share-invalid">
        <div className="empty">
          <strong>This match link is invalid or incomplete.</strong>
        </div>
      </main>
    )
  }

  const { session, points } = shared
  const placement = session.mode === 'placement'
  const summary = summarize(points)
  const mapPoints = placement ? points : points.filter((point) => point.outcome !== 'winner')
  return (
    <main className="public-share">
      <section className="shared-match page-in">
        <header className="shared-head">
          <div>
            <div className="eyebrow">Read-only match statistics</div>
            <h1>{sessionLabel(session)}</h1>
            <p className="muted">{formatDate(session.date)}{session.venue ? ` · ${session.venue}` : ''}</p>
          </div>
          {session.self_rating && <div className="shared-rating"><strong>{session.self_rating}</strong><span>/100</span></div>}
        </header>
        <div className="shared-court">
          <Court
            points={mapPoints}
            compactMarks="analysis"
            half={placement ? 'opposite' : 'own'}
            sideLabel={placement ? 'Opponent’s side' : 'Player’s side'}
            heat={placement ? null : summary.byZone}
            placementHeat={placement ? { in: summary.placementInZones, long: summary.placementLongZones, wide: summary.placementWideZones, net: summary.placementNet } : null}
            heatTotal={placement ? summary.placements : summary.total}
            showZones
          />
        </div>
        <MarkLegend mode={placement ? 'placement' : 'errors'} />
        <StatsPanel summary={summary} count={points.length} mode={placement ? 'placement' : 'errors'} showExports={false} />
        {session.notes && <div className="card shared-notes"><div className="section-title">Notes</div>{session.notes}</div>}
      </section>
    </main>
  )
}
