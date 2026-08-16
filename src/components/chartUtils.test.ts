import { describe, expect, it } from 'vitest'
import { niceTicks } from './chartUtils'

describe('niceTicks', () => {
  it('always yields integer ticks for count axes', () => {
    expect(niceTicks(0)).toEqual({ max: 1, ticks: [0, 1] })
    expect(niceTicks(1)).toEqual({ max: 1, ticks: [0, 1] })
    expect(niceTicks(2)).toEqual({ max: 2, ticks: [0, 1, 2] })
    expect(niceTicks(5)).toEqual({ max: 6, ticks: [0, 2, 4, 6] })
    expect(niceTicks(13)).toEqual({ max: 15, ticks: [0, 5, 10, 15] })
    for (let v = 0; v <= 120; v++) {
      const { max, ticks } = niceTicks(v)
      expect(max).toBeGreaterThanOrEqual(Math.max(1, v))
      expect(ticks.every(Number.isInteger)).toBe(true)
      expect(ticks.length).toBeLessThanOrEqual(6)
    }
  })
})
