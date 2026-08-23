import { describe, expect, it } from 'vitest'
import { errorDragChoice } from '../domain/errorWheel'

describe('error drag wheel', () => {
  it.each([
    [-30, -30, { stroke: 'bh', error: 'wide' }],
    [20, -40, { stroke: 'fh', error: 'wide' }],
    [40, 0, { stroke: 'fh', error: 'long' }],
    [30, 30, { stroke: 'fh', error: 'net' }],
    [-20, 40, { stroke: 'bh', error: 'net' }],
    [-40, 0, { stroke: 'bh', error: 'long' }],
  ] as const)('maps drag direction (%s, %s)', (dx, dy, expected) => {
    expect(errorDragChoice(dx, dy)).toEqual(expected)
  })

  it('requires a deliberate drag before selecting a sector', () => {
    expect(errorDragChoice(10, 10)).toBeNull()
  })
})
