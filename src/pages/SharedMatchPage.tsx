import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Court } from '../components/Court'
import { MarkLegend } from '../components/marks'
import { StatsFilters, StatsPanel, type StatsFilterState } from '../components/StatsPanel'
import { filterPoints, summarize } from '../domain/stats'
import { decodeLiveSharedMatch, decodeSharedMatch, type SharedMatch } from '../domain/share'
import { sessionLabel } from '../domain/session'
import { formatDate } from '../lib/format'
import { supabase } from '../data/app'
import { isUuid } from '../domain/validate'

const DEFAULT_STATS_FILTERS: StatsFilterState = { stroke: 'all', error: 'all', shotType: 'all', forced: 'all' }

/** Isolated, read-only public stats viewer with no navigation into the private app. */
export function SharedMatchPage() {
  const { payload = '' } = useParams()
  const liveToken = isUuid(payload)
  const [liveShared, setLiveShared] = useState<SharedMatch | null>(null)
  const [loading, setLoading] = useState(liveToken)
  const [filters, setFilters] = useState<StatsFilterState>(DEFAULT_STATS_FILTERS)
  const requestId = useRef(0)
  const shared = liveToken ? liveShared : decodeSharedMatch(payload)

  useEffect(() => {
    if (!liveToken) return
    let active = true
    const refresh = async (initial = false) => {
      const id = ++requestId.current
      if (initial) setLoading(true)
      if (!supabase) {
        if (active && id === requestId.current) setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_shared_match', { p_token: payload })
      if (!active || id !== requestId.current) return
      const next = error ? null : decodeLiveSharedMatch(data)
      // A transient refresh failure should not replace statistics already on screen.
      if (next || initial) setLiveShared(next)
      setLoading(false)
    }
    setLiveShared(null)
    setFilters(DEFAULT_STATS_FILTERS)
    void refresh(true)
    const interval = window.setInterval(() => void refresh(), 10_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [liveToken, payload])

  const placement = shared?.session.mode === 'placement'
  const visiblePoints = useMemo(
    () => (shared?.points ?? []).filter((point) => placement ? point.outcome === 'placement' || point.error_type === 'net' : point.outcome !== 'placement'),
    [shared, placement],
  )
  const shownPoints = useMemo(() => placement ? visiblePoints : filterPoints(visiblePoints, filters), [visiblePoints, placement, filters])
  const summary = useMemo(() => summarize(shownPoints), [shownPoints])
  const mapPoints = placement ? shownPoints : shownPoints.filter((point) => point.outcome !== 'winner')

  if (loading) {
    return (
      <main className="public-share public-share-invalid">
        <div className="empty"><strong>Loading current match statistics…</strong></div>
      </main>
    )
  }

  if (!shared) {
    return (
      <main className="public-share public-share-invalid">
        <div className="empty">
          <strong>This match link is invalid or incomplete.</strong>
        </div>
      </main>
    )
  }

  const { session } = shared
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
        {!placement && <StatsFilters value={filters} points={visiblePoints} onChange={setFilters} />}
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
          {!placement && (
            <div className="stats-map-winners" aria-label={`${summary.winners} opponent winners`}>
              <span className="stats-map-winner-mark" aria-hidden="true">×</span>
              Opponent winners <strong>{summary.winners}</strong>
            </div>
          )}
        </div>
        <MarkLegend mode={placement ? 'placement' : 'errors'} />
        <StatsPanel summary={summary} count={shownPoints.length} mode={placement ? 'placement' : 'errors'} showExports={false} />
        {session.notes && <div className="card shared-notes"><div className="section-title">Notes</div>{session.notes}</div>}
      </section>
    </main>
  )
}
