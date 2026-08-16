import { describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, cacheKey, findNearbyTennisVenues, overpassQuery, parseVenues, type VenueCache } from './places'

const here = { lat: 37.7749, lon: -122.4194 }

const sample = {
  elements: [
    { type: 'way', id: 1, center: { lat: 37.7755, lon: -122.4194 }, tags: { name: 'Bay Club', leisure: 'sports_centre', sport: 'tennis;swimming' } },
    { type: 'way', id: 2, center: { lat: 37.7751, lon: -122.4194 }, tags: { name: 'Buena Vista Courts', leisure: 'pitch', sport: 'tennis' } },
    // same club, second court further away → collapsed into one entry at the nearest position
    { type: 'way', id: 3, center: { lat: 37.79, lon: -122.4194 }, tags: { name: 'Bay Club', leisure: 'pitch', sport: 'tennis' } },
    { type: 'node', id: 4, lat: 37.776, lon: -122.4194, tags: { leisure: 'pitch', sport: 'tennis' } }, // unnamed → skipped
    { type: 'way', id: 5, tags: { name: 'No position', leisure: 'pitch', sport: 'tennis' } }, // no center → skipped
  ],
}

describe('overpassQuery', () => {
  it('matches tennis as a whole value and coarsens the location', () => {
    const q = overpassQuery({ lat: 37.774912345, lon: -122.419456789 }, 8000)
    expect(q).toContain('(^|;)tennis(;|$)')
    expect(q).toContain('around:8000,37.7749,-122.4195')
    expect(q).not.toContain('37.774912345')
  })
})

describe('parseVenues', () => {
  it('keeps named venues, dedupes by name, sorts by distance', () => {
    const v = parseVenues(sample, here)
    expect(v.map((x) => x.name)).toEqual(['Buena Vista Courts', 'Bay Club'])
    expect(v[0].distance).toBeLessThan(v[1].distance)
    expect(v[0].kind).toBe('court')
    expect(v[1].kind).toBe('club')
    expect(v[1].distance).toBeLessThan(300) // nearest of the two Bay Club entries
  })

  it('tolerates junk', () => {
    expect(parseVenues(null, here)).toEqual([])
    expect(parseVenues({ elements: 'nope' }, here)).toEqual([])
    expect(parseVenues({ elements: [{}] }, here)).toEqual([])
  })
})

describe('findNearbyTennisVenues', () => {
  const ok = (json: unknown) => async () => ({ ok: true, json: async () => json }) as unknown as Response

  it('posts the query and returns parsed venues', async () => {
    let calledWith: string | undefined
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calledWith = url
      expect(String(init.body)).toContain('data=')
      return { ok: true, json: async () => sample } as unknown as Response
    }) as unknown as typeof fetch
    const v = await findNearbyTennisVenues(here, { fetchImpl })
    expect(calledWith).toContain('overpass')
    expect(v).toHaveLength(2)
  })

  it('falls back to the second endpoint when the first fails', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string) => {
      seen.push(url)
      if (seen.length === 1) throw new Error('network down')
      return (await ok(sample)()) as Response
    }) as unknown as typeof fetch
    const v = await findNearbyTennisVenues(here, { fetchImpl })
    expect(seen).toHaveLength(2)
    expect(v).toHaveLength(2)
  })

  it('reports a busy service and a total failure in plain language', async () => {
    const busy = (async () => ({ ok: false, status: 429 }) as unknown as Response) as unknown as typeof fetch
    await expect(findNearbyTennisVenues(here, { fetchImpl: busy })).rejects.toThrow(/busy/i)
    const dead = (async () => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    await expect(findNearbyTennisVenues(here, { fetchImpl: dead })).rejects.toThrow(/could not reach/i)
  })
})

describe('caching', () => {
  const memCache = (): VenueCache & { map: Map<string, string> } => {
    const map = new Map<string, string>()
    return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
  }

  it('serves a fresh cache without hitting the network, and refetches once stale', async () => {
    const cache = memCache()
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return { ok: true, json: async () => sample } as unknown as Response
    }) as unknown as typeof fetch

    await findNearbyTennisVenues(here, { fetchImpl, cache, now: () => 1_000 })
    expect(calls).toBe(1)
    expect(cache.map.has(cacheKey(here, 8000))).toBe(true)

    const second = await findNearbyTennisVenues(here, { fetchImpl, cache, now: () => 1_000 + CACHE_TTL_MS - 1 })
    expect(calls).toBe(1)
    expect(second).toHaveLength(2)

    await findNearbyTennisVenues(here, { fetchImpl, cache, now: () => 1_000 + CACHE_TTL_MS + 1 })
    expect(calls).toBe(2)
  })

  it('ignores a broken cache', async () => {
    const cache = memCache()
    cache.map.set(cacheKey(here, 8000), 'not json')
    const fetchImpl = (async () => ({ ok: true, json: async () => sample }) as unknown as Response) as unknown as typeof fetch
    await expect(findNearbyTennisVenues(here, { fetchImpl, cache })).resolves.toHaveLength(2)
  })
})

describe('timeout', () => {
  it('gives up with a plain-language message', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    await expect(findNearbyTennisVenues(here, { fetchImpl, timeoutMs: 10, cache: undefined, endpoints: ['x'] })).rejects.toThrow(/slow right now/i)
  })

  it("propagates the caller's abort", async () => {
    const ac = new AbortController()
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as unknown as typeof fetch
    const p = findNearbyTennisVenues(here, { fetchImpl, signal: ac.signal, cache: undefined })
    ac.abort()
    await expect(p).rejects.toThrow(/abort/i)
  })
})
