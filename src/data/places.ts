import { coarse, distanceM, type Coords } from '../lib/geo'

export interface Venue {
  id: string
  name: string
  /** metres from the search point */
  distance: number
  /** 'club' for sports centres / tennis clubs, 'court' for individual pitches */
  kind: 'club' | 'court'
  lat: number
  lon: number
}

/** Public Overpass (OpenStreetMap) endpoints — no API key; the second is tried if the first fails. */
export const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

/**
 * Named tennis venues around a point. `sport~"(^|;)tennis(;|$)"` matches tennis as a whole value,
 * so "table_tennis" venues are not picked up.
 */
export function overpassQuery(c: Coords, radiusM: number): string {
  const { lat, lon } = coarse(c)
  const at = `around:${Math.round(radiusM)},${lat},${lon}`
  return `[out:json][timeout:20];
(
  nwr(${at})["sport"~"(^|;)tennis(;|$)"]["leisure"~"pitch|sports_centre|sports_hall|track"]["name"];
  nwr(${at})["club"="tennis"]["name"];
);
out center tags 60;`
}

interface OverpassElement {
  type?: string
  id?: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export function parseVenues(json: unknown, from: Coords, limit = 12): Venue[] {
  const elements = (json as { elements?: OverpassElement[] })?.elements
  if (!Array.isArray(elements)) return []
  const byName = new Map<string, Venue>()
  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = (tags.name ?? '').trim()
    const pos = el.center ?? (typeof el.lat === 'number' && typeof el.lon === 'number' ? { lat: el.lat, lon: el.lon } : null)
    if (!name || !pos) continue
    const kind: Venue['kind'] = tags.leisure === 'pitch' ? 'court' : 'club'
    const venue: Venue = {
      id: `${el.type ?? 'n'}/${el.id ?? name}`,
      name,
      distance: distanceM(from, pos),
      kind,
      lat: pos.lat,
      lon: pos.lon,
    }
    // one entry per name: a club with six courts should not fill the list
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (!existing || venue.distance < existing.distance) byName.set(key, existing ? { ...venue, kind: existing.kind === 'club' ? 'club' : venue.kind } : venue)
  }
  return [...byName.values()].sort((a, b) => a.distance - b.distance).slice(0, limit)
}

export interface FindOptions {
  radiusM?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  endpoints?: string[]
  /** Overpass is a shared public service and can queue for a while. */
  timeoutMs?: number
  /** Session-scoped cache so re-opening the sheet at the same court is instant. */
  cache?: VenueCache
  now?: () => number
}

export interface VenueCache {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const CACHE_TTL_MS = 10 * 60_000

export function cacheKey(c: Coords, radiusM: number): string {
  const { lat, lon } = coarse(c, 3)
  return `tennis-marker.venues.${lat},${lon},${Math.round(radiusM)}`
}

function defaultCache(): VenueCache | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Ties the caller's signal (if any) to our own timeout. */
function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; timedOut: () => boolean; done: () => void } {
  const ac = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ac.abort()
  }, ms)
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: ac.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/** Look up named tennis venues near the given point. Throws a user-readable Error on failure. */
export async function findNearbyTennisVenues(
  from: Coords,
  { radiusM = 8000, signal, fetchImpl, endpoints = OVERPASS_ENDPOINTS, timeoutMs = 30_000, cache = defaultCache() ?? undefined, now = Date.now }: FindOptions = {},
): Promise<Venue[]> {
  const key = cacheKey(from, radiusM)
  const cached = readCache(cache, key, now())
  if (cached) return cached

  const doFetch = fetchImpl ?? globalThis.fetch
  const body = new URLSearchParams({ data: overpassQuery(from, radiusM) })
  let lastError: unknown = null
  for (const url of endpoints) {
    const t = withTimeout(signal, timeoutMs)
    try {
      const res = await doFetch(url, { method: 'POST', body, signal: t.signal })
      if (!res.ok) {
        lastError = new Error(res.status === 429 || res.status === 504 ? 'The map service is busy — try again in a moment.' : `Map service error (${res.status}).`)
        continue
      }
      const venues = parseVenues(await res.json(), from)
      writeCache(cache, key, venues, now())
      return venues
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = t.timedOut() ? new Error('The map service is slow right now — try again, or type the name.') : e
    } finally {
      t.done()
    }
  }
  throw lastError instanceof Error && /busy|slow|service error/i.test(lastError.message)
    ? lastError
    : new Error('Could not reach the map service — check your connection, or type the name.')
}

function readCache(cache: VenueCache | undefined, key: string, nowMs: number): Venue[] | null {
  if (!cache) return null
  try {
    const raw = cache.getItem(key)
    if (!raw) return null
    const { at, venues } = JSON.parse(raw) as { at: number; venues: Venue[] }
    if (!Array.isArray(venues) || nowMs - at > CACHE_TTL_MS) return null
    return venues
  } catch {
    return null
  }
}

function writeCache(cache: VenueCache | undefined, key: string, venues: Venue[], nowMs: number): void {
  try {
    cache?.setItem(key, JSON.stringify({ at: nowMs, venues }))
  } catch {
    /* quota or private mode — the lookup still worked */
  }
}
