import { useEffect, useId, useRef, useState } from 'react'
import { findNearbyTennisVenues, type Venue } from '../data/places'
import { cleanOpponent, type TagRow } from '../domain/session'
import { currentPosition, formatDistance } from '../lib/geo'
import { PinIcon } from './Icons'

export interface VenuePickerProps {
  value: string
  onChange: (value: string) => void
  /** Places from previous sessions — one-tap chips, and what you get with no signal. */
  known: TagRow[]
  label?: string
  maxChips?: number
}

type Nearby = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; venues: Venue[] }

/** Court / club name: type it, pick a previous one, or look up tennis venues near you (OpenStreetMap). */
export function VenuePicker({ value, onChange, known, label = 'Court / venue', maxChips = 5 }: VenuePickerProps) {
  const listId = useId()
  const [nearby, setNearby] = useState<Nearby>({ state: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const lookUp = async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setNearby({ state: 'loading' })
    try {
      const at = await currentPosition()
      const venues = await findNearbyTennisVenues(at, { signal: ac.signal })
      if (ac.signal.aborted) return
      setNearby({ state: 'done', venues })
    } catch (e) {
      if (ac.signal.aborted) return
      setNearby({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const current = cleanOpponent(value).toLowerCase()
  const chips = known.slice(0, maxChips)

  return (
    <div className="field venue-picker">
      <span>{label}</span>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input grow"
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Riverside Tennis Club"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
        />
        <button type="button" className="btn sm ghost venue-near" onClick={() => void lookUp()} disabled={nearby.state === 'loading'} title="Find tennis courts near you">
          <PinIcon /> {nearby.state === 'loading' ? 'Finding…' : 'Nearby'}
        </button>
      </div>
      <datalist id={listId}>
        {known.map((v) => (
          <option key={v.key} value={v.name} />
        ))}
      </datalist>

      {chips.length > 0 && (
        <div className="chip-group venue-chips">
          {chips.map((v) => {
            const on = current === v.key
            return (
              <button key={v.key} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? '' : v.name)}>
                {v.name}
              </button>
            )
          })}
        </div>
      )}

      {nearby.state === 'loading' && <p className="kbd-hint venue-note">Searching OpenStreetMap for courts near you — this can take a few seconds.</p>}
      {nearby.state === 'error' && <div className="notice err venue-note">{nearby.message}</div>}
      {nearby.state === 'done' && (
        <div className="venue-results">
          {nearby.venues.length === 0 ? (
            <p className="muted">No named tennis courts found within 8 km — type the name.</p>
          ) : (
            <ul>
              {nearby.venues.map((v) => (
                <li key={v.id}>
                  <button type="button" className="venue-hit" onClick={() => onChange(v.name)}>
                    <span className="grow">
                      {v.name}
                      {v.kind === 'club' && <span className="muted"> · club</span>}
                    </span>
                    <span className="muted dist">{formatDistance(v.distance)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="kbd-hint">Courts from OpenStreetMap · your location is only used for this search and never saved.</p>
        </div>
      )}
    </div>
  )
}
