import { describe, expect, it } from 'vitest'
import type { Point, Session } from '../domain/types'
import {
  STORAGE_KEY,
  adoptOwnerless,
  clearDirty,
  copyForeignToOwner,
  emptyState,
  foreignRowIds,
  loadState,
  markDirty,
  memoryStorage,
  mergeRemote,
  pickRemote,
  saveState,
  type RepoState,
} from './localRepo'

const t1 = '2026-08-15T10:00:00.000Z'
const t2 = '2026-08-15T11:00:00.000Z'

function sess(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    user_id: null,
    title: '',
    opponent: '',
    venue: '',
    date: '2026-08-15',
    kind: 'practice',
    mode: 'errors',
    notes: '',
    created_at: t1,
    updated_at: t1,
    deleted_at: null,
    ...over,
  }
}
function pt(over: Partial<Point> = {}): Point {
  return {
    id: 'p1',
    user_id: null,
    session_id: 's1',
    x: 1,
    y: 40,
    stroke: 'fh',
    error_type: 'long',
    outcome: 'error',
    forced: false,
    created_at: t1,
    updated_at: t1,
    deleted_at: null,
    ...over,
  }
}

describe('load/save', () => {
  it('returns empty state on missing or corrupt data', () => {
    const st = memoryStorage()
    expect(loadState(st)).toEqual(emptyState())
    st.setItem(STORAGE_KEY, '{not json')
    expect(loadState(st)).toEqual(emptyState())
    st.setItem(STORAGE_KEY, JSON.stringify({ sessions: [], dirty: { sessions: 'x' } }))
    expect(loadState(st)).toEqual(emptyState())
  })

  it('defaults fields added after a row was written (no undefined reaches the UI)', () => {
    const st = memoryStorage()
    const legacy = { id: 's1', user_id: null, title: 'Practice 2026-08-01', date: '2026-08-01', kind: 'practice', notes: '', created_at: t1, updated_at: t1, deleted_at: null }
    st.setItem(STORAGE_KEY, JSON.stringify({ sessions: { s1: legacy }, points: {}, dirty: { sessions: [], points: [] }, meta: {} }))
    const loaded = loadState(st)
    expect(loaded.sessions.s1.opponent).toBe('')
    expect(loaded.sessions.s1.venue).toBe('')
    expect(loaded.sessions.s1.mode).toBe('errors')
    expect(loaded.sessions.s1.title).toBe('Practice 2026-08-01')
  })

  it('defaults the outcome on points written before winners existed', () => {
    const st = memoryStorage()
    const legacy = { id: 'p1', session_id: 's1', x: 1, y: 2, stroke: 'fh', error_type: 'long', forced: false, created_at: t1, updated_at: t1, deleted_at: null }
    st.setItem(STORAGE_KEY, JSON.stringify({ sessions: {}, points: { p1: legacy }, dirty: { sessions: [], points: [] }, meta: {} }))
    expect(loadState(st).points.p1.outcome).toBe('error')
  })

  it('round-trips and dedupes dirty ids', () => {
    const st = memoryStorage()
    const s: RepoState = {
      ...emptyState(),
      sessions: { s1: sess() },
      dirty: { sessions: ['s1', 's1'], points: [] },
      meta: { ownerId: 'u1', lastPullAt: t1, roster: [], playerName: '' },
    }
    saveState(st, s)
    expect(loadState(st)).toEqual({ ...s, dirty: { sessions: ['s1'], points: [] } })
  })
})

describe('dirty tracking', () => {
  it('markDirty is idempotent; clearDirty only clears unchanged rows', () => {
    let s: RepoState = { ...emptyState(), points: { p1: pt(), p2: pt({ id: 'p2' }) } }
    s = markDirty(s, 'points', ['p1', 'p2'])
    expect(markDirty(s, 'points', ['p1'])).toBe(s)
    expect(s.dirty.points).toEqual(['p1', 'p2'])
    // p2 was edited after the snapshot → stays dirty
    s = { ...s, points: { ...s.points, p2: { ...s.points.p2, updated_at: t2 } } }
    s = clearDirty(s, 'points', [
      ['p1', t1],
      ['p2', t1],
    ])
    expect(s.dirty.points).toEqual(['p2'])
  })
})

describe('merge', () => {
  it('pickRemote: last write wins, the tombstone wins a tie, and a restore is a later write', () => {
    expect(pickRemote(undefined, pt())).toEqual(pt())
    expect(pickRemote(pt(), pt({ deleted_at: t2, updated_at: t2 }))?.deleted_at).toBe(t2)
    expect(pickRemote(pt(), pt({ updated_at: t2, x: 5 }))?.x).toBe(5)
    expect(pickRemote(pt({ updated_at: t2 }), pt({ updated_at: t1, x: 5 }))).toBeNull()
    expect(pickRemote(pt(), pt({ x: 9 }))).toBeNull()
    // a delete and an edit stamped at the same instant: the delete wins
    expect(pickRemote(pt({ updated_at: t1 }), pt({ updated_at: t1, deleted_at: t1 }))?.deleted_at).toBe(t1)
    // an older tombstone must not undo a restore, or Undo would only work until the next pull
    expect(pickRemote(pt({ updated_at: t2 }), pt({ updated_at: t1, deleted_at: t1 }))).toBeNull()
    // but a delete that happened after the local edit still applies
    expect(pickRemote(pt({ updated_at: t1 }), pt({ updated_at: t2, deleted_at: t2 }))?.deleted_at).toBe(t2)
  })

  it('mergeRemote applies remote rows and records lastPullAt', () => {
    const local = { ...emptyState(), sessions: { s1: sess({ title: 'Local', updated_at: t2 }) }, points: { p1: pt() } }
    const { state, changed } = mergeRemote(
      local,
      {
        sessions: [sess({ title: 'Remote older' }), sess({ id: 's2', title: 'New remote' })],
        points: [pt({ deleted_at: t2, updated_at: t2 }), pt({ id: 'p2' })],
      },
      t2,
    )
    expect(changed).toBe(3)
    expect(state.sessions.s1.title).toBe('Local')
    expect(state.sessions.s2.title).toBe('New remote')
    expect(state.points.p1.deleted_at).toBe(t2)
    expect(state.points.p2).toBeTruthy()
    expect(state.meta.lastPullAt).toBe(t2)
  })
})

describe('ownership', () => {
  it('adopts ownerless rows and marks them dirty', () => {
    const s = { ...emptyState(), sessions: { s1: sess(), s2: sess({ id: 's2', user_id: 'other' }) }, points: { p1: pt() } }
    const { state, adopted } = adoptOwnerless(s, 'u1')
    expect(adopted).toBe(2)
    expect(state.sessions.s1.user_id).toBe('u1')
    expect(state.sessions.s2.user_id).toBe('other')
    expect(state.points.p1.user_id).toBe('u1')
    expect(state.dirty).toEqual({ sessions: ['s1'], points: ['p1'] })
    expect(foreignRowIds(state, 'u1')).toEqual({ sessions: ['s2'], points: [] })
  })

  it('copies foreign rows to the owner under new ids, remapping session_id', () => {
    let n = 0
    const s = {
      ...emptyState(),
      sessions: { s1: sess({ user_id: 'other' }) },
      points: { p1: pt({ user_id: 'other' }) },
      dirty: { sessions: ['s1'], points: ['p1'] },
    }
    const { state, copied } = copyForeignToOwner(s, 'u1', () => `n${++n}`, t2)
    expect(copied).toBe(2)
    expect(state.sessions.s1).toBeUndefined()
    expect(state.sessions.n1).toMatchObject({ user_id: 'u1', updated_at: t2 })
    expect(state.points.n2).toMatchObject({ user_id: 'u1', session_id: 'n1' })
    expect(state.dirty).toEqual({ sessions: ['n1'], points: ['n2'] })
  })
})
