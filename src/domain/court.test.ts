import { describe, expect, it } from 'vitest'
import {
  FLIP_CENTER,
  VIEW,
  VIEW_MAX_X,
  VIEW_MAX_Y,
  clampToView,
  describeLanding,
  describeMark,
  describeZone,
  flipPoint,
  isInsideView,
  roundFeet,
  zoneFor,
  zoneFromId,
  zoneId,
  zoneRect,
  ZONE_COLS,
  ZONE_ROWS,
} from './court'

describe('view geometry', () => {
  it('covers doubles court + margins', () => {
    expect(VIEW).toEqual({ minX: -24, minY: 0, width: 48, height: 51 })
    expect(VIEW_MAX_X).toBe(24)
    expect(VIEW_MAX_Y).toBe(51)
    expect(FLIP_CENTER).toEqual({ x: 0, y: 25.5 })
  })
})

describe('zoneFor', () => {
  it('maps columns by singles thirds; alleys and margins fold into outer columns', () => {
    expect(zoneFor(-20, 10).col).toBe('ad')
    expect(zoneFor(-13, 10).col).toBe('ad')
    expect(zoneFor(-4.51, 10).col).toBe('ad')
    expect(zoneFor(-4.5, 10).col).toBe('middle')
    expect(zoneFor(0, 10).col).toBe('middle')
    expect(zoneFor(4.5, 10).col).toBe('middle')
    expect(zoneFor(4.51, 10).col).toBe('deuce')
    expect(zoneFor(23, 10).col).toBe('deuce')
  })

  it('maps rows: net < 21, mid < 34, baseline otherwise', () => {
    expect(zoneFor(0, 0).row).toBe('net')
    expect(zoneFor(0, 20.9).row).toBe('net')
    expect(zoneFor(0, 21).row).toBe('mid')
    expect(zoneFor(0, 33.9).row).toBe('mid')
    expect(zoneFor(0, 34).row).toBe('baseline')
    expect(zoneFor(0, 39).row).toBe('baseline')
    expect(zoneFor(0, 51).row).toBe('baseline')
  })

  it('round-trips ids and describes zones', () => {
    for (const row of ZONE_ROWS) {
      for (const col of ZONE_COLS) {
        const id = zoneId({ row, col })
        expect(zoneFromId(id)).toEqual({ row, col })
      }
    }
    expect(describeZone(zoneFor(10, 45))).toBe('Baseline · deuce side')
    expect(describeZone(zoneFor(-10, 5))).toBe('Net · ad side')
  })

  it('zone rects tile the whole view without gaps', () => {
    let area = 0
    for (const row of ZONE_ROWS) {
      for (const col of ZONE_COLS) {
        const r = zoneRect({ row, col })
        area += r.width * r.height
        expect(r.width).toBeGreaterThan(0)
        expect(r.height).toBeGreaterThan(0)
      }
    }
    expect(area).toBeCloseTo(VIEW.width * VIEW.height)
    // a point strictly inside a rect maps to that zone
    for (const row of ZONE_ROWS) {
      for (const col of ZONE_COLS) {
        const r = zoneRect({ row, col })
        expect(zoneFor(r.x + r.width / 2, r.y + r.height / 2)).toEqual({ row, col })
      }
    }
  })
})

describe('landing vocabulary', () => {
  it('describes a placement by depth from the net, not by a player position', () => {
    expect(describeLanding(10, 5)).toBe('Short · deuce side')
    expect(describeLanding(0, 27)).toBe('Mid · middle')
    expect(describeLanding(-10, 38)).toBe('Deep · ad side')
    // the same spot reads as a player position for an error
    expect(describeMark(-10, 38, 'error')).toBe('Baseline · ad side')
    expect(describeMark(-10, 38, 'winner')).toBe('Baseline · ad side')
    expect(describeMark(-10, 38, 'placement')).toBe('Deep · ad side')
  })
})

describe('flip / clamp', () => {
  it('flipPoint is a 180° rotation about the view center and is an involution', () => {
    expect(flipPoint(10, 45)).toEqual({ x: -10, y: 6 })
    expect(flipPoint(0, 25.5)).toEqual({ x: 0, y: 25.5 })
    const p = flipPoint(-3.2, 40.1)
    const back = flipPoint(p.x, p.y)
    expect(back.x).toBeCloseTo(-3.2)
    expect(back.y).toBeCloseTo(40.1)
  })

  it('clamps and detects inside', () => {
    expect(isInsideView(0, 0)).toBe(true)
    expect(isInsideView(24, 51)).toBe(true)
    expect(isInsideView(24.1, 51)).toBe(false)
    expect(isInsideView(0, -0.1)).toBe(false)
    expect(clampToView(-30, 60)).toEqual({ x: -24, y: 51 })
    expect(clampToView(3, 3)).toEqual({ x: 3, y: 3 })
  })

  it('rounds to 0.1 ft', () => {
    expect(roundFeet(12.345)).toBe(12.3)
    expect(roundFeet(-4.55)).toBe(-4.5)
  })
})
