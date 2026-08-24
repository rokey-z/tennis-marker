import { describe, expect, it } from 'vitest'
import { decodeLiveSharedMatch, decodeSharedMatch, encodeSharedMatch } from './share'
import type { Point, Session } from './types'

const session: Session = {
  id: 'session-1', user_id: 'owner', title: '', opponent: 'Sam', opponent_utr: 9.25, venue: 'City Courts', date: '2026-08-22', kind: 'match', mode: 'placement', notes: 'Great second set.', finished_at: '2026-08-22T15:00:00.000Z', self_rating: 84,
  created_at: '2026-08-22T14:00:00.000Z', updated_at: '2026-08-22T15:00:00.000Z', deleted_at: null,
}
const point: Point = {
  id: 'point-1', user_id: 'owner', session_id: session.id, x: 6, y: 25, stroke: 'fh', error_type: 'wide', forced: false, outcome: 'error', placement_result: null, shot_type: 'lob',
  created_at: '2026-08-22T14:15:00.000Z', updated_at: '2026-08-22T14:15:00.000Z', deleted_at: null,
}

describe('shared match links', () => {
  it('round-trips match metadata and live marks without account identifiers', () => {
    const playerWinner: Point = { ...point, id: 'point-2', outcome: 'player_winner', error_type: '', stroke: 'serve', shot_type: null }
    const shared = decodeSharedMatch(encodeSharedMatch(session, [point, playerWinner]))
    expect(shared).toMatchObject({
      session: { kind: 'match', opponent: 'Sam', opponent_utr: 9.25, user_id: null, self_rating: 84 },
      points: [
        { user_id: null, x: 6, outcome: 'error', shot_type: 'lob' },
        { user_id: null, outcome: 'player_winner', stroke: 'serve', shot_type: null },
      ],
    })
  })

  it('rejects malformed links', () => {
    expect(decodeSharedMatch('not a link')).toBeNull()
  })

  it('validates a live public response and removes account identifiers', () => {
    const shared = decodeLiveSharedMatch({ session: { ...session, share_token: 'bdf933d9-8bc9-4cb8-a6dd-4c30d8061f28' }, points: [point] })
    expect(shared).toMatchObject({ session: { id: 'session-1', user_id: null, share_token: null }, points: [{ id: 'point-1', user_id: null }] })
  })

  it('rejects live responses containing a point from another session', () => {
    expect(decodeLiveSharedMatch({ session, points: [{ ...point, session_id: 'another-session' }] })).toBeNull()
  })
})
