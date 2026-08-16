import { describe, expect, it } from 'vitest'
import { formatDate, formatMinutes, isValidIso, parseYMD, todayLocalISO } from './format'

describe('format', () => {
  it('formatMinutes rounds before splitting hours', () => {
    expect(formatMinutes(119.7)).toBe('2 h')
    expect(formatMinutes(179.5)).toBe('3 h')
    expect(formatMinutes(65)).toBe('1 h 5 min')
    expect(formatMinutes(59.7)).toBe('1 h')
    expect(formatMinutes(42.2)).toBe('42 min')
    expect(formatMinutes(0.2)).toBe('<1 min')
    expect(formatMinutes(NaN)).toBe('—')
  })
  it('parses and formats YYYY-MM-DD locally, tolerating garbage', () => {
    expect(parseYMD('2026-08-15')?.getDate()).toBe(15)
    expect(parseYMD('')).toBeNull()
    expect(parseYMD('2026-8-5')).toBeNull()
    expect(formatDate('')).toBe('—')
    expect(formatDate('nope')).toBe('nope')
    expect(formatDate('2026-08-15', { weekday: 'short' })).toMatch(/Sat/)
    expect(todayLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('isValidIso', () => {
    expect(isValidIso('2026-08-15T10:00:00.000Z')).toBe(true)
    expect(isValidIso('garbage')).toBe(false)
    expect(isValidIso('')).toBe(false)
    expect(isValidIso(null)).toBe(false)
  })
})
