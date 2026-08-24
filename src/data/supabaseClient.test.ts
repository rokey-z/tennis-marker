import { describe, expect, it } from 'vitest'
import { normalizePoint } from './supabaseClient'

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  session_id: '22222222-2222-4222-8222-222222222222',
  x: 5,
  y: 30,
  created_at: '2026-08-16T10:00:00.000Z',
  updated_at: '2026-08-16T10:00:00.000Z',
  deleted_at: null,
}

describe('normalizePoint', () => {
  it('keeps every outcome the app writes — a placement must not come back as an error', () => {
    // a ball landing on the far half, fetched on a second device
    expect(normalizePoint({ ...row, stroke: 'bh', error_type: '', outcome: 'placement', forced: false })).toMatchObject({
      outcome: 'placement',
      stroke: 'bh',
      error_type: '',
      forced: false,
    })
    expect(normalizePoint({ ...row, stroke: 'fh', error_type: 'net', outcome: 'error', forced: true })).toMatchObject({
      outcome: 'error',
      stroke: 'fh',
      error_type: 'net',
      forced: true,
    })
    expect(normalizePoint({ ...row, stroke: 'bh', error_type: '', outcome: 'placement', placement_result: 'net' })).toMatchObject({
      outcome: 'error',
      stroke: 'bh',
      error_type: 'net',
      placement_result: null,
    })
    // the opponent's winner: no stroke of hers, no error type, never forced
    expect(normalizePoint({ ...row, stroke: 'fh', error_type: 'long', outcome: 'winner', forced: true })).toMatchObject({
      outcome: 'winner',
      stroke: '',
      error_type: '',
      forced: false,
    })
    expect(normalizePoint({ ...row, stroke: 'bh', error_type: 'wide', outcome: 'player_winner', shot_type: 'lob', forced: true })).toMatchObject({
      outcome: 'player_winner',
      stroke: 'bh',
      error_type: '',
      shot_type: 'lob',
      forced: false,
    })
    expect(normalizePoint({ ...row, stroke: 'serve', error_type: '', outcome: 'player_winner', shot_type: 'winning_serve' })).toMatchObject({
      outcome: 'player_winner',
      stroke: 'serve',
      shot_type: 'winning_serve',
    })
  })

  it('falls back to an error when the column is missing or junk', () => {
    expect(normalizePoint({ ...row, stroke: 'fh', error_type: 'wide' }).outcome).toBe('error')
    expect(normalizePoint({ ...row, stroke: 'fh', error_type: 'wide', outcome: 'nonsense' })).toMatchObject({ outcome: 'error', error_type: 'wide' })
  })
})
