import { describe, expect, it } from 'vitest'
import { sanitizePoint, sanitizeSession } from './validate'

const t = '2026-08-15T10:00:00.000Z'

describe('sanitizePoint', () => {
  const good = { id: 'p1', session_id: 's1', x: 10, y: 40, stroke: 'fh', error_type: 'long', forced: false, created_at: t, updated_at: t, deleted_at: null }
  it('accepts a valid row and canonicalises it', () => {
    expect(sanitizePoint({ ...good, x: '12.34', forced: 'true', shot_type: 'volley', updated_at: '2026-08-15T10:00:00+00:00' })).toMatchObject({ x: 12.3, forced: true, shot_type: 'volley', updated_at: t, user_id: null })
    expect(sanitizePoint({ ...good, shot_type: 'serve' })?.shot_type).toBeNull()
  })
  it('rejects unknown enums, bad coords and bad timestamps', () => {
    expect(sanitizePoint({ ...good, stroke: 'volley' })).toBeNull()
    expect(sanitizePoint({ ...good, error_type: 'out' })).toBeNull()
    expect(sanitizePoint({ ...good, x: 'abc' })).toBeNull()
    expect(sanitizePoint({ ...good, created_at: 'garbage' })).toBeNull()
    expect(sanitizePoint({ ...good, created_at: '' })).toBeNull()
    expect(sanitizePoint({ ...good, id: '' })).toBeNull()
    expect(sanitizePoint(null)).toBeNull()
  })
  it('accepts winners without a stroke or an error type, and defaults the outcome', () => {
    const w = sanitizePoint({ ...good, outcome: 'winner', stroke: '', error_type: '', forced: true })
    expect(w).toMatchObject({ outcome: 'winner', stroke: '', error_type: '', forced: false })
    // a winner is the opponent's shot: a stroke on an old row is dropped, not kept
    expect(sanitizePoint({ ...good, outcome: 'winner', stroke: 'fh', error_type: '' })).toMatchObject({ stroke: '' })
    // but an error still has to name one
    expect(sanitizePoint({ ...good, stroke: '', error_type: 'long' })).toBeNull()
    expect(sanitizePoint(good)?.outcome).toBe('error')
    // an error still needs a valid type
    expect(sanitizePoint({ ...good, error_type: '' })).toBeNull()
    expect(sanitizePoint({ ...good, outcome: 'nonsense' })?.outcome).toBe('error')
  })

  it('keeps a player winner stroke and ball type but removes error-only fields', () => {
    expect(sanitizePoint({ ...good, outcome: 'player_winner', stroke: 'bh', error_type: 'wide', shot_type: 'overhead', forced: true })).toMatchObject({
      outcome: 'player_winner',
      stroke: 'bh',
      error_type: '',
      shot_type: 'overhead',
      forced: false,
    })
    expect(sanitizePoint({ ...good, outcome: 'player_winner', stroke: '', error_type: '', shot_type: 'lob' })).toBeNull()
    expect(sanitizePoint({ ...good, outcome: 'player_winner', stroke: 'serve', error_type: '', shot_type: null })).toMatchObject({
      outcome: 'player_winner',
      stroke: 'serve',
      shot_type: null,
    })
  })

  it('clamps coordinates into the court view', () => {
    expect(sanitizePoint({ ...good, x: 999, y: -5 })).toMatchObject({ x: 24, y: 0 })
  })

  it('upgrades a legacy placement net strike to an error', () => {
    expect(sanitizePoint({ ...good, outcome: 'placement', error_type: '', placement_result: 'net' })).toMatchObject({
      outcome: 'error',
      error_type: 'net',
      placement_result: null,
    })
  })
})

describe('sanitizeSession', () => {
  const good = { id: 's1', title: 'T', date: '2026-08-15', kind: 'match', notes: '', created_at: t, updated_at: t, deleted_at: null }
  it('accepts valid rows and defaults kind', () => {
    expect(sanitizeSession({ ...good, kind: 'drill' })?.kind).toBe('practice')
    expect(sanitizeSession(good)?.date).toBe('2026-08-15')
  })
  it('defaults an unknown mode to errors', () => {
    expect(sanitizeSession({ ...good, mode: 'nonsense' })?.mode).toBe('errors')
    expect(sanitizeSession({ ...good, mode: 'placement' })?.mode).toBe('placement')
    expect(sanitizeSession(good)?.mode).toBe('errors')
    expect(sanitizeSession(good)?.finished_at).toBeNull()
    expect(sanitizeSession({ ...good, finished_at: t })?.finished_at).toBe(t)
    expect(sanitizeSession(good)?.self_rating).toBeNull()
    expect(sanitizeSession({ ...good, self_rating: 86 })?.self_rating).toBe(86)
    expect(sanitizeSession({ ...good, self_rating: 100 })?.self_rating).toBe(100)
    expect(sanitizeSession({ ...good, self_rating: 0 })?.self_rating).toBeNull()
    expect(sanitizeSession({ ...good, self_rating: 101 })?.self_rating).toBeNull()
    expect(sanitizeSession({ ...good, self_rating: 3.5 })?.self_rating).toBeNull()
    expect(sanitizeSession({ ...good, opponent_utr: '9.125' })?.opponent_utr).toBe(9.13)
    expect(sanitizeSession({ ...good, opponent_utr: 20 })?.opponent_utr).toBeNull()
  })

  it('rejects malformed dates / ids', () => {
    expect(sanitizeSession({ ...good, date: '' })).toBeNull()
    expect(sanitizeSession({ ...good, date: '2026-8-5' })).toBeNull()
    expect(sanitizeSession({ ...good, id: 5 })).toBeNull()
  })
})
