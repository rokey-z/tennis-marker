import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlacementSplit, clampTooltipPosition, placementHoverGroupId } from './Court'
import { errorDragChoice, errorWheelSelection } from '../domain/errorWheel'

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

  it('turns a drag beyond the visible circle into a winner', () => {
    expect(errorWheelSelection(101, 0, 100)).toEqual({ winner: true })
    expect(errorWheelSelection(50, 0, 100)).toEqual({ stroke: 'fh', error: 'long' })
  })
})

describe('court stats tooltip placement', () => {
  it('uses the pointer offset when there is room', () => {
    expect(clampTooltipPosition({ x: 100, y: 100 }, { width: 128, height: 80 }, { width: 800, height: 600 })).toEqual({ left: 114, top: 114 })
  })

  it('flips inward at the right and bottom edges', () => {
    expect(clampTooltipPosition({ x: 760, y: 570 }, { width: 210, height: 180 }, { width: 800, height: 600 })).toEqual({ left: 536, top: 376 })
  })

  it('keeps an oversized tooltip anchored to the safe viewport edge', () => {
    expect(clampTooltipPosition({ x: 4, y: 4 }, { width: 500, height: 700 }, { width: 375, height: 667 })).toEqual({ left: 8, top: 8 })
  })
})

describe('placement map hover groups', () => {
  it('groups all three in-court columns by depth', () => {
    expect(placementHoverGroupId('in-net-ad')).toBe('in-net')
    expect(placementHoverGroupId('in-mid-middle')).toBe('in-mid')
    expect(placementHoverGroupId('in-baseline-deuce')).toBe('in-baseline')
  })

  it('keeps out and net areas independent', () => {
    expect(placementHoverGroupId('wide-mid-ad')).toBe('wide-mid-ad')
    expect(placementHoverGroupId('long-baseline-middle')).toBe('long-baseline-middle')
    expect(placementHoverGroupId('net')).toBe('net')
  })
})

describe('placement split summary', () => {
  it('renders the in/out breakdown as its own layout block', () => {
    const html = renderToStaticMarkup(createElement(PlacementSplit, {
      placementHeat: {
        in: { 'net-middle': 2, 'mid-middle': 4, 'baseline-middle': 2 },
        wide: { 'mid-deuce': 1 },
        long: {},
        net: 1,
      },
      serveCount: 3,
      value: 'all',
      onChange: () => undefined,
    }))

    expect(html).toContain('class="placement-split"')
    expect(html).toContain('<span>IN</span><strong>80%</strong>')
    expect(html).toContain('<span>OUT</span><strong>20%</strong>')
    expect(html).toContain('<span>SERVE</span><strong>3</strong>')
  })
})
