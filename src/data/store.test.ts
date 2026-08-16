import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, memoryStorage } from './localRepo'
import { allLivePoints, createStore, defaultSessionTitle, livePointsForSession, liveSessions, pendingCount, todayLocalISO } from './store'

function clock(start = Date.UTC(2026, 7, 15, 10, 0, 0)) {
  let t = start
  return { now: () => new Date((t += 1000)) }
}
function ids() {
  let n = 0
  return () => `id${++n}`
}

describe('store', () => {
  it('creates sessions with sensible defaults and persists', () => {
    const storage = memoryStorage()
    const store = createStore(storage, { ...clock(), newId: ids() })
    const s = store.createSession()
    expect(s.title).toBe(defaultSessionTitle('practice', s.date))
    expect(s.kind).toBe('practice')
    expect(s.user_id).toBeNull()
    expect(store.getState().dirty.sessions).toEqual([s.id])
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions[s.id].title).toBe(s.title)
    const m = store.createSession({ title: '  vs Emma ', kind: 'match', date: '2026-08-01' })
    expect(m.title).toBe('vs Emma')
    expect(liveSessions(store.getState()).map((x) => x.id)).toEqual([s.id, m.id])
  })

  it('adds, lists, undoes and deletes points; notifies subscribers', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    let notified = 0
    store.subscribe(() => notified++)
    const s = store.createSession()
    const p1 = store.addPoint({ session_id: s.id, x: 10.26, y: 40.44, stroke: 'fh', error_type: 'long', forced: false })
    const p2 = store.addPoint({ session_id: s.id, x: -3, y: 20, stroke: 'bh', error_type: 'net', forced: true })
    expect(p1.x).toBe(10.3)
    expect(p1.y).toBe(40.4)
    expect(livePointsForSession(store.getState(), s.id).map((p) => p.id)).toEqual([p1.id, p2.id])
    expect(pendingCount(store.getState())).toBe(3)

    const undone = store.undoLastPoint(s.id)
    expect(undone?.id).toBe(p2.id)
    expect(livePointsForSession(store.getState(), s.id).map((p) => p.id)).toEqual([p1.id])
    expect(store.getState().points[p2.id].deleted_at).toBeTruthy()
    // still dirty (tombstone must upload), not duplicated
    expect(store.getState().dirty.points).toEqual([p1.id, p2.id])

    store.deletePoint(p1.id)
    expect(store.undoLastPoint(s.id)).toBeNull()
    expect(notified).toBeGreaterThanOrEqual(5)
  })

  it('deleting a session soft-deletes its points and hides them from all-points', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const a = store.createSession()
    const b = store.createSession()
    store.addPoint({ session_id: a.id, x: 0, y: 40, stroke: 'fh', error_type: 'wide', forced: false })
    const pb = store.addPoint({ session_id: b.id, x: 0, y: 40, stroke: 'fh', error_type: 'wide', forced: false })
    store.deleteSession(a.id)
    expect(liveSessions(store.getState()).map((s) => s.id)).toEqual([b.id])
    expect(allLivePoints(store.getState()).map((p) => p.id)).toEqual([pb.id])
    const st = store.getState()
    expect(Object.values(st.points).filter((p) => p.session_id === a.id).every((p) => p.deleted_at)).toBe(true)
  })

  it('updateSession bumps updated_at and re-dirties', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    store.clearDirty('sessions', [[s.id, s.updated_at]])
    expect(pendingCount(store.getState())).toBe(0)
    store.updateSession(s.id, { title: 'Renamed', kind: 'match' })
    const cur = store.getState().sessions[s.id]
    expect(cur.title).toBe('Renamed')
    expect(cur.updated_at > s.updated_at).toBe(true)
    expect(store.getState().dirty.sessions).toEqual([s.id])
  })

  it('setOwner adopts local rows; foreign rows can be copied or dropped', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    store.addPoint({ session_id: s.id, x: 0, y: 40, stroke: 'fh', error_type: 'wide', forced: false })
    expect(store.setOwner('u1')).toEqual({ adopted: 2, foreign: 0 })
    expect(store.getState().sessions[s.id].user_id).toBe('u1')
    // new rows get the owner
    const s2 = store.createSession()
    expect(s2.user_id).toBe('u1')
    // sign out keeps data; a different user sees foreign rows
    expect(store.setOwner(null)).toEqual({ adopted: 0, foreign: 0 })
    expect(store.setOwner('u2')).toEqual({ adopted: 0, foreign: 3 })
    expect(store.foreignCount()).toBe(3)
    expect(store.copyForeignToOwner()).toBe(3)
    expect(store.foreignCount()).toBe(0)
    expect(liveSessions(store.getState())).toHaveLength(2)
    expect(liveSessions(store.getState()).every((x) => x.user_id === 'u2')).toBe(true)
    store.setOwner('u3')
    store.dropForeign()
    expect(liveSessions(store.getState())).toHaveLength(0)
  })

  it('reload picks up what another tab wrote; clearAll wipes rows but keeps owner', () => {
    const storage = memoryStorage()
    const a = createStore(storage, { ...clock(), newId: ids() })
    a.setOwner('u1')
    const b = createStore(storage, { ...clock(), newId: () => 'other' })
    b.createSession({ title: 'From tab B' })
    expect(liveSessions(a.getState())).toHaveLength(0)
    a.reload()
    expect(liveSessions(a.getState()).map((s) => s.title)).toEqual(['From tab B'])
    a.clearAll()
    expect(liveSessions(a.getState())).toHaveLength(0)
    expect(a.getState().meta.ownerId).toBe('u1')
  })

  it('formats local dates', () => {
    expect(todayLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
