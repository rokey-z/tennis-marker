import { describe, expect, it } from 'vitest'
import { cleanOpponent, isAutoTitle, opponentFromLegacyTitle, opponentKey, opponentRows, sessionLabel, venueRows } from './session'
import type { Session } from './types'

const base: Session = {
  id: 's1',
  user_id: null,
  title: '',
  opponent: '',
  venue: '',
  date: '2026-08-15',
  kind: 'practice',
  mode: 'errors',
  notes: '',
  created_at: '2026-08-15T10:00:00.000Z',
  updated_at: '2026-08-15T10:00:00.000Z',
  deleted_at: null,
}
const sess = (o: Partial<Session> = {}): Session => ({ ...base, ...o })

describe('sessionLabel', () => {
  it('derives the name from kind + opponent', () => {
    expect(sessionLabel(sess())).toBe('Practice')
    expect(sessionLabel(sess({ kind: 'match' }))).toBe('Match')
    expect(sessionLabel(sess({ kind: 'match', opponent: 'Emma' }))).toBe('vs Emma')
    expect(sessionLabel(sess({ opponent: 'Coach Dan' }))).toBe('Practice with Coach Dan')
  })

  it('keeps a legacy typed title when there is no opponent, but ignores auto-generated ones', () => {
    expect(sessionLabel(sess({ title: 'Practice — groundstrokes' }))).toBe('Practice — groundstrokes')
    expect(sessionLabel(sess({ title: 'Practice 2026-08-15' }))).toBe('Practice')
    expect(sessionLabel(sess({ kind: 'match', title: 'Match 2026-08-15' }))).toBe('Match')
    // an opponent always wins over the legacy title
    expect(sessionLabel(sess({ kind: 'match', title: 'vs Emma — league', opponent: 'Mia' }))).toBe('vs Mia')
  })
})

describe('legacy title migration', () => {
  it('extracts an opponent only from explicit "vs" titles', () => {
    expect(opponentFromLegacyTitle('vs Emma — club ladder')).toBe('Emma')
    expect(opponentFromLegacyTitle('vs. Mia Chen, R1')).toBe('Mia Chen')
    expect(opponentFromLegacyTitle('against Sofia')).toBe('Sofia')
    // never invents an opponent out of a description
    expect(opponentFromLegacyTitle('Practice — groundstrokes')).toBe('')
    expect(opponentFromLegacyTitle('Match 2026-08-15')).toBe('')
    expect(opponentFromLegacyTitle('')).toBe('')
  })

  it('recognises auto titles', () => {
    expect(isAutoTitle('Match 2026-08-15')).toBe(true)
    expect(isAutoTitle('  ')).toBe(true)
    expect(isAutoTitle('vs Emma')).toBe(false)
  })
})

describe('names', () => {
  it('tolerates rows written before the field existed', () => {
    expect(cleanOpponent(undefined)).toBe('')
    expect(cleanOpponent(null)).toBe('')
    expect(opponentKey(undefined)).toBe('')
    // a legacy row with no opponent/venue keys at all must still render
    const legacy = { kind: 'practice', title: 'Practice 2026-08-01' } as unknown as Session
    expect(sessionLabel(legacy)).toBe('Practice')
    expect(opponentRows([legacy])).toEqual([])
    expect(venueRows([legacy])).toEqual([])
  })

  it('normalises spacing and case for matching', () => {
    expect(cleanOpponent('  Emma   Stone ')).toBe('Emma Stone')
    expect(opponentKey(' emma  STONE ')).toBe('emma stone')
    expect(cleanOpponent('x'.repeat(80))).toHaveLength(60)
  })
})

describe('opponentRows / venueRows', () => {
  const sessions = [
    sess({ id: 'a', opponent: 'Emma', kind: 'match', date: '2026-08-01', venue: 'Riverside Club' }),
    sess({ id: 'b', opponent: 'emma', kind: 'practice', date: '2026-08-10', venue: 'riverside club' }),
    sess({ id: 'c', opponent: 'Mia', kind: 'match', date: '2026-08-05', venue: 'City Park' }),
    sess({ id: 'd', opponent: 'Ghost', deleted_at: '2026-08-06T00:00:00.000Z' }),
    sess({ id: 'e' }),
  ]

  it('groups case-insensitively, counts sessions and keeps the newest spelling', () => {
    const rows = opponentRows(sessions)
    expect(rows.map((r) => r.name)).toEqual(['emma', 'Mia'])
    expect(rows[0]).toMatchObject({ sessions: 2, matches: 1, lastDate: '2026-08-10' })
    expect(rows[1]).toMatchObject({ sessions: 1, matches: 1 })
    expect(rows.some((r) => r.name === 'Ghost')).toBe(false)
  })

  it('does the same for venues', () => {
    expect(venueRows(sessions).map((v) => v.name)).toEqual(['riverside club', 'City Park'])
  })
})
