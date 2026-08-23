import { describe, expect, it } from 'vitest'
import { decodeSharedMatch, encodeSharedMatch } from './share'
import type { Point, Session } from './types'

const session: Session = {
  id: 'session-1', user_id: 'owner', title: '', opponent: 'Sam', venue: 'City Courts', date: '2026-08-22', kind: 'match', mode: 'placement', notes: 'Great second set.', finished_at: '2026-08-22T15:00:00.000Z', self_rating: 84,
  created_at: '2026-08-22T14:00:00.000Z', updated_at: '2026-08-22T15:00:00.000Z', deleted_at: null,
}
const point: Point = {
  id: 'point-1', user_id: 'owner', session_id: session.id, x: 6, y: 25, stroke: 'fh', error_type: '', forced: false, outcome: 'placement', placement_result: 'in',
  created_at: '2026-08-22T14:15:00.000Z', updated_at: '2026-08-22T14:15:00.000Z', deleted_at: null,
}

describe('shared match links', () => {
  it('round-trips match metadata and live marks without account identifiers', () => {
    const shared = decodeSharedMatch(encodeSharedMatch(session, [point]))
    expect(shared).toMatchObject({ session: { kind: 'match', opponent: 'Sam', user_id: null, self_rating: 84 }, points: [{ user_id: null, x: 6, outcome: 'placement' }] })
  })

  it('rejects malformed links', () => {
    expect(decodeSharedMatch('not a link')).toBeNull()
  })
})
