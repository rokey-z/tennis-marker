import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, memoryStorage } from './localRepo'
import { allLivePoints, createStore, livePointsForSession, liveSessions, pendingCount, todayLocalISO } from './store'
import { opponentRows, opponentRowsWithRoster, sessionLabel } from '../domain/session'

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
    expect(sessionLabel(s)).toBe('Practice')
    expect(s.title).toBe('')
    expect(s.kind).toBe('practice')
    expect(s.user_id).toBeNull()
    expect(store.getState().dirty.sessions).toEqual([s.id])
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).sessions[s.id].title).toBe(s.title)
    const m = store.createSession({ opponent: '  Emma  Stone ', kind: 'match', date: '2026-08-01' })
    expect(m.opponent).toBe('Emma Stone')
    expect(sessionLabel(m)).toBe('vs Emma Stone')
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

  it('updatePoint corrects a logged point and re-queues it', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    const p = store.addPoint({ session_id: s.id, x: 1, y: 40, stroke: 'fh', error_type: 'long', forced: false })
    store.clearDirty('points', [[p.id, p.updated_at]])
    expect(pendingCount(store.getState())).toBe(1) // the session is still dirty

    store.updatePoint(p.id, { stroke: 'bh', error_type: 'net', forced: true })
    const cur = store.getState().points[p.id]
    expect(cur).toMatchObject({ stroke: 'bh', error_type: 'net', forced: true, x: 1, y: 40 })
    expect(cur.created_at).toBe(p.created_at) // position and time are untouched
    expect(cur.updated_at > p.updated_at).toBe(true)
    expect(store.getState().dirty.points).toEqual([p.id])

    // deleted or unknown points are left alone
    store.deletePoint(p.id)
    store.updatePoint(p.id, { forced: false })
    expect(store.getState().points[p.id].forced).toBe(true)
    store.updatePoint('nope', { forced: true })
  })

  it('records a winner as the opponent’s point: position only, no stroke, error type or forced flag', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    const w = store.addPoint({ session_id: s.id, x: 5, y: 30, stroke: 'bh', error_type: 'long', forced: true, outcome: 'winner' })
    expect(w).toMatchObject({ outcome: 'winner', stroke: '', error_type: '', forced: false })
    const e = store.addPoint({ session_id: s.id, x: 5, y: 30, stroke: 'fh', error_type: 'net', forced: true })
    expect(e).toMatchObject({ outcome: 'error', error_type: 'net', forced: true })
    // an error can be corrected into a winner and back
    store.updatePoint(e.id, { outcome: 'winner', stroke: '', error_type: '', forced: false })
    expect(store.getState().points[e.id]).toMatchObject({ outcome: 'winner', stroke: '', error_type: '' })
  })

  it('undo can be narrowed to the marks in view, so a hidden one is never dropped', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    const placement = store.addPoint({ session_id: s.id, x: 4, y: 20, stroke: 'fh', error_type: '', forced: false, outcome: 'placement' })
    const error = store.addPoint({ session_id: s.id, x: 2, y: 36, stroke: 'bh', error_type: 'long', forced: false })
    // the session is in placement mode: the newest point is the error, but it is not on screen
    const undone = store.undoLastPoint(s.id, (p) => p.outcome === 'placement')
    expect(undone?.id).toBe(placement.id)
    expect(store.getState().points[error.id].deleted_at).toBeNull()
    // with no predicate it still takes the newest live point
    expect(store.undoLastPoint(s.id)?.id).toBe(error.id)
    expect(store.undoLastPoint(s.id, (p) => p.outcome === 'placement')).toBeNull()
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

  it('a session records one mode, defaulting to errors', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    expect(store.createSession().mode).toBe('errors')
    const p = store.createSession({ mode: 'placement' })
    expect(p.mode).toBe('placement')
    store.updateSession(p.id, { mode: 'errors' })
    expect(store.getState().sessions[p.id].mode).toBe('errors')
  })

  it('updateSession bumps updated_at and re-dirties', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const s = store.createSession()
    store.clearDirty('sessions', [[s.id, s.updated_at]])
    expect(pendingCount(store.getState())).toBe(0)
    store.updateSession(s.id, { opponent: 'Renamed', kind: 'match' })
    const cur = store.getState().sessions[s.id]
    expect(cur.opponent).toBe('Renamed')
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
    b.createSession({ opponent: 'From tab B' })
    expect(liveSessions(a.getState())).toHaveLength(0)
    a.reload()
    expect(liveSessions(a.getState()).map((s) => s.opponent)).toEqual(['From tab B'])
    a.clearAll()
    expect(liveSessions(a.getState())).toHaveLength(0)
    expect(a.getState().meta.ownerId).toBe('u1')
  })

  it('migrates legacy "vs …" titles into an opponent on load, once', () => {
    const storage = memoryStorage()
    const seed = createStore(storage, { ...clock(), newId: ids() })
    const a = seed.createSession({ kind: 'match' })
    const b = seed.createSession()
    // simulate rows written by the old version (title typed, no opponent)
    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!)
    raw.sessions[a.id] = { ...raw.sessions[a.id], title: 'vs Emma — club ladder', opponent: '' }
    raw.sessions[b.id] = { ...raw.sessions[b.id], title: 'Practice — groundstrokes', opponent: '' }
    raw.dirty = { sessions: [], points: [] }
    storage.setItem(STORAGE_KEY, JSON.stringify(raw))

    const store = createStore(storage, { ...clock(), newId: ids() })
    expect(store.getState().sessions[a.id].opponent).toBe('Emma')
    expect(sessionLabel(store.getState().sessions[a.id])).toBe('vs Emma')
    // a description is never turned into an opponent, and keeps showing as-is
    expect(store.getState().sessions[b.id].opponent).toBe('')
    expect(sessionLabel(store.getState().sessions[b.id])).toBe('Practice — groundstrokes')
    expect(store.getState().dirty.sessions).toEqual([a.id])

    // second load has nothing left to migrate
    const again = createStore(storage, { ...clock(), newId: ids() })
    expect(again.getState().dirty.sessions).toEqual([a.id])
  })

  it('renames and clears opponents across sessions', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    const a = store.createSession({ kind: 'match', opponent: 'Emma' })
    const b = store.createSession({ opponent: 'emma  ' })
    const c = store.createSession({ kind: 'match', opponent: 'Mia' })
    expect(store.renameOpponent('EMMA', 'Emma Stone')).toBe(2)
    expect(store.getState().sessions[a.id].opponent).toBe('Emma Stone')
    expect(store.getState().sessions[b.id].opponent).toBe('Emma Stone')
    expect(store.getState().sessions[c.id].opponent).toBe('Mia')
    // merge into an existing name
    expect(store.renameOpponent('Mia', 'Emma Stone')).toBe(1)
    expect(opponentRows(Object.values(store.getState().sessions)).map((r) => r.name)).toEqual(['Emma Stone'])
    // clearing keeps the sessions themselves
    expect(store.clearOpponent('Emma Stone')).toBe(3)
    expect(liveSessions(store.getState())).toHaveLength(3)
    expect(opponentRows(Object.values(store.getState().sessions))).toEqual([])
    expect(store.renameOpponent('nobody', 'x')).toBe(0)
  })

  it('keeps a device-local roster of opponents not played yet', () => {
    const storage = memoryStorage()
    const store = createStore(storage, { ...clock(), newId: ids() })
    expect(store.addRosterOpponent('  Nina  ')).toBe(true)
    expect(store.addRosterOpponent('nina')).toBe(false) // already there, case-insensitively
    expect(store.addRosterOpponent('   ')).toBe(false)
    expect(store.getState().meta.roster).toEqual(['Nina'])
    expect(opponentRowsWithRoster(Object.values(store.getState().sessions), store.getState().meta.roster)).toEqual([
      { name: 'Nina', key: 'nina', sessions: 0, matches: 0, lastDate: '' },
    ])

    // survives a reload, and an opponent already used in a session is not duplicated
    const reloaded = createStore(storage, { ...clock(), newId: ids() })
    expect(reloaded.getState().meta.roster).toEqual(['Nina'])
    reloaded.createSession({ kind: 'match', opponent: 'Emma' })
    expect(reloaded.addRosterOpponent('emma')).toBe(false)

    // once she plays Nina the roster entry gives way to the real session row
    reloaded.createSession({ kind: 'match', opponent: 'Nina' })
    const rows = opponentRowsWithRoster(Object.values(reloaded.getState().sessions), reloaded.getState().meta.roster)
    expect(rows.filter((r) => r.key === 'nina')).toHaveLength(1)
    expect(rows.find((r) => r.key === 'nina')?.sessions).toBe(1)

    // removing an unused name drops it from the roster
    const solo = createStore(memoryStorage(), { ...clock(), newId: ids() })
    solo.addRosterOpponent('Ghost')
    expect(solo.clearOpponent('Ghost')).toBe(0)
    expect(solo.getState().meta.roster).toEqual([])
  })

  it('renames an unused roster name without touching sessions', () => {
    const store = createStore(memoryStorage(), { ...clock(), newId: ids() })
    store.addRosterOpponent('Nina')
    expect(store.renameOpponent('Nina', 'Nina Patel')).toBe(0)
    expect(store.getState().meta.roster).toEqual(['Nina Patel'])
  })

  it('formats local dates', () => {
    expect(todayLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
