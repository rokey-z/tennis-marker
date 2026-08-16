import { describe, expect, it } from 'vitest'
import { coarse, distanceM, formatDistance } from './geo'

describe('geo', () => {
  it('measures great-circle distance', () => {
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0)
    // 0.01° of latitude ≈ 1.11 km
    expect(distanceM({ lat: 37.7749, lon: -122.4194 }, { lat: 37.7849, lon: -122.4194 })).toBeCloseTo(1112, -1)
    // SF → LA ≈ 559 km
    expect(distanceM({ lat: 37.7749, lon: -122.4194 }, { lat: 34.0522, lon: -118.2437 }) / 1000).toBeCloseTo(559, 0)
  })

  it('formats distances for both unit systems', () => {
    expect(formatDistance(240, true)).toBe('240 m')
    expect(formatDistance(2400, true)).toBe('2.4 km')
    expect(formatDistance(240, false)).toBe('790 ft')
    expect(formatDistance(2400, false)).toBe('1.5 mi')
    expect(formatDistance(NaN, true)).toBe('')
  })

  it('coarsens coordinates to ~11 m', () => {
    expect(coarse({ lat: 37.774912345, lon: -122.419456789 })).toEqual({ lat: 37.7749, lon: -122.4195 })
  })
})
